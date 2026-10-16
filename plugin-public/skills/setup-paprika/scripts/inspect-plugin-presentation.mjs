import { existsSync, realpathSync } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function regular(root, relative, maximum) {
  if (typeof relative !== 'string' || !relative.startsWith('./') || relative.includes('\\') || relative.slice(2).split('/').some(part => !part || part === '.' || part === '..')) throw new Error('unsafe_relative_path');
  let path = root;
  const parts = relative.slice(2).split('/');
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !(index === parts.length - 1 ? stat.isFile() : stat.isDirectory())) throw new Error('nonregular_or_symlink');
    if (index === parts.length - 1 && stat.size > maximum) throw new Error('file_too_large');
  }
  return readFile(path);
}
async function document(root, path, optional = false) {
  try { return JSON.parse((await regular(root, './' + path, 1024 * 1024)).toString('utf8')); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}

// Reports portable package evidence only. No install, refresh, cache edit, network
// request, account enumeration or rendering operation is performed.
export async function inspectPluginPresentation(pluginRoot) {
  const root = resolve(pluginRoot), issues = [], icons = [];
  const manifest = await document(root, 'plugin.json'), compatibility = await document(root, '.codex-plugin/plugin.json', true);
  const inline = manifest.extensions?.['com.openai'];
  const source = object(inline) ? 'root_extension' : compatibility ? 'compatibility_overlay' : 'missing';
  const listing = source === 'root_extension' ? inline.interface : compatibility?.interface;
  if (!object(listing)) issues.push('effective_interface_missing');
  if (compatibility && (compatibility.name !== manifest.name || compatibility.version !== manifest.version)) issues.push('compatibility_identity_or_version_drift');
  if (source === 'root_extension' && compatibility?.interface && !isDeepStrictEqual(listing, compatibility.interface)) issues.push('shadowed_compatibility_interface_differs');
  async function icon(path, field, base = root) {
    const result = {field, path: typeof path === 'string' ? path : null, status: 'invalid'};
    try {
      const bytes = await regular(base, path, 5 * 1024 * 1024);
      if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString() !== 'IHDR') throw new Error('invalid_or_unsupported_png');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      if (width !== height || width < 48 || width > 4096) throw new Error('invalid_dimensions');
      Object.assign(result, {status:'valid', bytes:bytes.length, width, height, sha256:sha(bytes)});
    } catch (error) { result.reason = ['ENOENT', 'EACCES'].includes(error.code) ? error.code : /^[a-z_]+$/.test(error.message) ? error.message : 'unreadable_asset'; issues.push(field + ':' + result.reason); }
    icons.push(result);
  }
  for (const field of ['logo', 'composerIcon', 'logoDark', 'composerIconDark']) {
    if (listing?.[field] !== undefined) await icon(listing[field], field);
    else if (['logo', 'composerIcon'].includes(field)) issues.push(field + ':missing');
  }
  let skills = [];
  try {
    const info = await lstat(join(root, 'skills'));
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid_skills_directory');
    skills = await readdir(join(root, 'skills'), {withFileTypes:true});
  } catch (error) { if (error.code !== 'ENOENT') issues.push('unsafe_skills_directory'); }
  for (const skill of skills.filter(entry => entry.isDirectory() && /^[a-z][a-z0-9-]*$/.test(entry.name))) {
    const relative = 'skills/' + skill.name;
    let text;
    try { text = (await regular(root, './' + relative + '/agents/openai.yaml', 64 * 1024)).toString('utf8'); }
    catch (error) { if (error.code !== 'ENOENT') issues.push(relative + ':unreadable_skill_interface'); continue; }
    for (const match of text.matchAll(/^\s*(icon_small|icon_large):\s*["']([^"']+)["']\s*$/gm)) await icon(match[2], relative + ':' + match[1], join(root, relative));
  }
  return {format:1, name:manifest.name, version:manifest.version, presentation_source:source,
    icons, issues, package_valid:issues.length === 0, host_rendering:'not_tested',
    account_catalog_projection:'not_tested', installed_release_identity:'not_verified_by_file_version',
    limits:['PNG checks validate packaged Paprika assets, not host display.', 'An installed version alone does not identify an account release.', 'A valid asset does not prove catalog propagation or icon-cache refresh.']};
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node inspect-plugin-presentation.mjs <plugin-root>');
    const report = await inspectPluginPresentation(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    if (!report.package_valid) process.exitCode = 2;
  } catch { console.error('Presentation inspection failed; verify the selected plugin directory and readable regular manifests.'); process.exitCode = 2; }
}
