import { cp, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const templateMetadataFile = 'paprika-service-template.json';
// This allowlist intentionally excludes account installation records and runtime state.
export const templateFiles = ['src', 'web', 'db', 'drizzle', 'tests', 'skills/paprika-messenger',
  'docs/SETUP.md', 'docs/SERVICE-TYPES.md', 'docs/WINDOWS-SITES-PACKAGING.md', 'docs/SECURITY.md', 'docs/SCHEDULING.md', 'docs/UPGRADING.md', 'docs/PARTICIPANTS.json',
  'scripts/build.mjs', 'scripts/dev.mjs', 'scripts/bundle.mjs', 'scripts/package.mjs',
  'package.json', 'package-lock.json', 'drizzle.config.ts', 'README.md', 'LICENSE', '.env.example', '.gitignore', '.gitattributes'];
export const forbiddenResource = /(?:^|\/)(?:\.git|node_modules|dist|artifacts|\.dev-data|\.sites-runtime|\.paprika)(?:\/|$)|(?:^|\/)(?:\.env(?:\..+)?|credentials[^/]*|auth\.json|[^/]*\.sqlite[^/]*)$/;
export const privateIdentity = /appgprj_[a-z0-9]+|(?:plugin_)?asdk_app_sites_[a-z0-9]+|plugins_[a-z0-9]{16,}|pluginrel_[a-z0-9]{16,}|oaiapp_[a-z0-9]{16,}|\b01a[0-9a-f]{5}-[0-9a-f-]{20,}\b/i;
const privateSecret = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|whsec_[A-Za-z0-9+/]{32,}={0,2}|gh[opsu]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/;
const textResource = /\.(?:mjs|js|ts|json|ya?ml|md|html|css|txt|sql)$|(?:^|\/)(?:LICENSE|\.env\.example)$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function inspectReusableFiles(directory, { ownerBindingFiles = [] } = {}) {
  const permitted = new Set(ownerBindingFiles);
  if ([...permitted].some(path => !['.app.json', 'paprika-connection.json'].includes(path)))
    throw new Error('Owner identity is permitted only in the standalone connection files.');
  const files = [];
  async function inspect(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = resolve(current, entry.name);
      const path = relative(directory, absolute).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) throw new Error('Symbolic link in reusable package: ' + path);
      if (forbiddenResource.test(path) && !path.endsWith('/.env.example') && path !== '.env.example')
        throw new Error('Private or generated resource in reusable package: ' + path);
      if (entry.isDirectory()) { await inspect(absolute); continue; }
      if (!entry.isFile()) throw new Error('Unsupported resource in reusable package: ' + path);
      const bytes = await readFile(absolute);
      if (textResource.test(path) && ((!permitted.has(path) && privateIdentity.test(bytes.toString('utf8'))) || privateSecret.test(bytes.toString('utf8'))))
        throw new Error('Owner-specific identity or secret in reusable package: ' + path);
      files.push({ path, size_bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  await inspect(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function normalizeReusableText(directory, options) {
  for (const file of await inspectReusableFiles(directory, options)) {
    if (!textResource.test(file.path) && !/(?:^|\/)(?:\.gitignore|\.gitattributes)$/.test(file.path)) continue;
    const absolute = resolve(directory, file.path);
    const bytes = await readFile(absolute);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Reusable text must be UTF-8: ' + file.path);
    if (text.includes('\r\n')) await writeFile(absolute, text.replaceAll('\r\n', '\n'));
  }
}

export async function verifyServiceVersion(directory) {
  const service = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(directory, 'package-lock.json'), 'utf8'));
  const protocol = await readFile(resolve(directory, 'src/protocol.mjs'), 'utf8');
  const protocolVersion = /name:\s*'Paprika Messenger',\s*version:\s*'([^']+)'/.exec(protocol)?.[1];
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(service.version) || lock.version !== service.version
      || lock.packages?.['']?.version !== service.version || protocolVersion !== service.version)
    throw new Error('Service package, lockfile and MCP protocol versions must match.');
  return service.version;
}

