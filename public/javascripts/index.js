'use strict';
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
});
