/** Only feature endpoints consumed by the product are exposed to its renderer. */
export const CALL_ENDPOINTS = new Set([
  'session/list', 'session/create', 'session/rename', 'session/prompt', 'session/cancel',
  'session/selectModel', 'session/modelCatalog', 'session/projections', 'session/page',
  'goals/get', 'goals/create', 'goals/pause', 'goals/resume',
  'workspace/create', 'workspace/rename', 'workspace/initializeDefault', 'workspace/archiveSession',
  'settings/describe', 'settings/update', 'settings/mutate', 'credentials/set', 'credentials/list',
  'llm/discoverModels',
  'skills/list', 'kuadeCapabilities/inventory',
  '$events/result', 'commands/execute', 'permissionPresets/catalog', 'userQuestions/answer',
]);
export const STREAM_ENDPOINTS = new Set(['$events', 'session/follow', 'session/control', 'workspace/follow', 'userQuestions/attachWait']);
export function validateEndpoint(endpoint: string, stream = false): void {
  if (!(stream ? STREAM_ENDPOINTS : CALL_ENDPOINTS).has(endpoint)) throw new Error('此操作未在 Kuade Harness 中开放');
}
export function redactLog(text: string): string {
  return text.replace(/([?&]token=)[^\s&]+/gi, '$1[redacted]').replace(/(Bearer\s+)\S+/gi, '$1[redacted]');
}
