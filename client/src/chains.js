// The chains this wallet offers. Edit this file to point the wallet at your own chain;
// it is the only place a chain is described.
//
//   url              the chain's API endpoint (it must allow cross-origin requests)
//   chainId          optional; if given, the wallet refuses to sign for any other chain
//   tokenContract, symbol, precision   the token shown as the balance and sent by "transfer"
//   systemContract   true if accounts need RAM and staked resources (public EOS-style chains)
//   explorer         optional account page, with {account} replaced by the account name
//   freePowerupUrl   optional free-PowerUp service; the account name is appended
//   accountService   optional URL of the sign-in account service (see ./service): visitors
//                    sign in with Google and get an account, instead of asking a custodian
//   wakeUrl          optional; POSTed before a transaction, for chains that pause when idle
//   default          the chain selected on first use
window.EOSINABOX_CHAINS = {
  jungle4: {
    name: 'Jungle4 Testnet',
    url: 'https://jungle4.cryptolions.io',
    chainId: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    tokenContract: 'eosio.token', symbol: 'EOS', precision: 4,
    systemContract: true,
    explorer: 'https://jungle4.eosq.eosnation.io/account/{account}',
    default: true,
  },
  eos: {
    name: 'EOS Mainnet',
    url: 'https://api.eos.cryptolions.io',
    chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906',
    tokenContract: 'eosio.token', symbol: 'EOS', precision: 4,
    systemContract: true,
    explorer: 'https://bloks.io/account/{account}',
    freePowerupUrl: 'https://api.eospowerup.io/freePowerup/',
  },
  local: {
    name: 'Local chain (Docker)',
    url: 'http://localhost:28888', // the chain in ./local-chain
    tokenContract: 'eosio.token', symbol: 'SYS', precision: 4,
    systemContract: false,
    accountService: '/api', // served by `npm run service:local`, proxied by serve.js
  },
};
