import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import admin = require('firebase-admin');
// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

firebase.initializeApp()


export const checkInviteKey = functions.https.onCall( async ( inviteKey : string, context: functions.https.CallableContext) => {
    const db = firebase.firestore()
    const accessTokenRef = db.doc(`/accessTokens/${inviteKey}`)
    const accessTokenSnap = await accessTokenRef.get()
    const accessToken = accessTokenSnap.data()
  
    // Check the paramaters of the document
    if (!accessToken) {
      throw new Error('Invalid access token')
    }
    
    return (accessToken)

});

export const addCustomRole = functions.https.onCall( async ( {enterpriseId} : {
    enterpriseId : string
}, context: functions.https.CallableContext) => {
    const { auth } = context
    console.log('auth',auth)
    if (!auth) {
        return
    }
    const { uid } = auth
    
    return admin.auth().setCustomUserClaims(uid, {admin:false, enterpriseId:enterpriseId})
    .then(()=>{
        return {
            message: `Success! ${uid} has been made an admin`
        }
    }).catch(err=>{
        return err
    })
    // get user add customa claim 
    // return admin.auth().getUserByEmail(email).then().then( user => {
    //     return admin.auth().setCustomUserClaims(user.uid, {admin:false, enterpriseId:enterpriseId})
    // }).then(()=>{
    //     return {
    //         message: `Success! ${email} has been made an admin`
    //     }
    // }).catch(err=>{
    //     return err
    // })
});
