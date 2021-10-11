# github

    https://github.com/eosinabox/eosinabox

# EOS in a Box

clean(er) version of the web wallet with webauthn tech.

dead simple project with one client file and one server file.
starting with jQuery on the client and node.js with express on the server.

There is no database and no sessions, All info will be saved on the user's phone since the private key is there anyway.

localStorage will have the blockchain and account name.

# Server code

    ./index.js

# Client code

    ./client/src/index.html
    ./client/src/client.js

# TODO

 [ ] make pure front end app, get rid of server side, log to another domain with CORS, make PUB_KEY in front end
 [ ] separate to a library, later put it in npm?
 [ ] convert to react.js
 [V] let user choose account to sign with in "create new account"
 [~] generl ESR in create new account copy/share, add human text explainer and 2 options, esr and link to eosinabox.com
 [ ] let user paste ESR from outside the app, show human readable version and let him sign
 [ ] direct link to ESR, https://eosinabox.com/?esr="the actual esr"
 [ ] manage accounts, let user delete or add accounts
 [ ] manage pub keys, let user delete pub keys
 [ ] manage chains, let user add or delete (system chains remain: jungle3 and EOS)
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

