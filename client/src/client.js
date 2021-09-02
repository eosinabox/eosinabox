const consoleLog = async (logObj) => {
  await fetch('/consoleLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logObj)
  });
}
$(() => {
  $('.eosinabox_help_header').on('click', ()=>{
    console.log('AMIHDEBUG toggle visibility?');
    consoleLog( { consoleLog: 'AMIHDEBUG toggle visibility?' });
    $('.eosinabox_help').toggle();
  })
  $('#esinabox_check_availability').on('click', (event)=>{
    event.preventDefault();
    var accName = $('#eosinabox_accountName').val();
    if(accName.length != 12){
      alert(`Account name should be 12 characters long, it is ${accName.length}, try again`);
      consoleLog( { consoleLog: 'account length failed', accName });
      return;
    }else if(!/^[a-z1-5]{12}$/.test(accName)){
      alert('The account name contains illegal characters. Characters should be in the range: a-z or 1-5, please fix and try again.');
      consoleLog( { consoleLog: 'account validation failed', accName });
      return;
    }
    consoleLog( { consoleLog: 'check if account name is available', accName });
    fetch('/checkAvailability/' + accName)
    .then(response => response.json())
    .then(data => {
      console.log('AMIHDEBUG res--data::', data);
      if(!!data.available){
        alert('The account name is available!');
      }else{
        alert('The account name is unavailable, please try another account name.');
      }
    })
    .catch((error) => {
      console.error('Error in FETCH:', error);
    });

  })
  $('#eosinbox_createKeys').on('click', async (event) => {
    event.preventDefault();
    const randomStringFromServer = 'sadfjhkjwebrkbwfekjbf'; // AMIHDEBUG TODO: generate random string on server and manage it in a session
    const rp = {
      name: "Duo Security",
      id: "localhost",
    };
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from( randomStringFromServer, c => c.charCodeAt(0) ),
      rp: rp,
      user: {
        id: Uint8Array.from(
          "UZSL85T9AFC", c => c.charCodeAt(0)),
        name: "lee@webauthn.guide",
        displayName: "Lee",
      },
      pubKeyCredParams: [{alg: -7, type: "public-key"}],
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform", // cross-platform or platform or comment out for both
        // warning: we want to require AttestationFlags.attestedCredentialPresent - only works with platform
      },
      timeout: 60000,
      attestation: "direct"
    };
    const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
    });
    /////////////////////////////////////////
    // take the credentials and make an object to send to the server!
    // helper: eosjs_serialize.arrayToHex([12,32,11])
    const credForServer = {
      rpid: rp.id,
      id: eosjs_serialize.arrayToHex(new Uint8Array(credential.rawId)),
      attestationObject: eosjs_serialize.arrayToHex(new Uint8Array(credential.response.attestationObject)),
      clientDataJSON: eosjs_serialize.arrayToHex(new Uint8Array(credential.response.clientDataJSON)),
    }
    // // decode the clientDataJSON into a utf-8 string
    // const utf8Decoder = new TextDecoder('utf-8');
    // const decodedClientData = utf8Decoder.decode( credential.response.clientDataJSON );
    // const clientDataObj = JSON.parse(decodedClientData);
    // const decodedAttestationObj = CBOR.decode( credential.response.attestationObject );
    // const {authData} = decodedAttestationObj;
    // // get the length of the credential ID
    // const dataView = new DataView( new ArrayBuffer(2) );
    // const idLenBytes = authData.slice(53, 55);
    // idLenBytes.forEach( (value, index) => dataView.setUint8( index, value ) );
    // const credentialIdLength = dataView.getUint16();
    // const credentialId = authData.slice( 55, 55 + credentialIdLength); // get the credential ID
    // const publicKeyBytes = authData.slice( 55 + credentialIdLength ); // get the public key object
    // const publicKeyObject = CBOR.decode( publicKeyBytes.buffer ); // the publicKeyBytes are encoded again as CBOR
    // console.log('AMIHDEBUG credForServer:', credForServer );
    fetch('/getNewPubKey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credForServer)
    })
    .then(response => response.json())
    .then(data => console.log('data: ', data))
    .catch( err => {
      console.log('err', err);
    });
  });
});

// body: JSON.stringify({
//   consoleLog: 'earlier logging, easier logging...',
//   accountName
// })