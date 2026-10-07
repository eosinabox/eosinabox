// The wallet core, without a browser or a chain: key derivation and signature packing.

const { test, before } = require('node:test');
const assert = require('node:assert');
const { encode } = require('cbor-x');
const { p256 } = require('@noble/curves/p256');
const { sha256 } = require('@noble/hashes/sha256');
const { Numeric, Serialize } = require('eosjs');

let core;
before(async () => { core = await import('../client/lib/core.mjs'); });

const concat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]));

// What an authenticator returns from navigator.credentials.create for a new P-256 key.
function attestationFor(publicKey, flags) {
  const point = p256.ProjectivePoint.fromHex(publicKey).toRawBytes(false); // 04 || x || y
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(point.subarray(1, 33))], [-3, Buffer.from(point.subarray(33))]]);
  const credentialId = Uint8Array.from({ length: 20 }, (_, i) => i);
  const authData = concat(
    new Uint8Array(32), [flags], [0, 0, 0, 1], new Uint8Array(16),
    [0, credentialId.length], credentialId, encode(cose),
  );
  return encode({ fmt: 'none', attStmt: {}, authData: Buffer.from(authData) });
}

// The key as eosjs, the library the wallet used before, would write it.
function eosjsKey(publicKey, userPresence, rpId) {
  const ser = new Serialize.SerialBuffer({ textEncoder: new TextEncoder(), textDecoder: new TextDecoder() });
  ser.pushArray(p256.ProjectivePoint.fromHex(publicKey).toRawBytes(true));
  ser.push(userPresence);
  ser.pushString(rpId);
  return Numeric.publicKeyToString({ type: Numeric.KeyType.wa, data: ser.asUint8Array() });
}

test('a key derived from an attestation matches the eosjs encoding', () => {
  for (let i = 0; i < 20; i++) {
    const publicKey = p256.getPublicKey(p256.utils.randomPrivateKey());
    const key = core.publicKeyFromAttestation(attestationFor(publicKey, 0x45), 'eosinabox.com');
    assert.equal(key, eosjsKey(publicKey, 2, 'eosinabox.com'));
  }
});

test('the key records user presence and the domain it is bound to', () => {
  const publicKey = p256.getPublicKey(p256.utils.randomPrivateKey());
  const verified = core.publicKeyFromAttestation(attestationFor(publicKey, 0x45), 'wallet.example.org');
  const presentOnly = core.publicKeyFromAttestation(attestationFor(publicKey, 0x41), 'wallet.example.org');
  assert.equal(core.describeKey(verified).userPresence, 2);
  assert.equal(core.describeKey(presentOnly).userPresence, 1);
  assert.equal(core.describeKey(verified).rpId, 'wallet.example.org');
  assert.notEqual(verified, presentOnly);
});

test('an attestation without credential data, or with another algorithm, is refused', () => {
  const publicKey = p256.getPublicKey(p256.utils.randomPrivateKey());
  assert.throws(() => core.publicKeyFromAttestation(attestationFor(publicKey, 0x05), 'eosinabox.com'), /attested credential/);
  const rsa = encode({ fmt: 'none', attStmt: {}, authData: Buffer.from(concat(
    new Uint8Array(32), [0x45], [0, 0, 0, 1], new Uint8Array(16), [0, 1], [9], encode(new Map([[1, 3], [3, -257]])),
  )) });
  assert.throws(() => core.publicKeyFromAttestation(rsa, 'eosinabox.com'), /not EC2/);
});

test('an assertion is packed as a signature that recovers to the signing key', () => {
  for (let i = 0; i < 20; i++) {
    const privateKey = p256.utils.randomPrivateKey();
    const publicKey = p256.getPublicKey(privateKey);
    const key = core.publicKeyFromAttestation(attestationFor(publicKey, 0x45), 'eosinabox.com');
    const authenticatorData = concat(sha256('eosinabox.com'), [0x05], [0, 0, 0, 2]);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: 'abc', origin: 'https://eosinabox.com' }));
    const signed = sha256(concat(authenticatorData, sha256(clientDataJSON)));
    // Authenticators return DER and do not normalise s, so sign without low-s.
    const signature = p256.sign(signed, privateKey, { lowS: false }).toDERRawBytes();

    const packed = core.signatureFromAssertion({ authenticatorData, clientDataJSON, signature }, key);
    assert.match(packed, /^SIG_WA_/);

    // Unpack it the way the chain does and recover the signer.
    const data = Numeric.stringToSignature(packed).data;
    const recovery = data[0] - 31;
    const compact = p256.Signature.fromCompact(data.subarray(1, 65)).addRecoveryBit(recovery);
    assert.ok(!compact.hasHighS(), 'the chain only accepts low-s signatures');
    assert.deepEqual(compact.recoverPublicKey(signed).toRawBytes(true), p256.ProjectivePoint.fromHex(publicKey).toRawBytes(true));
    assert.equal(data.length, 65 + 1 + authenticatorData.length + 1 + clientDataJSON.length);
  }
});

test('an assertion made by a different key is refused', () => {
  const key = core.publicKeyFromAttestation(attestationFor(p256.getPublicKey(p256.utils.randomPrivateKey()), 0x45), 'eosinabox.com');
  const authenticatorData = concat(sha256('eosinabox.com'), [0x05], [0, 0, 0, 2]);
  const clientDataJSON = new TextEncoder().encode('{}');
  const signed = sha256(concat(authenticatorData, sha256(clientDataJSON)));
  const signature = p256.sign(signed, p256.utils.randomPrivateKey()).toDERRawBytes();
  assert.throws(() => core.signatureFromAssertion({ authenticatorData, clientDataJSON, signature }, key), /not made by the key/);
});
