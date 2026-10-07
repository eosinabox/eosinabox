// End-to-end: the wallet creates a WebAuthn key, the key becomes the active key of an
// account on a local Antelope chain, and the wallet signs a token transfer with it.
//
// The passkey lives in Chrome's virtual authenticator, so no phone or fingerprint is needed.
// Needs the chain from ./local-chain running (npm run chain:up), Chrome and openssl.
//
// The wallet is served over https with a throwaway certificate: nodeos rejects any
// WebAuthn signature whose origin does not begin with https://.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const fetch = require('node-fetch');
const { Api, JsonRpc } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');

const CHAIN_URL = process.env.LOCAL_CHAIN_URL || 'http://localhost:28888';
const PORT = process.env.TEST_PORT || '18124';
const WALLET_URL = `https://localhost:${PORT}`;
const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome';
// The well-known Antelope development key; it controls `eosio` on the throwaway local chain.
const DEV_PRIV = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';
const DEV_PUB = 'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV';

const rpc = new JsonRpc(CHAIN_URL, { fetch });
const admin = new Api({ rpc, signatureProvider: new JsSignatureProvider([DEV_PRIV]) });
const push = (actions) => admin.transact({ actions }, { blocksBehind: 3, expireSeconds: 30 });
const balance = async (account) => (await rpc.get_currency_balance('eosio.token', account, 'SYS'))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Antelope account names: 12 characters from a-z and 1-5.
const randomName = () => 'wa' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz12345'[Math.floor(Math.random() * 31)]).join('');

let server, browser, page, tlsDir, pushed = [], chainReplies = [];

before(async () => {
  await rpc.get_info().catch(() => {
    throw new Error(`no chain at ${CHAIN_URL} — start it with: npm run chain:up`);
  });
  tlsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eosinabox-tls-'));
  const TLS_KEY = path.join(tlsDir, 'key.pem');
  const TLS_CERT = path.join(tlsDir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', TLS_KEY, '-out', TLS_CERT, '-days', '2', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  server = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, TLS_KEY, TLS_CERT }, stdio: 'ignore',
  });
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  page = await browser.newPage();

  // A platform authenticator with user verification, like a phone's fingerprint reader.
  const cdp = await page.createCDPSession();
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  // Record what the wallet actually sends to the chain.
  page.on('request', (req) => {
    if (/\/v1\/chain\/(push|send)_transaction/.test(req.url())) pushed.push(JSON.parse(req.postData()));
  });
  page.on('response', async (res) => {
    if (/\/v1\/chain\/(push|send)_transaction/.test(res.url())) {
      chainReplies.push({ status: res.status(), body: await res.text().catch(() => '') });
    }
  });
  for (let i = 0; ; i++) {
    try { await page.goto(WALLET_URL, { waitUntil: 'networkidle2' }); break; }
    catch (err) { if (i > 50) throw err; await sleep(100); }
  }
});

after(async () => {
  await browser?.close();
  server?.kill();
  if (tlsDir) fs.rmSync(tlsDir, { recursive: true, force: true });
});

const auth = (key) => ({ threshold: 1, keys: [{ key, weight: 1 }], accounts: [], waits: [] });

// Ask the wallet for a new key; returns the PUB_WA_ key it displays.
async function createKeyInWallet(accountName) {
  await page.evaluate((name) => {
    $('#eosinabox_pubkey').text('');
    $('#eosinabox_accountName').val(name);
    $('#eosinbox_createKeys').trigger('click');
  }, accountName);
  await page.waitForFunction(() => $('#eosinabox_pubkey').text().startsWith('PUB_WA_'), { timeout: 15000 });
  return page.evaluate(() => $('#eosinabox_pubkey').text());
}

// What the chain operator does: create the account and give it some SYS.
async function createAccountOnChain(name, activeKey) {
  await push([
    { account: 'eosio', name: 'newaccount', authorization: [{ actor: 'eosio', permission: 'active' }],
      data: { creator: 'eosio', name, owner: auth(DEV_PUB), active: auth(activeKey) } },
    { account: 'eosio.token', name: 'transfer', authorization: [{ actor: 'eosio', permission: 'active' }],
      data: { from: 'eosio', to: name, quantity: '100.0000 SYS', memo: 'welcome' } },
  ]);
}

