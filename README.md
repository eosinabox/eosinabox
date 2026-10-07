# github

    https://github.com/eosinabox/eosinabox

# EOS in a Box

A web wallet for Antelope chains that signs with WebAuthn: the private key is created in the
phone's secure hardware and never leaves it, and the user approves a transaction with a
fingerprint or face.

The wallet is static files. There is no server, no database and no session: the chain is read
and written directly from the browser, and the account names and public keys the wallet knows
about are kept in the browser's localStorage.

    client/src/            the wallet as deployed: copy this folder to any https web server
      index.html, client.js   the UI (jQuery)
      chains.js               the chains the wallet offers; edit this to add your own
      core.bundle.js          built from client/lib/core.mjs by `npm run build`
    client/lib/core.mjs    keys, signatures and chain calls (Wharfkit), no DOM
    serve.js               a small static server for local use
    local-chain/           a throwaway Antelope chain in Docker, for development
    test/                  unit tests for the core and an end-to-end test in headless Chrome

# Use it with your own chain

Add an entry to `client/src/chains.js` with the chain's API URL and token, and serve
`client/src` over https. Three things the chain and the host must provide:

* the `WEBAUTHN_KEY` protocol feature must be activated on the chain;
* the chain API must allow cross-origin requests from the wallet's domain;
* the wallet must be on an `https://` origin: nodeos rejects WebAuthn signatures from any other.

A WebAuthn key is bound to the domain that created it. Keys made on `eosinabox.com` are bound
to that domain; on any other host they are bound to the host serving the page. Moving the
wallet to another domain means new keys.

# Run it against a local chain

The wallet can be tried end to end without a phone, a public chain or any tokens.
`local-chain/` builds a single-node Antelope (Spring 1.2.2) chain in Docker with `WEBAUTHN_KEY`
activated and a `SYS` token; the tests drive the wallet in headless Chrome with a virtual
authenticator standing in for the fingerprint reader.

    npm install
    npm run chain:build     # once
    npm run chain:up        # throwaway chain on http://localhost:28888
    npm test
    npm run chain:down

What the end-to-end test shows:

1. the wallet creates a key pair in the authenticator and derives the `PUB_WA_` key in the browser;
2. that key is set as the `active` key of a new account on the chain;
3. the wallet signs a token transfer with the passkey and the chain executes it (`SIG_WA_` signature);
4. a signature from a different passkey is refused by the wallet, and by the chain when replayed;
5. the wallet's own origin is asked for nothing but static files;
6. a crafted "shared" link cannot inject markup or a `javascript:` link into the page.

To click around yourself, serve it over https with any certificate:

    TLS_KEY=key.pem TLS_CERT=cert.pem npm start

# TODO

 [V] make pure front end app, get rid of server side, make PUB_KEY in front end
 [ ] separate to a library, later put it in npm?
 [ ] convert to react.js
 [V] let user choose account to sign with in "create new account"
 [~] generl ESR in create new account copy/share, add human text explainer and 2 options, esr and link to eosinabox.com
 [ ] let user paste ESR from outside the app, show human readable version and let him sign
 [ ] direct link to ESR, https://eosinabox.com/?esr="the actual esr"
 [ ] manage accounts, let user delete or add accounts
 [ ] manage pub keys, let user delete pub keys
 [~] manage chains: the site owner edits chains.js; letting the user add or delete chains is still open
 [ ] each chain can have 1 or more access points (for redundancy) and chainID (to verify correct chain)
 [ ] allow user to add or delete tokens, choose chain, enter account and symbol
 [ ] manage contacts, when sending moey, optionally add nickname or alias
 [ ] manage contacts, let user add, delete or modify nicknames for accounts
 [ ] advanced key management, accept pubKey, timeDelay, weights, multiple such options per permission
 [ ] easy page: add existing account to this phone (to be signed by owner or active key of this account elsewhere)
 [ ] easy page, move active to this phone, similat to above
 [ ] cloud backup of localStorage, if user wants and agrees

 [V] choose between Jungle3 and EOS main net
 [V] PWA install, capture and let install internally?
 [ ] PWA update, click to reload? https://solidstudio.io/blog/pwa-refreshing-application
 [ ] Manage accounts to send money to
 [V] powerup, display simple gauge, e.g. https://codepen.io/xgh/pen/ExaXgbb
 [X] share invite friend to create account, cleaner UI without this.
 [V] external link to block explorer
 [ ] allow complex permission, multisig with threshold, account+pubKeys+timeDelays
 [ ] Allow pay for powerup directly from app
 [ ] Allow general transactions
 [ ] Allow multisig transactions
 [ ] Allow ESR - EOSIO Signing Request using QR / clipboard / url with parameter
 [ ] Support scanning QR: https://stackoverflow.com/questions/52255929/progressive-web-app-pwa-qr-code-scanner
 [ ] special "programming codes" as links.
 [ ] E.g. Want to add EOSDT on jungle3? click here: https://eosinabox.com/#sharedInfo?action=addToken&chain=jungle3&account=eosdtsttoken&token=EOSDT
 [ ] scan QR with ESR

# snippets

    cleos -u https://jungle3.cryptolions.io:443 get currency balance eosdtsttoken grayfox12345 EOSDT -j >> ["1997.975627679 EOSDT"]
    cleos -u https://jungle3.cryptolions.io:443 get currency balance eosdtsttoken ${anaccount} EOSDT -j >> ["1234.123456789 EOSDT"]

