#!/bin/bash
# Start nodeos, then bootstrap the chain: protocol features (including WEBAUTHN_KEY),
# the boot contract on `eosio`, and a SYS token. State is thrown away with the container.
set -euo pipefail

# The well-known Antelope development key. Never use it for anything but a throwaway chain.
DEV_PUB=EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV
DEV_PRIV=5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3
API=http://127.0.0.1:8888
CLEOS="cleos -u $API"

nodeos -e -p eosio \
  --plugin eosio::producer_plugin --plugin eosio::producer_api_plugin \
  --plugin eosio::chain_api_plugin --plugin eosio::http_plugin \
  --http-server-address=0.0.0.0:8888 --http-validate-host=false \
  --access-control-allow-origin='*' --access-control-allow-headers='*' \
  --signature-provider="$DEV_PUB=KEY:$DEV_PRIV" \
  --data-dir /data --config-dir /data/config --contracts-console \
  >/data.log 2>&1 &
NODEOS_PID=$!
trap 'kill $NODEOS_PID 2>/dev/null || true' TERM INT

until curl -sf $API/v1/chain/get_info >/dev/null; do
  kill -0 $NODEOS_PID 2>/dev/null || { cat /data.log; exit 1; }
  sleep 0.3
done

next_block() {
  local start; start=$(curl -sf $API/v1/chain/get_info | jq .head_block_num)
  until [ "$(curl -sf $API/v1/chain/get_info | jq .head_block_num)" -gt $((start + 1)) ]; do sleep 0.2; done
}

cleos wallet create --to-console >/dev/null
cleos wallet import --private-key $DEV_PRIV >/dev/null

# PREACTIVATE_FEATURE has to be scheduled through the producer API; everything else
# is then activated by the boot contract.
curl -sf -X POST $API/v1/producer/schedule_protocol_feature_activations \
  -d '{"protocol_features_to_activate":["0ec7e080177b2c02b278d5088611686b49d739925a92d9bfcacd7fc6b74053bd"]}' >/dev/null
next_block
$CLEOS set contract eosio /contracts/eosio.boot eosio.boot.wasm eosio.boot.abi >/dev/null
next_block

# Every Spring 1.2 feature except SAVANNA, which needs a finalizer policy this
# single-node chain does not set up.
while read -r digest name; do
  $CLEOS push action eosio activate "[\"$digest\"]" -p eosio@active >/dev/null
  echo "activated $name"
done <<'FEATURES'
fce57d2331667353a0eac6b4209b67b843a7262a848af0a49a6e2fa9f6584eb4 DISABLE_DEFERRED_TRXS_STAGE_1
1a99a59d87e06e09ec5b028a9cbb7749b4a5ad8819004365d02dc4379a8b7241 ONLY_LINK_TO_EXISTING_PERMISSION
2652f5f96006294109b3dd0bbde63693f55324af452b799ee137a81a905eed25 FORWARD_SETCODE
299dcb6af692324b899b39f16d5a530a33062804e41f09dc97e9f156b4476707 WTMSIG_BLOCK_SIGNATURES
35c2186cc36f7bb4aeaf4487b36e57039ccf45a9136aa856a5d569ecca55ef2b GET_BLOCK_NUM
ef43112c6543b88db2283a2e077278c315ae2c84719a8b25f25cc88565fbea99 NO_DUPLICATE_DEFERRED_ID
4e7bf348da00a945489b2a681749eb56f5de00b900014e137ddae39f48f69d67 RAM_RESTRICTIONS
4fca8bd82bbd181e714e283f83e1b45d95ca5af40fb89ad3977b653c448f78c2 WEBAUTHN_KEY
5443fcf88330c586bc0e5f3dee10e7f63c76c00249c87fe4fbf7f38c082006b4 BLOCKCHAIN_PARAMETERS
63320dd4a58212e4d32d1f58926b73ca33a247326c2a5e9fd39268d2384e011a BLS_PRIMITIVES2
68dcaa34c0517d19666e6b33add67351d8c5f69e999ca1e37931bc410a297428 DISALLOW_EMPTY_PRODUCER_SCHEDULE
6bcb40a24e49c26d0a60513b6aeb8551d264e4717f306b81a37a5afb3b47cedc CRYPTO_PRIMITIVES
8ba52fe7a3956c5cd3a656a3174b931d3bb2abb45578befc59f283ecd816a405 ONLY_BILL_FIRST_AUTHORIZER
ad9e3d8f650687709fd68f4b90b41f7d825a365b02c23a636cef88ac2ac00c43 RESTRICT_ACTION_TO_SELF
bcd2a26394b36614fd4894241d3c451ab0f6fd110958c3423073621a70826e99 GET_CODE_HASH
c3a6138c5061cf291310887c0b5c71fcaffeab90d5deb50d3b9e687cead45071 ACTION_RETURN_VALUE
d528b9f6e9693f45ed277af93474fd473ce7d831dae2180cca35d907bd10cb40 CONFIGURABLE_WASM_LIMITS2
e0fb64b1085cc5538970158d05a009c24e276fb94e1a0bf6a528b48fbc4ff526 FIX_LINKAUTH_RESTRICTION
f0af56d2c5a48d60a4a5b5c903edfb7db3a736a94ed589d0b797df33ff9d3e1d GET_SENDER
4a90c00d55454dc5b059055ca213579c6ea856967712a56017487886a4d4cc0f REPLACE_DEFERRED
09e86cb0accf8d81c9e85d34bea4b925ae936626d00c984e4691186891f5bc16 DISABLE_DEFERRED_TRXS_STAGE_2
FEATURES
next_block

$CLEOS create account eosio eosio.token $DEV_PUB >/dev/null
$CLEOS set contract eosio.token /contracts/eosio.token eosio.token.wasm eosio.token.abi >/dev/null
$CLEOS push action eosio.token create '["eosio","1000000000.0000 SYS"]' -p eosio.token >/dev/null
$CLEOS push action eosio.token issue '["eosio","1000000.0000 SYS","boot"]' -p eosio >/dev/null

touch /booted
echo "chain ready: $(curl -sf $API/v1/chain/get_info | jq -r .chain_id)"
wait $NODEOS_PID
