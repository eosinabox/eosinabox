// The wallet's chain and key logic, with no DOM and no server behind it.
// Bundled into client/src/core.bundle.js (npm run build) as the global `EosinaboxCore`.

import { APIClient, Base58, Bytes, PublicKey, Serializer, Transaction } from '@wharfkit/antelope';
import { SigningRequest } from '@wharfkit/signing-request';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { Decoder } from 'cbor-x';
import { deflateRaw, inflateRaw } from 'pako';

export const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
export const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const varuint32 = (n) => {
  const out = [];
  do { out.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0)); n >>>= 7; } while (n);
  return Uint8Array.from(out);
};
// Always decode CBOR maps as Map: COSE keys are indexed by integers, not strings.
const cbor = new Decoder({ mapsAsObjects: false, useRecords: false });
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------------------------------
// Keys

// Turn a WebAuthn attestation into an Antelope PUB_WA_ key.
// authData layout (https://www.w3.org/TR/webauthn-2/#sctn-authenticator-data):
//   0..32    hash of the rpId, the domain the key is bound to
//   32       flags: bit 0 user present, bit 2 user verified, bit 6 attested credential data
//   33..37   signature counter
//   37..53   AAGUID
//   53..55   credential id length L
//   55..55+L credential id, followed by the COSE public key (CBOR)
export function publicKeyFromAttestation(attestationObject, rpId) {
  const authData = cbor.decode(attestationObject).get('authData');
  const flags = authData[32];
  if (!(flags & 0x40)) throw new Error('No attested credential data in the authenticator response');
  // enum UserPresence { none = 0, present = 1, verified = 2 }
  const userPresence = flags & 0x04 ? 2 : flags & 0x01 ? 1 : 0;
  const credentialIdLength = (authData[53] << 8) | authData[54];
  const cose = cbor.decode(authData.subarray(55 + credentialIdLength));
  // COSE_Key labels: 1 kty (2 = EC2), 3 alg (-7 = ES256), -1 crv (1 = P-256), -2 x, -3 y
  if (cose.get(1) !== 2) throw new Error('Public key is not EC2');
  if (cose.get(3) !== -7) throw new Error('Public key is not ES256');
  if (cose.get(-1) !== 1) throw new Error('Public key has unsupported curve');
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (x.length !== 32 || y.length !== 32) throw new Error('Public key has invalid X or Y size');
  const rpIdBytes = new TextEncoder().encode(rpId);
  const data = concat([y[31] & 1 ? 3 : 2], x, [userPresence], varuint32(rpIdBytes.length), rpIdBytes);
  return 'PUB_WA_' + Base58.encodeRipemd160Check(Bytes.from(data), 'WA');
}

// A PUB_WA_ key carries the compressed P-256 point and the rpId it is bound to.
export function describeKey(key) {
  const data = PublicKey.from(key).data.array;
  const rpIdLength = data[34]; // rpIds are far shorter than 128 bytes, so the varuint is one byte
  return {
    point: data.subarray(0, 33),
    userPresence: data[33],
    rpId: new TextDecoder().decode(data.subarray(35, 35 + rpIdLength)),
  };
}

// Pack a WebAuthn assertion as an Antelope SIG_WA_ signature for `key`.
// The authenticator signs sha256(authenticatorData || sha256(clientDataJSON)); the chain needs
// the recovery id as well, found by trying each one until it recovers the expected key.
export function signatureFromAssertion({ authenticatorData, clientDataJSON, signature }, key) {
  const { point } = describeKey(key);
  const signed = sha256(concat(authenticatorData, sha256(clientDataJSON)));
  const sig = p256.Signature.fromDER(signature).normalizeS();
  let recovery = -1;
  for (let bit = 0; bit < 4 && recovery < 0; bit++) {
    try {
      if (sameBytes(sig.addRecoveryBit(bit).recoverPublicKey(signed).toRawBytes(true), point)) recovery = bit;
    } catch (_) { /* not a valid point for this bit */ }
  }
  if (recovery < 0) throw new Error('The signature was not made by the key ' + key);
  const data = concat(
    [recovery + 27 + 4], sig.toCompactRawBytes(),
    varuint32(authenticatorData.length), authenticatorData,
    varuint32(clientDataJSON.length), clientDataJSON,
  );
  return 'SIG_WA_' + Base58.encodeRipemd160Check(Bytes.from(data), 'WA');
}

