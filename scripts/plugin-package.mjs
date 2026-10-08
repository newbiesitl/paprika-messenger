import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { inspectReusableFiles, normalizeReusableText, stageTemplate, verifyTemplate } from './bundle.mjs';

export const bundleMetadataFile = 'paprika-bundle.json';
const templatePath = 'skills/setup-paprika/assets/service-template';

export async function verifyPluginPackage(pluginRoot) {
  const manifest = JSON.parse(await readFile(resolve(pluginRoot, 'plugin.json'), 'utf8'));
  const extension = manifest.extensions?.['com.openai'];
  const listing = extension?.interface;
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(manifest.name) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version))
    throw new Error('Invalid plugin identity or version.');
  for (const field of ['skills', 'mcpServers', 'apps', 'interface'])
    if (Object.hasOwn(manifest, field)) throw new Error('Non-portable root manifest field: ' + field);
  for (const [field, maximum] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000], ['developerName', 80]]) {
    const value = listing?.[field];
    if (typeof value !== 'string' || !value.length || value.length > maximum) throw new Error('Invalid listing field: ' + field);
  }
  const prompts = typeof listing.defaultPrompt === 'string' ? [listing.defaultPrompt] : listing.defaultPrompt;
  if (!Array.isArray(prompts) || !prompts.length || prompts.length > 3 || prompts.some(prompt => typeof prompt !== 'string' || !prompt.length || prompt.length > 128))
    throw new Error('Invalid starter prompts.');
  const files = await inspectReusableFiles(pluginRoot);
  if (files.some(file => file.path === '.app.json' || file.path === 'mcp.json') || extension.apps != null)
    throw new Error('Reusable setup package must not bind another owner\'s service.');
  const onboarding = extension.onboardingSkill;
  if (typeof onboarding !== 'string' || !/^\.\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(onboarding))
    throw new Error('Invalid onboarding skill reference.');
  await readFile(resolve(pluginRoot, onboarding));
  const icon = await readFile(resolve(pluginRoot, listing.logo));
  if (icon.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Primary icon must be a PNG.');
  const width = icon.readUInt32BE(16), height = icon.readUInt32BE(20);
  if (width !== height || width < 48 || width > 4096 || icon.length > 5 * 1024 * 1024) throw new Error('Invalid primary icon size.');
  const service = await verifyTemplate(resolve(pluginRoot, templatePath));
  const bundle = JSON.parse(await readFile(resolve(pluginRoot, bundleMetadataFile), 'utf8'));
  if (bundle.format !== 1 || bundle.plugin_name !== manifest.name || bundle.plugin_version !== manifest.version
      || bundle.service_version !== service.service_version || bundle.service_template !== './' + templatePath
      || bundle.onboarding_skill !== onboarding)
    throw new Error('Plugin and bundled service metadata must match.');
  if (manifest.name === 'paprika-messenger-private' || files.some(file => file.path === '.codex-plugin/plugin.json')) {
    const compatibility = JSON.parse(await readFile(resolve(pluginRoot, '.codex-plugin/plugin.json'), 'utf8'));
    if (compatibility.name !== manifest.name || compatibility.version !== manifest.version
        || compatibility.extensions?.['com.openai']?.onboardingSkill !== onboarding
        || compatibility.apps != null || compatibility.extensions?.['com.openai']?.apps != null
        || JSON.stringify(compatibility.interface) !== JSON.stringify(listing))
      throw new Error('Compatibility manifest must preserve plugin identity, interface and onboarding.');
  }
  return { manifest, bundle, files, icon: { width, height } };
}

// A portable store-only ZIP keeps packaging independent of Bash, PowerShell and
// tar's platform-specific -a behavior. Paths and bytes are validated first.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
async function writeZip(archive, pluginRoot, name, files) {
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const filename = Buffer.from(name + '/' + file.path);
    const bytes = await readFile(resolve(pluginRoot, file.path));
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42); central.push(record, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(archive, Buffer.concat([...local, directory, end]));
}

