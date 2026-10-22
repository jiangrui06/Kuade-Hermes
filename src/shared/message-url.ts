/** Model output can link to web pages, never arbitrary OS protocol handlers. */
export function messageWebUrl(value: string | undefined): string | undefined {
  if (!value || /[\u0000-\u0020\u007f]/.test(value) || !/^https?:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}
