import { pathToFileURL } from 'node:url';

// Read only host-provided current-session metadata. Never search history, titles,
// working directories or the most recently used thread to infer this value.
export function getCurrentThreadId(env = process.env) {
  for (const source of ['CODEX_THREAD_ID', 'CODEX_SESSION_ID']) {
    const value = env[source];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value)) {
      throw new Error(`${source} contains an invalid thread ID.`);
    }
    return {thread_id: value, source};
  }
  throw new Error('Current thread ID is unavailable. This host must provide current-conversation metadata; an inbox participant ID is not a substitute.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node get-thread-id.mjs');
    console.log(JSON.stringify(getCurrentThreadId()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
