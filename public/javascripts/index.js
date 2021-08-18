'use strict';
import Client from 'webauthn/client'

const client = new Client({ pathPrefix: '/webauthn' });

const debugMessageToServer = async (obj) => {
  var o = { obj: JSON.stringify(obj) };
  console.log('debugMessageToServer, o:', JSON.stringify(o));
  const rawResponse = await fetch('/newaccount/debugMessageToServer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(o)
  });
  const content = await rawResponse.json();
  console.log('debugMessageToServer response:', content);
};
$(()=>{
  console.log('this is the onload function of jquery...');
  $('#btnTestEsr').on('click', ()=>{
    console.log('user clicked the test-esr btn...');
    $.ajax({
      type: 'POST',
      url: '/newaccount/testEsr/' + $('#accountname').val() + '/' + $('#initialamount').val(),
      timeout: 15*1000
    }).done(res => {
      console.log('[testEsr] frontend res:', res);
    })
    .fail(err => {
      console.log('[testEsr] frontend err:', err);
    });

  });
  $('#btnCheckAvailability').on('click', ()=>{
    console.log('user clicked the btn, check availability of the account name using the backend of this server...');
    $.ajax({
      type: 'POST',
      url: '/newaccount/isavailable/' + $('#accountname').val(),
      timeout: 15*1000
    }).done(res => {
      console.log('[isavailable] frontend res:', res);
    })
    .fail(err => {
      console.log('[isavailable] frontend err:', err);
    });
  });
  $('#btnCreateKeyPair').on('click', ()=>{
    await client.register({
      username: 'webauthn3333',
      name: 'webauthn3333',
    })    
  }
  $('#btnCreateKeyPairXX').on('click', ()=>{
    console.log('user clicked the createKeyPair btn...');
    console.log('AMIHDEBUG createKeyPair[0]');
    debugMessageToServer('createKeyPair[0]');
    const randomStringFromServer = 'l2kj13brljhvrjhvewf';
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from(
        randomStringFromServer, c => c.charCodeAt(0)),
      rp: {
        name: "EOS in a Box on AmiHeines.com",
        id: "amiheines.com",
      },
      user: {
        id: Uint8Array.from(
          "webauthn3333", c => c.charCodeAt(0)),
        name: "amih@testing.eos",
        displayName: "webauthn3333",
      },
      pubKeyCredParams: [{alg: -7, type: "public-key"}],
      authenticatorSelection: {
        userVerification: "discouraged",
        authenticatorAttachment: "cross-platform",
        // authenticatorAttachment: "platform",
      },
      timeout: 60000,
      attestation: "direct"
    };
    console.log('AMIHDEBUG createKeyPair[1]');
    debugMessageToServer('createKeyPair[1]');
    const main = async () => {
      console.log('AMIHDEBUG createKeyPair[3]');
      await debugMessageToServer('createKeyPair[3]');
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      });
      console.log('AMIHDEBUG createKeyPair[4]');
      await debugMessageToServer('createKeyPair[4] cred::' + JSON.stringify(credential));
      console.log('webauthn create keypair:');
      console.log(credential);
    }
    console.log('AMIHDEBUG createKeyPair[2]');
    debugMessageToServer('createKeyPair[2]');
    main().catch(console.error);
  });
});
