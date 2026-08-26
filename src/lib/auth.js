// Gatekeeper — the friend key. Password mode is shipped; signature mode is a
// documented stub. Classic script; attaches to globalThis.GKAuth.
// Depends on globalThis.GK and globalThis.GKStorage.

(() => {
  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Friend sets the password once (in Settings). We store only the hash.
  async function setFriendPassword(plain) {
    const hash = await sha256Hex(plain);
    await GKStorage.patchConfig({ friendPasswordHash: hash, authMode: 'password' });
    return true;
  }

  async function hasFriendKey() {
    const cfg = await GKStorage.getConfig();
    return Boolean(cfg.friendPasswordHash);
  }

  // Verify an attempt and, on success, open a 10-minute unlock window.
  async function verifyPassword(plain) {
    const cfg = await GKStorage.getConfig();
    if (!cfg.friendPasswordHash) return { ok: false, reason: 'not_configured' };
    const hash = await sha256Hex(plain);
    if (hash !== cfg.friendPasswordHash) return { ok: false, reason: 'mismatch' };
    await GKStorage.set('unlockUntil', Date.now() + GK.UNLOCK_WINDOW_MS);
    return { ok: true };
  }

  async function isUnlocked() {
    const until = (await GKStorage.get('unlockUntil')) || 0;
    return Date.now() < until;
  }

  async function unlockRemainingMs() {
    const until = (await GKStorage.get('unlockUntil')) || 0;
    return Math.max(0, until - Date.now());
  }

  // --- Signature mode (ECDSA P-256 challenge-response) — NOT wired this build ---
  // The preferred design from the PRD: friend holds a private key, the extension
  // stores the public JWK, verifies a signature over a random challenge via
  // crypto.subtle.verify. Left here as a marked stub behind authMode:"signature".
  async function verifySignature(/* challenge, signatureB64 */) {
    throw new Error('signature mode not implemented in this build; use authMode="password"');
  }

  globalThis.GKAuth = {
    sha256Hex,
    setFriendPassword,
    hasFriendKey,
    verifyPassword,
    isUnlocked,
    unlockRemainingMs,
    verifySignature,
  };
})();