async function transferFromWallet(from, quantity) {
  pushed = [];
  chainReplies = [];
  await page.evaluate((name, qty) => {
    localStorage.currentAccount = 'local:' + name;
    $('#eosinabox_transfer_to').val('eosio');
    $('#eosinabox_transfer_quantity').val(qty);
    $('#eosinabox_transfer_memo').val('signed with a passkey');
    $('#eosinabox_transfer_transact').trigger('click');
  }, from, quantity);
  for (let i = 0; i < 60 && chainReplies.length === 0; i++) await sleep(250);
}

test('a WebAuthn key created in the wallet signs a transfer on the local chain', async () => {
  const account = randomName();

  // 1. The wallet asks the authenticator for a new key pair and shows the public key.
  const pubkey = await createKeyInWallet(account);
  const stored = await page.evaluate(() => JSON.parse(localStorage.eosinabox_pubkeys));
  assert.equal(stored.at(-1).key, pubkey, 'the wallet remembers the key with its credential id');

  // 2. The chain operator creates the account: their key as owner, the WebAuthn key as active.
  await createAccountOnChain(account, pubkey);
  const active = (await rpc.get_account(account)).permissions.find((p) => p.perm_name === 'active');
  assert.equal(active.required_auth.keys[0].key, pubkey, 'the chain holds the WebAuthn key as the active key');
  assert.equal(await balance(account), '100.0000 SYS');

  // 3. The wallet signs a transfer with the passkey and pushes it itself.
  await transferFromWallet(account, '1.5000 SYS');
  assert.equal(chainReplies[0]?.status, 202, 'the chain accepted the transaction: ' + chainReplies[0]?.body.slice(0, 300));
  assert.equal(await balance(account), '98.5000 SYS');

  // 4. It was a WebAuthn signature, and only that, which authorised it.
  assert.equal(pushed[0].signatures.length, 1);
  assert.match(pushed[0].signatures[0], /^SIG_WA_/);
});

test('one passkey cannot authorise a transfer from another passkey\'s account', async () => {
  const victim = randomName();
  const attacker = randomName();
  const victimKey = await createKeyInWallet(victim);
  const attackerKey = await createKeyInWallet(attacker);
  assert.notEqual(attackerKey, victimKey);
  await createAccountOnChain(victim, victimKey);
  await createAccountOnChain(attacker, attackerKey);
  const honestKeys = await page.evaluate(() => localStorage.eosinabox_pubkeys);

  // 1. A tampered wallet that signs for the victim's key with the attacker's credential:
  //    the signature does not recover to the victim's key, and nothing is sent.
  await page.evaluate((victimKey, attackerKey) => {
    const keys = JSON.parse(localStorage.eosinabox_pubkeys);
    const credentialId = keys.find((k) => k.key === attackerKey).credentialId;
    localStorage.eosinabox_pubkeys = JSON.stringify([{ key: victimKey, credentialId }]);
  }, victimKey, attackerKey);
  await transferFromWallet(victim, '100.0000 SYS');
  assert.equal(pushed.length, 0, 'the wallet refused to send a signature from the wrong key');
  await page.evaluate((keys) => { localStorage.eosinabox_pubkeys = keys; }, honestKeys);

  // 2. Skip the wallet: take a genuine signature the attacker's passkey made for their own
  //    transfer and attach it to a transfer out of the victim's account.
  await transferFromWallet(attacker, '1.0000 SYS');
  assert.equal(chainReplies[0]?.status, 202);
  const attackerSignature = pushed[0].signatures[0];
  const forged = await admin.transact({
    actions: [{ account: 'eosio.token', name: 'transfer', authorization: [{ actor: victim, permission: 'active' }],
      data: { from: victim, to: attacker, quantity: '100.0000 SYS', memo: '' } }],
  }, { blocksBehind: 3, expireSeconds: 30, broadcast: false, sign: false });
  // The signature commits to the digest of the transaction it was made for.
  await assert.rejects(
    rpc.push_transaction({ signatures: [attackerSignature], serializedTransaction: forged.serializedTransaction }),
    (err) => /webauthn|challenge|signatures for it|unsatisfied/i.test(JSON.stringify(err.json ?? err.message)),
  );
  assert.equal(await balance(victim), '100.0000 SYS', 'the funds did not move');
});
