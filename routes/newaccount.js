var express = require('express');
const axios = require('axios');
var router = express.Router();

// this hard coded list should move to a config file
var eosEndpoint = [
  'http://api.eoseoul.io'
, 'http://api.eos.cryptolions.io'
, 'http://eos.hyperion.eosrio.io'
//, eos-seed-de.privex.io:9876
//, eu1.eosdac.io:49876
//, fn001.eossv.org:443
//, fullnode.eoslaomao.com:443
//, mainnet.eoscalgary.io:5222
//, node1.eoscannon.io:59876
//, p2p.eosdetroit.io:3018
//, p2p.genereos.io:9876
//, peer.eosn.io:9876
//, peer.main.alohaeos.com:9876
//, peer1.mainnet.helloeos.com.cn:80
//, peer2.mainnet.helloeos.com.cn:80
//, publicnode.cypherglass.com:9876
];

// curl http://eos.hyperion.eosrio.io/v1/chain/get_info 
// curl http://eos.hyperion.eosrio.io/v1/chain/get_block -d '{"block_num_or_id": "120000000"}' | jq
// need to save user's account name+permission+chain
// make sure the chain id for main net is: aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906
//
/* GET users listing. */
router.post('/isAvailable/:accountname', function(req, res, next) {
  res.send('respond with json stating result of check with api for multiple endpointss of hte blockchain:' + req.params.accountname + ';');
  // use axios
  //   .post(eosEndpoint[0] + '/v1/chain/get_account', { account_name: req.params.accountname }, { timeout: 20 })
  //   .then(response => {
  //     console.log('result of chain api: ', response.data);
  //   })
  //   .catch(err => {
  //     console.log('error in getting response to get_account');
  //     console.log(err.code);
  //     console.log(err.message);
  //     console.log(err.stack);
  //   })
});

module.exports = router;
