// The faucet's side of the chain: create an account for a passkey and give it some tokens.

import { APIClient, PrivateKey, PublicKey, SignedTransaction, Transaction } from '@wharfkit/antelope';

// A PUB_WA_ key carries the domain (rpId) it is bound to after the 33-byte point and a flags byte.
export function passkeyDomain(key) {
  const publicKey = PublicKey.from(key);
  if (publicKey.type !== 'WA') throw new Error('not a WebAuthn key');
  const data = publicKey.data.array;
  return new TextDecoder().decode(data.subarray(35, 35 + data[34]));
}

export function faucet({ chainUrl, chainId, account, privateKey, tokenContract, grant, wakeUrl, fetchImpl = fetch }) {
  const api = new APIClient({ url: chainUrl, fetch: fetchImpl });
  const key = PrivateKey.from(privateKey);
  const authorization = [{ actor: account, permission: 'active' }];

  // A chain that pauses when idle has to be producing before a transaction is built:
  // the transaction refers to a recent block and expires within a minute.
  async function wake() {
    if (!wakeUrl) return;
    await fetchImpl(wakeUrl, { method: 'POST' }).catch(() => {});
    for (let i = 0; i < 40; i++) {
      const info = await api.v1.chain.get_info();
      if (Date.now() - info.head_block_time.toMilliseconds() < 3000) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('the chain did not wake up');
  }

  async function exists(name) {
    try {
      await api.v1.chain.get_account(name);
      return true;
    } catch {
      return false;
    }
  }

  // The new account's owner is the faucet account, so a lost phone can be replaced;
  // its active key is the passkey, so only the user can sign for it day to day.
  async function createAccount(name, passkey) {
    await wake();
    const info = await api.v1.chain.get_info();
    if (chainId && String(info.chain_id) !== chainId) throw new Error('connected to the wrong chain');
    const system = (await api.v1.chain.get_abi('eosio')).abi;
    const token = (await api.v1.chain.get_abi(tokenContract)).abi;
    const transaction = Transaction.from({
      ...info.getTransactionHeader(60),
      actions: [
        { account: 'eosio', name: 'newaccount', authorization,
          data: {
            creator: account, name,
            owner: { threshold: 1, keys: [], accounts: [{ permission: { actor: account, permission: 'active' }, weight: 1 }], waits: [] },
            active: { threshold: 1, keys: [{ key: passkey, weight: 1 }], accounts: [], waits: [] },
          } },
        { account: tokenContract, name: 'transfer', authorization,
          data: { from: account, to: name, quantity: grant, memo: 'welcome to the passkey demo' } },
      ],
    }, [{ contract: 'eosio', abi: system }, { contract: tokenContract, abi: token }]);
    const signature = key.signDigest(transaction.signingDigest(info.chain_id));
    const result = await api.v1.chain.push_transaction(SignedTransaction.from({ ...transaction, signatures: [signature] }));
    return result.transaction_id;
  }

  return { wake, exists, createAccount };
}
