import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
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
