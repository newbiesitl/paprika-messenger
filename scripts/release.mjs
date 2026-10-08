import { constants } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { preparePluginPackage, verifyPluginPackage } from './plugin-package.mjs';
import { inspectReusableFiles, stageTemplate, verifyTemplate } from './bundle.mjs';
import { writePluginZip } from '../plugin-public/skills/setup-paprika/scripts/merge-service-plugin.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: repository, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || `${command} failed`);
  return result.stdout.trim();
}
function safeName(name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error('Unsafe release filename: ' + name);
  return name;
}
async function checksums(directory) {
  const entries = (await readFile(resolve(directory, 'SHA256SUMS'), 'utf8')).trim().split(/\r?\n/);
  for (const entry of entries) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(entry);
    if (!match) throw new Error('Invalid checksum entry in ' + directory);
    const [, expected, name] = match;
    if (sha256(await readFile(resolve(directory, safeName(name)))) !== expected)
      throw new Error('Checksum mismatch: ' + name);
  }
  return entries.length;
}
async function inspectArchive(archive, expectedRoot, staging) {
  const names = run('tar', ['-tf', archive]).split(/\r?\n/).filter(Boolean);
  if (!names.length || names.some(name => name.includes('\\') || name.split('/').includes('..')
      || (name !== expectedRoot && !name.startsWith(expectedRoot + '/'))))
    throw new Error('Archive has an unexpected root or path: ' + archive);
  const destination = await mkdtemp(resolve(staging, 'extracted-'));
  run('tar', ['-xf', archive, '-C', destination]);
  const root = resolve(destination, expectedRoot);
  return { root, files: await inspectReusableFiles(root) };
}
async function verifyRelease(directory, staging) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'artifacts.json'), 'utf8'));
  if (sha256(await readFile(resolve(repository, 'dist/_worker.js'))) !== manifest.worker_sha256)
    throw new Error('Release Worker differs from the current source build');
  const groups = new Map();
  for (const artifact of manifest.artifacts) {
    const archive = resolve(directory, safeName(artifact.file));
    if (sha256(await readFile(archive)) !== artifact.sha256) throw new Error('Artifact digest mismatch');
    const extracted = await inspectArchive(archive, safeName(artifact.root), staging);
    if (artifact.kind === 'plugin') {
      const checked = await verifyPluginPackage(extracted.root);
      if (checked.manifest.version !== manifest.plugin_version || checked.bundle.service_version !== manifest.service_version)
        throw new Error('Plugin version mismatch');
    } else if (artifact.kind === 'service') {
      if ((await verifyTemplate(extracted.root)).service_version !== manifest.service_version)
        throw new Error('Service version mismatch');
    } else if (artifact.kind === 'worker') {
      if (sha256(await readFile(resolve(extracted.root, 'worker.mjs'))) !== manifest.worker_sha256)
        throw new Error('Compiled Worker mismatch');
    } else throw new Error('Unknown artifact kind');
    if (groups.has(artifact.kind) && !isDeepStrictEqual(groups.get(artifact.kind), extracted.files))
      throw new Error('ZIP and tar.gz contents differ: ' + artifact.kind);
    groups.set(artifact.kind, extracted.files);
  }
  if (groups.size !== 3 || manifest.artifacts.length !== 6) throw new Error('Expected plugin, service and Worker in ZIP and tar.gz');
  await checksums(directory);
  return manifest;
}
const [action = 'verify', suppliedVersion] = process.argv.slice(2);
if (!['build', 'verify'].includes(action) || process.argv.length > 4) throw new Error('Usage: node scripts/release.mjs build|verify [plugin-version]');
const plugin = JSON.parse(await readFile(resolve(repository, 'plugin-public/plugin.json'), 'utf8'));
const version = suppliedVersion ?? plugin.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a release version');
const release = resolve(repository, 'releases', version);
await mkdir(resolve(repository, 'artifacts'), { recursive: true });
const staging = await mkdtemp(resolve(repository, 'artifacts/release-'));
if (action === 'build') {
  if (version !== plugin.version) throw new Error('Build the current source version only');
  const git = args => run('git', ['-c', 'safe.directory=' + repository.replaceAll('\\', '/'), ...args]);
  if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Commit the source before building a versioned release');
  const sourceCommit = git(['rev-parse', 'HEAD']);
  run(process.execPath, ['scripts/build.mjs']);
  const account = await preparePluginPackage({ repository, kind: 'account', outputRoot: resolve(staging, 'account') });
  const sourceRoot = resolve(staging, 'paprika-messenger-service');
  await stageTemplate(sourceRoot, { source: repository });
  const workerRoot = resolve(staging, 'paprika-messenger-worker');
  await mkdir(workerRoot);
  const worker = await readFile(resolve(repository, 'dist/_worker.js'));
  await writeFile(resolve(workerRoot, 'worker.mjs'), worker);
  await cp(resolve(repository, 'LICENSE'), resolve(workerRoot, 'LICENSE'));
  await writeFile(resolve(workerRoot, 'README.md'), '# Paprika Messenger compiled Worker\n\nService ' + account.source_version + '. This platform-neutral JavaScript module is the built server with its UI and messaging skill embedded. It requires the service\'s Cloudflare/Sites runtime, D1 migrations, owner authentication and event secrets. It is not a desktop executable or a complete Site deployment. Use the companion service-source package and its setup instructions to deploy or upgrade the same private Site.\n');
  const output = resolve(staging, 'publish'); await mkdir(output);
  const artifacts = [];
  for (const [kind, root, name] of [
    ['plugin', account.plugin_root, `paprika-messenger-private-${version}`],
    ['service', sourceRoot, `paprika-messenger-service-${account.source_version}`],
    ['worker', workerRoot, `paprika-messenger-worker-${account.source_version}`],
  ]) {
    const folder = root.split(/[\\/]/).at(-1), files = await inspectReusableFiles(root);
    const zip = resolve(output, name + '.zip'), tar = resolve(output, name + '.tar.gz');
    await writePluginZip(zip, root, folder, files);
    run('tar', ['-czf', tar, '-C', dirname(root), folder]);
    for (const file of [name + '.zip', name + '.tar.gz'])
      artifacts.push({ file, kind, root: folder, sha256: sha256(await readFile(resolve(output, file))) });
  }
  const report = { format: 1, plugin_version: version, service_version: account.source_version,
    source_commit: sourceCommit, worker_sha256: sha256(worker), platforms: ['macOS', 'Windows'], artifacts };
  await writeFile(resolve(output, 'artifacts.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(output, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.file}`).join('\n') + '\n');
  await verifyRelease(output, staging);
  await mkdir(release, { recursive: true });
  for (const file of [...artifacts.map(a => a.file), 'artifacts.json', 'SHA256SUMS'])
    await copyFile(resolve(output, file), resolve(release, file), constants.COPYFILE_EXCL);
  console.log(JSON.stringify({ release, source_commit: sourceCommit, artifacts: artifacts.map(a => a.file) }));
} else {
  run(process.execPath, ['scripts/build.mjs']);
  let verified = 0;
  for (const entry of await readdir(resolve(repository, 'releases'), { withFileTypes: true }))
    if (entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name)) verified += await checksums(resolve(repository, 'releases', entry.name));
  for (const entry of await readdir(resolve(repository, 'deployments'), { withFileTypes: true }))
    if (entry.isDirectory()) verified += await checksums(resolve(repository, 'deployments', entry.name));
  const manifest = await verifyRelease(release, staging);
  console.log(JSON.stringify({ verified_checksums: verified, plugin_version: manifest.plugin_version,
    service_version: manifest.service_version, archive_parity: 'plugin, service and Worker ZIP/tar.gz pairs match' }));
}
