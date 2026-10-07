// Account creation for the public demo. The wallet itself is static files and needs no server;
// this exists only because a new passkey is useless until someone with a key on the chain
// creates an account for it. It never sees a private key of a user.
//
// A visitor signs in first, with Google or with a single-use link sent to their e-mail, so
// there is a name behind every account and a ceiling on how many one person can make.
// Configuration is by environment variable; see service/README.md.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { faucet, passkeyDomain } from './chain.mjs';
import { googleVerifier } from './google.mjs';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SESSION_TTL = 7 * DAY;
const LINK_TTL = 10 * MINUTE;

class Refusal extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

export function createService({ verifyGoogle, mailer, chain, config, now = () => Date.now() }) {
  const logFile = path.join(config.dataDir, 'accounts.jsonl');
  fs.mkdirSync(config.dataDir, { recursive: true });
  const records = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  let queue = Promise.resolve(); // one account at a time, so the limits cannot be raced

  // ---- sessions: a signed cookie, no store ------------------------------------------
  const sign = (body) => crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  const cookieFlags = `Path=/; HttpOnly; SameSite=Strict${config.cookieSecure === false ? '' : '; Secure'}`;
  const sessionCookie = (session) => {
    const body = Buffer.from(JSON.stringify({ ...session, exp: now() + SESSION_TTL })).toString('base64url');
    return `eib_session=${body}.${sign(body)}; ${cookieFlags}; Max-Age=${SESSION_TTL / 1000}`;
  };
  const clearCookie = (name) => `${name}=; ${cookieFlags}; Max-Age=0`;
  const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=');
    return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  function readSession(req) {
    const [body, signature] = String(cookies(req).eib_session || '').split('.');
    if (!body || !signature) return null;
    const expected = sign(body);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
      const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return session.exp > now() ? session : null;
    } catch {
      return null;
    }
  }
  // Operator rights need a sign-in that proves this browser is the person's own: Google, or an
  // e-mail link confirmed in the browser that asked for it. A link confirmed elsewhere could
  // have been requested by someone else and merely clicked by the owner of the address.
  const describe = (session) => ({
    email: session.email, name: session.name, method: session.method,
    isAdmin: session.trusted === true && config.adminEmails.includes(session.email),
  });

  // ---- e-mail links -----------------------------------------------------------------
  const linkRequests = new Map(); // id -> { tokenHash, email, ip, expires, approved }
  const sentLog = []; // { time, email, ip }
  function pruneLinks() {
    for (const [id, request] of linkRequests) if (request.expires + MINUTE < now()) linkRequests.delete(id);
    while (sentLog.length && now() - sentLog[0].time > DAY) sentLog.shift();
  }

  async function requestLink(req, body, ip) {
    if (!mailer) throw new Refusal(503, 'Sign-in by e-mail is not available');
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(email)) throw new Refusal(400, 'That does not look like an e-mail address');
    pruneLinks();
    const lastHour = sentLog.filter((s) => now() - s.time < HOUR);
    if (lastHour.filter((s) => s.email === email).length >= config.maxLinksPerEmailPerHour) throw new Refusal(429, 'Too many links were sent to that address; try again in an hour');
    if (lastHour.filter((s) => s.ip === ip).length >= config.maxLinksPerIpPerHour) throw new Refusal(429, 'Too many links were requested from here; try again in an hour');
    if (sentLog.length >= config.maxLinksPerDay) throw new Refusal(429, 'The demo has sent its daily quota of e-mails; try again tomorrow');

    const id = randomToken();
    const token = randomToken();
    linkRequests.set(id, { tokenHash: sha256(token), email, ip, expires: now() + LINK_TTL, approved: false });
    sentLog.push({ time: now(), email, ip });
    const link = `${config.origin}/#confirm=${token}`;
    const minutes = LINK_TTL / MINUTE;
    await mailer.send({
      to: email,
      subject: 'Your sign-in link for the EOS in a Box demo',
      text: [
        'Someone, probably you, asked to sign in to the EOS in a Box passkey demo with this address.',
        '',
        `Open this link within ${minutes} minutes to confirm. It works once.`,
        '',
        link,
        '',
        `The request came from ${ip}. If it was not you, ignore this message and nothing happens.`,
      ].join('\n'),
    });
    return { cookie: `eib_pending=${id}; ${cookieFlags}; Max-Age=${LINK_TTL / 1000}`, body: { sent: true, minutes } };
  }

  // Opening the link only shows a page; this call, made by pressing the button on it, is what
  // confirms. Mail scanners that fetch links therefore cannot use one up or approve anything.
  function confirmLink(req, body) {
    pruneLinks();
    const tokenHash = sha256(String(body.token || ''));
    const entry = [...linkRequests].find(([, r]) => r.tokenHash === tokenHash);
    if (!entry || entry[1].expires < now() || entry[1].approved) throw new Refusal(410, 'This link has expired or was already used; ask for a new one');
    const [id, request] = entry;
    if (cookies(req).eib_pending === id) {
      linkRequests.delete(id);
      const session = { email: request.email, name: null, method: 'email', trusted: true };
      return { cookies: [sessionCookie(session), clearCookie('eib_pending')], body: { signedIn: true, ...describe(session) } };
    }
    request.approved = true; // the browser that asked collects the session the next time it checks
    return { cookies: [], body: { signedIn: false, approved: true, email: request.email } };
  }

  function currentSession(req) {
    const session = readSession(req);
    if (session) return { cookies: [], body: describe(session) };
    const id = cookies(req).eib_pending;
    const request = id && linkRequests.get(id);
    if (request?.approved && request.expires + MINUTE > now()) {
      linkRequests.delete(id);
      const fresh = { email: request.email, name: null, method: 'email', trusted: false };
      return { cookies: [sessionCookie(fresh), clearCookie('eib_pending')], body: describe(fresh) };
    }
    throw new Refusal(401, request ? 'Waiting for the e-mail link to be confirmed' : 'Not signed in');
  }

  async function googleSignIn(body) {
    if (!verifyGoogle) throw new Refusal(503, 'Sign-in with Google is not available');
    let user;
    try {
      user = await verifyGoogle(body.credential);
    } catch (err) {
      throw new Refusal(401, 'Google sign-in was not accepted: ' + err.message);
    }
    const session = { email: user.email, name: user.name, method: 'google', trusted: true };
    return { cookies: [sessionCookie(session)], body: describe(session) };
  }

  // ---- accounts ---------------------------------------------------------------------
  async function createAccount(session, { accountName, publicKey }, ip) {
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

    const mine = records.filter((r) => r.email === session.email).length;
    if (mine >= config.maxPerUser) {
      throw new Refusal(429, `You have already created ${mine} demo accounts, which is the limit`);
    }
    const today = records.filter((r) => now() - Date.parse(r.time) < DAY).length;
    if (today >= config.maxPerDay) throw new Refusal(429, 'The demo has created its daily quota of accounts; try again tomorrow');
    if (await chain.exists(accountName)) throw new Refusal(409, 'That account name is taken');

    const transactionId = await chain.createAccount(accountName, publicKey);
    const record = { time: new Date(now()).toISOString(), email: session.email, name: session.name, method: session.method, account: accountName, publicKey, ip, transactionId };
    records.push(record);
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n');
    return { account: accountName, transactionId, grant: config.grant, remaining: config.maxPerUser - mine - 1 };
  }

  // ---- http -------------------------------------------------------------------------
  const send = (res, status, body, setCookies = []) => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    if (setCookies.length) headers['Set-Cookie'] = setCookies;
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  };

  async function readJson(req) {
    // Cross-site forms cannot send JSON, and a browser states where a request came from.
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Refusal(415, 'Send JSON');
    if (req.headers.origin && req.headers.origin !== config.origin) throw new Refusal(403, 'Requests from other sites are not accepted');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16 * 1024) throw new Refusal(413, 'Request too large');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      throw new Refusal(400, 'The request body is not JSON');
    }
  }
  const requireSession = (req) => {
    const session = readSession(req);
    if (!session) throw new Refusal(401, 'Sign in first');
    return session;
  };

  return http.createServer(async (req, res) => {
    const route = `${req.method} ${new URL(req.url, 'http://localhost').pathname}`;
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress);
    try {
      switch (route) {
        case 'GET /api/config':
          return send(res, 200, { googleClientId: config.googleClientId, emailSignIn: !!mailer, grant: config.grant, maxPerUser: config.maxPerUser });
        case 'POST /api/wake':
          await chain.wake();
          return send(res, 200, { awake: true });
        case 'GET /api/session': {
          const out = currentSession(req);
          return send(res, 200, out.body, out.cookies);
        }
        case 'POST /api/session': {
          const out = await googleSignIn(await readJson(req));
          return send(res, 200, out.body, out.cookies);
        }
        case 'DELETE /api/session':
          return send(res, 200, { signedIn: false }, [clearCookie('eib_session'), clearCookie('eib_pending')]);
        case 'POST /api/signin/email': {
          const out = await requestLink(req, await readJson(req), ip);
          return send(res, 202, out.body, [out.cookie]);
        }
        case 'POST /api/signin/confirm': {
          const out = confirmLink(req, await readJson(req));
          return send(res, 200, out.body, out.cookies);
        }
        case 'POST /api/accounts': {
          const body = await readJson(req);
          const session = requireSession(req);
          const result = await (queue = queue.catch(() => {}).then(() => createAccount(session, body, ip)));
          return send(res, 201, result);
        }
        case 'GET /api/admin/accounts': {
          // Who has tried the demo, for the operators named in ADMIN_EMAILS.
          if (!describe(requireSession(req)).isAdmin) throw new Refusal(403, 'Not an operator of this demo');
          return send(res, 200, { accounts: records });
        }
        default:
          return send(res, 404, { error: 'Not found' });
      }
    } catch (err) {
      if (err instanceof Refusal) return send(res, err.status, { error: err.message });
      console.error(new Date(now()).toISOString(), route, err);
      return send(res, 502, { error: 'Something went wrong on the server; try again' });
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
    origin: need('ORIGIN'),
    sessionSecret: need('SESSION_SECRET'),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    smtp: env.SMTP_HOST ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), user: need('SMTP_USER'), pass: need('SMTP_PASS'), from: need('MAIL_FROM') } : null,
    rpId: need('RP_ID'),
    grant: need('GRANT'),
    dataDir: need('DATA_DIR'),
    maxPerUser: Number(env.MAX_ACCOUNTS_PER_USER || 3),
    maxPerDay: Number(env.MAX_ACCOUNTS_PER_DAY || 50),
    maxLinksPerEmailPerHour: Number(env.MAX_LINKS_PER_EMAIL_PER_HOUR || 3),
    maxLinksPerIpPerHour: Number(env.MAX_LINKS_PER_IP_PER_HOUR || 10),
    maxLinksPerDay: Number(env.MAX_LINKS_PER_DAY || 200),
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
  let mailer = null;
  if (config.smtp) {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: false, requireTLS: true,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    mailer = { send: (message) => transport.sendMail({ from: config.smtp.from, ...message }) };
  }
  const service = createService({
    verifyGoogle: config.googleClientId ? googleVerifier({ clientId: config.googleClientId }) : null,
    mailer,
    chain: faucet(config.chain),
    config,
  });
  service.listen(config.port, '127.0.0.1', () => console.log(
    `account service on 127.0.0.1:${config.port} (google: ${config.googleClientId ? 'on' : 'off'}, e-mail: ${mailer ? 'on' : 'off'})`));
}
