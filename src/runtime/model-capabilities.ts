/** Only documented, provider-reported capabilities become selectable controls. */
import { EFFORT_NAMES } from '../shared/model-options';
export function ollamaCapabilityURL(baseURL: string, api: string): string | undefined {
  if (api !== 'openai-completions') return;
  try {
    const url = new URL(baseURL);
    if (url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) return;
    const cloud = url.origin === 'https://ollama.com';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === '11434' && ['http:', 'https:'].includes(url.protocol);
    if (cloud || local) return url.origin + '/api/show';
  } catch { /* Unrecognized endpoints use their declared upstream capabilities. */ }
}
export function ollamaReasoning(body: any): false | Record<string, string> | undefined {
  const values = body?.thinking?.values;
  if (!Array.isArray(values) || !values.length) return;
  if (values.every(value => value === false)) return false;
  const efforts: Record<string, string> = {};
  for (const value of values) {
    if (value === false) efforts.off = 'none';
    else if (value === true) efforts.high = 'high';
    else if (typeof value === 'string' && value !== 'off' && EFFORT_NAMES[value]) efforts[value] = value;
  }
  return Object.keys(efforts).some(level => level !== 'off') ? efforts : undefined;
}
/** An absent capability list is unknown, not a text-only declaration. */
export function ollamaInput(body: any): Array<'text' | 'image'> | undefined {
  const capabilities = body?.capabilities;
  if (!Array.isArray(capabilities) || !capabilities.every(value => typeof value === 'string')) return;
  if (capabilities.includes('vision')) return ['text', 'image'];
  if (capabilities.includes('completion')) return ['text'];
}
