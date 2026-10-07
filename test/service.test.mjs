// The account-creation service against the local chain (npm run chain:up), with Google
// sign-in replaced by a stub; the real token verification is tested separately below.

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APIClient, Base58, Bytes, PrivateKey, SignedTransaction, Transaction } from '@wharfkit/antelope';
import { createService } from '../service/server.mjs';
import { faucet } from '../service/chain.mjs';
import { googleVerifier } from '../service/google.mjs';

const CHAIN_URL = process.env.LOCAL_CHAIN_URL || 'http://localhost:28888';
const DEV_KEY = PrivateKey.from('5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3'); // throwaway local chain only
const api = new APIClient({ url: CHAIN_URL });

const randomName = (prefix) => prefix + Array.from({ length: 12 - prefix.length }, () => 'abcdefghijklmnopqrstuvwxyz12345'[crypto.randomInt(31)]).join('');
// A syntactically valid WebAuthn key bound to `rpId`; nothing here needs to sign with it.
const passkey = (rpId = 'wallet.test') => {
  const id = new TextEncoder().encode(rpId);
  return 'PUB_WA_' + Base58.encodeRipemd160Check(Bytes.from([2, ...crypto.randomBytes(32), 2, id.length, ...id]), 'WA');
};

async function pushAsEosio(actions) {
  const info = await api.v1.chain.get_info();
  const abis = await Promise.all([...new Set(actions.map((a) => a.account))].map(async (c) => ({ contract: c, abi: (await api.v1.chain.get_abi(c)).abi })));
  const tx = Transaction.from({ ...info.getTransactionHeader(60), actions }, abis);
  await api.v1.chain.push_transaction(SignedTransaction.from({ ...tx, signatures: [DEV_KEY.signDigest(tx.signingDigest(info.chain_id))] }));
}

const faucetAccount = randomName('faucet');
const faucetKey = PrivateKey.generate('K1');
const users = { 'token-alice': { email: 'alice@example.com', name: 'Alice' }, 'token-bob': { email: 'bob@example.com', name: 'Bob' }, 'token-admin': { email: 'admin@example.com', name: 'Admin' } };
let dataDir, server, base, config;

async function start(overrides = {}) {
  server?.close();
  config = { googleClientId: 'client-id.test', rpId: 'wallet.test', grant: '25.0000 SYS', dataDir, maxPerUser: 2, maxPerDay: 50, adminEmails: ['admin@example.com'], ...overrides };
  const chain = faucet({ chainUrl: CHAIN_URL, account: faucetAccount, privateKey: String(faucetKey), tokenContract: 'eosio.token', grant: config.grant });
  const verify = async (token) => {
    if (!users[token]) throw new Error('unknown token');
    return users[token];
  };
  server = createService({ verify, chain, config });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
const post = async (body) => {
  const res = await fetch(base + '/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await api.v1.chain.get_info().catch(() => { throw new Error(`no chain at ${CHAIN_URL} — start it with: npm run chain:up`); });
  const auth = { threshold: 1, keys: [{ key: String(faucetKey.toPublic()), weight: 1 }], accounts: [], waits: [] };
  const eosio = [{ actor: 'eosio', permission: 'active' }];
  await pushAsEosio([
    { account: 'eosio', name: 'newaccount', authorization: eosio, data: { creator: 'eosio', name: faucetAccount, owner: auth, active: auth } },
    { account: 'eosio.token', name: 'transfer', authorization: eosio, data: { from: 'eosio', to: faucetAccount, quantity: '1000.0000 SYS', memo: 'faucet float' } },
  ]);
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eosinabox-service-'));
  await start();
});
after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a signed-in visitor gets an account with their passkey and some tokens', async () => {
  const accountName = randomName('alice');
  const publicKey = passkey();
  const { status, body } = await post({ credential: 'token-alice', accountName, publicKey });
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.account, accountName);
  assert.match(body.transactionId, /^[0-9a-f]{64}$/);

  const account = await api.v1.chain.get_account(accountName);
  const permission = (name) => JSON.parse(JSON.stringify(account.getPermission(name).required_auth));
  assert.equal(permission('active').keys[0].key, publicKey, 'the passkey is the active key');
  assert.deepEqual(permission('owner').accounts[0].permission, { actor: faucetAccount, permission: 'active' }, 'the faucet can replace a lost key');
  assert.equal(permission('owner').keys.length, 0);
  const balance = await api.v1.chain.get_currency_balance('eosio.token', accountName, 'SYS');
  assert.equal(String(balance[0]), '25.0000 SYS');

  const log = fs.readFileSync(path.join(dataDir, 'accounts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.at(-1).email, 'alice@example.com');
  assert.equal(log.at(-1).account, accountName);
});