export async function preparePluginPackage({ repository, kind = 'account', outputRoot } = {}) {
  if (!repository || !['account', 'directory', 'local'].includes(kind)) throw new Error('Provide a repository and package kind.');
  repository = resolve(repository);
  outputRoot = resolve(outputRoot ?? resolve(repository, 'artifacts/paprika-messenger-' + (kind === 'account' ? 'account' : 'directory')));
  const sourceManifest = JSON.parse(await readFile(resolve(repository, 'plugin-public/plugin.json'), 'utf8'));
  const manifest = structuredClone(sourceManifest);
  const extension = manifest.extensions['com.openai'];
  if (kind === 'account') {
    manifest.name = 'paprika-messenger-private';
    extension.interface.displayName = 'Paprika Messenger (Private)';
    extension.interface.longDescription = 'Private account edition. ' + extension.interface.longDescription;
    delete extension.publication; delete extension.review;
  }
  if (kind === 'local') extension.interface.displayName = 'Paprika Messenger (Local)';
  await mkdir(outputRoot, { recursive: true });
  const stage = await mkdtemp(resolve(outputRoot, 'package-'));
  const pluginRoot = resolve(stage, manifest.name);
  await cp(resolve(repository, 'plugin-public'), pluginRoot, { recursive: true });
  await cp(resolve(repository, 'skills/paprika-messenger'), resolve(pluginRoot, 'skills/paprika-messenger'), { recursive: true });
  await cp(resolve(repository, 'LICENSE'), resolve(pluginRoot, 'LICENSE'));
  await mkdir(resolve(pluginRoot, 'assets'), { recursive: true });
  await cp(resolve(repository, 'skills/paprika-messenger/assets/dot-icon.png'), resolve(pluginRoot, 'assets/paprika-icon.png'));
  await stageTemplate(resolve(pluginRoot, templatePath), { source: repository });
  const service = await verifyTemplate(resolve(pluginRoot, templatePath));
  await writeFile(resolve(pluginRoot, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (kind === 'account' || kind === 'local') {
    const { $schema, extensions, ...metadata } = manifest;
    await mkdir(resolve(pluginRoot, '.codex-plugin'), { recursive: true });
    await writeFile(resolve(pluginRoot, '.codex-plugin/plugin.json'), JSON.stringify({
      ...metadata, skills: './skills/', interface: extension.interface,
      extensions: { 'com.openai': { onboardingSkill: extension.onboardingSkill } },
    }, null, 2) + '\n');
  }
  const bundle = { format: 1, plugin_name: manifest.name, plugin_version: manifest.version,
    service_version: service.service_version, service_template: './' + templatePath,
    onboarding_skill: extension.onboardingSkill };
  await writeFile(resolve(pluginRoot, bundleMetadataFile), JSON.stringify(bundle, null, 2) + '\n');
  if (kind === 'account')
    await writeFile(resolve(pluginRoot, 'README.md'), '# Paprika Messenger (Private)\n\nPlugin version ' + manifest.version
      + ', bundled service version ' + service.service_version + '. This one package includes setup, messaging skills and the complete reusable service source. Default installation saves this complete ZIP through Plugin Creator\'s hosted account-save workflow, then installs the returned private account plugin for supported cloud, mobile and desktop clients. Select Personal account context for personal scope; an active workspace selects workspace scope. A local Codex marketplace install does not complete account installation. See [Account installation](https://github.com/newbiesitl/paprika-messenger/blob/main/docs/ACCOUNT-PLUGIN.md). Open onboarding to verify the account package, check Sites and reuse your service or deploy a new private instance. Connect the same Site-provisioned service plugin in each participating client and verify that client separately; receiving chats opt in to notifications separately.\n');
  if (kind === 'local')
    await writeFile(resolve(pluginRoot, 'README.md'), '# Paprika Messenger (Local)\n\nPlugin version ' + manifest.version
      + ', bundled service version ' + service.service_version + '. This local Codex copy includes the setup workflow, messaging skills and reusable service source. Use the existing authenticated Messenger service connection. Installing the local plugin creates no additional service, subscription or schedule. This copy is separate from the private account plugin and public submission.\n');
  await normalizeReusableText(pluginRoot);
  const validation = await verifyPluginPackage(pluginRoot);
  const archive = resolve(outputRoot, manifest.name + '-' + manifest.version + '.zip');
  await writeZip(archive, pluginRoot, manifest.name, validation.files);
  const report = { archive, plugin_root: pluginRoot, package_version: manifest.version, source_version: service.service_version,
    file_count: validation.files.length, icon: validation.icon,
    sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files: validation.files };
  await writeFile(resolve(outputRoot, 'package-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
