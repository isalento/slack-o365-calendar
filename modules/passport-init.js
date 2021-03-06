var express = require('express'),
    passport = require('passport'),
    bunyan = require('bunyan'),
    nconf = require('../config'),
    OIDCStrategy = require('passport-azure-ad').OIDCStrategy,
    RSVP = require('RSVP');

var MongoClient = require('mongodb').MongoClient
  , assert = require('assert');

// Connection URL
var url = nconf.get('mongo_connection'),
    connect = RSVP.denodeify(MongoClient.connect);

function setupPassport () {
    var settings = {
    callbackURL: nconf.get('returnURL'),
    realm: nconf.get('realm'),
    clientID: nconf.get('clientID'),
    clientSecret: nconf.get('clientSecret'),
    //resource: 'http://outlook.office.com/',
    //oidcIssuer: nconf.get('issuer'),
    identityMetadata: nconf.get('identityMetadata'),
    responseType: nconf.get('responseType'),
    responseMode: nconf.get('responseMode'),
    skipUserProfile: nconf.get('skipUserProfile'),
    //scope: ['Calendars.Read']
    };

    return new RSVP.Promise(function (resolve, reject){
        passport.use(new OIDCStrategy(settings,
        function(iss, sub, profile, accessToken, refreshToken, done) {
            console.log('Example: Email address we received was: ', profile.email);

            return resolve({
                iss: iss,
                sub: sub,
                profile: profile,
                accessToken: accessToken,
                refreshToken: refreshToken,
                done: done
            });
        }
        ));
    });
}

function dbConnect () {
    return connect.call(MongoClient, url)
    .then(function(connection) {
        return connection;
    });
}

function registerUser (db, profileData) {

    var users = db.collection('users'),
        findOne = RSVP.denodeify(users.findOne);

    return findOne.call(users, {email: profileData.profile.email})
    .then(function (user) {
        if (!user) {
            // "Auto-registration"
            profileData.profile.accessToken = profileData.accessToken;
            profileData.profile.refreshToken = profileData.refreshToken;
            console.log('============================');
            console.dir(profileData.profile);
            console.log('============================');

            var insert = RSVP.denodeify(users.insert);

            return insert.call(users, profileData.profile)
        }
        else {
            console.log('============================');
            console.log('already registered user:')
            console.dir(user);
            console.log('============================');
            return user;
        }
    })
    .then(function () {
        console.log('sucessfully saved user!');
        return profileData.done(null, profileData.profile);
    });

}


function setupSerializers() {
    // Passport session setup. (Section 2)

    //   To support persistent login sessions, Passport needs to be able to
    //   serialize users into and deserialize users out of the session.  Typically,
    //   this will be as simple as storing the user ID when serializing, and finding
    //   the user by ID when deserializing.
    passport.serializeUser(function(user, done) {
      done(null, user.email);
    });

    passport.deserializeUser(function(id, done) {
      findByEmail(id, function (err, user) {
        done(err, user);
      });
    });
}

var connection;
dbConnect()
.then(function (db) {
    connection = db;
    return setupPassport();
})
.then(function (profileData) {
    return registerUser(connection, profileData);
})
.catch(function (err) {
    console.error(err);
})
.finally(function (){
    connection.close();
});
setupSerializers();



