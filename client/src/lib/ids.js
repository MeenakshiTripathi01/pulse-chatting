/**
 * Random id for a message being sent. crypto.randomUUID only exists on secure origins
 * (https or localhost), so fall back to getRandomValues, e.g. when testing over a LAN IP.
 */
export function createClientMessageId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
