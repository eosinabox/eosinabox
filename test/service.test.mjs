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
const google = { 'token-alice': { email: 'alice@example.com', name: 'Alice' }, 'token-bob': { email: 'bob@example.com', name: 'Bob' }, 'token-admin': { email: 'admin@example.com', name: 'Admin' } };
let dataDir, server, base, config, clock, outbox;

async function start(overrides = {}, parts = {}) {
  server?.close();
  outbox = [];
  config = { origin: 'https://wallet.test', sessionSecret: 'test-secret', cookieSecure: false, googleClientId: 'client-id.test',
    rpId: 'wallet.test', grant: '25.0000 SYS', dataDir, maxPerUser: 2, maxPerDay: 50,
    maxLinksPerEmailPerHour: 3, maxLinksPerIpPerHour: 10, maxLinksPerDay: 200, adminEmails: ['admin@example.com'], ...overrides };
  const chain = faucet({ chainUrl: CHAIN_URL, account: faucetAccount, privateKey: String(faucetKey), tokenContract: 'eosio.token', grant: config.grant });
  const verifyGoogle = async (token) => {
    if (!google[token]) throw new Error('unknown token');
    return google[token];
  };
  const mailer = { send: async (message) => { outbox.push(message); } };
  server = createService({ verifyGoogle, mailer, chain, config, now: () => Date.now() + clock, ...parts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

// A browser as far as the service can tell: it keeps the cookies it is given.
function browser() {
  const jar = new Map();
  const call = async (method, route, body, headers = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (value) jar.set(name, value); else jar.delete(name);
    }
    return { status: res.status, body: await res.json(), cookies: res.headers.getSetCookie() };
  };
  return { call, jar, signIn: (token) => call('POST', '/api/session', { credential: token }) };
}
const signedIn = async (token) => {
  const b = browser();
  assert.equal((await b.signIn(token)).status, 200);
  return b;
};
const newAccount = (prefix) => ({ accountName: randomName(prefix), publicKey: passkey() });
const linkToken = (message) => message.text.match(/#confirm=([\w-]+)/)[1];

before(async () => {
  await api.v1.chain.get_info().catch(() => { throw new Error(`no chain at ${CHAIN_URL} — start it with: npm run chain:up`); });
  const auth = { threshold: 1, keys: [{ key: String(faucetKey.toPublic()), weight: 1 }], accounts: [], waits: [] };
  const eosio = [{ actor: 'eosio', permission: 'active' }];
  await pushAsEosio([
    { account: 'eosio', name: 'newaccount', authorization: eosio, data: { creator: 'eosio', name: faucetAccount, owner: auth, active: auth } },
    { account: 'eosio.token', name: 'transfer', authorization: eosio, data: { from: 'eosio', to: faucetAccount, quantity: '1000.0000 SYS', memo: 'faucet float' } },
  ]);
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eosinabox-service-'));
  clock = 0;
  await start();
});
after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
const readLog = () => fs.readFileSync(path.join(dataDir, 'accounts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ---- accounts -----------------------------------------------------------------------

test('a signed-in visitor gets an account with their passkey and some tokens', async () => {
  const alice = await signedIn('token-alice');
  const request = newAccount('alice');
  const { status, body } = await alice.call('POST', '/api/accounts', request);
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.account, request.accountName);
  assert.match(body.transactionId, /^[0-9a-f]{64}$/);

  const account = await api.v1.chain.get_account(request.accountName);
  const permission = (name) => JSON.parse(JSON.stringify(account.getPermission(name).required_auth));
  assert.equal(permission('active').keys[0].key, request.publicKey, 'the passkey is the active key');
  assert.deepEqual(permission('owner').accounts[0].permission, { actor: faucetAccount, permission: 'active' }, 'the faucet can replace a lost key');
  assert.equal(permission('owner').keys.length, 0);
  const balance = await api.v1.chain.get_currency_balance('eosio.token', request.accountName, 'SYS');
  assert.equal(String(balance[0]), '25.0000 SYS');

  const last = readLog().at(-1);
  assert.deepEqual([last.email, last.method, last.account], ['alice@example.com', 'google', request.accountName]);
});

test('requests that should not create an account are refused', async () => {
  const bob = await signedIn('token-bob');
  const make = (change) => bob.call('POST', '/api/accounts', { ...newAccount('bob'), ...change });
  assert.equal((await browser().call('POST', '/api/accounts', newAccount('bob'))).status, 401, 'nobody is signed in');
  assert.equal((await make({ accountName: 'TooShort' })).status, 400);
  assert.equal((await make({ accountName: 'eosio.token1' })).status, 400);
  assert.equal((await make({ publicKey: String(PrivateKey.generate('K1').toPublic()) })).status, 400, 'an ordinary key is not a passkey');
  assert.equal((await make({ publicKey: 'PUB_WA_garbage' })).status, 400);
  const elsewhere = await make({ publicKey: passkey('evil.example') });
  assert.equal(elsewhere.status, 400);
  assert.match(elsewhere.body.error, /evil\.example/);
  assert.equal((await make({ accountName: faucetAccount })).status, 409, 'an existing account is not overwritten');
  assert.equal((await bob.call('POST', '/api/accounts', 'x'.repeat(20000))).status, 413);
  assert.ok(!readLog().some((r) => r.email === 'bob@example.com'), 'nothing was recorded for the refused requests');
});

test('a session cannot be forged, altered or used from another site', async () => {
  const alice = await signedIn('token-alice');
  const [body] = alice.jar.get('eib_session').split('.');
  const asAdmin = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), email: 'admin@example.com' })).toString('base64url');
  const forged = browser();
  forged.jar.set('eib_session', `${asAdmin}.${alice.jar.get('eib_session').split('.')[1]}`);
  assert.equal((await forged.call('GET', '/api/session')).status, 401);
  assert.equal((await browser().signIn('made-up')).status, 401);
  assert.equal((await alice.call('POST', '/api/accounts', newAccount('alice'), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await alice.call('POST', '/api/accounts', JSON.stringify(newAccount('alice')), { 'Content-Type': 'text/plain' })).status, 415);
  assert.match(alice.jar.get('eib_session') && (await alice.signIn('token-alice')).cookies[0], /HttpOnly; SameSite=Strict/);
  assert.equal((await alice.call('DELETE', '/api/session')).status, 200);
  assert.equal((await alice.call('GET', '/api/session')).status, 401, 'signed out');
});

test('one person can only create a few accounts, and the limit survives a restart', async () => {
  let bob = await signedIn('token-bob');
  assert.equal((await bob.call('POST', '/api/accounts', newAccount('bob'))).status, 201);
  await start(); // the count comes from the log on disk; the session cookie outlives the restart
  assert.equal((await bob.call('POST', '/api/accounts', newAccount('bob'))).status, 201);
  const third = await bob.call('POST', '/api/accounts', newAccount('bob'));
  assert.equal(third.status, 429);
  assert.match(third.body.error, /limit/);
});

test('simultaneous requests cannot slip past the limit', async () => {
  google['token-carol'] = { email: 'carol@example.com', name: 'Carol' };
  const carol = await signedIn('token-carol');
  const results = await Promise.all(Array.from({ length: 6 }, () => carol.call('POST', '/api/accounts', newAccount('carol'))));
  assert.equal(results.filter((r) => r.status === 201).length, 2);
  assert.equal(results.filter((r) => r.status === 429).length, 4);
});

test('the demo stops creating accounts at its daily quota', async () => {
  await start({ maxPerDay: readLog().length, maxPerUser: 99 });
  const refused = await (await signedIn('token-alice')).call('POST', '/api/accounts', newAccount('alice'));
  assert.equal(refused.status, 429);
  assert.match(refused.body.error, /daily quota/);
  await start();
});

// ---- signing in by e-mail -----------------------------------------------------------

test('an e-mail link, confirmed in the browser that asked for it, signs that browser in', async () => {
  const dave = browser();
  const asked = await dave.call('POST', '/api/signin/email', { email: 'Dave@Example.com' });
  assert.equal(asked.status, 202);
  assert.equal((await dave.call('GET', '/api/session')).status, 401, 'asking is not signing in');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'dave@example.com');
  assert.match(outbox[0].text, /https:\/\/wallet\.test\/#confirm=[\w-]{40,}/);
  assert.match(outbox[0].text, /10 minutes/);

  const confirmed = await dave.call('POST', '/api/signin/confirm', { token: linkToken(outbox[0]) });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.signedIn, true);
  const session = await dave.call('GET', '/api/session');
  assert.deepEqual(session.body, { email: 'dave@example.com', name: null, method: 'email', isAdmin: false });

  const made = await dave.call('POST', '/api/accounts', newAccount('dave'));
  assert.equal(made.status, 201);
  assert.equal(readLog().at(-1).method, 'email');
});

