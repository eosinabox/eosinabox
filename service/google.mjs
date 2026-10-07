// Verify a Google sign-in ID token with nothing but node:crypto.
// Google Identity Services hands the browser a signed RS256 JWT; Google publishes the keys.

import crypto from 'node:crypto';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const b64url = (s) => Buffer.from(s, 'base64url');

export function googleVerifier({ clientId, fetchImpl = fetch, now = () => Date.now() }) {
  let cache = { keys: new Map(), fetchedAt: 0 };

  async function keyFor(kid) {
    if (now() - cache.fetchedAt > 60 * 60 * 1000 || !cache.keys.has(kid)) {
      const res = await fetchImpl(JWKS_URL);
      if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
      const { keys } = await res.json();
      cache = {
        fetchedAt: now(),
        keys: new Map(keys.map((jwk) => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })])),
      };
    }
    const key = cache.keys.get(kid);
    if (!key) throw new Error('unknown signing key');
    return key;
  }

  /** Returns { email, name } for a valid token minted for this app; throws otherwise. */
  return async function verify(idToken) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new Error('malformed token');
    const [rawHeader, rawPayload, rawSignature] = parts;
    let header;
    try {
      header = JSON.parse(b64url(rawHeader).toString('utf8'));
    } catch {
      throw new Error('malformed token');
    }
    if (header.alg !== 'RS256') throw new Error(`unexpected alg ${header.alg}`);
    const key = await keyFor(header.kid);
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${rawHeader}.${rawPayload}`), key, b64url(rawSignature))) {
      throw new Error('bad signature');
    }
    const claims = JSON.parse(b64url(rawPayload).toString('utf8'));
    const seconds = Math.floor(now() / 1000);
    if (!ISSUERS.has(claims.iss)) throw new Error('bad issuer');
    if (claims.aud !== clientId) throw new Error('token was not minted for this app');
    if (!(claims.exp > seconds)) throw new Error('token expired');
    if (claims.nbf && claims.nbf > seconds + 60) throw new Error('token not yet valid');
    if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('email not verified by Google');
    if (!claims.email) throw new Error('token carries no email');
    return { email: String(claims.email).toLowerCase(), name: claims.name || null };
  };
}
