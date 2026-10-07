// Account creation for the public demo. The wallet itself is static files and needs no server;
// this exists only because a new passkey is useless until someone with a key on the chain
// creates an account for it. It never sees a private key of a user.
//
// A visitor signs in with Google, so there is a name behind every account and a ceiling on
// how many one person can make. Configuration is by environment variable; see service/README.md.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { faucet, passkeyDomain } from './chain.mjs';
import { googleVerifier } from './google.mjs';

const DAY = 24 * 60 * 60 * 1000;

class Refusal extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createService({ verify, chain, config, now = () => Date.now() }) {
  const logFile = path.join(config.dataDir, 'accounts.jsonl');
  fs.mkdirSync(config.dataDir, { recursive: true });
  const records = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  let queue = Promise.resolve(); // one account at a time, so the limits cannot be raced

  async function createAccount({ credential, accountName, publicKey }, ip) {
    if (!config.googleClientId) throw new Refusal(503, 'Sign-in is not set up yet, so the demo cannot create accounts');
    let user;
    try {
      user = await verify(credential);
    } catch (err) {
      throw new Refusal(401, 'Google sign-in was not accepted: ' + err.message);
    }
    if (!/^[a-z1-5]{12}$/.test(String(accountName))) {
      throw new Refusal(400, 'The account name must be 12 characters: a-z and 1-5');
    }
    let domain;
    try {
      domain = passkeyDomain(publicKey);
    } catch {
      throw new Refusal(400, 'That is not a WebAuthn public key');
    }
    if (domain !== config.rpId) throw new Refusal(400, `The key is bound to ${domain}, not to ${config.rpId}`);

    const mine = records.filter((r) => r.email === user.email).length;
    if (mine >= config.maxPerUser) {
      throw new Refusal(429, `You have already created ${mine} demo accounts, which is the limit`);
    }
    const today = records.filter((r) => now() - Date.parse(r.time) < DAY).length;
    if (today >= config.maxPerDay) throw new Refusal(429, 'The demo has created its daily quota of accounts; try again tomorrow');
    if (await chain.exists(accountName)) throw new Refusal(409, 'That account name is taken');

    const transactionId = await chain.createAccount(accountName, publicKey);
    const record = { time: new Date(now()).toISOString(), email: user.email, name: user.name, account: accountName, publicKey, ip, transactionId };
    records.push(record);
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n');
    return { account: accountName, transactionId, grant: config.grant, remaining: config.maxPerUser - mine - 1 };
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024) throw new Refusal(413, 'Request too large');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Refusal(400, 'The request body is not JSON');
    }
  }

  return http.createServer(async (req, res) => {
    const route = `${req.method} ${new URL(req.url, 'http://localhost').pathname}`;
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress);
    try {
      if (route === 'GET /api/config') {
        return send(res, 200, { googleClientId: config.googleClientId, grant: config.grant, maxPerUser: config.maxPerUser });
      }
      if (route === 'POST /api/wake') {
        await chain.wake();
        return send(res, 200, { awake: true });
      }
      if (route === 'POST /api/accounts') {
        const body = await readJson(req);
        const result = await (queue = queue.catch(() => {}).then(() => createAccount(body, ip)));
        return send(res, 201, result);
      }
      if (route === 'GET /api/admin/accounts') {
        // Who has tried the demo: for the operators named in ADMIN_EMAILS, signed in with Google.
        let user;
        try {
          user = await verify(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        } catch {
          throw new Refusal(401, 'Sign in with Google');
        }
        if (!config.adminEmails.includes(user.email)) throw new Refusal(403, 'Not an operator of this demo');
        return send(res, 200, { accounts: records });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof Refusal) return send(res, err.status, { error: err.message });
      console.error(new Date().toISOString(), route, err);
      return send(res, 502, { error: 'The account could not be created on the chain' });
    }
  });
}

export function configFromEnv(env) {
  const need = (name) => {
    if (!env[name]) throw new Error(`${name} is not set`);
    return env[name];
  };
  return {
    port: Number(env.PORT || 8095),
    googleClientId: env.GOOGLE_CLIENT_ID || null, // without it the service runs but creates no accounts
    rpId: need('RP_ID'),
    grant: need('GRANT'),
    dataDir: need('DATA_DIR'),
    maxPerUser: Number(env.MAX_ACCOUNTS_PER_USER || 3),
    maxPerDay: Number(env.MAX_ACCOUNTS_PER_DAY || 50),
    adminEmails: (env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
    chain: {
      chainUrl: need('CHAIN_URL'),
      chainId: env.CHAIN_ID,
      account: need('FAUCET_ACCOUNT'),
      privateKey: need('FAUCET_PRIVATE_KEY'),
      tokenContract: env.TOKEN_CONTRACT || 'eosio.token',
      grant: need('GRANT'),
      wakeUrl: env.WAKE_URL,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configFromEnv(process.env);
  const service = createService({
    verify: config.googleClientId
      ? googleVerifier({ clientId: config.googleClientId })
      : async () => { throw new Error('sign-in is not configured'); },
    chain: faucet(config.chain),
    config,
  });
  service.listen(config.port, '127.0.0.1', () => console.log(`account service on 127.0.0.1:${config.port}`));
}