// Ask the authenticator (fingerprint, face, PIN) to sign `digest` with the given credential.
async function assertWithPasskey(digest, { key, credentialId }) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: digest,
      rpId: describeKey(key).rpId,
      allowCredentials: [{ id: hexToBytes(credentialId), type: 'public-key' }],
      timeout: 60000,
    },
  });
  return {
    authenticatorData: new Uint8Array(assertion.response.authenticatorData),
    clientDataJSON: new Uint8Array(assertion.response.clientDataJSON),
    signature: new Uint8Array(assertion.response.signature),
  };
}

// ---------------------------------------------------------------------------------------
// Chain

const client = (chain) => new APIClient({ url: chain.url });

// The account as the chain reports it, or null if there is no such account.
export async function getAccount(chain, name) {
  try {
    return await client(chain).call({ path: '/v1/chain/get_account', params: { account_name: name } });
  } catch (err) {
    if (/unknown key|does not exist|Account not found/i.test(JSON.stringify(err.response?.json ?? err.message))) return null;
    throw err;
  }
}

export async function getBalance(chain, account) {
  const rows = await client(chain).call({
    path: '/v1/chain/get_currency_balance',
    params: { code: chain.tokenContract, account, symbol: chain.symbol },
  });
  return rows[0] ?? `0 ${chain.symbol}`;
}

async function buildTransaction(chain, actions) {
  const api = client(chain);
  const info = await api.v1.chain.get_info();
  const contracts = [...new Set(actions.map((a) => a.account))];
  const abis = await Promise.all(contracts.map(async (contract) => ({ contract, abi: (await api.v1.chain.get_abi(contract)).abi })));
  const transaction = Transaction.from({ ...info.getTransactionHeader(60), actions }, abis);
  return { api, info, transaction };
}

// Sign `actions` with the passkeys in `keys` ([{ key, credentialId }]) and push them.
// `assert` is replaceable so the signing step can be exercised without a browser.
export async function transact(chain, actions, keys, { assert = assertWithPasskey } = {}) {
  const { api, info, transaction } = await buildTransaction(chain, actions);
  if (chain.chainId && String(info.chain_id) !== chain.chainId) {
    throw new Error(`${chain.url} is not the configured chain (it reports ${info.chain_id})`);
  }
  const { required_keys } = await api.call({
    path: '/v1/chain/get_required_keys',
    params: { transaction: Serializer.objectify(transaction), available_keys: keys.map((k) => k.key) },
  });
  const digest = transaction.signingDigest(info.chain_id).array;
  const signatures = [];
  for (const required of required_keys) {
    const held = keys.find((k) => k.key === required);
    signatures.push(signatureFromAssertion(await assert(digest, held), held.key));
  }
  return api.call({
    path: '/v1/chain/push_transaction',
    params: {
      signatures,
      compression: 0,
      packed_context_free_data: '',
      packed_trx: bytesToHex(Serializer.encode({ object: transaction }).array),
    },
  });
}

// An EOSIO Signing Request (esr:...) for `actions`, to hand to another wallet to sign.
export async function createSigningRequest(chain, actions) {
  const api = client(chain);
  const chainId = chain.chainId ?? String((await api.v1.chain.get_info()).chain_id);
  const request = await SigningRequest.create({ actions, chainId }, {
    abiProvider: { getAbi: async (account) => (await api.v1.chain.get_abi(String(account))).abi },
    zlib: { deflateRaw: (data) => deflateRaw(data), inflateRaw: (data) => inflateRaw(data) },
  });
  return request.encode();
}
