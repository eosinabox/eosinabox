// One-off chain setup for the demo: the faucet account and its token. Safe to run again;
// each step is skipped if it is already done.
//
//   CHAIN_URL            the chain API
//   ADMIN_PRIVATE_KEY    a key for eosio@active and <token contract>@active
//   FAUCET_ACCOUNT       the account the service will act as
//   FAUCET_PUBLIC_KEY    its key
//   FAUCET_PRIVATE_KEY   the private half, used here only to issue the first tokens
//   TOKEN                e.g. "4,PASSKEY"      MAX_SUPPLY, ISSUE   e.g. "1000000.0000 PASSKEY"
//   TOKEN_CONTRACT       default eosio.token   WAKE_URL            optional

import { APIClient, PrivateKey, SignedTransaction, Transaction } from '@wharfkit/antelope';

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
};
const api = new APIClient({ url: env('CHAIN_URL') });
const admin = PrivateKey.from(env('ADMIN_PRIVATE_KEY'));
const account = env('FAUCET_ACCOUNT');
const faucetKey = env('FAUCET_PUBLIC_KEY');
const tokenContract = env('TOKEN_CONTRACT', 'eosio.token');
const symbol = env('TOKEN').split(',')[1];

async function push(actions) {
  const info = await api.v1.chain.get_info();
  const contracts = [...new Set(actions.map((a) => a.account))];
  const abis = await Promise.all(contracts.map(async (contract) => ({ contract, abi: (await api.v1.chain.get_abi(contract)).abi })));
  const tx = Transaction.from({ ...info.getTransactionHeader(60), actions }, abis);
  const result = await api.v1.chain.push_transaction(SignedTransaction.from({ ...tx, signatures: [admin.signDigest(tx.signingDigest(info.chain_id))] }));
  return result.transaction_id;
}
const call = (path, params) => api.call({ path, params });

if (process.env.WAKE_URL) {
  await fetch(process.env.WAKE_URL, { method: 'POST' });
  for (let i = 0; i < 60; i++) {
    const info = await api.v1.chain.get_info();
    if (Date.now() - info.head_block_time.toMilliseconds() < 3000) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}

const exists = await api.v1.chain.get_account(account).then(() => true, () => false);
if (exists) {
  console.log(`account ${account} already exists`);
} else {
  const auth = { threshold: 1, keys: [{ key: faucetKey, weight: 1 }], accounts: [], waits: [] };
  const id = await push([{ account: 'eosio', name: 'newaccount', authorization: [{ actor: 'eosio', permission: 'active' }],
    data: { creator: 'eosio', name: account, owner: auth, active: auth } }]);
  console.log(`created account ${account}: ${id}`);
}

const stats = await call('/v1/chain/get_currency_stats', { code: tokenContract, symbol });
if (stats[symbol]) {
  console.log(`token ${symbol} already exists: issuer ${stats[symbol].issuer}, supply ${stats[symbol].supply}`);
} else {
  // The faucet account is the issuer, so the admin key is not needed again after this.
  const id = await push([{ account: tokenContract, name: 'create', authorization: [{ actor: tokenContract, permission: 'active' }],
    data: { issuer: account, maximum_supply: env('MAX_SUPPLY') } }]);
  console.log(`created token ${symbol}: ${id}`);
}

const balance = await call('/v1/chain/get_currency_balance', { code: tokenContract, account, symbol });
if (balance.length) {
  console.log(`${account} already holds ${balance[0]}`);
} else {
  // Only the issuer can issue, so this step is signed with the faucet's own key.
  const faucet = PrivateKey.from(env('FAUCET_PRIVATE_KEY'));
  const info = await api.v1.chain.get_info();
  const abi = (await api.v1.chain.get_abi(tokenContract)).abi;
  const tx = Transaction.from({ ...info.getTransactionHeader(60), actions: [{ account: tokenContract, name: 'issue',
    authorization: [{ actor: account, permission: 'active' }], data: { to: account, quantity: env('ISSUE'), memo: 'demo float' } }] }, [{ contract: tokenContract, abi }]);
  const result = await api.v1.chain.push_transaction(SignedTransaction.from({ ...tx, signatures: [faucet.signDigest(tx.signingDigest(info.chain_id))] }));
  console.log(`issued ${env('ISSUE')} to ${account}: ${result.transaction_id}`);
}