test('a link confirmed on another device signs in the browser that asked, once', async () => {
  const laptop = browser();
  const phone = browser();
  await laptop.call('POST', '/api/signin/email', { email: 'erin@example.com' });
  assert.match((await laptop.call('GET', '/api/session')).body.error, /Waiting/);
  const confirmed = await phone.call('POST', '/api/signin/confirm', { token: linkToken(outbox.at(-1)) });
  assert.deepEqual(confirmed.body, { signedIn: false, approved: true, email: 'erin@example.com' });
  assert.equal((await phone.call('GET', '/api/session')).status, 401, 'the device that clicked is not signed in');
  assert.equal((await laptop.call('GET', '/api/session')).body.email, 'erin@example.com');
});

test('a link works once, for ten minutes, and cannot be guessed', async () => {
  const frank = browser();
  await frank.call('POST', '/api/signin/email', { email: 'frank@example.com' });
  const token = linkToken(outbox.at(-1));
  assert.equal((await frank.call('POST', '/api/signin/confirm', { token: token.slice(0, -2) + 'xx' })).status, 410);
  assert.equal((await frank.call('POST', '/api/signin/confirm', { token: '' })).status, 410);
  assert.equal((await frank.call('POST', '/api/signin/confirm', { token })).status, 200);
  assert.equal((await browser().call('POST', '/api/signin/confirm', { token })).status, 410, 'second use');

  const grace = browser();
  await grace.call('POST', '/api/signin/email', { email: 'grace@example.com' });
  const late = linkToken(outbox.at(-1));
  clock += 11 * 60 * 1000;
  assert.equal((await grace.call('POST', '/api/signin/confirm', { token: late })).status, 410, 'expired');
  assert.equal((await grace.call('GET', '/api/session')).status, 401);
});

