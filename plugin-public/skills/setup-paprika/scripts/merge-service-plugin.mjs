import { cp, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const connectionFiles = ['.app.json', 'paprika-connection.json'];
const templatePath = 'skills/setup-paprika/assets/service-template';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)))
    throw new Error('Unexpected connection configuration fields.');
}
async function regular(path, directory = false) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()))
    throw new Error('Connection input must be a regular ' + (directory ? 'directory: ' : 'file: ') + path);
}
function appEntry(apps) {
  keys(apps, ['apps']);
  if (!object(apps.apps) || Object.keys(apps.apps).length !== 1)
    throw new Error('Standalone messaging requires exactly one existing service App.');
  const [alias, entry] = Object.entries(apps.apps)[0];
  keys(entry, ['id', 'required']);
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(alias) || typeof entry.id !== 'string'
      || !/^asdk_app_sites_[a-z0-9]+$/.test(entry.id)
      || (entry.required !== undefined && typeof entry.required !== 'boolean'))
    throw new Error('Use the exact App ID from the selected Site plugin, not its plugin ID.');
  return { alias, entry };
}
function endpoint(value) {
  if (typeof value !== 'string') throw new Error('Missing Site MCP endpoint.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/mcp')
    throw new Error('Use the exact HTTPS MCP endpoint returned by Sites, without credentials.');
  return url;
}
function checkConnection(apps, connection) {
  const { alias, entry } = appEntry(apps);
  keys(connection, ['format', 'kind', 'project_id', 'service_plugin_id', 'app_id', 'mcp_url', 'oauth_resource']);
  if (connection.format !== 1 || connection.kind !== 'existing-sites-app'
      || typeof connection.project_id !== 'string' || !/^appgprj_[a-z0-9]+$/.test(connection.project_id)
      || connection.app_id !== entry.id || connection.service_plugin_id !== 'plugin_' + entry.id)
    throw new Error('Site connection and installed service App do not match.');
  const mcp = endpoint(connection.mcp_url), oauth = endpoint(connection.oauth_resource);
  if (mcp.href !== oauth.href) throw new Error('Site MCP endpoint and OAuth resource must match.');
  return { alias, entry, origin: mcp.origin };
}

export async function readSiteServiceBinding({ servicePluginRoot, siteConnection }) {
  if (!isAbsolute(servicePluginRoot ?? '')) throw new Error('Provide the absolute installed service plugin directory.');
  await regular(servicePluginRoot, true);
  const manifestPath = resolve(servicePluginRoot, '.codex-plugin/plugin.json');
  await regular(manifestPath); await regular(resolve(servicePluginRoot, '.app.json'));
  const manifest = await json(manifestPath), apps = await json(resolve(servicePluginRoot, '.app.json'));
  if (manifest.apps !== './.app.json') throw new Error('Selected service plugin does not declare its existing App binding.');
  const { entry } = appEntry(apps);
  const site = typeof siteConnection === 'string' ? await json(siteConnection) : siteConnection;
  if (!object(site) || site.current_user_role !== 'owner' || site.status !== 'active' || !object(site.mcp_connection))
    throw new Error('Provide the current native Sites owner read-back with include_mcp_connection enabled.');
  const connection = { format: 1, kind: 'existing-sites-app', project_id: site.id,
    service_plugin_id: site.mcp_connection.plugin_id, app_id: entry.id,
    mcp_url: site.mcp_connection.mcp_url, oauth_resource: site.mcp_connection.oauth_resource };
  const checked = checkConnection(apps, connection);
  if (manifest.interface?.websiteURL !== checked.origin)
    throw new Error('Installed service plugin and selected Site have different origins.');
  const requiredApps = structuredClone(apps);
  requiredApps.apps[checked.alias].required = true;
  return { apps: requiredApps, connection };
}

export async function verifyStandaloneBinding(pluginRoot, manifest, compatibility, bundle) {
  if (manifest.extensions?.['com.openai']?.apps !== './.app.json' || compatibility.apps !== './.app.json'
      || compatibility.extensions?.['com.openai']?.apps !== './.app.json' || bundle.distribution !== 'standalone')
    throw new Error('Both manifests must discover the standalone App binding.');
  await regular(resolve(pluginRoot, '.app.json')); await regular(resolve(pluginRoot, 'paprika-connection.json'));
  const apps = await json(resolve(pluginRoot, '.app.json')), connection = await json(resolve(pluginRoot, 'paprika-connection.json'));
  const checked = checkConnection(apps, connection);
  if (checked.entry.required !== true) throw new Error('The messaging service App must be required.');
  return { apps, connection };
}

// ZIP bytes are deterministic and need neither Bash nor an OS-specific archiver.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
export async function writePluginZip(archive, pluginRoot, name, files) {
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const filename = Buffer.from(name + '/' + file.path), bytes = await readFile(resolve(pluginRoot, file.path));
    if (sha256(bytes) !== file.sha256) throw new Error('Package changed while creating the archive: ' + file.path);
    const crc = crc32(bytes), header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  await writeFile(archive, Buffer.concat([...local, directory, end]));
}