test('requests that should not create an account are refused', async () => {
  const good = () => ({ credential: 'token-bob', accountName: randomName('bob'), publicKey: passkey() });
  assert.equal((await post({ ...good(), credential: 'forged' })).status, 401);
  assert.equal((await post({ ...good(), credential: undefined })).status, 401);
  assert.equal((await post({ ...good(), accountName: 'TooShort' })).status, 400);
  assert.equal((await post({ ...good(), accountName: 'eosio.token1' })).status, 400);
  assert.equal((await post({ ...good(), publicKey: String(PrivateKey.generate('K1').toPublic()) })).status, 400, 'an ordinary key is not a passkey');
  assert.equal((await post({ ...good(), publicKey: 'PUB_WA_garbage' })).status, 400);
  const elsewhere = await post({ ...good(), publicKey: passkey('evil.example') });
  assert.equal(elsewhere.status, 400);
  assert.match(elsewhere.body.error, /evil\.example/);
  assert.equal((await post({ ...good(), accountName: faucetAccount })).status, 409, 'an existing account is not overwritten');
  const res = await fetch(base + '/api/accounts', { method: 'POST', body: 'x'.repeat(20000) });
  assert.equal(res.status, 413);
  const log = fs.readFileSync(path.join(dataDir, 'accounts.jsonl'), 'utf8');
  assert.ok(!log.includes('bob@example.com'), 'nothing was recorded for the refused requests');
});

test('one person can only create a few accounts, and the limit survives a restart', async () => {
  const make = () => post({ credential: 'token-bob', accountName: randomName('bob'), publicKey: passkey() });
  assert.equal((await make()).status, 201);
  await start(); // the count comes from the log on disk, not from memory
  assert.equal((await make()).status, 201);
  const third = await make();
  assert.equal(third.status, 429);
  assert.match(third.body.error, /limit/);
});

test('simultaneous requests cannot slip past the limit', async () => {
  users['token-carol'] = { email: 'carol@example.com', name: 'Carol' };
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    post({ credential: 'token-carol', accountName: randomName('carol'), publicKey: passkey() })));
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.equal(results.filter((r) => r.status === 429).length, 4);
});

test('the demo stops creating accounts at its daily quota', async () => {
  const soFar = fs.readFileSync(path.join(dataDir, 'accounts.jsonl'), 'utf8').trim().split('\n').length;
  await start({ maxPerDay: soFar, maxPerUser: 99 });
  const refused = await post({ credential: 'token-alice', accountName: randomName('alice'), publicKey: passkey() });
  assert.equal(refused.status, 429);
  assert.match(refused.body.error, /daily quota/);
  await start();
});

test('only operators can see who has used the demo', async () => {
  const get = (token) => fetch(base + '/api/admin/accounts', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  assert.equal((await get()).status, 401);
  assert.equal((await get('token-alice')).status, 403);
  const res = await get('token-admin');
  assert.equal(res.status, 200);
  const { accounts } = await res.json();
  assert.ok(accounts.some((a) => a.email === 'alice@example.com'));
});

test('the public configuration exposes the client id and nothing secret', async () => {
  const body = await (await fetch(base + '/api/config')).json();
  assert.deepEqual(body, { googleClientId: 'client-id.test', grant: '25.0000 SYS', maxPerUser: 2 });
});

// ---------------------------------------------------------------------------------------

test('Google ID tokens: only a valid token minted for this app is accepted', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };
  const nowMs = Date.parse('2026-10-07T10:00:00Z');
  const verify = googleVerifier({ clientId: 'my-app', fetchImpl: async () => ({ ok: true, json: async () => jwks }), now: () => nowMs });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claims = { iss: 'https://accounts.google.com', aud: 'my-app', exp: nowMs / 1000 + 600, email: 'Alice@Example.com', email_verified: true, name: 'Alice' };
  const mint = (c = claims, key = privateKey, header = { alg: 'RS256', kid: 'k1' }) => {
    const signed = `${b64(header)}.${b64(c)}`;
    return `${signed}.${crypto.sign('RSA-SHA256', Buffer.from(signed), key).toString('base64url')}`;
  };

  assert.deepEqual(await verify(mint()), { email: 'alice@example.com', name: 'Alice' });
  await assert.rejects(verify(mint({ ...claims, aud: 'another-app' })), /not minted for this app/);
  await assert.rejects(verify(mint({ ...claims, exp: nowMs / 1000 - 1 })), /expired/);
  await assert.rejects(verify(mint({ ...claims, iss: 'https://evil.example' })), /issuer/);
  await assert.rejects(verify(mint({ ...claims, email_verified: false })), /not verified/);
  await assert.rejects(verify(mint(claims, other.privateKey)), /bad signature/);
  await assert.rejects(verify(mint(claims, privateKey, { alg: 'none', kid: 'k1' })), /unexpected alg/);
  await assert.rejects(verify(mint(claims, privateKey, { alg: 'RS256', kid: 'unknown' })), /unknown signing key/);
  const [h, , s] = mint().split('.');
  await assert.rejects(verify(`${h}.${b64({ ...claims, email: 'mallory@example.com' })}.${s}`), /bad signature/);
  await assert.rejects(verify('not-a-token'), /malformed/);
});
