'use strict';
$(()=>{
  console.log('this is the onload function of jquery...');
  $('#btnCheckAvailability').on('click', ()=>{
    console.log('user clicked the btn, check availability of the account name using the backend of this server...');
    $.ajax({
      type: 'POST',
      url: '/newaccount/isavailable/' + $('#accountname').val(),
      timeout: 15*1000
    }).done(res => {
      console.log('frontend res:', res);
    })
    .fail(err => {
      console.log('frontend err:', err);
    });
  });
});
