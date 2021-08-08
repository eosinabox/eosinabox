This will be the project where I test eosinabox webauthn server.
For dev it is installed on my sub domain.

This was the output of running:

    npx express-generator

  warning: the default view engine will not be jade in future releases
  warning: use `--view=jade' or `--help' for additional options


   create : public/
   create : public/javascripts/
   create : public/images/
   create : public/stylesheets/
   create : public/stylesheets/style.css
   create : routes/
   create : routes/index.js
   create : routes/users.js
   create : views/
   create : views/error.jade
   create : views/index.jade
   create : views/layout.jade
   create : app.js
   create : package.json
   create : bin/
   create : bin/www

   install dependencies:
     $ npm install

   run the app:
     $ DEBUG=dev:* npm start

remote: GitHub found 2 vulnerabilities on eosinabox/eosinabox's default branch (1 critical, 1 low). To find out more, visit:
remote:      https://github.com/eosinabox/eosinabox/security/dependabot

====

# Design principles
* Simple code, less layers between code and the website owner, no need to be an expert in:
    * typescript
    * react
    * route libraries
    * esoteric css compilers
    * Database
* No database, not saving user's name nor email nor phone number,
    * No backup needed
    * No private info needs to be kept secure
    * No GDPR or other regulatory compliance needed
* Warn website owner in README and on the front page of the site, and warn the user requesting an account with the help of the website owner
* Warning should include: Don't put a large sum of money in tokens on this wallet, you might lose access forever.

# To Do / To Research
* pwa register schema handler
* pwa other capabilities
* https://github.com/greymass/eosio-signing-request

# Plan (will be fine tuned as time progresses)

## Week 1-2
* define requirements and capabilities and order of development in broad lines
* start implementing and git push, so there is something to show on github at the end of each 2 week cycle
* dead simple hard coded config, input fields and buttons, jQuery front end, simple backend
* proof of concept, check account name, taken or available
* user wants to create a new keypair using webauthn? do it!
* check on server if valid attestation
* perhaps if account exists, ask user if this account is managed by the site owner?
* perhaps have a simple PIN so only friends of the site owner have access? PIN in a setup file on the server?
* create jungle3 test accounts and play with their permissions and keys

## Week 3-4
* allow the user to transfer EOS using the mini website as a wallet
* allow transfer of any "standard" token
* "share" feature, send to web site owner the info - account name and pub key and what the user wants, either create a new account or change keys since user changed phones.
* split flows to:
    * I want to create a new account
    * I want to regain access to my account with a new phone
    * I want to add another phone to my account, so either phone can be used (future)
    * I want to add another phone to my account, so I will need to approve a transaction from both phones (future)
    * I want to logout, please forget my account on this phone
    * I want to transfer EOS to another account
    * (future) sign any transaction (wallet capabilities)

## Week 5-6
* beautify with react & some css
* use sockets for push notification from server to phone
* streamline the pages
* continue implementing the features from the previous cycle

## Week 7-8
* integrate with eospowerup.io ?
* integrate with EOS block explorers? several?
* config json with different chains, let owner customize the site
* integrate with EOS wallets to make it easier for site owner to create accounts and replace active keys to help users regain access
* define recommended standard msig owners, perhaps with delays? some without delays to cancel unstaking and replace keys to help user save his account from attacker
* continue implementing the features from the previous cycle

---

jungle3 testing playground, create account, use faucet, then use that as the website-owner who creates new accounts

cleos -u https://jungle.eosn.io:443 system newaccount \
--dont-broadcast \
--buy-ram-bytes {howMuch?} \
--stake-net "{howMuch?} EOS" \
--stake-cpu "{howMuch?} EOS" \
webauthn1111 webauthn2222 {whoWillBeTheManager?} EOS7fVpbiuSyctgBYa2YhYq79dnxZTx9rAPS4AD1EyNNqBxDbLSFj

Fill in the parameters from the website owner's config file and prepare a ESR that the user can send out-of-band (perhaps on telegram) to the website owner to sign.

# self-powerup
cleos -u https://jungle.eosn.io:443 get table eosio 0 powup.state
cleos -u https://jungle.eosn.io:443 push action eosio powerup '[webauthn1111, webauthn1111, 1, 100000000, 100000000, "0.0010 EOS"]' -p webauthn1111
cleos -u https://jungle.eosn.io:443 get account webauthn1111