test('the e-mail form cannot be used to flood an inbox or to send mail in bulk', async () => {
  clock += 2 * 60 * 60 * 1000;
  await start();
  const ask = (email, ip) => browser().call('POST', '/api/signin/email', { email }, ip ? { 'X-Real-IP': ip } : {});
  for (const bad of ['', 'no-at-sign', 'a@b', 'two@@example.com', 'x@example.com\nBcc: victim@example.com', 'a b@example.com'])
    assert.equal((await ask(bad)).status, 400, JSON.stringify(bad));
  for (let i = 0; i < 3; i++) assert.equal((await ask('heidi@example.com', `10.0.0.${i}`)).status, 202);
  assert.equal((await ask('heidi@example.com', '10.0.0.9')).status, 429, 'per address');
  for (let i = 0; i < 10; i++) assert.equal((await ask(`ivan${i}@example.com`, '10.1.1.1')).status, 202);
  assert.equal((await ask('ivan99@example.com', '10.1.1.1')).status, 429, 'per requester');
  assert.equal(outbox.length, 13);

  await start({ maxLinksPerDay: 2 });
  assert.equal((await ask('j1@example.com', '10.2.0.1')).status, 202);
  assert.equal((await ask('j2@example.com', '10.2.0.2')).status, 202);
  assert.equal((await ask('j3@example.com', '10.2.0.3')).status, 429, 'daily quota');
  await start();
});

// ---- operators ------------------------------------------------------------------------

test('only operators can see who has used the demo', async () => {
  assert.equal((await browser().call('GET', '/api/admin/accounts')).status, 401);
  const alice = await signedIn('token-alice');
  assert.equal((await alice.call('GET', '/api/session')).body.isAdmin, false);
  assert.equal((await alice.call('GET', '/api/admin/accounts')).status, 403);
  const admin = await signedIn('token-admin');
  assert.equal((await admin.call('GET', '/api/session')).body.isAdmin, true);
  const list = await admin.call('GET', '/api/admin/accounts');
  assert.equal(list.status, 200);
  assert.ok(list.body.accounts.some((a) => a.email === 'alice@example.com'));
});

test('an operator link clicked on a device that did not ask for it grants no operator rights', async () => {
  // Someone else types the operator's address; the operator, seeing the mail, presses confirm.
  const attacker = browser();
  const operator = browser();
  await attacker.call('POST', '/api/signin/email', { email: 'admin@example.com' });
  await operator.call('POST', '/api/signin/confirm', { token: linkToken(outbox.at(-1)) });
  const stolen = await attacker.call('GET', '/api/session');
  assert.equal(stolen.body.email, 'admin@example.com');
  assert.equal(stolen.body.isAdmin, false);
  assert.equal((await attacker.call('GET', '/api/admin/accounts')).status, 403);

  // The operator asking and confirming in their own browser does get them.
  await operator.call('POST', '/api/signin/email', { email: 'admin@example.com' });
  const own = await operator.call('POST', '/api/signin/confirm', { token: linkToken(outbox.at(-1)) });
  assert.equal(own.body.isAdmin, true);
  assert.equal((await operator.call('GET', '/api/admin/accounts')).status, 200);
});

test('the public configuration says which sign-ins are on and nothing secret', async () => {
  const b = browser();
  assert.deepEqual((await b.call('GET', '/api/config')).body, { googleClientId: 'client-id.test', emailSignIn: true, grant: '25.0000 SYS', maxPerUser: 2 });
  await start({ googleClientId: null }, { verifyGoogle: null, mailer: null });
  assert.deepEqual((await b.call('GET', '/api/config')).body, { googleClientId: null, emailSignIn: false, grant: '25.0000 SYS', maxPerUser: 2 });
  assert.equal((await b.signIn('token-alice')).status, 503);
  assert.equal((await b.call('POST', '/api/signin/email', { email: 'a@example.com' })).status, 503);
  assert.equal((await b.call('POST', '/api/wake')).status, 200);
  await start();
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
