import { existsSync, realpathSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePluginPackage, verifyPluginPackage } from './plugin-package.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginPath = 'plugins/paprika-messenger-private';

function assertWithin(root, target) {
  const suffix = relative(root, target);
  if (!suffix || suffix === '..' || suffix.startsWith('..' + sep) || isAbsolute(suffix))
    throw new Error('GitHub package path must stay within the repository: ' + target);
}

export async function prepareGithubPlugin({ repository = repositoryDirectory, check = false } = {}) {
  repository = await realpath(resolve(repository));
  const marketplace = JSON.parse(await readFile(resolve(repository, '.agents/plugins/marketplace.json'), 'utf8'));
  const entry = marketplace.plugins?.find(plugin => plugin.name === 'paprika-messenger-private');
  if (marketplace.name !== 'paprika-github' || entry?.source?.source !== 'local'
      || entry.source.path !== './' + pluginPath || entry.policy?.installation !== 'AVAILABLE'
      || entry.policy?.authentication !== 'ON_USE' || entry.category !== 'Communication')
    throw new Error('GitHub marketplace must point to the complete private setup package.');

  const outputRoot = resolve(repository, 'artifacts/github-plugin');
  await mkdir(outputRoot, { recursive: true });
  assertWithin(repository, await realpath(outputRoot));
  const report = await preparePluginPackage({ repository, kind: 'account', outputRoot });
  const pluginRoot = resolve(repository, pluginPath);
  const result = { plugin_id: 'paprika-messenger-private@paprika-github', plugin_root: pluginRoot,
    package_version: report.package_version, service_version: report.source_version, file_count: report.file_count };

  let existing;
  try { existing = await lstat(pluginRoot); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('GitHub package must be a normal directory.');
    assertWithin(repository, await realpath(pluginRoot));
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'plugin.json'), 'utf8'));
    if (manifest.name !== 'paprika-messenger-private') throw new Error('Unexpected package identity; preserve the existing directory.');
  }

  if (check) {
    if (!existing) throw new Error('GitHub package is missing. Run node scripts/prepare-github-plugin.mjs.');
    const validation = await verifyPluginPackage(pluginRoot);
    if (JSON.stringify(validation.files) !== JSON.stringify(report.files))
      throw new Error('GitHub package differs from current source. Run node scripts/prepare-github-plugin.mjs and commit plugins/.');
    return { ...result, checked: true };
  }

  await mkdir(dirname(pluginRoot), { recursive: true });
  assertWithin(repository, await realpath(dirname(pluginRoot)));
  let backup;
  if (existing) {
    const backupRoot = await mkdtemp(resolve(outputRoot, 'previous-'));
    backup = resolve(backupRoot, 'paprika-messenger-private');
    assertWithin(repository, backup);
    await rename(pluginRoot, backup);
  }
  try { await rename(report.plugin_root, pluginRoot); }
  catch (error) { if (backup) await rename(backup, pluginRoot); throw error; }
  await verifyPluginPackage(pluginRoot);
  return { ...result, ...(backup ? { previous_package_backup: backup } : {}) };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check') || args.length > 1) throw new Error('Usage: node scripts/prepare-github-plugin.mjs [--check]');
  console.log(JSON.stringify(await prepareGithubPlugin({ check: args.includes('--check') })));
}
