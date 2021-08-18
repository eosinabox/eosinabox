var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const WebAuthn = require('webauthn');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var newaccountRouter = require('./routes/newaccount');
var bodyParser = require('body-parser');

var app = express();

const webauthn = new WebAuthn({
  origin: 'https://amiheines.com',
  rpName: 'EOS in a Box on AmiHeines.com',
  usernameField: 'username',
  userFields: {
    username: 'username',
    name: 'displayName',
  },
  // store: new LevelAdapter(),
  // OR
  store: {
    put: async (id, value) => { console.log('called [store][put], id-', id, '; val-', value); },
    get: async (id) => { console.log('called [store][get] id-', id); },
    search: async (search) => { console.log('called [store][search] search-', search); return { username: 'asd' };  /* return { [username]: User } */},
    delete: async (id) => { console.log('called [store][delete] id-', id ); /* return boolean */},
  },
  enableLogging: true,
});


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/newaccount', newaccountRouter);
app.use('/webauthn', webauthn.initialize());
app.use('/users', usersRouter);

module.exports = app;
