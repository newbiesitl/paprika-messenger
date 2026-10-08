import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preparePluginPackage, verifyPluginPackage } from '../scripts/plugin-package.mjs';
import { inspectReusableFiles, stageTemplate, verifyServiceVersion, verifyTemplate } from '../scripts/bundle.mjs';
import { prepareLocalPlugin } from '../scripts/prepare-local-plugin.mjs';
import { prepareGithubPlugin } from '../scripts/prepare-github-plugin.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args, cwd) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
};

test('account ZIP initializes a complete independent service and preserves portable onboarding metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paprika-package-'));
  try {
    const original = JSON.parse(await readFile(resolve(repository, 'plugin-public/plugin.json'), 'utf8'));
    const report = await preparePluginPackage({ repository, outputRoot: join(directory, 'output') });
    const extracted = join(directory, 'extracted'); await mkdir(extracted);
    run('tar', ['-xf', report.archive, '-C', extracted], directory);
    const plugin = join(extracted, 'paprika-messenger-private');
    const validation = await verifyPluginPackage(plugin);
    assert.equal(validation.manifest.name, 'paprika-messenger-private');
    assert.equal(validation.manifest.version, original.version);
    assert.deepEqual(validation.manifest.extensions['com.openai'].interface.defaultPrompt,
      original.extensions['com.openai'].interface.defaultPrompt);
    const compatibility = JSON.parse(await readFile(join(plugin, '.codex-plugin/plugin.json'), 'utf8'));
    assert.equal(compatibility.extensions['com.openai'].onboardingSkill, original.extensions['com.openai'].onboardingSkill);
    assert.equal(validation.bundle.service_version, JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')).version);
    const template = join(plugin, 'skills/setup-paprika/assets/service-template');
    assert((await readFile(join(template, 'src/connection-ui.mjs'), 'utf8')).includes('connectionControls'));
    assert((await readFile(join(template, 'web/connection-controls.html'), 'utf8')).includes('Enable incoming messages'));
    assert((await readFile(join(plugin, 'skills/paprika-messenger/references/connection-ui.md'), 'utf8')).includes('Connect this chat'));
    const docs = await readdir(join(template, 'docs'));
    assert(!docs.includes('ACCOUNT-PLUGIN.md'));
    for (const file of ['LOCAL-PLUGIN.md', 'TEST-RESULTS.md']) {
      const text = await readFile(join(template, 'docs', file), 'utf8');
      assert(!/vex|01a[0-9a-f]|reinstalled|all \d+ tests passed/i.test(text));
    }
    const participants = JSON.parse(await readFile(join(template, 'docs/PARTICIPANTS.json'), 'utf8'));
    assert.equal(participants.example_only, true);
    assert(participants.participants.every(participant => !participant.thread_id));
    const service = join(directory, 'new-service');
    const initializer = join(plugin, 'skills/setup-paprika/scripts/init-service.mjs');
    const initialized = JSON.parse(run(process.execPath, [initializer, service], directory));
    assert.deepEqual(initialized, { directory: service, service_version: validation.bundle.service_version,
      template_verified: true, registered: false });
    assert.deepEqual(JSON.parse(await readFile(join(service, '.openai/hosting.json'), 'utf8')),
      { d1: 'DB', r2: null, capabilities: ['mcp'] });
    assert(!(await readdir(service)).includes('plugin-public'));
    const output = run(process.execPath, ['--test', '--test-reporter=tap', 'tests/*.test.mjs'], service);
    assert.match(output, /# fail 0/);
    run(process.execPath, ['scripts/build.mjs'], service);
    assert((await readFile(join(service, 'dist/server/index.js'), 'utf8')).includes("version:'" + initialized.service_version + "'"));
    const before = await readFile(join(service, 'package.json'), 'utf8');
    const second = spawnSync(process.execPath, [initializer, service], { encoding: 'utf8', windowsHide: true });
    assert.equal(second.status, 1); assert.match(second.stderr, /Destination is not empty/);
    assert.equal(await readFile(join(service, 'package.json'), 'utf8'), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('template refuses mismatched versions, tampering, owner identities and runtime files before initialization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paprika-package-invalid-'));
  try {
    const template = join(directory, 'template'); await stageTemplate(template);
    await verifyTemplate(template);
    const protocolPath = join(template, 'src/protocol.mjs');
    const protocol = await readFile(protocolPath, 'utf8');
    await writeFile(protocolPath, protocol.replace(/version:'[^']+'/, "version:'9.9.9'"));
    await assert.rejects(verifyServiceVersion(template), /versions must match/);
    await writeFile(protocolPath, protocol);
    const sourcePath = join(template, 'src/service.mjs');
    const source = await readFile(sourcePath, 'utf8'); await writeFile(sourcePath, source + '\n// Changed package\n');
    await assert.rejects(verifyTemplate(template), /checksums/);
    await writeFile(sourcePath, source);
    await writeFile(join(template, 'unexpected.txt'), 'plugins_' + 'a'.repeat(32));
    await assert.rejects(inspectReusableFiles(template), /Owner-specific identity/);
    await writeFile(join(template, 'unexpected.txt'), 'sk-' + 'a'.repeat(32));
    await assert.rejects(inspectReusableFiles(template), /secret/);
    await rm(join(template, 'unexpected.txt'));
    await writeFile(join(template, '.env'), 'OWNER_EMAIL=someone@example.com');
    await assert.rejects(inspectReusableFiles(template), /Private or generated resource/);
    await rm(join(template, '.env'));
    await verifyTemplate(template);
    const account = await preparePluginPackage({ repository, outputRoot: join(directory, 'account') });
    const asset = join(account.plugin_root, 'skills/setup-paprika/assets/service-template/src/service.mjs');
    await writeFile(asset, (await readFile(asset, 'utf8')) + '\n// Changed package\n');
    const target = join(directory, 'must-not-exist');
    const initialized = spawnSync(process.execPath, [join(account.plugin_root, 'skills/setup-paprika/scripts/init-service.mjs'), target],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(initialized.status, 1); assert.match(initialized.stderr, /checksums/);
    await assert.rejects(readdir(target), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('local restaging preserves prior source and marketplace policies while validating the full bundle', async () => {
  const artifacts = join(repository, 'artifacts'); await mkdir(artifacts, { recursive: true });
  const directory = await mkdtemp(join(artifacts, 'local-staging-test-'));
  const suffix = relative(artifacts, directory);
  assert(suffix && suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix));
  try {
    const plugin = join(directory, 'plugins/paprika-messenger'); await mkdir(plugin, { recursive: true });
    await writeFile(join(plugin, 'plugin.json'), JSON.stringify({ name: 'paprika-messenger', version: '1.1.0' }));
    await writeFile(join(plugin, 'keep-old-source.txt'), 'Existing generated source');
    const marketplaceFile = join(directory, '.agents/plugins/marketplace.json');
    await mkdir(join(directory, '.agents/plugins'), { recursive: true });
    const marketplace = { name: 'paprika-local', interface: { displayName: 'Preserved label' }, extra: 'keep', plugins: [
      { name: 'paprika-messenger', source: { source: 'local', path: './plugins/paprika-messenger' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE', extra: 'keep' }, note: 'preserve' },
      { name: 'another-plugin', source: { source: 'local', path: './plugins/another-plugin' } },
    ] };
    await writeFile(marketplaceFile, JSON.stringify(marketplace));
    const result = await prepareLocalPlugin({ repository, marketplaceRoot: directory });
    assert.equal(result.plugin_id, 'paprika-messenger@paprika-local');
    assert.equal(result.plugin_root, plugin);
    assert.equal(await readFile(join(result.previous_stage_backup, 'keep-old-source.txt'), 'utf8'), 'Existing generated source');
    await assert.rejects(readFile(join(plugin, 'keep-old-source.txt')), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(marketplaceFile, 'utf8')), marketplace);
    const verified = await verifyPluginPackage(plugin);
    assert.equal(verified.manifest.name, 'paprika-messenger');
    assert.equal(verified.manifest.extensions['com.openai'].interface.displayName, 'Paprika Messenger (Local)');
    assert.equal(verified.bundle.plugin_version, result.version);
    assert.equal(verified.bundle.service_version, result.service_version);
    assert(verified.files.some(file => file.path === 'skills/setup-paprika/assets/service-template/drizzle/0003_event-delivery.sql'));
    const compatibility = JSON.parse(await readFile(join(plugin, '.codex-plugin/plugin.json'), 'utf8'));
    assert.equal(compatibility.extensions['com.openai'].onboardingSkill, './skills/setup-paprika/SKILL.md');
    const docs = await readdir(join(plugin, 'skills/setup-paprika/assets/service-template/docs'));
    assert(!docs.includes('ACCOUNT-PLUGIN.md'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('GitHub marketplace ships a complete independent package and detects stale extra files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paprika-github-package-'));
  try {
    const { cp } = await import('node:fs/promises');
    for (const path of ['src', 'web', 'db', 'drizzle', 'tests', 'skills', 'docs', 'scripts', 'plugin-public',
      'package.json', 'package-lock.json', 'drizzle.config.ts', 'README.md', 'LICENSE', '.env.example', '.gitignore', '.gitattributes', '.agents'])
      await cp(join(repository, path), join(directory, path), { recursive: true });
    const copiedService = join(directory, 'src/service.mjs');
    const copiedSetup = join(directory, 'plugin-public/skills/setup-paprika/scripts/init-service.mjs');
    for (const file of [copiedService, copiedSetup])
      await writeFile(file, (await readFile(file, 'utf8')).replace(/\r?\n/g, '\r\n'));
    const report = await prepareGithubPlugin({ repository: directory });
    assert.equal(report.plugin_id, 'paprika-messenger-private@paprika-github');
    assert.equal((await prepareGithubPlugin({ repository: directory, check: true })).checked, true);
    const validation = await verifyPluginPackage(report.plugin_root);
    assert(validation.files.some(file => file.path === 'skills/setup-paprika/scripts/init-service.mjs'));
    assert(validation.files.some(file => file.path === 'skills/paprika-messenger/SKILL.md'));
    assert(validation.files.some(file => file.path === '.codex-plugin/plugin.json'));
    for (const file of ['skills/setup-paprika/assets/service-template/src/service.mjs', 'skills/setup-paprika/scripts/init-service.mjs'])
      assert(!(await readFile(join(report.plugin_root, file), 'utf8')).includes('\r\n'));
    const service = join(directory, 'independent-service');
    const initialized = JSON.parse(run(process.execPath,
      [join(report.plugin_root, 'skills/setup-paprika/scripts/init-service.mjs'), service], directory));
    assert.equal(initialized.service_version, report.service_version);
    assert.equal(initialized.registered, false);
    await writeFile(join(report.plugin_root, 'stale.txt'), 'Stale generated file');
    await assert.rejects(prepareGithubPlugin({ repository: directory, check: true }), /differs from current source/);
    const updated = await prepareGithubPlugin({ repository: directory });
    assert.equal(await readFile(join(updated.previous_package_backup, 'stale.txt'), 'utf8'), 'Stale generated file');
    await assert.rejects(readFile(join(updated.plugin_root, 'stale.txt')), { code: 'ENOENT' });
    assert.equal((await prepareGithubPlugin({ repository: directory, check: true })).checked, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
