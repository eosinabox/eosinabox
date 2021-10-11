var gState = {
  chain: 'jungle3',
  accountName: false,
  custodianAccountName: false,
  pubkey: false,
  esr: '',
  gaugeEstimatedNumOfTx: 9999
};
const gChain = {
  jungle3: 'https://jungle3.cryptolions.io',
  eos    : 'https://api.eos.cryptolions.io',
}
const eosinaboxToast = (msg) => {
  $('.toast-body').html(msg);
  $('.toast').show().toast('show');
}
const repopulateMyAccounts = () => {
  const accoultListString = localStorage.allAccounts;
  let accountList = []; if(!!accoultListString){ accountList = JSON.parse(accoultListString); }
  let s = '';
  for(let i=0; i<accountList.length; i++){
    s += `<a class="dropdown-item text-primary fromMyAccountsItem" href="#">${accountList[i]}</a>`;
  }
  $('.eosinabox_transfer_fromMyAccounts .dropdown-menu .dropdown-item').remove();
  $('.eosinabox_transfer_fromMyAccounts .dropdown-menu').append(s);
}
const addAccountToLocalStorage = (accountWithChainPrefix) => {
  const parts = accountWithChainPrefix.split(':');
  if(parts.length<2 || parts[0].length==0 || parts[1].length==0){ return; }
  const accoultListString = localStorage.allAccounts;
  let accountList = []; if(!!accoultListString){ accountList = JSON.parse(accoultListString); }
  accountList.push(accountWithChainPrefix);
  localStorage.allAccounts = JSON.stringify( accountList );
  repopulateMyAccounts();
}
const getCurrentAccountName = () => {
  const part = localStorage.currentAccount?.split(':');
  // empty? new client phone, no account yet
  // just one element? old format, no chain prefix
  // 2 parts? eosChain:accountname
  if(!part || part.length==0){
    return 'no account yet...'
  }else if(part.length==1){
    return part[0];
  }else{
    if(part[1]==''){
      JSON.parse(localStorage.allAccounts)[0].split(':')[1];
    }else{
      return part[1];
    }
  }
}
const getCurrentAccountChain = () => {
  const part = localStorage.currentAccount?.split(':');
  // empty? new client phone, no account yet
  // just one element? old format, no chain prefix, so must be jungle3
  // 2 parts? eosChain:accountname
  if(!part || part.length==0){
    return 'no account yet...'
  }else if(part.length==1){
    return 'jungle3';
  }else{
    if(part[1]==''){
      localStorage.currentAccount = JSON.parse(localStorage.allAccounts)[0];
      JSON.parse(localStorage.allAccounts)[0].split(':')[0];
    }else{
      return part[0];
    }
  }
}
const consoleLog = async (logObj) => {
  console.log('[consoleLog] ', logObj);
  await fetch('/consoleLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logObj)
  });
}
const callMyShare = (txtToShare) => {
  // make behavior uniform across iOS and Android, sacrifice the nice "share" feature which is only avalable in Android
  // Now the buttons can say "copy" and the user has the same behavior on both platforms.
  //
  // if(navigator.share){
  //   navigator.share({ text: txtToShare }); // url: ?
  // }else{
    navigator.clipboard.writeText(txtToShare).then(function() {
      eosinaboxToast('Copied to clipboard, you can share now by pasting');
    }, function(err) {
      consoleLog('Async: Could not copy text: ', err);
    });
  // }
}
const detectOs = () => {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;
  // Windows Phone must come first because its UA also contains "Android"
  if (/windows phone/i.test(userAgent)) {
    return 'windowsphone';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  // iOS detection from: http://stackoverflow.com/a/9039885/177710
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'ios';
  }
  return 'notPhone';
}
window.onerror = function errorHandler(msg, url, line) {
  consoleLog({ logMsg: 'clientSideError', arguments });
  return false; // Just let default handler run.
}
$(() => {
  $('#eosinabox_accountName').on('input', (e) => {
    $('#eosinabox_accountName')[0].setCustomValidity('');
    $('#eosinabox_accountName')[0].reportValidity();
    $('#eosinabox_accountName').val( $('#eosinabox_accountName').val().toLowerCase() );
    let len = $('#eosinabox_accountName').val().length;
    if(len > 12){
      $('#eosinabox_accountName').val( $('#eosinabox_accountName').val().substr(0,12) );
      len = $('#eosinabox_accountName').val().length;
    }
    $('#eosinabox_countAccountLen').html( (12-len) + ' more characters' );
    if(len == 12){
      $('#eosinabox_countAccountLen').html('Checking if the account name is available...');
      checkIfAccountNameIsAvailable( gState.chain, $('#eosinabox_accountName').val(), res => {
        if(res.accountAvailable){
          gState.accountName = true;
          $('#eosinabox_countAccountLen').html('Account is available');
        }else{
          gState.accountName = false;
          $('#eosinabox_countAccountLen').html('Account is already taken, please try another name');
        }
      });
    }
    // checkIfAllConditionsMet();
  });
  $('#esinabox_check_availability').on('click', (event)=>{
    event.preventDefault();
    checkIfAccountNameIsAvailable( gState.chain, $('#eosinabox_accountName').val(), res => {
      if(res.accountAvailable){
        gState.accountName = true;
        $('#eosinabox_countAccountLen').html('Account is available');
      }else{
        gState.accountName = false;
        $('#eosinabox_countAccountLen').html('Account is already taken, please try another name');
      }
      // checkIfAllConditionsMet();
    });
  });
  $('#eosinabox_custodianAccountName').on('input', (e) => {
    $('#eosinabox_custodianAccountName')[0].setCustomValidity('');
    $('#eosinabox_custodianAccountName')[0].reportValidity();
    $('#eosinabox_custodianAccountName').val( $('#eosinabox_custodianAccountName').val().toLowerCase() );
    let len = $('#eosinabox_custodianAccountName').val().length;
    if(len > 12){
      $('#eosinabox_custodianAccountName').val( $('#eosinabox_custodianAccountName').val().substr(0,12) );
      len = $('#eosinabox_custodianAccountName').val().length;
    }
    $('#eosinabox_countCustodianAccountLen').html( (12-len) + ' more characters' );
    if(len == 12){
      $('#eosinabox_countCustodianAccountLen').html('Checking if the custodian account name exists...');
      checkIfAccountNameIsAvailable( gState.chain, $('#eosinabox_custodianAccountName').val(), res => {
        if(res.accountAvailable){
          gState.custodianAccountName = false;
          $('#eosinabox_countCustodianAccountLen').html('Custodian Account does not exist, please try again');
        }else{
          gState.custodianAccountName = true;
          $('#eosinabox_countCustodianAccountLen').html('Custodian account found');
        }
      });
    }
    // checkIfAllConditionsMet();
  });
  // const checkIfAllConditionsMet = () => {
  //   // if there's a new account name, an existing custodian name and a public key, hide the create key button and show the prepareEsr key
  //   if(gState.accountName && gState.pubkey
  //     && (gState.custodianAccountName || $('#eosinabox_custodianAccountName').val().length>2)){
  //     $('#eosinbox_createKeys' ).hide();
  //     $('#eosinabox_share').show();
  //   }else{
  //     $('#eosinbox_createKeys' ).show();
  //     $('#eosinabox_share').hide();
  //   }
  // }
  const checkIfAccountNameIsAvailable = async (chain, accToCheck, callback) => {
    if(accToCheck.length != 12){
      eosinaboxToast(`Account name should be 12 characters long, it is ${accToCheck.length}, try again`);
      return;
    }else if(!/^[a-z1-5]{12}$/.test(accToCheck)){
      eosinaboxToast('The account name contains illegal characters. Characters should be in the range: a-z or 1-5, please fix and try again.');
      return;
    }
    const rpc = new eosjs_jsonrpc.JsonRpc(gChain[chain]);
    try{
      let acc = await rpc.get_account(accToCheck);
      callback({ accountAvailable: false });
    }
    catch(err){
      if(!!err.details && !!err.details[0].message && err.details[0].message.substr(0,11) == 'unknown key'){
        callback({ accountAvailable: true });
      }else{
        callback({ accountAvailable: false });
      }
    }
  }
  const getCurrencyBalance = async (chain, code, account, symbol) => {
    if(account=='no account yet...' || account==null || !account){ return [ 'No account...' ]; }
    const response = await fetch(`/getCurrencyBalance/${chain}/${code}/${account}/${symbol}`);
    return response.json();
  }
  const getAccountInfo = async (chain, account) => {
    if(account=='no account yet...' || account==null || !account){ return {}; }
    const response = await fetch(`/getAccountInfo/${chain}/${account}`);
    return response.json();
  }
  const updateBalance = async (chain) => {
    $('#eosinabox_balance').html('...');
    if((typeof chain=='object') || chain==null){
      chain = gState.chain;
    }
    if(!chain){ chain = 'jungle3'; } // still no chain?? fall back to jungle3
    // const balance = await getCurrencyBalance( getCurrentAccountChain(), 'eosio.token', getCurrentAccountName(),'EOS' );
    const currentAccCh = getCurrentAccountChain();
    const currentAccNm = getCurrentAccountName();
    const accountInfo = await getAccountInfo( currentAccCh, currentAccNm );
    if(!!accountInfo.errMsg || currentAccNm=='no account yet...' || !currentAccNm){
      $('#eosinabox_balance').html( `Account not found <i class="eosinabox_viewOnExplorer bi bi-eye h6 text-primary"></i>` );
      $('#eosinabox_power1').html( `perhaps the custodian` );
      $('#eosinabox_power2').html( `needs to create it for you` );
    }else{
      $('#eosinabox_balance').html( `${!!accountInfo.core_liquid_balance ? accountInfo.core_liquid_balance : 0} <i class="eosinabox_refresh bi bi-arrow-repeat h2"></i> <i class="eosinabox_viewOnExplorer bi bi-eye h2 text-primary"></i>` );
      $('#eosinabox_power1').html( `NET available: ${Number.parseFloat(accountInfo.net_limit.available/1024).toFixed(2)} KB` );
      $('#eosinabox_power2').html( `CPU available: ${Number.parseFloat(accountInfo.cpu_limit.available/1000).toFixed(2)} ms` );
      // calc gauge settiings, each simple transaction takes about 250 usec CPU and 250 bytes NET, so take the minimum of these and divide by 250
      // then take the log base 10 of that
      // sigmoid function, then convert to degrees
      // 0-inf => 0-1 => 0-180
      const gaugeEstimatedNumOfTx = Math.min(accountInfo.net_limit.available, accountInfo.cpu_limit.available) / 250; // 0 .. 1 .. 10 .. 100 .. 1000
      const gaugeOrderOfMagnitude = Math.log10( 1 + gaugeEstimatedNumOfTx ); // 1 .. 2 .. 11 .. 101 .. 1001 => 0 .. 0.3 .. 1.04 .. 2.004 .. 3.0004
      const gaugeSigmoid = Math.tanh(gaugeOrderOfMagnitude); // 0 .. 0.3 .. 1.04 .. 2.004 .. 3.0004 => 0 .. 0.29 .. 0.78 .. 0.96 .. 0.995
      const gaugeMin = 5, gaugeMax = 175;
      const gaugeAngle = gaugeMin + (gaugeMax - gaugeMin) * gaugeSigmoid;
      $('#eosinabox_powerup_gauge svg #dial')[0].setAttribute('transform','rotate(' + gaugeAngle + ' 150 150 )');
      gState.gaugeEstimatedNumOfTx = gaugeEstimatedNumOfTx;
      if(gaugeEstimatedNumOfTx < 4){
        $('#eosinabox_powerup_gauge svg').css('background-color', 'lightgreen');
      }else{
        $('#eosinabox_powerup_gauge svg').css('background-color', 'transparent');
      }
    }
  };
  const wizardTo = (stepTo) => {
    $('.eosinabox_page_createAccount .wizard')
    .fadeOut().promise().done( () => {
      $(`.eosinabox_page_createAccount .wizard${stepTo}`).fadeIn();
    });
  }
  const gotoHome = () => {
    $('.eosinabox_page').hide();
    if(!localStorage.allAccounts){
      $(`.eosinabox_page_createAccount`).show();
    }else{
      $(`.eosinabox_page_myAccount`).show();
      $('#eosinabox_transfer_from').html(localStorage.currentAccount);
    }
  }
  $('.eosinabox_page_createAccount .wizard .idonotagree').on('click', () => {
    wizardTo(0);
    gotoHome();
  });
  $('.eosinabox_page_createAccount .wizard .next').on('click', (e)=> {
    if(e.currentTarget.parentElement.parentElement.classList.contains('wizard0')){
      if($('.eosinabox_dropdown_blockchain>button').html().trim() == 'Choose A Chain: ...'){
        $('.eosinabox_dropdown_blockchain .btn').removeClass('btn-outline-primary').addClass('btn-outline-danger');
        return;
      }
      $('.eosinabox_dropdown_blockchain .btn').removeClass('btn-outline-danger').addClass('btn-outline-primary');
      wizardTo(1);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard1')){
      if(!gState.accountName){
        $('#eosinabox_accountName')[0].setCustomValidity('Please choose a valid account name')
        $('#eosinabox_accountName')[0].reportValidity()
        return;
      }
      wizardTo(2);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard2')){
      // "I agree" == "next"
      wizardTo(3);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard3')){
      if(!gState.custodianAccountName){
        $('#eosinabox_custodianAccountName')[0].setCustomValidity('Please choose a real custody account');
        $('#eosinabox_custodianAccountName')[0].reportValidity();
        return;
      }
      wizardTo(4);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard4')){
      wizardTo(5);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard5')){
      wizardTo(5);
    }
  });
  $('.eosinabox_page_createAccount .wizard .back').on('click', (e)=> {
    if(e.currentTarget.parentElement.parentElement.classList.contains('wizard0')){
      wizardTo(0);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard1')){
      wizardTo(0);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard2')){
      wizardTo(1);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard3')){
      wizardTo(2);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard4')){
      wizardTo(3);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard5')){
      wizardTo(4);
    }
  });
  $('.eosinabox_help_technical_header').on('click', () => {
    $('.eosinabox_help_technical').fadeToggle();
  });
  $('.eosinabox_help_technical_deleteAllAccounts').on('click', ()=>{
    if (confirm('Are you sure you want to delete all info?')) {
      localStorage.allAccounts = '';
      localStorage.currentAccount=''
      gotoHome();
    }
  });
  $('#eosinabox_powerup_gauge svg').on('click', async () => {
    if(gState.gaugeEstimatedNumOfTx < 4){
      if(getCurrentAccountChain() == 'jungle3'){
        eosinaboxToast('Please use the Help menu link manually for Jungle3 accounts');
      }else{
        const response = await fetch('https://api.eospowerup.io/freePowerup/' + getCurrentAccountName());
        consoleLog({ freepowerup: response });
        setTimeout(()=>{
          updateBalance();
          $('#eosinabox_powerup_gauge svg').css('background-color', 'transparent');
          eosinaboxToast('Free PowerUp can be used twice every 24 hours');
        }, 5000);
      }
    }
  });
  $('#eosinbox_createKeys, .eosinbox_createKeysClass').on('click', async (event) => {
    event.preventDefault();
    // AMIHDEBUG TODO: generate random string on server and manage it in a session,
    // Perhaps this is not needed, not worried about replay attacks, discuss...
    const randomStringFromServer = 'replayAttackProtectionRandomStringNotNeeded?';
    const rp = {
      name: "Ami Heines",
      id: "eosinabox.com", // AMIHDEBUG TODO: update this when installing on another web site, e.g. eosinabox.com (move out to a config .json file?)
    };
    const accName = $('#eosinabox_accountName').val();
    const publicKeyCredentialCreationOptions = {
      challenge: Uint8Array.from( randomStringFromServer, c => c.charCodeAt(0) ),
      rp: rp,
      user: {
        id: Uint8Array.from(
          accName, c => c.charCodeAt(0)),
        name: accName,
        displayName: accName,
      },
      pubKeyCredParams: [{alg: -7, type: "public-key"}],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // cross-platform or platform or comment out for both
        // warning: we want to require AttestationFlags.attestedCredentialPresent - only works with platform
        // TODO: discuss, perhaps this is not needed, it's up to the user to keep his security level,
      },
      timeout: 60000,
      attestation: "none" // "direct" is not needed, why bother reading all the different types of attestations?
      // the authData contains the pubKey and we will *maybe* check the attestation later, in a future version
    };
    let credential;
    try {
      credential = await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });
    } catch (error) {
      consoleLog({msg: 'err in [navigator.credentials.create]', errorMessage: error.message});
      eosinaboxToast('Create Key Failed with error: ' + error.message);
    }
    const credForServer = {
      rpid: rp.id,
      id: eosjs_serialize.arrayToHex(new Uint8Array(credential.rawId)),
      attestationObject: eosjs_serialize.arrayToHex(new Uint8Array(credential.response.attestationObject)),
      clientDataJSON: eosjs_serialize.arrayToHex(new Uint8Array(credential.response.clientDataJSON)),
    }
    // // TODO: discuss, perhaps there is no need to do this on the server side, we can do most (ALL?)
    // // of the processing on the front end.
    fetch('/getNewPubKey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credForServer)
    })
    .then(response => response.json())
    .then(async data => {
      gState.pubkey = true;
      $('#eosinabox_pubkey').html(data.pubkey);
      $('.eosinabox_pubkeyClass').html(data.pubkey);
      // save in localStorage
      let credentialIdHex = eosjs_serialize.arrayToHex(new Uint8Array(credential.rawId));
      if( !localStorage['eosinabox_pubkeys'] ){
        localStorage['eosinabox_pubkeys'] = JSON.stringify( [{ credentialId: credentialIdHex, key: data.pubkey }] );
      }else{
        let o = JSON.parse(localStorage['eosinabox_pubkeys']);
        o.push({ credentialId: credentialIdHex, key: data.pubkey });
        localStorage['eosinabox_pubkeys'] = JSON.stringify( o );
        // save just the new key, destroy the older ones!
        // localStorage['eosinabox_pubkeys'] = JSON.stringify( [{ credentialId: credentialIdHex, key: data.pubkey }] );
      }
      // checkIfAllConditionsMet();
      await consoleLog( data );
    })
    .catch( err => {
      gState.pubkey = false;
      // checkIfAllConditionsMet();
      consoleLog(err);
    });
  });
  ///////////////////////////////////////////////////////////////////////////////////
  $('#eosinbox_declineTransaction').on('click', async (event) => {
    eosinaboxToast('Deleting this transaction.');
    localStorage.sharedInfo = '';
    $('.eosinabox_page').hide();
    $(`.eosinabox_page_myAccount`).show();
    $('#eosinabox_transfer_from').html(localStorage.currentAccount);
  });
  $('#eosinbox_approveThisTransaction').on('click', async (event) => {
    event.preventDefault();
    const signatureProvider = new eosjs_wasig.WebAuthnSignatureProvider();
    signatureProvider.keys.clear();
    const keys = JSON.parse( localStorage.eosinabox_pubkeys );
    for (const key of keys){
      signatureProvider.keys.set(key.key, key.credentialId);
    }
    const rpc = new eosjs_jsonrpc.JsonRpc(gChain[gState.chain]);
    const api = new eosjs_api.Api({ rpc, signatureProvider });
    let o = JSON.parse(localStorage.sharedInfo);
    // https://eosinabox.com/#sharedInfo?
    // action=createAccount&
    // chain=jungle3&
    // accountName=cggdggffgyft&
    // custodianAccountName=webauthn1111&
    // pubkey=PUB_WA_AwTqYqJEwQ3B4bzNGyxHT25qZCxRfrjgYnshr97otStVYZJ7uA5EAkEey2RoKZCyu7pxaAStoGV1ieCc3tUk
    try {
      const result = await api.transact({
        // actions: [{
        //   account: 'eosio.token',
        //   name: 'transfer',
        //   data: { from, to, quantity, memo },
        //   authorization: [{ actor: from, permission: 'active' }],
        // }],
        actions: [{
          account: 'eosio',
          name: 'newaccount',
          authorization: [{
            actor: getCurrentAccountName(),
            permission: 'active',
          }],
          data: {
            creator: getCurrentAccountName(),
            name: o.accountName,
            owner: {
              threshold: 1,
              keys: [],
              accounts: [{
                permission: {
                  actor: o.custodianAccountName,
                  permission: 'active'
                },
                weight: 1
              }],
              waits: []
            },
            active: {
              threshold: 1,
              keys: [{
                key: o.pubkey,
                weight: 1
              }],
              accounts: [],
              waits: []
            },
          },
        },
        {
          account: 'eosio',
          name: 'buyrambytes',
          authorization: [{
            actor: getCurrentAccountName(),
            permission: 'active',
          }],
          data: {
            payer: getCurrentAccountName(),
            receiver: o.accountName,
            bytes: 3200,
          },
        },
        {
          account: 'eosio',
          name: 'delegatebw',
          authorization: [{
            actor: getCurrentAccountName(),
            permission: 'active',
          }],
          data: {
            from: getCurrentAccountName(),
            receiver: getCurrentAccountName(),
            stake_net_quantity: '0.0001 EOS',
            stake_cpu_quantity: '0.0001 EOS',
            transfer: false,
          }
        }]
      }, {
        blocksBehind: 3,
        expireSeconds: 60,
      });
      consoleLog( {logMsg: 'createdAccount!', result } );
      eosinaboxToast('Transaction sent, let the other person know you created their account and send them some EOS!');
      localStorage.sharedInfo = '';
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_myAccount`).show();
      $('#eosinabox_transfer_from').html(localStorage.currentAccount);
      $('#eosinabox_transfer_to').html(o.accountName);
      $('#eosinabox_transfer_memo').html('Initial EOS transfer using EOS-in-a-Box 🌈');
    } catch (error) {
      consoleLog( {logMsg: 'transfer EOS error!', error } );
      eosinaboxToast('Transaction failed with error, ' + error.message);
    }
  });
  ///////////////////////////////////////////////////////////////////////////////////
  $('#eosinabox_transfer_quantity').on('input', () => {
    const ele = $('#eosinabox_transfer_quantity');
    var start = ele[0].selectionStart, end = ele[0].selectionEnd; // store current positions in variables
    if( parseFloat( ele.val() )==0 && start<=1 && end<=1 ){
      ele.val('');
      start = end = 1;
      ele[0].setSelectionRange(start, end);
      return;
    }
    if( ele.val()=='.' && start<=1 && end<=1 ){
      ele.val('0.');
      start = end = 2;
    }
    ele.val( parseFloat( ele.val() ).toFixed(4) + ' EOS' );
    ele[0].setSelectionRange(start, end); // restore from variables...
  });
  $('#eosinabox_transfer_transact').on('click', async (event) => {
    event.preventDefault();
    const signatureProvider = new eosjs_wasig.WebAuthnSignatureProvider();
    signatureProvider.keys.clear();
    const keys = JSON.parse( localStorage.eosinabox_pubkeys );
    for (const key of keys){
      signatureProvider.keys.set(key.key, key.credentialId);
    }
    const rpc = new eosjs_jsonrpc.JsonRpc(gChain[getCurrentAccountChain()]);
    const api = new eosjs_api.Api({ rpc, signatureProvider });
    const to       = $('#eosinabox_transfer_to'      ).val().toLowerCase();
    const quantity = $('#eosinabox_transfer_quantity').val();
    const memo     = $('#eosinabox_transfer_memo'    ).val();
    try {
      const result = await api.transact({
        actions: [{
          account: 'eosio.token',
          name: 'transfer',
          data: { from: getCurrentAccountName(), to, quantity, memo },
          authorization: [{ actor: getCurrentAccountName(), permission: 'active' }],
        }],
      }, {
        blocksBehind: 3,
        expireSeconds: 60,
      });
      consoleLog( {logMsg: 'transfer EOS!', result } );
      $('#eosinabox_transfer_to'      ).val('');
      $('#eosinabox_transfer_quantity').val('');
      $('#eosinabox_transfer_memo'    ).val('');
      eosinaboxToast('Transaction sent');
      setTimeout(()=>{
        updateBalance(gState.chain);
      }, 3000);
    } catch (error) {
      consoleLog( {logMsg: 'transfer EOS error!', error } );
      if(error.message.includes('too high')){
        eosinaboxToast('You need to power up the account first, check the help page, ' + error.message);
      }else{
        eosinaboxToast('Transaction failed with error, ' + error.message);
      }
    }
  });
  ///////////////////////////////////////////////////////////////////////////////////
  // change active keys!
  $('.eosinabox_buttonRestoreAccountTransaction').on('click', async (event) => {
    event.preventDefault();
    const signatureProvider = new eosjs_wasig.WebAuthnSignatureProvider();
    signatureProvider.keys.clear();
    const keys = JSON.parse( localStorage.eosinabox_pubkeys );
    for (const key of keys){ signatureProvider.keys.set(key.key, key.credentialId); }
    const rpc = new eosjs_jsonrpc.JsonRpc(gChain[getCurrentAccountChain()]);
    const api = new eosjs_api.Api({ rpc, signatureProvider });
    // cleos -u https://jungle3.cryptolions.io set account permission webauthn1111 active PUB_WA_77Nes48N65f1 -p webauthn1111@owner
    const replaceKeysAccountName = $('.eosinabox_accountNameClassRestoreAccountTransaction').html();
    const replaceKeysPubKey = $('.eosinabox_pubkeyClassRestoreAccountTransaction').html();
    // const replaceKeysCustodian = $('.eosinabox_custodianAccountNameRestoreAccountTransaction').val();
    try {
      const result = await api.transact({
        actions: [{
          "account": "eosio",
          "name": "updateauth",
          "authorization": [{ "actor": replaceKeysAccountName, "permission": "owner" } ],
          "data": {
            "account": replaceKeysAccountName,
            "permission": "active",
            "parent": "owner",
            "auth": {
              "threshold": 1,
              "keys": [{ "key": replaceKeysPubKey, "weight": 1 }
              ],
              "accounts": [],
              "waits": []
            }
          }
        }],
      }, {
        blocksBehind: 3,
        expireSeconds: 60,
      });
      consoleLog( {logMsg: 'replaceKeys!', result } );
      $('.eosinabox_accountNameClassRestoreAccountTransaction').html('');
      $('.eosinabox_pubkeyClassRestoreAccountTransaction'     ).html('');
      eosinaboxToast('Transaction sent - key change');
    } catch (error) {
      consoleLog( {logMsg: 'transaction - key change error!', error } );
      eosinaboxToast('Transaction - key change failed with error, ' + error.message);
    }
  });
  ///////////////////////////////////////////////////////////////////////////////////
  // $('#eosinabox_prepareEsr').on('click', (event)=>{
  //   event.preventDefault();
  //   fetch('/prepareEsr', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       custodianAccountName: $('#eosinabox_custodianAccountName').val(),
  //       accountName:          $('#eosinabox_accountName').val(),
  //       pubkey:               $('#eosinabox_pubkey').html(),
  //     })
  //   })
  //   .then(response => response.json())
  //   .then(async data => {
  //     // $('#eosinabox_pubkey').html(data.pubkey);
  //     gState.esr = data.esr;
  //     gState.cleos = [
  //       `cleos -u https://jungle3.cryptolions.io:443 system newaccount`,
  //       `__CREATOR_ACCOUNT__ ${$('#eosinabox_accountName').val()}`,
  //       `${$('#eosinabox_custodianAccountName').val()}@active ${$('#eosinabox_pubkey').html()}`,
  //       `--stake-net "0.0010 EOS" --stake-cpu "0.0010 EOS" --buy-ram-kbytes 3`,
  //     ].join(' ');
  //     $('#eosinabox_prepareEsr').hide();
  //     $('#eosinabox_share').show();
  //     $('#eosinabox_shareCleos').show();
  //     await consoleLog( { data, stage: 'amihDebug create ESR response in client...' } );
  //   })
  //   .catch( err => {
  //     consoleLog(err);
  //   });
  // });
  $('#eosinabox_balance').on('click', '#eosinabox_balance,.eosinabox_refresh', (e) => {
    e.preventDefault();
    updateBalance(gState.chain);
  });
  // $('.eosinabox_viewOnExplorer').on('click', (e)=>{
  $('#eosinabox_balance').on('click', '.eosinabox_viewOnExplorer', (e)=>{
      if(getCurrentAccountChain()=='eos'){
      window.open('https://bloks.io/account/' + getCurrentAccountName(), '_blank').focus();
    }else{
      window.open('https://jungle3.bloks.io/account/' + getCurrentAccountName(), '_blank').focus();
    }
  });

  $('.eosinabox_transfer_fromMyAccounts').on('click', '.fromMyAccountsItem', (e) => {
    localStorage.currentAccount = $(e.target).html();
    $('#eosinabox_transfer_from').html( $(e.target).html() );
    $('.eosinabox_transfer_fromSharedInfo').html( $(e.target).html() );
    updateBalance();
  });

  $('#eosinabox_share_backup_debug').on('click', (e)=>{
    callMyShare(JSON.stringify(localStorage)); // txt? or url
  });

  // $('.eosinabox_share_inviteFriend').on('click', (e)=>{
  //   gState.shareEssentials = {
  //     custodianAccountName: $('.eosinabox_custodianAccountNameInvite').val().toLowerCase(),
  //   };
  //   const shareInfo = {
  //     url: `https://eosinabox.com/#sharedInfo?action=` +
  //       `inviteToCreateAccount&chain=${gState.chain}` +
  //       `&custodianAccountName=${gState.shareEssentials.custodianAccountName}`
  //   }
  //   callMyShare( shareInfo.url );
  // });

  $('.eosinabox_shareRestore').on('click', (e)=>{
    gState.shareEssentials = {
      accountName:          $('.eosinabox_accountNameClass').val(),
      pubkey:               $('.eosinabox_pubkeyClass').html(),
    };
    localStorage.currentAccount = gState.chain + ':' + $('#eosinabox_accountName').val().toLowerCase();
    addAccountToLocalStorage(localStorage.currentAccount);
    localStorage.currentChain   = gState.chain;
    callMyShare(`https://eosinabox.com/#sharedInfo?action=restoreAccount&chain=${gState.chain}&` +
      `accountName=${gState.shareEssentials.accountName}` +
      `&pubkey=${gState.shareEssentials.pubkey}`
    );
  });

  $('#eosinabox_share').on('click', async (e)=>{
    gState.shareEssentials = {
      custodianAccountName: $('#eosinabox_custodianAccountName').val(),
      accountName:          $('#eosinabox_accountName').val(),
      pubkey:               $('#eosinabox_pubkey').html(),
    };
    localStorage.currentAccount = gState.chain + ':' + $('#eosinabox_accountName').val().toLowerCase();
    addAccountToLocalStorage(localStorage.currentAccount);
    localStorage.currentChain = gState.chain;
    // call createEsr on server and get back the ESR (TODO: make this a front end call if possible)
    const actions = [
      {
        "account": "eosio",
        "name": "newaccount",
        "authorization": [{ "actor": "............1", "permission": "............2" }],
        "data": {
          "creator": "............1",
          "name": gState.shareEssentials.accountName,
          "owner": {
            "threshold": 1,
            "keys": [],
            "accounts": [{
            "permission": {
              "actor": gState.shareEssentials.custodianAccountName,
              "permission": "active"
            },
            "weight": 1
            }],
            "waits": []
          },
          "active": {
            "threshold": 1,
            "keys": [{ "key": gState.shareEssentials.pubkey, "weight": 1 }],
            "accounts": [],
            "waits": []
          }
        },
      },
      {
        "account": "eosio",
        "name": "buyrambytes",
        "authorization": [{ "actor": "............1", "permission": "............2" }],
        "data": {
          "payer": "............1",
          "receiver": gState.shareEssentials.accountName,
          "bytes": 3200
        },
      },
      {
        "account": "eosio",
        "name": "delegatebw",
        "authorization": [{ "actor": "............1", "permission": "............2" }],
        "data": {
          "from": "............1",
          "receiver": gState.shareEssentials.accountName,
          "stake_net_quantity": "0.0100 EOS",
          "stake_cpu_quantity": "0.0100 EOS",
          "transfer": 0
        },
      }
    ];
    const response = await fetch('/createEsr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: gState.chain, actions })
    });
    const ESR = await response.json();
    consoleLog({ ESR });

    const shareTxt = [
      `Hello, this is an EOS-in-a-Box account creation request, if you were `,
      `expecting this message, please either click the link to open it in EOSinaBox: `,
      `https://eosinabox.com/#sharedInfo?action=createAccount&chain=${gState.chain}&`,
      `accountName=${gState.shareEssentials.accountName}`,
      `&custodianAccountName=${gState.shareEssentials.custodianAccountName}&`,
      `pubkey=${gState.shareEssentials.pubkey} `,
      `or use this ESR link for Anchor wallet: `,
      `${ESR.uri}`,
    ].join('');
    callMyShare(shareTxt);
    gotoHome();
  });
  $('#eosinabox_transfer_from').on('click', () => {
    $('#eosinabox_transfer_from').html('...');
    setTimeout(()=>{
      $('#eosinabox_transfer_from').html(localStorage.currentAccount);
    }, 500);
  });
  $('nav li a.nav-link').on('click', (e) => {
    e.preventDefault();
    $('#eosinabox_transfer_from').html(localStorage.currentAccount);
    $('.navbar-collapse').collapse('hide');
    $('.eosinabox_page').hide();
    const href = e.target.href.split('#')[1];
    $(`.eosinabox_page_${href}`).show();
  });
  $('.eosinabox_dropdown_blockchain a.dropdown-item').on('click', (e)=>{
    if( $(e.target).text()=='EOS' ){
      gState.chain = 'eos';
    }else{
      gState.chain = 'jungle3';
    }
    $('.eosinabox_dropdown_blockchain .btn').removeClass('btn-outline-danger').addClass('btn-outline-primary');
    $('.eosinabox_dropdown_blockchain>button').html(`${$(e.target).text()} `);
  });
  // onLoad
  /////////
  $('.toast').hide(); // aarg! why is the toast not showing but blocking the elements under it?
  $('.toast').on('hidden.bs.toast', ()=> { $('.toast').hide(); })
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./pwaServiceWorker.js');
  }
  repopulateMyAccounts();
  if(!localStorage.currentChain){ localStorage.currentChain = 'jungle3'; }
  gState.chain = localStorage.currentChain;
  try { updateBalance(gState.chain); } catch (error) { consoleLog({ msg: 'updateBalanceErr:398', error }); }
  if(typeof(PublicKeyCredential)=='undefined'){ // won't work if browser is not modern
    const os = detectOs();
    if(os=='ios'){
      eosinaboxToast('Please use a modern browser, on Apple that would be Safari.');
    }else{
      eosinaboxToast('Please use a modern browser, on Android that would be Google Chrome.');
    }
    consoleLog({ errMsg: 'PublicKeyCredential_undefined', message: 'Please use a modern browser to use this app.' });
  }
  // show different page if not on mobile, this will be an explainer about eosinabox.com
  // if(detectOs() == 'notPhone'){
  //   window.open('https://eosinabox.com/notPhone', '_self').focus();
  // }
  // if url has #sharedInfo in it, get the parameters and navigate to the right page.
  if(window.location.href.split('#').length>1 && window.location.href.split('#')[1].substr(0,10) == 'sharedInfo'){
    const params = window.location.href.split('#')[1].split('?')[1].split('&');
    var o = {};
    localStorage.sharedInfo = '';
    $('.eosinabox_sharedinfo_action').html('');
    $('.eosinabox_sharedinfo_chain').html('');
    $('.eosinabox_sharedinfo_accountName').html('');
    $('.eosinabox_sharedinfo_custodianAccountName').html('');
    $('.eosinabox_sharedinfo_pubkey').html('');
    $('.eosinabox_sharedinfo_cleos').html('');
    for(var i=0; i<params.length; i++){
      var param = params[i].split('=');
      o[param[0]] = param[1];
      if( param[0]=='chain' ){ gState.chain = o.chain; }
      $(`.eosinabox_sharedinfo_${param[0]}`).html(param[1]);
    }
    localStorage.sharedInfo = JSON.stringify(o);
    history.pushState('', '', window.location.pathname); // delete the share info, so it won't go back again to that page.
    // full share of create account OR partial share of invite friend?
    // https://eosinabox.com/#sharedInfo?action=createAccount&chain=jungle3&accountName=aminewphone1&custodianAccountName=webauthntest&pubkey=PUB_WA_9vAuvYoJ3iWMKp9hEwfRaz645GQZ89F4w1e6XA4DCQGTh4aQwtQVNQ9MGVYbGa48suGGAuDZPpuFmjHEKvzp
    // https://eosinabox.com/#sharedInfo?action=inviteToCreateAccount&chain=jungle3&custodianAccountName=undefined
    if(o.action == 'createAccount'){
      const cleosCommand = [
        `cleos -u ${gChain[gState.chain]} system newaccount`,
        `CREATOR_ACCOUNT ${o.accountName} ${o.custodianAccountName}@active ${o.pubkey}`,
        `--stake-net "0.0010 EOS" --stake-cpu "0.0010 EOS" --buy-ram-kbytes 3`,
      ].join(' ');
      $(`.eosinabox_sharedinfo_cleos`).html(cleosCommand);
      $('.eosinabox_transfer_fromSharedInfo').html(localStorage.currentAccount);
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_sharedInfo`).show();
    }else if(o.action == 'inviteToCreateAccount'){
      $('.eosinabox_dropdown_blockchain a.dropdown-item').data('chain', o.chain);
      $('.eosinabox_dropdown_blockchain button').html(o.chain);
      $('#eosinabox_custodianAccountName').val(o.custodianAccountName);
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_createAccount`).show();
    }else if(o.action == 'restoreAccount'){
      console.log('o.action::::restoreAccount, o:', o);
      console.log('o.action::::restoreAccount, o:', o.chain, o.pubkey, o.accountName);
      $('.eosinabox_dropdown_blockchain a.dropdown-item').data('chain', o.chain);
      $('.eosinabox_dropdown_blockchain button').html(o.chain);
      $('.eosinabox_accountNameClassRestoreAccountTransaction').html(o.accountName);
      $('.eosinabox_pubkeyClassRestoreAccountTransaction').html(o.pubkey);
      // .eosinabox_custodianAccountNameRestoreAccountTransaction
      // .eosinabox_buttonRestoreAccountTransaction
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_restoreAccountTransaction`).show();
    }else{
      // default - unknown...
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_myAccount`).show();
      $('#eosinabox_transfer_from').html(localStorage.currentAccount);
    }
  }else{
    gotoHome();
  }
});

