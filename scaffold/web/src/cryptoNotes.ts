export type NoteKey = { key: CryptoKey; fingerprint: string };
export type SealedNote = { id: string; author: string; fingerprint: string; iv: string; ciphertext: string };
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const bytes = (text: string) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
export const generateSecret = () => b64(crypto.getRandomValues(new Uint8Array(32)));

export async function importSecret(secret: string): Promise<NoteKey> {
  if (!/^[\w-]{43}$/.test(secret)) throw new Error('Enter the 43-character workspace key.');
  const raw = bytes(secret);
  if (b64(raw) !== secret) throw new Error('Invalid workspace key.');
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), b => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, fingerprint };
}
function additionalData(workspace: string, contact: string, note: Pick<SealedNote, 'id' | 'author' | 'fingerprint'>) {
  return encoder.encode(JSON.stringify(['switchboard-note-v1', workspace, contact, note.author, note.id, note.fingerprint]));
}
export async function seal(key: NoteKey, workspace: string, contact: string, author: string, text: string): Promise<SealedNote> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const meta = { author, id: crypto.randomUUID(), fingerprint: key.fingerprint };
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(workspace, contact, meta) }, key.key, encoder.encode(text));
  return { ...meta, iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) };
}
export async function unseal(key: NoteKey, workspace: string, contact: string, note: SealedNote) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(note.iv),
    additionalData: additionalData(workspace, contact, note) }, key.key, bytes(note.ciphertext));
  return new TextDecoder('utf-8', { fatal: true }).decode(plain);
}
