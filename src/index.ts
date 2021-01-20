import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import admin = require('firebase-admin');
const request = require('request');
// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

firebase.initializeApp()
const db = firebase.firestore()

/* Function for check the invititation key is valid or not */
export const checkInviteKey = functions.https.onCall( async ( inviteKey : string, context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) {
        return
    }

    // get the accessToken
    const accessTokenRef = db.doc(`/accessTokens/${inviteKey}`)
    const accessTokenSnap = await accessTokenRef.get()
    const accessToken = accessTokenSnap.data()
  
    // Check the paramaters of the document
    if (!accessToken) {
      throw new Error('Invalid access token')
    }

    return (accessToken)
});

/* Function for add the Custome Clames like admin and enterpriseId */
export const addCustomRole = functions.https.onCall( async ( {enterpriseId} : {
    enterpriseId : string
}, context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
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
});


export type TmpZoomKey = {
    createdDate : Date,
    expirationDate : Date,
    targetApp : string,
    enterpriseId : string,
    userId : string
}

export type requestZoomAuthorizationUrlParam = {
    enterpriseId : string, // the uuid of the enterprose
    expirationLimitHour? : number // the limited expiration hour of the created key for authorization
}

/* Function to create the tmp key for zoom authorization and return the redirect url to auhorize zoom */
export const requestZoomAuthorizationUrl = functions.https.onCall( async ({
    enterpriseId,
    expirationLimitHour = 1 // initialized by 1 hour
} : requestZoomAuthorizationUrlParam ,context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) {
        return
    }
    const { uid } = auth

    // create the temporarily key document
    const accessTokenRef = db.collection(`temporalKeys`).doc('zoom').collection('keys').doc()
    const createdDate = new Date()
    const expirationDate = new Date()
    expirationDate.setHours(expirationDate.getHours() + expirationLimitHour)
    var keyInfo: TmpZoomKey = {
        createdDate : createdDate,
        expirationDate : expirationDate,
        targetApp : 'zoom',
        enterpriseId : enterpriseId,
        userId : uid
    }
    await accessTokenRef.set(keyInfo)

    // return the redirect url to authorize zoom with key  
    const zoomAuthorizePath = `https://zoom.us/oauth/authorize?response_type=code&client_id=7t2eCeBwQySq2hjb0m9pKw&redirect_uri=https%3A%2F%2Fus-central1-react-tutorial-tailwind.cloudfunctions.net%2Finitialize_access_token?state=${accessTokenRef.id}`
    return zoomAuthorizePath
});


/* Redirected url from zoom and try to get and save access_token */
export const initializeZoomAccessToken = functions.https.onRequest((req, res) => {
    // const requestedKey = req.query.state
    // const code = req.query.code
    // const redirectUrl = 'https://us-central1-react-tutorial-tailwind.cloudfunctions.net/initializeZoomAccessToken'
    // const encoded=''

    // console.log('requestedKey',requestedKey)
    // console.log('code',code)

    // const accessTokenUrl = `https://zoom.us/oauth/token?grant_type=authorization_code&code=${code}&redirect_uri=${redirectUrl}`


    res.status(301).redirect('https://fbc9ada98235.ngrok.io')
})