export async function verifyTemplate(directory) {
  const metadata = JSON.parse(await readFile(resolve(directory, templateMetadataFile), 'utf8'));
  if (metadata.format !== 1 || metadata.kind !== 'paprika-messenger-service-template' || !Array.isArray(metadata.files))
    throw new Error('Invalid service template metadata.');
  const serviceVersion = await verifyServiceVersion(directory);
  if (metadata.service_version !== serviceVersion) throw new Error('Service template metadata version does not match source.');
  const hosting = JSON.parse(await readFile(resolve(directory, '.openai/hosting.json'), 'utf8'));
  if (JSON.stringify(hosting) !== JSON.stringify({ d1: 'DB', r2: null, capabilities: ['mcp'] }))
    throw new Error('Service template must have a fresh MCP hosting manifest without an owner or Site identity.');
  const files = (await inspectReusableFiles(directory)).filter(file => file.path !== templateMetadataFile);
  if (JSON.stringify(files) !== JSON.stringify(metadata.files)) throw new Error('Service template files do not match bundled checksums.');
  return { service_version: serviceVersion, file_count: files.length };
}

export async function stageTemplate(destination, { source = repository } = {}) {
  const version = await verifyServiceVersion(source);
  await mkdir(destination, { recursive: true });
  for (const file of templateFiles) {
    const from = resolve(source, file);
    if ((await lstat(from)).isSymbolicLink()) throw new Error('Symbolic link in source template: ' + file);
    await cp(from, resolve(destination, file), { recursive: true, filter: async path => {
      const name = relative(source, path).replaceAll('\\', '/');
      if (name === 'tests/packaging.test.mjs') return false;
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Symbolic link in source template: ' + name);
      return true;
    } });
  }
  await mkdir(resolve(destination, '.openai'), { recursive: true });
  // Copy logical capabilities only; never read/copy this owner's registered project.
  await writeFile(resolve(destination, '.openai/hosting.json'), JSON.stringify({ d1: 'DB', r2: null, capabilities: ['mcp'] }, null, 2) + '\n');
  // Replace files shipped in earlier releases so account update overlays stay neutral.
  await writeFile(resolve(destination, 'docs/LOCAL-PLUGIN.md'), '# Local plugin setup\n\nThe service template contains reusable source. Install Paprika Messenger through the supported plugin interface, then run its setup workflow. See [Setup](SETUP.md) for deployment and [Upgrading](UPGRADING.md) for preserving an existing service. No account installation or client connection is claimed by this template.\n');
  await writeFile(resolve(destination, 'docs/TEST-RESULTS.md'), '# Validate this service\n\nBundled service version ' + version + '. In a new workspace, run `npm ci`, `npm test` and `npm run build`. Tests exercise the service, migrations, generated Worker, event delivery and messaging helpers with local fixtures. They do not establish another account\'s deployment, client connection or agent wake-up. Verify each intended client through its authenticated service connection.\n');
  await writeFile(resolve(destination, 'README.md'), (await readFile(resolve(destination, 'README.md'), 'utf8'))
    + '\n## Bundled service workspace\n\nThis folder contains the service source, service tests and deployment tools. Plugin release packaging commands in the development README apply to the publisher\'s complete checkout; this copied workspace deploys the service through its setup skill and Sites. Run `npm ci`, `npm test` and `npm run build` here.\n');
  // Normalize copied text before hashing so Git checkout cannot invalidate it.
  await normalizeReusableText(destination);
  const files = (await inspectReusableFiles(destination)).filter(file => file.path !== templateMetadataFile);
  await writeFile(resolve(destination, templateMetadataFile), JSON.stringify({ format: 1,
    kind: 'paprika-messenger-service-template', service_version: version, files }, null, 2) + '\n');
  await verifyTemplate(destination);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(repository, 'artifacts'); await mkdir(root, { recursive: true });
  const stage = await mkdtemp(resolve(root, 'template-stage-'));
  await stageTemplate(resolve(stage, 'paprika-messenger'));
  const archive = resolve(root, 'paprika-messenger-template.tar.gz');
  const result = spawnSync('tar', ['-czf', archive, '-C', stage, 'paprika-messenger'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw Error(result.stderr || 'Could not package template.');
  let zip;
  if (process.platform === 'win32') {
    zip = resolve(root, 'paprika-messenger-template.zip');
    const zipped = spawnSync('tar', ['-a', '-cf', zip, '-C', stage, 'paprika-messenger'], { encoding: 'utf8', windowsHide: true });
    if (zipped.status !== 0) throw Error(zipped.stderr || 'Could not package ZIP.');
  }
  console.log(JSON.stringify({ archive, ...(zip ? { zip } : {}) }));
}
