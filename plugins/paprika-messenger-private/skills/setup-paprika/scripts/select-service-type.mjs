import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceTypes = ['chatgpt-codex', 'dot-chatgpt-codex'];

// The host supplies verified availability when its metadata exposes it. Missing
// tools are not evidence of a missing account entitlement. No probes or sends.
export function selectServiceType(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['requested_service_type', 'existing_service_type', 'dot_available'].includes(key)))
    throw new Error('Use an object with requested_service_type, existing_service_type and/or dot_available.');
  const { requested_service_type: requested = null, existing_service_type: existing = null, dot_available: dotAvailable = null } = input;
  for (const value of [requested, existing])
    if (value !== null && !serviceTypes.includes(value)) throw new Error('Unknown service type. Choose chatgpt-codex or dot-chatgpt-codex.');
  if (dotAvailable !== null && typeof dotAvailable !== 'boolean')
    throw new Error('dot_available must be true, false or null (unknown).');
  if (requested === 'dot-chatgpt-codex' && dotAvailable === false)
    throw new Error('Dot is unavailable for this account. Choose chatgpt-codex.');
  const serviceType = requested ?? existing ?? (dotAvailable === true ? 'dot-chatgpt-codex' : 'chatgpt-codex');
  return {
    service_type: serviceType,
    selection_source: requested ? 'explicit_choice' : existing ? 'existing_service' : dotAvailable === null ? 'default_without_dot' : 'host_capability',
    dot_available: dotAvailable,
    runtime_setting: { PAPRIKA_SERVICE_TYPE: serviceType }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(selectServiceType(JSON.parse(input))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
