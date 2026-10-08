import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTemplate } from '../assets/service-template/scripts/bundle.mjs';

const skillDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateDirectory = resolve(skillDirectory, 'assets/service-template');

export async function initializeService(destination) {
  if (!destination || !isAbsolute(destination)) throw new Error('Provide an absolute destination directory for the private service source.');
  const target = resolve(destination);
  const insideTemplate = relative(templateDirectory, target);
  if (!insideTemplate || (insideTemplate !== '..' && !insideTemplate.startsWith(`..${sep}`) && !isAbsolute(insideTemplate))) {
    throw new Error('Choose a workspace outside the packaged service template.');
  }
  const validation = await verifyTemplate(templateDirectory);
  let existing;
  try { existing = await readdir(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.length) throw new Error('Destination is not empty. Reuse an existing service or choose a new directory.');
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(templateDirectory)) {
    await cp(resolve(templateDirectory, entry), resolve(target, entry), { recursive: true, force: false, errorOnExist: true });
  }
  return { directory: target, service_version: validation.service_version, template_verified: true, registered: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await initializeService(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
