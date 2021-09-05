/**
 * Required External Modules
 */
const express = require("express");
const path = require("path");
const cbor = require("cbor");
const { Api, JsonRpc, Serialize, Numeric } = require('eosjs');
const fetch = require("node-fetch");
const bodyParser = require('body-parser');

/**
 * App Variables
 */
const app = express();

app.use( bodyParser.json() );                       // to support JSON-encoded bodies
// app.use(bodyParser.urlencoded({ extended: true })); // to support URL-encoded bodies 

const port = process.env.PORT || "8000";

/**
 *  App Configuration
 */

/**
 * Routes Definitions
 */
app.get("/client/src/eosjs/dist-web/:filename", (req, res) => {
  res.sendFile( path.join(__dirname, 'client/src/eosjs/dist-web', req.params.filename) );
});
app.get("/client/src/:filename", (req, res) => {
  res.sendFile( path.join(__dirname, 'client/src', req.params.filename) );
});
app.post("/consoleLog", (req, res) => {
  console.log('[consoleLog]:::', JSON.stringify(req.body, null, 2));
  console.log('[consoleLog][headers]:', JSON.stringify(req.headers, null, 2));
  res.status(200).send("ok");
});
app.post("/getNewPubKey", async (req, res) => {
  try {
    const k = req.body;
    console.log('AMIHDEBUG getNewPubKey [0] k.rpid:', k.rpid);
    console.log('AMIHDEBUG getNewPubKey [0] k.id:', k.id);
    console.log('AMIHDEBUG getNewPubKey [0] k.attestationObject.substr(0,80):', k.attestationObject.substr(0,180));
    console.log('AMIHDEBUG getNewPubKey [0] k.clientDataJSON.substr(0,80):', k.clientDataJSON.substr(0,180));
    // // decode the clientDataJSON into a utf-8 string
    // https://medium.com/webauthnworks/verifying-fido2-responses-4691288c8770
    const utf8Decoder = new TextDecoder('utf-8');
    const decodedClientData = utf8Decoder.decode( Serialize.hexToUint8Array(k.clientDataJSON) );
    const clientDataObj = JSON.parse(decodedClientData);
    console.log('AMIHDEBUG getNewPubKey [1] clientDataObj:', clientDataObj);
    const decodedAttestationObj = cbor.decode( k.attestationObject );
    console.log('AMIHDEBUG getNewPubKey [2] attestationObj:', decodedAttestationObj );
    const {authData} = decodedAttestationObj;

    // get the length of the credential ID
    const dataView = new DataView( new ArrayBuffer(2) );
    const idLenBytes = authData.slice(53, 55);
    idLenBytes.forEach( (value, index) => dataView.setUint8( index, value ));
    const credentialIdLength = dataView.getUint16();
    const credentialId = authData.slice( 55, 55 + credentialIdLength); // get the credential ID
    const publicKeyBytes = authData.slice( 55 + credentialIdLength ); // get the public key object
    const pubKey = cbor.decode( publicKeyBytes); // the publicKeyBytes are encoded again as CBOR
    console.log('AMIHDEBUG getNewPubKey [5] pubKey:', pubKey);
    if (pubKey.get(1) !== 2){
      throw new Error('Public key is not EC2');
    }
    if (pubKey.get(3) !== -7){
      throw new Error('Public key is not ES256');
    }
    if (pubKey.get(-1) !== 1){
      throw new Error('Public key has unsupported curve');
    }
    const x = pubKey.get(-2);
    const y = pubKey.get(-3);
    if (x.length !== 32 || y.length !== 32){
      throw new Error('Public key has invalid X or Y size');
    }
    const ser = new Serialize.SerialBuffer({textEncoder: new TextEncoder(), textDecoder: new TextDecoder()});
    ser.push((y[31] & 1) ? 3 : 2);
    ser.pushArray(x);
    //////////////////////////////////////////////////
    // const enum UserPresence {
    //   none = 0,
    //   present = 1,
    //   verified = 2,
    // }
    // function flagsToPresence(flags: number) {
    //   if (flags & AttestationFlags.userVerified)
    //     return UserPresence.verified;
    //   else if (flags & AttestationFlags.userPresent)
    //     return UserPresence.present;
    //   else
    //     return UserPresence.none;
    // }
    //////////////////////////////////////////////////
    ser.push( 1); // should be flags to presence...
    ser.pushString(k.rpid);
    const compact = ser.asUint8Array();
    const key = Numeric.publicKeyToString({
        type: Numeric.KeyType.wa,
        data: compact,
    });
    console.log('AMIHDEBUG [6] key: ', key)
    res.status(200).send({pubkey: key});
    ////////////////////////////////////////////////////////////////////////////////
    // var AttestationFlags;
    // (function (AttestationFlags) {
    //   AttestationFlags[AttestationFlags["userPresent"] = 0x01] = "userPresent";
    //   AttestationFlags[AttestationFlags["userVerified"] = 0x04] = "userVerified";
    //   AttestationFlags[AttestationFlags["attestedCredentialPresent"] = 0x40] = "attestedCredentialPresent";
    //   AttestationFlags[AttestationFlags["extensionDataPresent"] = 0x80] = "extensionDataPresent";
    // })(AttestationFlags || (AttestationFlags = {}));
    // const k = req.body;
    // const att = await cbor.decodeFirst(Serialize.hexToUint8Array(k.attestationObject));
    // // console.log(att);
    // // console.log(Serialize.arrayToHex(new Uint8Array(att.authData.buffer)));
    // const data = new DataView(att.authData.buffer);
    // // let pos = 30;   // skip unknown
    // let pos = 0;   // NO SKIPPING?!??!?!!? https://www.w3.org/TR/webauthn/#sctn-attestation
    // pos += 32;      // RP ID hash
    // const flags = data.getUint8(pos++);
    // const signCount = data.getUint32(pos);
    // pos += 4;
    // console.log({ msg: 'amihdebug [0]', flags, paaram: AttestationFlags.attestedCredentialPresent });
    // console.log({ msg: 'amihdebug [1]', boolNeg: !(flags & AttestationFlags.attestedCredentialPresent) });
    // //
    // // HOW RISKY IS DISABLING THIS??
    // // Perhaps not risky at all? not sure. I want the biometrics to work, not a yubikey touch
    // // the yubikey can be touched by anyone - no fingrpring...
    // // ALSO: disabling this "throw" messes up the rest of the code, especially the
    // // > const credentialId = new Uint8Array(data.buffer, pos, credentialIdLength);
    // // --> RangeError: Invalid typed array length: 53043
    // //
    // // probably no way around it, can't proceed with a yubikey on my laptop and developing on localhost.
    // // will have to continue developing on a remte server with ssh and nginx and a proper ssl cert
    // //
    // if (!(flags & AttestationFlags.attestedCredentialPresent)) {
    //   console.log('attestedCredentialPresent flag not set!!!');
    //   throw new Error('attestedCredentialPresent flag not set');
    // }
    // const aaguid = Serialize.arrayToHex(new Uint8Array(data.buffer, pos, 16));
    // pos += 16;
    // const credentialIdLength = data.getUint16(pos);
    // pos += 2;
    // const credentialId = new Uint8Array(data.buffer, pos, credentialIdLength);
    // pos += credentialIdLength;
    // const pubKey = await cbor.decodeFirst(new Uint8Array(data.buffer, pos));
    // if (Serialize.arrayToHex(credentialId) !== k.id){
    //   throw new Error('Credential ID does not match');
    // }
    // if (pubKey.get(1) !== 2){
    //   throw new Error('Public key is not EC2');
    // }
    // if (pubKey.get(3) !== -7){
    //   throw new Error('Public key is not ES256');
    // }
    // if (pubKey.get(-1) !== 1){
    //   throw new Error('Public key has unsupported curve');
    // }
    // const x = pubKey.get(-2);
    // const y = pubKey.get(-3);
    // if (x.length !== 32 || y.length !== 32){
    //   throw new Error('Public key has invalid X or Y size');
    // }
    // const ser = new Serialize.SerialBuffer({textEncoder: new util.TextEncoder(), textDecoder: new util.TextDecoder()});
    // ser.push((y[31] & 1) ? 3 : 2);
    // ser.pushArray(x);
    // ser.push(flagsToPresence(flags));
    // ser.pushString(k.rpid);
    // const compact = ser.asUint8Array();
    // const key = Numeric.publicKeyToString({
    //     type: Numeric.KeyType.wa,
    //     data: compact,
    // });
    // consoleLog(key)
    ////////////////////////////////////////////////////////////////////////////////
  } catch (error) {
    console.log('error in [getNewPubKey]', error)
    res.status(200).send({ msg: 'error in getNewPubKey' });
  }
});
app.get("/", (req, res) => {
  var p = path.join(__dirname, 'client/src', 'index.html');
  console.log('[AMIHDEBUG] PATH:::', p);
  res.sendFile(p);
  // res.status(200).send("WHATABYTE: Food For Devs");
});
app.get("/checkAvailability/:name", (req, res) => {
	const rpc = new JsonRpc('http://jungle3.cryptolions.io:80', { fetch }); // http://jungle3.cryptolions.io:80 https://jungle3.cryptolions.io:443
  // const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
  (async () => {
    try{
      console.log('AMIHDEBUG [checkAvail][name]-====>>>', req.params.name);
      var acc = await rpc.get_account(req.params.name);
      console.log('ACCOUNT:::', acc);
      res.status(200).send({ available: false });
    }
    catch(err){
      if(!!err.details && !!err.details[0].message && err.details[0].message.substr(0,11) == 'unknown key'){
        console.log('Account not found - great news!!');
        res.status(200).send({ available: true });
      }else{
        console.log('AMIHDEBUG error, account not found??', err);
        res.status(200).send({ available: false });
      }
    }
  })();
});
/**
 * Server Activation
 */
app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});
