# Private team notes

An administrator opens **Private note → Unlock notes** in an existing conversation. Their browser generates a random 256-bit workspace key with Web Crypto. The administrator saves it in a password manager and gives it to verified workspace members through a separate trusted channel. The first administrator to register a SHA-256 fingerprint establishes the workspace key. Concurrent attempts with a different fingerprint receive a conflict.

Each agent enters the shared key in their own browser. The browser compares its fingerprint with the registered value, then imports a non-extractable AES-GCM key. The application keeps the imported key in memory for the active workspace. Signing out, switching workspaces or reloading requires unlocking again. The server has no key recovery mechanism.

For each note, the browser generates a UUID and a random 96-bit IV, encodes the text as UTF-8 and encrypts it using AES-256-GCM with a 128-bit authentication tag. The additional authenticated data is the UTF-8 JSON encoding of the ordered array `["switchboard-note-v1", workspace, contact, authorSub, noteId, fingerprint]`. Ciphertext, including the tag, and IV use unpadded base64url. A retry of the same submission sends the same sealed note.

MongoDB stores the fingerprint, IV, ciphertext, note ID, authenticated author's subject, workspace, contact, time and stream sequence. API authorization comes from the server session. The server assigns the author and limits reads and writes to workspace members. A WebSocket frame announces a change, then authorized clients fetch the conversation and decrypt locally. Notes never enter the Pigeon send queue.

## Threat limits

1. An attacker controlling the application server can serve modified JavaScript that reads a key or plaintext the next time a user unlocks notes. A compromised browser or extension has similar access.
2. A member who copies the shared key can decrypt previously captured notes and share them. Removing workspace access blocks future API reads. This version has no group key rotation or forward secrecy.
3. A database reader can see membership-related metadata, contact identifiers, timing and ciphertext lengths. The scheme provides no traffic-analysis protection, and a storage administrator can delete or withhold notes.
