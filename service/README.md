# Account service

The wallet is static files and needs no server. This small service exists for the public demo
only: a new passkey is useless until someone with a key on the chain creates an account for
it, so a visitor signs in with Google and the service creates the account and sends it a few
demo tokens. It never sees a user's private key; those stay in the phone.

Why sign-in: every account has a name behind it, one person can make only a few accounts,
and the service stops at a daily quota. That keeps out anonymous scripts and bounds what a
determined abuser can take. It does not protect the chain API or the static site themselves;
rate limiting in the web server does that.

| Route | |
|---|---|
| `GET /api/config` | The Google client id, the grant and the per-person limit |
| `POST /api/accounts` | `{ credential, accountName, publicKey }` → creates the account |
| `POST /api/wake` | Wakes a chain that pauses when idle |
| `GET /api/admin/accounts` | Who has used the demo; `Authorization: Bearer <Google ID token>` of an operator |

Every created account is appended to `DATA_DIR/accounts.jsonl` with the time, e-mail, name,
account, key, IP address and transaction id.

The new account's `active` key is the visitor's passkey. Its `owner` is the faucet account,
so a lost phone can be replaced by the operator, and so the operator, not the visitor, has
the last word over a demo account.

## Configuration

| Variable | |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client id (Web application) with the wallet's origin as an authorised JavaScript origin. No client secret is used. |
| `RP_ID` | The wallet's domain. Keys bound to any other domain are refused. |
| `CHAIN_URL`, `CHAIN_ID` | The chain API, and optionally the chain id to insist on |
| `FAUCET_ACCOUNT`, `FAUCET_PRIVATE_KEY` | The account the service acts as. Give it only what the demo may spend. |
| `TOKEN_CONTRACT`, `GRANT` | e.g. `eosio.token` and `100.0000 PASSKEY` |
| `DATA_DIR` | Where `accounts.jsonl` is kept |
| `MAX_ACCOUNTS_PER_USER`, `MAX_ACCOUNTS_PER_DAY` | Defaults 3 and 50 |
| `ADMIN_EMAILS` | Comma-separated operators allowed to read the account list |
| `WAKE_URL` | Optional: POSTed to wake a chain that pauses when idle |
| `PORT` | Default 8095, bound to 127.0.0.1 |

`setup-chain.mjs` creates the faucet account and its token on a chain, once.
