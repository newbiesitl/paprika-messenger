import { realpathSync } from 'node:fs';
import { constants } from 'node:fs';
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const inside = (root, target) => {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const excluded = /(?:^|\/)(?:\.git|node_modules|\.paprika|\.dev-data|\.sites-runtime|artifacts)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|credentials[^/]*|auth\.json|[^/]*\.sqlite[^/]*)$/i;

function run(executable, args, cwd, label) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.status !== 0) throw new Error(label + ' failed: ' + (result.error?.code || result.stderr.trim() || 'exit ' + result.status));
  return result.stdout.trim();
}

async function regularFiles(root, directory, { deployment = false } = {}) {
  const files = [];
  async function visit(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !inside(root, await realpath(path))) throw new Error('Packaging input must stay inside its root without symlinks.');
    const name = relative(root, path).replaceAll('\\', '/');
    if (deployment && excluded.test(name)) throw new Error('Private or development file in deployment output: ' + name);
    if (stat.isDirectory()) {
      for (const entry of await readdir(path)) await visit(resolve(path, entry));
    } else if (stat.isFile()) files.push({ path: name, sha256: digest(await readFile(path)) });
    else throw new Error('Packaging input must contain regular files only.');
  }
  await visit(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function readConfig(project, path, optional = false) {
  const filename = resolve(project, path);
  const stat = await lstat(filename).catch(error => { if (optional && error.code === 'ENOENT') return null; throw error; });
  if (!stat) return {};
  if (!stat.isFile() || stat.isSymbolicLink() || !inside(project, await realpath(filename))) throw new Error('Invalid hosting manifest path.');
  const value = JSON.parse(await readFile(filename, 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid hosting manifest.');
  return value;
}

// Recover only archive creation; Sites still owns source synchronization,
// credentials, version saving, deployment and the canonical service plugin.
export async function prepareDeploymentArchive({ project = process.cwd(), sitesPluginRoot, source, archive } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or later is required.');
  if (!sitesPluginRoot || !isAbsolute(sitesPluginRoot)) throw new Error('Provide the absolute installed Sites plugin root.');
  project = await realpath(resolve(project));
  if (!source || !isAbsolute(source.checkout_path ?? '') || await realpath(source.checkout_path) !== project
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.commit_sha ?? '') || typeof source.project_id !== 'string' || !source.project_id)
    throw new Error('Provide the native Sites opening result for this same pushed checkout.');
  if (['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'].some(key => process.env[key])) throw new Error('Git directory overrides are not supported.');
  const git = args => run('git', ['-c', 'safe.directory=' + project.replaceAll('\\', '/'), ...args], project, 'Git source verification');
  const verifySource = async () => {
    if (await realpath(git(['rev-parse', '--show-toplevel'])) !== project
        || git(['rev-parse', 'HEAD']) !== source.commit_sha || git(['status', '--porcelain', '--untracked-files=all']))
      throw new Error('Site source is dirty or does not match the verified pushed revision. Rebuild and reopen the same Site.');
  };
  await verifySource();
  const inputBuild = await regularFiles(project, resolve(project, 'dist'));
  const migrations = resolve(project, 'drizzle');
  const migrationFiles = async () => await lstat(migrations).catch(error => { if (error.code === 'ENOENT') return null; throw error; })
    ? regularFiles(project, migrations) : [];
  const inputMigrations = await migrationFiles();
  const hosting = await readConfig(project, '.openai/hosting.json');
  const built = await readConfig(project, 'dist/.openai/hosting.json', true);
  if (hosting.project_id !== source.project_id) throw new Error('Source project_id does not match the selected Site.');
  if (hosting.artifact_metadata != null && built.artifact_metadata != null && !isDeepStrictEqual(hosting.artifact_metadata, built.artifact_metadata))
    throw new Error('Conflicting artifact_metadata; rebuild with matching attribution.');
  const plugin = await realpath(sitesPluginRoot);
  const validator = resolve(plugin, 'skills/sites-hosting/scripts/prepare-site-build.cjs');
  if (!(await lstat(validator)).isFile() || !inside(plugin, await realpath(validator))) throw new Error('Installed Sites build validator is unavailable.');
  const artifacts = resolve(project, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  if (!inside(project, await realpath(artifacts)) || (await lstat(artifacts)).isSymbolicLink()) throw new Error('Artifacts must stay inside the project.');
  archive = resolve(archive ?? resolve(artifacts, 'dot-board.tar.gz'));
  if (!inside(artifacts, archive)) throw new Error('Use an archive path inside this checkout\'s artifacts directory.');
  const stage = await mkdtemp(resolve(artifacts, 'site-package-'));
  try {
    const output = resolve(stage, 'dist');
    const kind = run(process.execPath, [validator, project, output], project, 'Sites build validation');
    if (kind !== 'worker') throw new Error('Paprika requires a validated Worker build.');
    await mkdir(resolve(output, '.openai'), { recursive: true });
    const stagedHosting = { ...hosting };
    const attribution = built.artifact_metadata ?? hosting.artifact_metadata;
    if (attribution != null) stagedHosting.artifact_metadata = attribution;
    await writeFile(resolve(output, '.openai/hosting.json'), JSON.stringify(stagedHosting, null, 2) + '\n');
    if (await lstat(migrations).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))
      await cp(migrations, resolve(output, '.openai/drizzle'), { recursive: true });
    const files = await regularFiles(stage, output, { deployment: true });
    if (!files.some(file => file.path === 'dist/server/index.js') || !files.some(file => file.path === 'dist/.openai/hosting.json'))
      throw new Error('Deployment output is incomplete.');
    const stagedArchive = resolve(stage, 'deployment.tar.gz');
    run('tar', ['-czf', stagedArchive, '-C', stage, 'dist'], project, 'Native tar archive creation');
    const entries = run('tar', ['-tzf', stagedArchive], project, 'Archive validation').split(/\r?\n/).filter(Boolean);
    if (entries.some(entry => !entry.startsWith('dist/') || entry.includes('\\') || entry.split('/').includes('..'))
        || !isDeepStrictEqual(entries.filter(entry => !entry.endsWith('/')).sort(), files.map(file => file.path).sort()))
      throw new Error('Deployment archive contents do not match the validated output.');
    if (!isDeepStrictEqual(files, await regularFiles(stage, output, { deployment: true }))) throw new Error('Build output changed while archiving.');
    if (!isDeepStrictEqual(inputBuild, await regularFiles(project, resolve(project, 'dist')))
        || !isDeepStrictEqual(inputMigrations, await migrationFiles()))
      throw new Error('Build or migrations changed while packaging. Rebuild and retry.');
    await verifySource();
    if (dirname(archive) !== artifacts) throw new Error('Use an archive file directly inside artifacts.');
    if (!inside(artifacts, await realpath(dirname(archive)))) throw new Error('Archive destination must stay inside artifacts.');
    try { await copyFile(stagedArchive, archive, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Archive already exists; preserve it and choose a new --archive path.'); throw error; }
    return { project_id: source.project_id, checkout_path: project, commit_sha: source.commit_sha,
      archive, sha256: digest(await readFile(archive)), build_kind: kind, file_count: files.length };
  } finally {
    // This newly created directory is the only recursive cleanup target.
    if (!inside(artifacts, stage) || !inside(await realpath(artifacts), await realpath(stage))) throw new Error('Unsafe staging cleanup path.');
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      if (!['--sites-plugin-root', '--source', '--archive'].includes(args[index]) || !args[index + 1]) throw new Error('Usage: package.mjs --sites-plugin-root ABSOLUTE_PATH --source SOURCE_REPORT_JSON [--archive ABSOLUTE_PATH]');
      options[args[index].slice(2)] = args[index + 1];
    }
    if (!options.source) throw new Error('Provide --source with the native Sites opening result saved outside Git.');
    const source = JSON.parse(await readFile(resolve(options.source), 'utf8'));
    console.log(JSON.stringify(await prepareDeploymentArchive({ sitesPluginRoot: options['sites-plugin-root'], source, archive: options.archive })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
