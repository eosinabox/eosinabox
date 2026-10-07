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
const auth = (key) => ({ threshold: 1, keys: [{ key, weight: 1 }], accounts: [], waits: [] });

function randomNameLater() { return 'faucet' + Math.random().toString(36).replace(/[^a-z]/g, '').padEnd(6, 'a').slice(0, 6); }
// Antelope account names: 12 characters from a-z and 1-5.
const randomName = () => 'wa' + Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz12345'[Math.floor(Math.random() * 31)]).join('');

let server, service, serviceDir, browser, page, tlsDir, pushed = [], chainReplies = [], walletRequests = [];
const FAUCET = randomNameLater();

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
  // The account service, with Google sign-in replaced by a stub that knows one visitor.
  const { createService } = await import('../service/server.mjs');
  const { faucet } = await import('../service/chain.mjs');
  await push([
    { account: 'eosio', name: 'newaccount', authorization: [{ actor: 'eosio', permission: 'active' }],
      data: { creator: 'eosio', name: FAUCET, owner: auth(DEV_PUB), active: auth(DEV_PUB) } },
    { account: 'eosio.token', name: 'transfer', authorization: [{ actor: 'eosio', permission: 'active' }],
      data: { from: 'eosio', to: FAUCET, quantity: '500.0000 SYS', memo: 'faucet float' } },
  ]);
  serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eosinabox-service-'));
  service = createService({
    verify: async (token) => {
      if (token !== 'token-visitor') throw new Error('unknown token');
      return { email: 'visitor@example.com', name: 'Visitor' };
    },
    chain: faucet({ chainUrl: CHAIN_URL, account: FAUCET, privateKey: DEV_PRIV, tokenContract: 'eosio.token', grant: '10.0000 SYS' }),
    config: { googleClientId: 'client-id.test', rpId: 'localhost', grant: '10.0000 SYS', dataDir: serviceDir, maxPerUser: 3, maxPerDay: 50, adminEmails: [] },
  });
  await new Promise((r) => service.listen(0, '127.0.0.1', r));
  const API_PROXY = `http://127.0.0.1:${service.address().port}`;

  server = spawn('node', ['serve.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, TLS_KEY, TLS_CERT, API_PROXY }, stdio: 'ignore',
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
    if (req.url().startsWith(WALLET_URL)) walletRequests.push(req.method() + ' ' + new URL(req.url()).pathname);
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
  service?.close();
  for (const dir of [tlsDir, serviceDir]) if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

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

test('chains come from chains.js, and the balance is read from the chain', async () => {
  const offered = await page.evaluate(() =>
    $('.eosinabox_dropdown_blockchain').first().find('a.dropdown-item').map((_, a) => $(a).attr('data-chain')).get());
  const configured = await page.evaluate(() => Object.keys(window.EOSINABOX_CHAINS));
  assert.deepEqual(offered, configured);
  assert.ok(configured.includes('local'));

  const account = randomName();
  await createAccountOnChain(account, await createKeyInWallet(account));
  await page.evaluate((name) => {
    localStorage.currentAccount = 'local:' + name;
    $('.eosinabox_refresh, #eosinabox_balance').first().trigger('click');
  }, account);
  await page.waitForFunction(() => $('#eosinabox_balance').text().includes('100.0000 SYS'), { timeout: 10000 });
});

test('a signing request for another wallet is built in the browser', async () => {
  const uri = await page.evaluate(() => EosinaboxCore.createSigningRequest(window.EOSINABOX_CHAINS.local, [{
    account: 'eosio.token', name: 'transfer',
    authorization: [{ actor: '............1', permission: '............2' }],
    data: { from: '............1', to: 'eosio', quantity: '1.0000 SYS', memo: 'esr' },
  }]));
  assert.match(uri, /^esr:(\/\/)?[A-Za-z0-9_-]{20,}$/);
});

test('a shared link cannot inject markup into the wallet', async () => {
  const payload = encodeURIComponent('<img src=x onerror="window.__injected=1">');
  const link = `${WALLET_URL}/#sharedInfo?action=createAccount&chain=local&accountName=${payload}` +
    `&custodianAccountName=${payload}&pubkey=${payload}&esr=javascript:window.__injected=1&bogus=${payload}`;
  await page.goto('about:blank');
  await page.goto(link, { waitUntil: 'networkidle2' });
  await sleep(500);
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await page.evaluate(() => $('.eosinabox_page_sharedInfo img[src="x"]').length), 0);
  assert.equal(await page.evaluate(() => $('.eosinabox_sharedinfo_esr a').length), 0, 'a javascript: link is not offered');
});

test('a visitor who signs in gets an account from the service and can spend from it', async () => {
  await page.goto(WALLET_URL, { waitUntil: 'networkidle2' });
  const account = randomName();
  // The wizard: choose the chain, name the account, make the passkey.
  await page.evaluate(() => $('.eosinabox_dropdown_blockchain a.dropdown-item[data-chain="local"]').first().trigger('click'));
  const pubkey = await createKeyInWallet(account);
  // Google's button cannot be clicked from a test; this is the callback it invokes on sign-in.
  await page.evaluate(() => window.createAccountViaService('token-visitor'));

  const onChain = await rpc.get_account(account);
  const permission = (name) => onChain.permissions.find((p) => p.perm_name === name).required_auth;
  assert.equal(permission('active').keys[0].key, pubkey);
  assert.equal(permission('owner').accounts[0].permission.actor, FAUCET);
  assert.equal(await balance(account), '10.0000 SYS');
  assert.equal(await page.evaluate(() => localStorage.currentAccount), 'local:' + account, 'the wallet switched to the new account');
  const log = fs.readFileSync(path.join(serviceDir, 'accounts.jsonl'), 'utf8');
  assert.match(log, /visitor@example\.com/);

  await transferFromWallet(account, '4.0000 SYS');
  assert.equal(chainReplies[0]?.status, 202, chainReplies[0]?.body.slice(0, 300));
  assert.equal(await balance(account), '6.0000 SYS');
});

test('without a valid sign-in the service creates nothing, and the wallet says why', async () => {
  const account = randomName();
  await createKeyInWallet(account);
  await page.evaluate(() => window.createAccountViaService('forged-token'));
  assert.match(await page.evaluate(() => $('#eosinabox_serviceStatus').text()), /sign-in was not accepted/);
  await assert.rejects(rpc.get_account(account));
});

test('the wallet asked its own origin for static files and the account service, nothing else', () => {
  // Signatures and transactions never go to the wallet's origin; only the sign-up request does.
  assert.ok(walletRequests.length > 0);
  for (const request of walletRequests) {
    assert.match(request, /^(GET \/($|[\w./-]+\.(html|js|css|png|ico|gif|webmanifest)$)|GET \/api\/config$|POST \/api\/accounts$)/, request);
  }
});