export async function mergeServicePlugin({ pluginRoot, servicePluginRoot, siteConnection, outputRoot, version } = {}) {
  if (typeof pluginRoot !== 'string') throw new Error('Provide the complete base plugin directory.');
  pluginRoot = resolve(pluginRoot);
  await regular(pluginRoot, true);
  const utilities = await import(pathToFileURL(resolve(pluginRoot, templatePath, 'scripts/bundle.mjs')).href);
  const base = await json(resolve(pluginRoot, 'plugin.json'));
  const oldBundle = await json(resolve(pluginRoot, 'paprika-bundle.json'));
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(base.name) || !/^\d+\.\d+\.\d+$/.test(base.version)
      || oldBundle.plugin_name !== base.name || oldBundle.plugin_version !== base.version)
    throw new Error('Invalid base package identity or version.');
  if (version !== undefined) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Provide a strict standalone package version.');
    const old = base.version.split('.').map(Number), next = version.split('.').map(Number);
    const first = next.findIndex((part, i) => part !== old[i]);
    if (first >= 0 && next[first] < old[first]) throw new Error('Standalone package must not downgrade the base version.');
  }
  if (base.extensions?.['com.openai']?.apps != null || oldBundle.distribution === 'standalone')
    throw new Error('Package already has an App binding; preserve it and reconcile the existing standalone release.');
  await utilities.inspectReusableFiles(pluginRoot);
  await utilities.verifyTemplate(resolve(pluginRoot, templatePath));
  const binding = await readSiteServiceBinding({ servicePluginRoot, siteConnection });
  outputRoot = resolve(outputRoot ?? 'artifacts/paprika-standalone');
  const suffix = relative(pluginRoot, outputRoot);
  if (!suffix || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep)))
    throw new Error('Standalone output must stay outside the source plugin.');
  await mkdir(outputRoot, { recursive: true });
  const actualSuffix = relative(await realpath(pluginRoot), await realpath(outputRoot));
  if (!actualSuffix || (!isAbsolute(actualSuffix) && actualSuffix !== '..' && !actualSuffix.startsWith('..' + sep)))
    throw new Error('Standalone output must stay outside the source plugin.');
  const stage = await mkdtemp(resolve(outputRoot, 'package-')), target = resolve(stage, base.name);
  await cp(pluginRoot, target, { recursive: true });
  const manifest = await json(resolve(target, 'plugin.json'));
  const compatibility = await json(resolve(target, '.codex-plugin/plugin.json'));
  const bundle = await json(resolve(target, 'paprika-bundle.json'));
  manifest.version = version ?? manifest.version;
  compatibility.version = manifest.version; bundle.plugin_version = manifest.version;
  manifest.extensions['com.openai'].apps = './.app.json';
  compatibility.apps = './.app.json'; compatibility.extensions['com.openai'].apps = './.app.json';
  manifest.extensions['com.openai'].interface.displayName = 'Paprika Messenger';
  compatibility.interface = structuredClone(manifest.extensions['com.openai'].interface);
  bundle.distribution = 'standalone';
  await save(resolve(target, 'plugin.json'), manifest); await save(resolve(target, '.codex-plugin/plugin.json'), compatibility);
  await save(resolve(target, 'paprika-bundle.json'), bundle); await save(resolve(target, '.app.json'), binding.apps);
  await save(resolve(target, 'paprika-connection.json'), binding.connection);
  await writeFile(resolve(target, 'README.md'), '# Paprika Messenger\n\nOne private account package combines both skills, the complete service source and a required reference to your existing Sites App. That App supplies the MCP tools and existing OAuth connection. Install this package and complete any requested App authentication. No second MCP server or new Site is created. Preserve the selected Site, database and account access.\n\nThis personalized package is for its selected owner account. Build a separate package against each other owner\'s own Site. Keep the generated connection files and archive outside public Git history. Existing Local and service-only plugin entries are legacy installations; remove them only after verifying tools and both skills with this combined package enabled by itself. Automatic receiving and schedules require the receiving chat\'s own instructions.\n');
  await verifyStandaloneBinding(target, manifest, compatibility, bundle);
  const iconPath = manifest.extensions['com.openai'].interface.logo;
  if (iconPath !== './assets/paprika-icon.png' || manifest.extensions['com.openai'].interface.composerIcon !== iconPath)
    throw new Error('Preserve both Paprika logo and composer-icon paths.');
  const icon = await readFile(resolve(target, iconPath));
  const originalIcon = await readFile(resolve(pluginRoot, base.extensions['com.openai'].interface.logo));
  if (!icon.equals(originalIcon)) throw new Error('Standalone merge must preserve the existing Paprika icon.');
  const files = await utilities.inspectReusableFiles(target, { ownerBindingFiles: connectionFiles });
  const archive = resolve(stage, base.name + '-' + manifest.version + '.zip');
  await writePluginZip(archive, target, base.name, files);
  const report = { archive, plugin_root: target, package_version: manifest.version, source_version: bundle.service_version,
    distribution: 'standalone', binding_configured: true, file_count: files.length,
    icon_sha256: sha256(icon), sha256: sha256(await readFile(archive)) };
  await save(resolve(stage, 'package-report.json'), report);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  const fields = { '--plugin': 'pluginRoot', '--service-plugin': 'servicePluginRoot', '--site-connection': 'siteConnection', '--output': 'outputRoot', '--version': 'version' };
  for (let i = 0; i < args.length; i += 2) {
    if (!fields[args[i]] || !args[i + 1] || options[fields[args[i]]] !== undefined)
      throw new Error('Usage: merge-service-plugin.mjs --service-plugin ABSOLUTE_DIRECTORY --site-connection SITES_REPORT_JSON [--plugin DIRECTORY] [--output DIRECTORY] [--version VERSION]');
    options[fields[args[i]]] = args[i + 1];
  }
  options.pluginRoot ??= resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  console.log(JSON.stringify(await mergeServicePlugin(options)));
}
