var gState = {
  chain: null, // set from chains.js below
  accountName: false,
  custodianAccountName: false,
  pubkey: false,
  esr: '',
  gaugeEstimatedNumOfTx: 9999
};
// Chains come from chains.js, which the site owner edits; nothing about a chain is hardcoded here.
const gChain = window.EOSINABOX_CHAINS;
const gDefaultChain = Object.keys(gChain).find((id) => gChain[id].default) || Object.keys(gChain)[0];
const chainOrDefault = (id) => (gChain[id] ? id : gDefaultChain);
gState.chain = gDefaultChain;
// Sign with the passkeys this device holds and push to the chain; no server is involved.
const walletTransact = (chainId, tx) =>
  EosinaboxCore.transact(gChain[chainOrDefault(chainId)], withoutResourceActions(chainId, tx.actions), JSON.parse(localStorage.eosinabox_pubkeys || '[]'));
// Chains without the system contract have no RAM market or staking to pay for.
const withoutResourceActions = (chainId, actions) =>
  gChain[chainOrDefault(chainId)].systemContract ? actions : actions.filter((a) => !['buyrambytes', 'delegatebw'].includes(a.name));
const escapeHtml = (text) => $('<div>').text(text).html();
const eosinaboxToast = (msg) => {
  $('.toast-body').html(msg);
  $('.toast').show().toast('show');
}
const repopulateMyAccounts = () => {
  const accoultListString = localStorage.allAccounts;
  let accountList = []; if(!!accoultListString){ accountList = [... new Set( JSON.parse(accoultListString) )]; }
  let s = '';
  for(let i=0; i<accountList.length; i++){
    s += `<a class="dropdown-item text-primary fromMyAccountsItem" href="#">${accountList[i]}</a>`;
  }
  $('.eosinabox_transfer_fromMyAccounts .dropdown-menu .dropdown-item').remove();
  $('.eosinabox_transfer_fromMyAccounts .dropdown-menu').append(s);
}
const addAccountToLocalStorage = (accountWithChainPrefix) => {
  const parts = accountWithChainPrefix.split(':');
  if(parts.length<2 || parts[0].length==0 || parts[1].length==0){ return; } // prevent empty account entry
  const accoultListString = localStorage.allAccounts;
  if(!!localStorage.allAccounts?.includes('"' + accountWithChainPrefix + '"')){ return; } // prevent duplicate entry
  let accountList = []; if(!!accoultListString){ accountList = JSON.parse(accoultListString); }
  accountList.push(accountWithChainPrefix);
  localStorage.allAccounts = JSON.stringify( [... new Set(accountList)] );// remove previous duplicates if exist
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
  // just one element? old format, no chain prefix, so use the default chain
  // 2 parts? eosChain:accountname
  if(!part || part.length==0){
    return 'no account yet...'
  }else if(part.length==1){
    return gDefaultChain;
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
    try{
      const acc = await EosinaboxCore.getAccount(gChain[chainOrDefault(chain)], accToCheck);
      callback({ accountAvailable: acc === null });
    }
    catch(err){
      callback({ accountAvailable: false });
    }
  }
  const getCurrencyBalance = async (chain, code, account, symbol) => {
    if(account=='no account yet...' || account==null || !account){ return [ 'No account...' ]; }
    return [ await EosinaboxCore.getBalance(gChain[chainOrDefault(chain)], account) ];
  }
  const getAccountInfo = async (chain, account) => {
    if(account=='no account yet...' || account==null || !account){ return {}; }
    try{
      const info = await EosinaboxCore.getAccount(gChain[chainOrDefault(chain)], account);
      if(!info){ return { errMsg: 'getAccountInfo' }; }
      // the token balance, which also works on chains with no system contract
      info.balance = await EosinaboxCore.getBalance(gChain[chainOrDefault(chain)], account);
      return info;
    }catch(err){
      return { errMsg: 'getAccountInfo', err };
    }
  }
  const updateBalance = async (chain) => {
    $('#eosinabox_balance').html('...');
    if((typeof chain=='object') || chain==null){
      chain = gState.chain;
    }
    if(!chain){ chain = gDefaultChain; }
    // const balance = await getCurrencyBalance( getCurrentAccountChain(), 'eosio.token', getCurrentAccountName(),'EOS' );
    const currentAccCh = getCurrentAccountChain();
    const currentAccNm = getCurrentAccountName();
    const currentToken = gChain[chainOrDefault(currentAccCh)];
    $('#eosinabox_transfer_quantity').attr('placeholder', (0).toFixed(currentToken.precision) + ' ' + currentToken.symbol);
    $('#eosinabox_powerup_gauge, #eosinabox_power1, #eosinabox_power2').toggle(!!currentToken.systemContract);
    const accountInfo = await getAccountInfo( currentAccCh, currentAccNm );
    if(!!accountInfo.errMsg || currentAccNm=='no account yet...' || !currentAccNm){
      $('#eosinabox_balance').html( `Account not found <i class="eosinabox_viewOnExplorer bi bi-eye h6 text-primary"></i>` );
      $('#eosinabox_power1').html( `perhaps the custodian` );
      $('#eosinabox_power2').html( `needs to create it for you` );
    }else{
      $('#eosinabox_balance').html( `${accountInfo.balance} <i class="eosinabox_refresh bi bi-arrow-repeat h2"></i> <i class="eosinabox_viewOnExplorer bi bi-eye h2 text-primary"></i>` );
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
  // ---------------------------------------------------------------------------------
  // The account service (see ./service): on a chain that has one there is no custodian to
  // name and nothing to share. The visitor signs in, with Google or with a link sent to
  // their e-mail, and the service creates the account. Signing in is also how the demo's
  // operators reach the list of sign-ups.
  const serviceChain = () => Object.keys(gChain).find((id) => gChain[id].accountService);
  const chainHasAccountService = () => !!gChain[gState.chain].accountService;
  const service = async (method, route, body) => {
    const response = await fetch(gChain[serviceChain()].accountService + route, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if(!response.ok){ throw new Error(json.error || ('The service answered ' + response.status)); }
    return json;
  };
  let gSession = null, gServiceConfig = null, gGoogleRendered = false, gSessionPoll = null;
  const signinStatus = (text) => $('#eosinabox_signinStatus').text(text || '');
  const renderSession = () => {
    $('#eosinabox_signedOut').toggle(!gSession);
    $('#eosinabox_signedIn').toggle(!!gSession);
    $('.eosinabox_sessionEmail').text(gSession ? gSession.email : '');
    $('.eosinabox_nav_admin').toggle(!!(gSession && gSession.isAdmin));
    $('#eosinabox_createViaService').toggle(!!gSession);
    if(gSession){
      signinStatus('');
      clearInterval(gSessionPoll);
      // signed in while the wizard was waiting on its last step: carry on and make the account
      if(gState.awaitingAccount){ gState.awaitingAccount = false; createAccountViaService(); }
    }
  };
  const refreshSession = async () => {
    try{ gSession = await service('GET', '/session'); }catch(err){ gSession = null; }
    renderSession();
    return gSession;
  };
  const signInWithGoogle = async (credential) => {
    try{
      gSession = await service('POST', '/session', { credential });
      renderSession();
    }catch(err){
      signinStatus(err.message);
    }
  };
  window.eosinaboxSignInWithGoogle = signInWithGoogle; // what Google's button calls
  // Put the one sign-in block into whichever page is asking for it, and switch on what the service offers.
  const showSignin = async (holder) => {
    $('#eosinabox_signin').appendTo(holder).show();
    try{
      if(!gServiceConfig){ gServiceConfig = await service('GET', '/config'); }
      $('.eosinabox_serviceGrant').text(gServiceConfig.grant);
      $('#eosinabox_emailForm').toggle(!!gServiceConfig.emailSignIn);
      if(!gServiceConfig.googleClientId && !gServiceConfig.emailSignIn){
        signinStatus('Sign-in is not set up yet, so the demo cannot create accounts');
      }
      if(gServiceConfig.googleClientId && !gGoogleRendered){
        gGoogleRendered = true;
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = () => {
          google.accounts.id.initialize({ client_id: gServiceConfig.googleClientId, callback: (response) => signInWithGoogle(response.credential) });
          google.accounts.id.renderButton($('#eosinabox_googleButton')[0], { theme: 'outline', size: 'large', text: 'signin_with' });
        };
        // ad blockers often stop Google's script; the e-mail link still works
        script.onerror = () => $('#eosinabox_googleButton').text(gServiceConfig.emailSignIn ? '' : 'Google sign-in did not load; an ad blocker usually causes this');
        document.head.appendChild(script);
      }
    }catch(err){
      signinStatus(err.message);
    }
    await refreshSession();
  };
  $('#eosinabox_emailForm').on('submit', async (e) => {
    e.preventDefault();
    const email = $('#eosinabox_email').val().trim();
    try{
      const sent = await service('POST', '/signin/email', { email });
      signinStatus(`We sent a link to ${email}. Open it within ${sent.minutes} minutes and keep this page open.`);
      clearInterval(gSessionPoll);
      const started = Date.now();
      gSessionPoll = setInterval(async () => {
        if(Date.now() - started > (sent.minutes + 1) * 60000){ clearInterval(gSessionPoll); signinStatus('The link has expired; ask for a new one.'); return; }
        try{ gSession = await service('GET', '/session'); renderSession(); }catch(err){ /* not confirmed yet */ }
      }, 3000);
    }catch(err){
      signinStatus(err.message);
    }
  });
  $('#eosinabox_signOut').on('click', async (e) => {
    e.preventDefault();
    await service('DELETE', '/session').catch(() => {});
    gSession = null;
    renderSession();
  });
  const prepareFinalStep = async () => {
    const viaService = chainHasAccountService();
    $('#eosinabox_serviceSignup').toggle(viaService);
    $('#eosinabox_esr, #eosinabox_share').toggle(!viaService);
    if(!viaService){ return; }
    $('#eosinabox_serviceStatus').text('');
    gState.awaitingAccount = false;
    await showSignin('#eosinabox_wizardSigninHolder');
    gState.awaitingAccount = !gSession; // if they still have to sign in, create the account as soon as they have
  };
  const createAccountViaService = async () => {
    const chain = gState.chain;
    const accountName = $('#eosinabox_accountName').val().toLowerCase();
    $('#eosinabox_serviceStatus').text('Creating your account...');
    try{
      const result = await service('POST', '/accounts', { accountName, publicKey: $('#eosinabox_pubkey').text() });
      localStorage.currentAccount = chain + ':' + result.account;
      addAccountToLocalStorage(localStorage.currentAccount);
      localStorage.currentChain = chain;
      $('#eosinabox_serviceStatus').text('');
      eosinaboxToast(`Your account ${escapeHtml(result.account)} is ready, with ${escapeHtml(result.grant)} to try a transfer`);
      wizardTo(0);
      gotoHome();
      updateBalance(chain);
    }catch(err){
      $('#eosinabox_serviceStatus').text(err.message);
    }
  };
  $('#eosinabox_createViaService').on('click', (e) => { e.preventDefault(); createAccountViaService(); });
  // Operators: who has signed up.
  const showAdmin = async () => {
    const body = $('#eosinabox_adminRows').empty();
    $('#eosinabox_adminStatus').text('Loading...');
    try{
      const { accounts } = await service('GET', '/admin/accounts');
      for(const a of accounts.slice().reverse()){
        $('<tr>').append([a.time.replace('T', ' ').slice(0, 16), a.email, a.name || '', a.account, a.method || 'google', a.ip].map((v) => $('<td>').text(v))).appendTo(body);
      }
      $('#eosinabox_adminStatus').text(`${accounts.length} accounts created by ${new Set(accounts.map((a) => a.email)).size} people`);
    }catch(err){
      $('#eosinabox_adminStatus').text(err.message);
    }
  };
  // An e-mailed link lands here. Opening it does nothing; pressing the button confirms.
  const showConfirm = (token) => {
    $('.eosinabox_page').hide();
    $('.eosinabox_page_confirm').show();
    $('#eosinabox_confirmSignin').off('click').on('click', async () => {
      try{
        const result = await service('POST', '/signin/confirm', { token });
        $('#eosinabox_confirmSignin').hide();
        $('#eosinabox_confirmStatus').text(result.signedIn
          ? `You are signed in as ${result.email}. If you started in another tab, go back to it; it carries on by itself.`
          : `Confirmed for ${result.email}. Go back to the browser where you asked for the link; it carries on by itself.`);
        await refreshSession();
      }catch(err){
        $('#eosinabox_confirmStatus').text(err.message);
      }
    });
  };
  const wizardTo = (stepTo) => {
    if(stepTo == 5){ prepareFinalStep(); }
    $('.eosinabox_page_createAccount .wizard')
    .fadeOut().promise().done( () => {
      $(`.eosinabox_page_createAccount .wizard${stepTo}`).fadeIn();
    });
  }
  const gotoHome = () => {
    $('body').removeClass('eosinabox_wide');
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
      wizardTo(chainHasAccountService() ? 4 : 3);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard3')){
      if(!gState.custodianAccountName){
        $('#eosinabox_custodianAccountName')[0].setCustomValidity('Please choose a real custody account');
        $('#eosinabox_custodianAccountName')[0].reportValidity();
        return;
      }
      wizardTo(4);
    }else if(e.currentTarget.parentElement.parentElement.classList.contains('wizard4')){
      if(!gState.pubkey){
        $('#eosinbox_createKeys').removeClass('btn-primary').addClass('btn-danger');
        return;
      }
      $('#eosinbox_createKeys').removeClass('btn-danger').addClass('btn-primary');
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
      wizardTo(chainHasAccountService() ? 2 : 3);
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
      const powerupUrl = gChain[chainOrDefault(getCurrentAccountChain())].freePowerupUrl;
      if(!powerupUrl){
        eosinaboxToast('This chain has no free PowerUp service, check the Help page');
      }else{
        const response = await fetch(powerupUrl + getCurrentAccountName());
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
    $('#eosinbox_createKeys').removeClass('btn-danger').addClass('btn-primary');
    gState.pubkey = false;
    // AMIHDEBUG TODO: generate random string on server and manage it in a session,
    // Perhaps this is not needed, not worried about replay attacks, discuss...
    const randomStringFromServer = 'replayAttackProtectionRandomStringNotNeeded?';
    const rp = {
      name: "Ami Heines",
      // WebAuthn keys are bound to this domain. Production keys stay on eosinabox.com;
      // anywhere else (localhost, a demo host) the key is bound to the host serving the page.
      id: location.hostname.endsWith("eosinabox.com") ? "eosinabox.com" : location.hostname,
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
      return;
    }
    const credentialIdHex = EosinaboxCore.bytesToHex(new Uint8Array(credential.rawId));
    // The public key is derived here, in the browser: nothing about the new key goes to the server.
    try {
      const pubkey = EosinaboxCore.publicKeyFromAttestation(new Uint8Array(credential.response.attestationObject), rp.id);
      gState.pubkey = true;
      $('#eosinabox_pubkey').html(pubkey);
      $('.eosinabox_pubkeyClass').html(pubkey);
      // save in localStorage
      const stored = localStorage['eosinabox_pubkeys'] ? JSON.parse(localStorage['eosinabox_pubkeys']) : [];
      stored.push({ credentialId: credentialIdHex, key: pubkey });
      localStorage['eosinabox_pubkeys'] = JSON.stringify( stored );
      await consoleLog({ pubkey });
    } catch (err) {
      gState.pubkey = false;
      consoleLog({ msg: 'err in [publicKeyFromAttestation]', errorMessage: err.message });
      eosinaboxToast('Create Key Failed with error: ' + err.message);
    }
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
    let o = JSON.parse(localStorage.sharedInfo);
    // https://eosinabox.com/#sharedInfo?
    // action=createAccount&
    // chain=jungle4&
    // accountName=cggdggffgyft&
    // custodianAccountName=webauthn1111&
    // pubkey=PUB_WA_AwTqYqJEwQ3B4bzNGyxHT25qZCxRfrjgYnshr97otStVYZJ7uA5EAkEey2RoKZCyu7pxaAStoGV1ieCc3tUk
    try {
      const result = await walletTransact(gState.chain, {
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
            stake_net_quantity: (0.0001).toFixed(gChain[gState.chain].precision) + ' ' + gChain[gState.chain].symbol,
            stake_cpu_quantity: (0.0001).toFixed(gChain[gState.chain].precision) + ' ' + gChain[gState.chain].symbol,
            transfer: false,
          }
        }]
      });
      consoleLog( {logMsg: 'createdAccount!', result } );
      eosinaboxToast('Transaction sent, let the other person know you created their account and send them some EOS!');
      localStorage.sharedInfo = '';
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_myAccount`).show();
      $('#eosinabox_transfer_from').html(localStorage.currentAccount);
      $('#eosinabox_transfer_to').val(o.accountName);
      $('#eosinabox_transfer_memo').val('Initial transfer using EOS-in-a-Box 🌈');
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
    const token = gChain[chainOrDefault(getCurrentAccountChain())];
    ele.val( parseFloat( ele.val() ).toFixed(token.precision) + ' ' + token.symbol );
    ele[0].setSelectionRange(start, end); // restore from variables...
  });
  $('#eosinabox_transfer_transact').on('click', async (event) => {
    event.preventDefault();
    const to       = $('#eosinabox_transfer_to'      ).val().toLowerCase();
    const quantity = $('#eosinabox_transfer_quantity').val();
    const memo     = $('#eosinabox_transfer_memo'    ).val();
    try {
      const result = await walletTransact(getCurrentAccountChain(), {
        actions: [{
          account: 'eosio.token',
          name: 'transfer',
          data: { from: getCurrentAccountName(), to, quantity, memo },
          authorization: [{ actor: getCurrentAccountName(), permission: 'active' }],
        }],
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
    // cleos -u https://jungle4.cryptolions.io set account permission webauthn1111 active PUB_WA_77Nes48N65f1 -p webauthn1111@owner
    const replaceKeysAccountName = $('.eosinabox_accountNameClassRestoreAccountTransaction').html();
    const replaceKeysPubKey = $('.eosinabox_pubkeyClassRestoreAccountTransaction').html();
    // const replaceKeysCustodian = $('.eosinabox_custodianAccountNameRestoreAccountTransaction').val();
    try {
      const result = await walletTransact(getCurrentAccountChain(), {
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
  //       `cleos -u https://jungle4.cryptolions.io:443 system newaccount`,
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
    const explorer = gChain[chainOrDefault(getCurrentAccountChain())].explorer;
    if(explorer){
      window.open(explorer.replace('{account}', getCurrentAccountName()), '_blank').focus();
    }else{
      eosinaboxToast('No block explorer is configured for this chain');
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
  //     url: `${location.origin}${location.pathname}#sharedInfo?action=` +
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
    callMyShare(`${location.origin}${location.pathname}#sharedInfo?action=restoreAccount&chain=${gState.chain}&` +
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
    // the signing request is built here in the browser
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
          "stake_net_quantity": (0.01).toFixed(gChain[gState.chain].precision) + ' ' + gChain[gState.chain].symbol,
          "stake_cpu_quantity": (0.01).toFixed(gChain[gState.chain].precision) + ' ' + gChain[gState.chain].symbol,
          "transfer": 0
        },
      }
    ];
    const ESR = { uri: await EosinaboxCore.createSigningRequest(gChain[gState.chain], withoutResourceActions(gState.chain, actions)) };
    // consoleLog({ ESR });

    const shareTxt = [
      `Hello, this is an EOS-in-a-Box account creation request, if you were `,
      `expecting this message, please open the link:\n\n`,
      `${location.origin}${location.pathname}#sharedInfo?action=createAccount&chain=${gState.chain}&`,
      `accountName=${gState.shareEssentials.accountName}`,
      `&custodianAccountName=${gState.shareEssentials.custodianAccountName}&`,
      `pubkey=${gState.shareEssentials.pubkey}&esr=${ESR.uri}`,
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
    $('body').toggleClass('eosinabox_wide', href == 'admin'); // the sign-ups table gets a wide card on a laptop
    if(href == 'signin'){ gState.awaitingAccount = false; showSignin('#eosinabox_signinHolder'); }
    if(href == 'admin'){ showAdmin(); }
  });
  $('.eosinabox_dropdown_blockchain .dropdown-menu').html(
    Object.keys(gChain).map((id) => `<a class="dropdown-item" data-chain="${id}" href="#">${escapeHtml(gChain[id].name)}</a>`).join('')
  );
  $('.eosinabox_dropdown_blockchain').on('click', 'a.dropdown-item', (e)=>{
    e.preventDefault();
    gState.chain = chainOrDefault($(e.target).attr('data-chain'));
    $('.eosinabox_dropdown_blockchain .btn').removeClass('btn-outline-danger').addClass('btn-outline-primary');
    $('.eosinabox_dropdown_blockchain>button').html(`${$(e.target).text()} `);
  });
  // onLoad
  /////////
  $('.toast').hide(); // aarg! why is the toast not showing but blocking the elements under it?
  $('.toast').on('hidden.bs.toast', ()=> { $('.toast').hide(); })
  // if ('serviceWorker' in navigator) {
  //   navigator.serviceWorker.register('./pwaServiceWorker.js');
  // }
  repopulateMyAccounts();
  if(!gChain[localStorage.currentChain]){ localStorage.currentChain = gDefaultChain; }
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
  if(serviceChain()){
    $('.eosinabox_nav_signin').show();
    refreshSession();
  }
  if(serviceChain() && window.location.hash.startsWith('#confirm=')){
    const token = window.location.hash.slice('#confirm='.length);
    history.replaceState('', '', window.location.pathname); // the token should not linger in the address bar
    showConfirm(token);
  }else if(window.location.href.split('#').length>1 && window.location.href.split('#')[1].substr(0,10) == 'sharedInfo'){
    const params = window.location.href.split('#')[1].split('?')[1].split('&');
    var o = {};
    localStorage.sharedInfo = '';
    $('.eosinabox_sharedinfo_action').html('');
    $('.eosinabox_sharedinfo_chain').html('');
    $('.eosinabox_sharedinfo_accountName').html('');
    $('.eosinabox_sharedinfo_custodianAccountName').html('');
    $('.eosinabox_sharedinfo_pubkey').html('');
    $('.eosinabox_sharedinfo_esr').html('');
    $('.eosinabox_sharedinfo_cleos').html('');
    // A shared link is untrusted input: only known fields are shown, and only as text.
    const sharedFields = ['action', 'chain', 'accountName', 'custodianAccountName', 'pubkey', 'esr'];
    for(var i=0; i<params.length; i++){
      var param = params[i].split('=');
      if( !sharedFields.includes(param[0]) ){ continue; }
      o[param[0]] = param[1];
      if( param[0]=='chain' ){ o.chain = gState.chain = chainOrDefault(o.chain); }
      if( param[0]=='esr' && /^esr:(\/\/)?[A-Za-z0-9_-]+$/.test(param[1]) ){
        $('.eosinabox_sharedinfo_esr').empty().append( $('<a>').attr('href', param[1]).text('Open Anchor Wallet') );
      }else{
        $(`.eosinabox_sharedinfo_${param[0]}`).text(o[param[0]]);
      }
    }
    localStorage.sharedInfo = JSON.stringify(o);
    history.pushState('', '', window.location.pathname); // delete the share info, so it won't go back again to that page.
    // full share of create account OR partial share of invite friend?
    // https://eosinabox.com/#sharedInfo?action=createAccount&chain=jungle4&accountName=aminewphone1&custodianAccountName=webauthntest&pubkey=PUB_WA_9vAuvYoJ3iWMKp9hEwfRaz645GQZ89F4w1e6XA4DCQGTh4aQwtQVNQ9MGVYbGa48suGGAuDZPpuFmjHEKvzp
    // https://eosinabox.com/#sharedInfo?action=inviteToCreateAccount&chain=jungle4&custodianAccountName=undefined
    if(o.action == 'createAccount'){
      const cleosCommand = [
        `cleos -u ${gChain[gState.chain].url} system newaccount`,
        `CREATOR_ACCOUNT ${o.accountName} ${o.custodianAccountName}@active ${o.pubkey}`,
        `--stake-net "0.0010 ${gChain[gState.chain].symbol}" --stake-cpu "0.0010 ${gChain[gState.chain].symbol}" --buy-ram-kbytes 3`,
      ].join(' ');
      $(`.eosinabox_sharedinfo_cleos`).text(cleosCommand);
      $('.eosinabox_transfer_fromSharedInfo').html(localStorage.currentAccount);
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_sharedInfo`).show();
    }else if(o.action == 'inviteToCreateAccount'){
      $('.eosinabox_dropdown_blockchain button').text(gChain[gState.chain].name);
      $('#eosinabox_custodianAccountName').val(o.custodianAccountName);
      $('.eosinabox_page').hide();
      $(`.eosinabox_page_createAccount`).show();
    }else if(o.action == 'restoreAccount'){
      console.log('o.action::::restoreAccount, o:', o);
      console.log('o.action::::restoreAccount, o:', o.chain, o.pubkey, o.accountName);
      $('.eosinabox_dropdown_blockchain button').text(gChain[gState.chain].name);
      $('.eosinabox_accountNameClassRestoreAccountTransaction').text(o.accountName);
      $('.eosinabox_pubkeyClassRestoreAccountTransaction').text(o.pubkey);
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

//////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// ESR human readable?
////////////////////////////////////////////////////////////////////////////////////////////////////

// x = require("eosio-signing-request");
// zlib = require('zlib');
// const textEncoder = new TextEncoder();
// const textDecoder = new TextDecoder();

// const opts = {
// 	textEncoder,
// 	textDecoder,
// 	zlib: {
// 		deflateRaw: (data) => new Uint8Array(zlib.deflateRawSync(Buffer.from(data))),
// 		inflateRaw: (data) => new Uint8Array(zlib.inflateRawSync(Buffer.from(data))),
// 	}
// }
// decodedEsr = x.SigningRequest.from('esr:gmPUYlrAahfV890qbBf_LcEnN_WYLJYsWlXy57zb1ZUCJRkOjMwMIPDKIJTBYd4spZQdsxgZGSCACUonwwQ-TKla-bBNMg_MZ3Ro49icmtv3CMRZ8dbICCgKkmBkYt74K_73HQ7x79u3vxaQuKa1zUrZR7F-g5yj-VPXD07ML5cx8abmF2fmJSblV-gl5-fCjAc7YsOpfx7Fe-0wHCGC7ogGHiRdDPZa0ssWeWHoMkTXlQLls7j6B4NodD7ICwA', opts)

// > decodedEsr.data.req.value[0].account.toString()
// 'eosio'
// > decodedEsr.data.req.value[0].name.toString()
// 'newaccount'
// > decodedEsr.data.req.value[0].authorization.toString()
// '............1@............2'
// > decodedEsr.data.req.value[0].data.toString()
// '0100000000000000f0947aa9e186196e010000000001408608b3656d8ee200000000a8ed323201000001000000010203b1fa5ffbdc0817f7b7b7eb1018d62ab63a234c217fb01e4137e545f04203e9a6020d656f73696e61626f782e636f6d01000000'

// > decodedEsr.data.req.value[1].account.toString()
// 'eosio'
// > decodedEsr.data.req.value[1].name.toString()
// 'buyrambytes'
// > decodedEsr.data.req.value[1].authorization.toString()
// '............1@............2'
// > decodedEsr.data.req.value[1].data.toString()
// '0100000000000000f0947aa9e186196e800c0000'

// > decodedEsr.data.req.value[2].account.toString()
// 'eosio'
// > decodedEsr.data.req.value[2].name.toString()
// 'delegatebw'
// > decodedEsr.data.req.value[2].authorization.toString()
// '............1@............2'
// > decodedEsr.data.req.value[2].data.toString()
// '0100000000000000f0947aa9e186196e640000000000000004454f5300000000640000000000000004454f530000000000'
