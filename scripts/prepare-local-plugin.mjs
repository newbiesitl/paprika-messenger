import { realpathSync } from 'node:fs';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePluginPackage, verifyPluginPackage } from './plugin-package.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function assertWithin(root, path) {
  const suffix = relative(root, path);
  if (!suffix || suffix === '..' || suffix.startsWith('..' + sep) || isAbsolute(suffix))
    throw new Error('Local staging path must stay within the intended workspace: ' + path);
}

export async function prepareLocalPlugin({ repository = repositoryDirectory, marketplaceRoot } = {}) {
  repository = resolve(repository);
  marketplaceRoot = resolve(marketplaceRoot ?? resolve(repository, 'artifacts/local-plugin-marketplace'));
  const pluginRoot = resolve(marketplaceRoot, 'plugins/paprika-messenger');
  const marketplaceFile = resolve(marketplaceRoot, '.agents/plugins/marketplace.json');
  assertWithin(repository, marketplaceRoot); assertWithin(marketplaceRoot, pluginRoot);
  await mkdir(marketplaceRoot, { recursive: true });
  const resolvedRepository = await realpath(repository);
  const resolvedMarketplace = await realpath(marketplaceRoot);
  assertWithin(resolvedRepository, resolvedMarketplace);
  let marketplace;
  try { marketplace = JSON.parse(await readFile(marketplaceFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    marketplace = { name: 'paprika-local', interface: { displayName: 'Paprika Local Development' }, plugins: [] };
  }
  if (marketplace.name !== 'paprika-local' || !Array.isArray(marketplace.plugins))
    throw new Error('Unexpected existing marketplace; preserve it and inspect first.');
  const index = marketplace.plugins.findIndex(plugin => plugin.name === 'paprika-messenger');
  if (index >= 0) {
    const existing = marketplace.plugins[index];
    if (existing.source?.source !== 'local' || resolve(marketplaceRoot, existing.source.path ?? '') !== pluginRoot)
      throw new Error('Unexpected existing Paprika source; preserve its configuration and inspect first.');
    // Preserve the registered source, authentication/installation policy and extra fields.
  } else marketplace.plugins.push({ name: 'paprika-messenger', source: { source: 'local', path: './plugins/paprika-messenger' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Communication' });

  let previous;
  try { previous = await lstat(pluginRoot); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink()))
    throw new Error('Existing local stage must be a normal directory.');
  let previousVersion;
  if (previous) {
    assertWithin(resolvedRepository, await realpath(pluginRoot));
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'plugin.json'), 'utf8'));
    if (manifest.name !== 'paprika-messenger' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version))
      throw new Error('Unexpected existing plugin identity; preserve its source and inspect first.');
    previousVersion = manifest.version;
  }
  const outputRoot = resolve(marketplaceRoot, 'packages');
  for (const directory of [outputRoot, dirname(pluginRoot), dirname(marketplaceFile)]) {
    await mkdir(directory, { recursive: true });
    assertWithin(resolvedRepository, await realpath(directory));
  }
  const report = await preparePluginPackage({ repository, kind: 'local', outputRoot });
  assertWithin(resolvedRepository, await realpath(report.plugin_root));
  let backup;
  if (previous) {
    const backupRoot = resolve(marketplaceRoot, 'backups'); await mkdir(backupRoot, { recursive: true });
    assertWithin(resolvedRepository, await realpath(backupRoot));
    backup = resolve(backupRoot, 'paprika-messenger-' + previousVersion + '-' + Date.now());
    assertWithin(repository, backup); assertWithin(marketplaceRoot, backup);
    // The exact old generated stage is retained. Never delete installed caches or settings.
    await rename(pluginRoot, backup);
  }
  try { await rename(report.plugin_root, pluginRoot); }
  catch (error) { if (backup) await rename(backup, pluginRoot); throw error; }
  await verifyPluginPackage(pluginRoot);
  await writeFile(marketplaceFile, JSON.stringify(marketplace, null, 2) + '\n');
  const result = { marketplace_root: marketplaceRoot, plugin_root: pluginRoot,
    plugin_id: 'paprika-messenger@paprika-local', version: report.package_version,
    service_version: report.source_version, archive: report.archive, ...(backup ? { previous_stage_backup: backup } : {}) };
  await writeFile(resolve(marketplaceRoot, 'local-stage-report.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)))
  console.log(JSON.stringify(await prepareLocalPlugin()));
