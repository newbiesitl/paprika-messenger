import { fail } from './validation.mjs';

// This is an owner-selected workflow, not an account entitlement or a client
// identity check. Participant labels cannot establish which host is calling.
export function serviceConfiguration(env = {}) {
  const configured = env.PAPRIKA_SERVICE_TYPE !== undefined;
  const serviceType = configured ? env.PAPRIKA_SERVICE_TYPE : 'dot-chatgpt-codex';
  if (!['chatgpt-codex', 'dot-chatgpt-codex'].includes(serviceType))
    fail(503, 'invalid_service_type', 'Set PAPRIKA_SERVICE_TYPE to chatgpt-codex or dot-chatgpt-codex in Sites runtime settings.');
  const dotEnabled = serviceType === 'dot-chatgpt-codex';
  return {
    service_type: serviceType,
    service_type_source: configured ? 'runtime_setting' : 'legacy_default',
    dot_enabled: dotEnabled,
    supported_clients: ['chatgpt', 'codex_local', 'codex_cloud', ...(dotEnabled ? ['dot'] : [])],
    receiving_surfaces: ['ChatGPT Work web', 'ChatGPT Work desktop with Cloud selected', ...(dotEnabled ? ['Dot'] : [])],
    receiving_host_capability_verification_required: true
  };
}
