var express = require('express');
var router = express.Router();
const { JsonRpc, Api } = require('eosjs')
const fetch = require('node-fetch') // consider replacing with axios, which has timeout!
const axios = require('axios');
const util = require('util')
const zlib = require('zlib')
const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()
const configFile = { // TODO: move this out to a real config file!
  "siteOwnerName": "Ami Heines",
  "siteHeader": "Account creation and wallet for friends of Ami",
  "sponsorAccount": {
    "actor": "webauthn1111",
    "permission": "active"
  },
  "amountOfRamToBuyInBytes": 3200,
  "howMuchToStakeForNet": "0.0100 EOS",
  "howMuchToStakeForCpu": "0.0100 EOS",
  "ShouldTransferStakedEos": 0
};
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
    if(req.params.accountname == response.data.account_name){
      res.send('FOUND!!!');
    }else{
      res.send('NOT found...');
    }
    //res.send('respond from isAvailable :' + JSON.stringify(response.data));
  })
  .catch(err => {
    console.log('error in getting response to get_account', err.code, err.message, err.stack);
    res.send('NOT found [err]');
    // res.send(JSON.stringify(['error from isAvailable:', err.code, err.message, err.stack]));
  })
});
router.post('/testEsr/:accountname/:initialamount', function(req, res, next){
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
    const actions = [
      {
        "account": "eosio",
        "name": "newaccount",
        "authorization": [{
        "actor": "............1",
        "permission": "............2"
        }],
        "data": {
        "creator": "............1",
        "name": req.params.accountname,
        "owner": {
          "threshold": 1,
          "keys": [],
          "accounts": [{
          "permission": {
            "actor": configFile.sponsorAccount.actor,
            "permission": configFile.sponsorAccount.permission
          },
          "weight": 1
          }],
          "waits": []
        },
        "active": {
          "threshold": 1,
          "keys": [{
            "key": "EOS7fVpbiuSyctgBYa2YhYq79dnxZTx9rAPS4AD1EyNNqBxDbLSFj",
            "weight": 1
          }],
          "accounts": [],
          "waits": []
        }
        },
      },
      {
        "account": "eosio",
        "name": "buyrambytes",
        "authorization": [{
        "actor": "............1",
        "permission": "............2"
        }],
        "data": {
          "payer": "............1",
          "receiver": req.params.accountname,
          "bytes": configFile.amountOfRamToBuyInBytes
        },
      },
      {
        "account": "eosio",
        "name": "delegatebw",
        "authorization": [{
          "actor": "............1",
          "permission": "............2"
        }],
        "data": {
          "from": "............1",
          "receiver": req.params.accountname,
          "stake_net_quantity": configFile.howMuchToStakeForNet,
          "stake_cpu_quantity": configFile.howMuchToStakeForCpu,
          "transfer": 0
        },
      },
      {
        "account": "eosio.token",
        "name": "transfer",
        "authorization": [{
        "actor": "............1",
        "permission": "............2"
        }],
        "data": {
        "from": "............1",
        "to": req.params.accountname,
        "quantity": req.params.initialamount + ' EOS',
        "memo": configFile.siteHeader
        }
      }
    ]
    const request = await SigningRequest.create({ actions, chainId: '2a02a0053e5a8cf73a56ba0fda11e4d92e0238a4a2aa74fccf46d5a910746840' }, opts)
    console.log(util.inspect(request, false, null, true))
    // encode signing request as URI string
    const uri = request.encode();
    console.log(`\n[AMIHDEBUG][URI]: ${ uri }`)
  }
  main().catch(console.error)  
});
router.post('/debugMessageToServer', function(req, res, next){
  console.log('AMIHDEBUG debugMessageToServer?', req.body);
  console.log('AMIHDEBUG debugMessageToServer?', JSON.stringify(req.body));
  return res.send({ status: 'ok', msg: 'got it, thanks'});
});
module.exports = router;

