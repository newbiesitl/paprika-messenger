import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePluginPackage } from './plugin-package.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = await preparePluginPackage({ repository, kind: 'directory' });
console.log(JSON.stringify({ archive: report.archive, plugin_root: report.plugin_root,
  package_version: report.package_version, source_version: report.source_version,
  file_count: report.file_count, sha256: report.sha256 }));
