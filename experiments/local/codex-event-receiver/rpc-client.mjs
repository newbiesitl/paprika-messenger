import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter, once } from 'node:events';

export function safeError(error) {
  return { code: error?.rpcCode ?? error?.code ?? null,
    message: String(error?.message ?? error).replace(/https?:\/\/\S+/g, '[URL omitted]')
      .replace(/(?:Bearer |whsec_)[A-Za-z0-9+/_=.-]+/g, '[credential omitted]').slice(0, 1200) };
}

export class AppServer extends EventEmitter {
  constructor(binary, { codexDirectory, cwd, overrides = [], env = {} }) {
    super();
    this.pending = new Map(); this.nextId = 1; this.notifications = []; this.closed = false; this.ownedThreadIds = new Set();
    this.child = spawn(binary, ['app-server', '--stdio', ...overrides.flatMap(v => ['-c', v])], {
      cwd, env: { ...process.env, CODEX_HOME: codexDirectory, ...env },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.stderrBytes = 0;
    this.child.stderr.on('data', chunk => { this.stderrBytes += chunk.length; });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id !== undefined) {
        // This bounded pilot grants no command/file approvals or host attestation.
        this.child.stdin.write(JSON.stringify({ id: message.id, error: {
          code: -32601, message: 'This read-only pilot does not implement host actions.' } }) + '\n');
        this.emit('hostRequestRejected', message.method); return;
      }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const request = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(request.timer);
        if (message.error) request.reject(Object.assign(new Error(message.error.message), { rpcCode: message.error.code }));
        else {
          if (request.method === 'thread/start' && message.result?.thread?.id) this.ownedThreadIds.add(message.result.thread.id);
          request.resolve(message.result);
        }
      } else if (message.method) {
        const notification = { ...message, observedAt: new Date().toISOString() };
        this.notifications.push(notification); this.emit('notification', notification);
      }
    });
    this.child.on('error', error => this.rejectPending(error));
    this.child.on('exit', (code, signal) => {
      this.closed = true; this.exit = { code, signal };
      this.rejectPending(new Error(`Pilot app-server exited (${code ?? signal}).`)); this.emit('closed');
    });
    this.child.stdin.on('error', error => this.rejectPending(error));
  }
  rejectPending(error) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
  request(method, params = {}, timeoutMs = 20000) {
    if (this.closed) return Promise.reject(new Error('Pilot app-server is closed.'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async initialize() {
    const response = await this.request('initialize', { clientInfo: {
      name: 'paprika_receiver_pilot', title: 'Isolated Paprika receiving pilot', version: '0.1.0' } });
    this.child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n'); return response;
  }
  waitFor(predicate, timeoutMs = 90000) {
    const found = this.notifications.find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer); this.off('notification', listener); this.off('closed', closed);
        error ? reject(error) : resolve(value);
      };
      const listener = value => { if (predicate(value)) finish(null, value); };
      const closed = () => finish(new Error('Pilot app-server closed before expected notification.'));
      const timer = setTimeout(() => finish(new Error('Expected pilot notification timed out.')), timeoutMs);
      this.on('notification', listener); this.on('closed', closed);
      if (this.closed) closed();
    });
  }
  async close() {
    if (this.closed) return { stopped: true, pid: this.child.pid, forced: false };
    const exited = once(this, 'closed'); this.child.stdin.end();
    let timer;
    const natural = await Promise.race([exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
    clearTimeout(timer);
    if (!natural && !this.closed) { this.child.kill(); await exited; }
    this.lines.close();
    return { stopped: this.closed, pid: this.child.pid, forced: !natural };
  }
}
