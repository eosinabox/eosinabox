var express = require('express');
var router = express.Router();
const { JsonRpc, Api } = require('eosjs')
const fetch = require('node-fetch') // consider replacing with axios, which has timeout!
const axios = require('axios');
const util = require('util')
const zlib = require('zlib')
const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()

// this hard coded list should move to a config file
var eosEndpoint = [
  'https://jungle3.eossweden.org'
// , 'http://api.eoseoul.io'
// , 'http://api.eos.cryptolions.io'
// , 'http://eos.hyperion.eosrio.io'
];

// curl http://eos.hyperion.eosrio.io/v1/chain/get_info 
// curl http://eos.hyperion.eosrio.io/v1/chain/get_block -d '{"block_num_or_id": "120000000"}' | jq
// need to save user's account name+permission+chain
// make sure the chain id for main net is: aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906
//
/* GET users listing. */
router.post('/isAvailable/:accountname', function(req, res, next) {
  // const rpc = new JsonRpc('https://jungle3.eossweden.org', { fetch }) // only needed if running in nodejs, not required in browsers
  // const eos = new Api({ rpc, textDecoder, textEncoder })
  axios
  .post(eosEndpoint[0] + '/v1/chain/get_account', { account_name: req.params.accountname }, { timeout: 10*1000 })
  .then(response => {
    console.log('result of chain api: ', response.data);
    res.send('respond from isAvailable with json stating result of check with api for multiple endpointss of the blockchain:' + response.data + ';');
  })
  .catch(err => {
    console.log('error in getting response to get_account', err.code, err.message, err.stack);
    res.send(JSON.stringify(['error from isAvailable:', err.code, err.message, err.stack]));
  })
});
router.post('/testEsr', function(req, res, next){
  // copied from https://github.com/greymass/eosio-signing-request-demo/blob/master/examples/encode.js
  const rpc = new JsonRpc('https://jungle3.eossweden.org', { fetch }) // only needed if running in nodejs, not required in browsers
  const eos = new Api({ rpc, textDecoder, textEncoder })
  const { SigningRequest } = require("eosio-signing-request")
  const opts = {
    textEncoder,
    textDecoder,
    zlib: {
      deflateRaw: (data) => new Uint8Array(zlib.deflateRawSync(Buffer.from(data))),
      inflateRaw: (data) => new Uint8Array(zlib.inflateRawSync(Buffer.from(data))),
    },
    abiProvider: {
      getAbi: async (account) => (await eos.getAbi(account))
    }
  }
  async function main() {
    const actions = [{
      account: 'eosio',
      name: 'voteproducer',
      authorization: [{
        actor: '............1',
        permission: '............2'
      }],
      data: {
        voter: '............1',
        proxy: 'greymassvote',
        producers: [],
      }
    }]
    const request = await SigningRequest.create({ actions }, opts)
    console.log(util.inspect(request, false, null, true))
    // encode signing request as URI string
    const uri = request.encode();
    console.log(`\n[AMIHDEBUG][URI]: ${ uri }`)
  }
  main().catch(console.error)  
});
module.exports = router;

// {
//   "req": [
//     "action[]",
//     [
//     	{
//         "account": "eosio",
//         "name": "newaccount",
//         "authorization": [{
//           "actor": "............1",
//           "permission": "............2"
//         }],
//         "data": {
//           "creator": "............1",
//           "name": "webauthn3333",
//           "owner": {
//             "threshold": 1,
//             "keys": [],
//             "accounts": [{
//               "permission": {
//                 "actor": "{replaceWithConfigInfo}",
//                 "permission": "{replaceWithConfigInfo}"
//               },
//               "weight": 1
//             }],
//             "waits": []
//           },
//           "active": {
//             "threshold": 1,
//             "keys": [{
//               "key": "{replaceWithWebAuthnKeys}",
//               "weight": 1
//             }],
//             "accounts": [],
//             "waits": []
//           }
//         },
//       },
//       {
//         "account": "eosio",
//         "name": "buyrambytes",
//         "authorization": [{
//           "actor": "............1",
//           "permission": "............2"
//         }],
//         "data": {
//           "payer": "............1",
//           "receiver": "webauthn3333",
//           "bytes": "{replaceWithConfigInfo}"
//         },
//       },
//       {
//         "account": "eosio",
//         "name": "delegatebw",
//         "authorization": [{
//           "actor": "............1",
//           "permission": "............2"
//         }],
//         "data": {
//           "from": "............1",
//           "receiver": "webauthn3333",
//           "stake_net_quantity": "{replaceWithConfigInfo}",
//           "stake_cpu_quantity": "{replaceWithConfigInfo}",
//           "transfer": 0
//         },
//       },
//       {
//         "account": "eosio.token",
//         "name": "transfer",
//         "authorization": [{
//           "actor": "............1",
//           "permission": "............2"
//         }],
//         "data": {
//           "from": "............1",
//           "to": "webauthn3333",
//           "quantity": "9.0000 EOS",
//           "memo": "{replaceWithConfigInfo} - {combinedWithNewUserMessage}"
//         }
//       },
//       {
//         "account": "eosio.token",
//         "name": "transfer",
//         "authorization": [{
//           "actor": "............1",
//           "permission": "............2"
//         }],
//         "data": {
//           "from": "............1",
//           "to": "eden",
//           "quantity": "1.0000 EOS",
//           "memo": "eden donation, eosinabox account webauthn2222"
//         }
//       }
//     ]
//   ]
// }
