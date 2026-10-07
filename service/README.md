# Account service

The wallet is static files and needs no server. This small service exists for the public demo
only: a new passkey is useless until someone with a key on the chain creates an account for
it, so a visitor signs in with Google and the service creates the account and sends it a few
demo tokens. It never sees a user's private key; those stay in the phone.

Why sign-in: every account has a name behind it, one person can make only a few accounts,
and the service stops at a daily quota. That keeps out anonymous scripts and bounds what a
determined abuser can take. It does not protect the chain API or the static site themselves;
rate limiting in the web server does that.

## Signing in

Two ways, either or both:

* **Google.** The button gives the page a signed ID token and the service verifies it against
  Google's published keys. Only a client id is needed, with the wallet's origin as an
  authorised JavaScript origin; no redirect URI and no client secret.
* **A link by e-mail**, for people without Google or with the button blocked. The visitor types
  an address and gets a link that works once, for ten minutes. Opening the link only shows a
  page with a button; pressing the button confirms, so a mail scanner that fetches links
  cannot use one up. If the link is opened on another device, the browser that asked is the
  one that gets signed in.

A session is a signed, HttpOnly, SameSite=Strict cookie lasting a week. Requests that change
anything must be JSON and, when the browser states an origin, must come from the wallet's own.

Operators (`ADMIN_EMAILS`) get a "Demo sign-ups" item in the wallet's menu. Operator rights
need a sign-in that proves the browser is the operator's own: Google, or a link confirmed in
the same browser that asked for it. A link confirmed elsewhere signs in without those rights,
because someone else could have typed the operator's address and waited for them to press
the button.

The e-mail form is rate limited per address, per requester and per day, so it cannot be used
to flood an inbox or to send mail in bulk.

| Route | |
|---|---|
| `GET /api/config` | Which sign-ins are on, the grant and the per-person limit |
| `POST /api/session` | `{ credential }` from Google → signs in |
| `GET /api/session`, `DELETE /api/session` | Who is signed in; sign out |
| `POST /api/signin/email` | `{ email }` → sends the link |
| `POST /api/signin/confirm` | `{ token }` → confirms it |
| `POST /api/accounts` | `{ accountName, publicKey }` → creates the account for whoever is signed in |
| `POST /api/wake` | Wakes a chain that pauses when idle |
| `GET /api/admin/accounts` | Who has used the demo, for operators |

Every created account is appended to `DATA_DIR/accounts.jsonl` with the time, e-mail, name,
how they signed in, account, key, IP address and transaction id.

The new account's `active` key is the visitor's passkey. Its `owner` is the faucet account,
so a lost phone can be replaced by the operator, and so the operator, not the visitor, has
the last word over a demo account.

## Configuration

| Variable | |
|---|---|
| `ORIGIN` | The wallet's origin, e.g. `https://wallet.example` |
| `SESSION_SECRET` | Random; signs the session cookie (`openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | Optional. OAuth client id (Web application) with the wallet's origin as an authorised JavaScript origin. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional. A mailbox to send sign-in links from (STARTTLS, port 587 by default). |
| `RP_ID` | The wallet's domain. Keys bound to any other domain are refused. |
| `CHAIN_URL`, `CHAIN_ID` | The chain API, and optionally the chain id to insist on |
| `FAUCET_ACCOUNT`, `FAUCET_PRIVATE_KEY` | The account the service acts as. Give it only what the demo may spend. |
| `TOKEN_CONTRACT`, `GRANT` | e.g. `eosio.token` and `100.0000 PASSKEY` |
| `DATA_DIR` | Where `accounts.jsonl` is kept |
| `MAX_ACCOUNTS_PER_USER`, `MAX_ACCOUNTS_PER_DAY` | Defaults 3 and 50 |
| `ADMIN_EMAILS` | Comma-separated operators allowed to read the account list |
| `MAX_LINKS_PER_EMAIL_PER_HOUR`, `MAX_LINKS_PER_IP_PER_HOUR`, `MAX_LINKS_PER_DAY` | Defaults 3, 10 and 200 |
| `WAKE_URL` | Optional: POSTed to wake a chain that pauses when idle |
| `PORT` | Default 8095, bound to 127.0.0.1 |

`setup-chain.mjs` creates the faucet account and its token on a chain, once.
