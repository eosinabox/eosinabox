// The chains offered on eosinabox.com. Deployed over client/src/chains.js by infra/deploy.sh;
// see that file for what each field means.
window.EOSINABOX_CHAINS = {
  verarta: {
    name: 'Private chain demo (Verarta)',
    url: 'https://chain.verarta.com',
    chainId: '96f99757daf05efb9ed0f8bb675e643e4954a5b6c4c017a25a184ea27f0394cc',
    tokenContract: 'eosio.token', symbol: 'PASSKEY', precision: 4,
    systemContract: false,
    accountService: '/api', // sign in with Google to get an account and some PASSKEY
    wakeUrl: '/api/wake',   // this chain pauses when idle
    default: true,
  },
  jungle4: {
    name: 'Jungle4 Testnet',
    url: 'https://jungle4.cryptolions.io',
    chainId: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    tokenContract: 'eosio.token', symbol: 'EOS', precision: 4,
    systemContract: true,
    explorer: 'https://jungle4.eosq.eosnation.io/account/{account}',
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
};
