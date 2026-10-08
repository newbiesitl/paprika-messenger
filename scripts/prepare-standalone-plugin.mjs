import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePluginPackage, verifyPluginPackage } from './plugin-package.mjs';
import { mergeServicePlugin } from '../plugin-public/skills/setup-paprika/scripts/merge-service-plugin.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
const fields = { '--service-plugin': 'servicePluginRoot', '--site-connection': 'siteConnection', '--output': 'outputRoot', '--kind': 'kind' };
for (let i = 0; i < args.length; i += 2) {
  if (!fields[args[i]] || !args[i + 1] || options[fields[args[i]]] !== undefined)
    throw new Error('Usage: prepare-standalone-plugin.mjs --service-plugin ABSOLUTE_DIRECTORY --site-connection SITES_REPORT_JSON [--kind account|local] [--output DIRECTORY]');
  options[fields[args[i]]] = args[i + 1];
}
if (!options.servicePluginRoot || !options.siteConnection || !['account', 'local'].includes(options.kind ?? 'account'))
  throw new Error('Provide an installed service plugin and native Sites connection report; kind defaults to account.');
options.outputRoot = resolve(options.outputRoot ?? resolve(repository, 'artifacts/paprika-standalone'));
const base = await preparePluginPackage({ repository, kind: options.kind ?? 'account', outputRoot: resolve(options.outputRoot, 'base') });
const report = await mergeServicePlugin({ ...options, pluginRoot: base.plugin_root });
await verifyPluginPackage(report.plugin_root);
console.log(JSON.stringify(report));
