import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import admin = require('firebase-admin')
import axios from "axios"
import * as Moment from 'moment-timezone';


firebase.initializeApp()
const db = firebase.firestore()

/*
* checkInviteKey
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Args :
    inviteKey : uuid 
    context :  the user information

return:
    success : accessToken
    failure : cause Error
*/
export const checkInviteKey = functions.https.onCall( async ( inviteKey : string, context: functions.https.CallableContext) => {
    // check the access is authorised

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

/*
* addCustomRole
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Arges:
    enterpriseId : 

return:
    success : none
    failure : cause Error
*/
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



/*
* initilizeAccount
This function is called by onCall request from app.
After called, this endpoint stores the user information to firestore
Then this server returns the https url
*/
export type initAccountOptions = {
    firstName : string,
    lastName : string,
    email : string,
    enterpriseId : string
}

/* Function for add the Custome Clames like admin and enterpriseId */
export const initilizeAccount = functions.https.onCall( async ( {
    firstName,
    lastName,
    email='dummy',
    enterpriseId='dummy',
} : initAccountOptions, context: functions.https.CallableContext) => {
    // check the access is authorised
    
      
    // axios.get('https://ui-avatars.com/api/?name=%E6%85%8E%E4%BA%8C+%E5%B7%9D%E4%B8%8A&color=ffffff&background=EA5532&size=256').then((response:any) => {
    //     console.log('[response]',response.data)
    //     return response.data
    // })
});


/*
* requestZoomAuthorizationUrl
This function is called by onCall request from app.
After called, this server creates the temporary key and creating the https url to authorize the zoom app
Then this server returns the https url
*/
export type TmpZoomKey = {
    createdDate : Date,
    expiredDate : Date,
    targetApp : string,
    enterpriseId : string,
    userId : string
}

export type requestZoomAuthorizationUrlParam = {
    enterpriseId : string, // the uuid of the enterprose
    expirationLimitHour? : number // the limited expiration hour of the created key for authorization
}

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
    const expiredDate = new Date()
    expiredDate.setHours(expiredDate.getHours() + expirationLimitHour)
    const keyInfo: TmpZoomKey = {
        createdDate : createdDate,
        expiredDate : expiredDate,
        targetApp : 'zoom',
        enterpriseId : enterpriseId,
        userId : uid
    }
    await accessTokenRef.set(keyInfo)

    // return the redirect url to authorize zoom with key  
    const accessTokenUrl = 'https://zoom.us/oauth/authorize?response_type=code&client_id=7t2eCeBwQySq2hjb0m9pKw&redirect_uri=https%3A%2F%2F41e92f8c1ecd.ngrok.io%2Finitialize_zoom_access_token'
    const zoomAuthorizePath = `${accessTokenUrl}&state=${accessTokenRef.id}`
    // const zoomAuthorizePath = `${accessTokenUrl}`
    return zoomAuthorizePath
});


/*
* refleshZoomAccessToken
This function is called by https request.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const refleshZoomAccessToken = functions.https.onRequest( async (req, res) => {
    const snapshot = await db.collection('enterprises').get()
    if (!snapshot) {
        return
    }

    // すべてのconversationを保存する
    const enterpriseList = await Promise.all(snapshot.docs.map( async (doc) => { 
        return { id:doc.id, data: doc.data()}
    }))

    console.log('[enterpriseList]', enterpriseList)

    for (const i in enterpriseList){
        const enterpriseId = enterpriseList[i].id

        const accessTokenRef = db.collection('enterprises').doc(enterpriseId).collection('accessTokens').doc('zoom')
        const accessTokenSnap = await accessTokenRef.get()
        const accessTokenData = await accessTokenSnap.data()
    
        if(!accessTokenData){
            continue
        }    
    
        const refleshUrl = `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${accessTokenData.refreshToken}`
        await axios.post(refleshUrl,{},{
            headers: {Authorization:'Basic aFlqNWNRUjdSSkdVRjZkZF80RmlnOkRHYW1SbkdVcHZoWURJTGdPN05ZeDJqOFlZMTBqQ1A1'}
        }).then( async (response) => {
            const updatedDate = new Date()
            await accessTokenRef.set({
                accessToken : response.data.access_token,
                refreshToken : response.data.refresh_token,
                updatedDate : updatedDate
            },{merge: true})
            console.log('[log]response',response.data)
        }).catch((error) => {
            console.log('[log]error',error)
        })
    }
    res.status(200).send(`access_token updated`); 
})


/*
* scheduledRefleshZoomAccessToken
This function is called periodly by cloud pub/sub.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const scheduledRefleshZoomAccessToken = functions.pubsub.schedule('every 25 minutes').onRun(async (context) => {
    const snapshot = await db.collection('enterprises').get()
    if (!snapshot) {
        return
    }

    // すべてのconversationを保存する
    const enterpriseList = await Promise.all(snapshot.docs.map( async (doc) => { 
        return { id:doc.id, data: doc.data()}
    }))

    console.log('[enterpriseList]', enterpriseList)

    for (const i in enterpriseList){
        const enterpriseId = enterpriseList[i].id

        const accessTokenRef = db.collection('enterprises').doc(enterpriseId).collection('accessTokens').doc('zoom')
        const accessTokenSnap = await accessTokenRef.get()
        const accessTokenData = await accessTokenSnap.data()
    
        if(!accessTokenData){
            continue
        }    
    
        const refleshUrl = `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${accessTokenData.refreshToken}`
        await axios.post(refleshUrl,{},{
            headers: {Authorization:'Basic aFlqNWNRUjdSSkdVRjZkZF80RmlnOkRHYW1SbkdVcHZoWURJTGdPN05ZeDJqOFlZMTBqQ1A1'}
        }).then( async (response) => {
            const updatedDate = new Date()
            await accessTokenRef.set({
                accessToken : response.data.access_token,
                refreshToken : response.data.refresh_token,
                updatedDate : updatedDate
            },{merge: true})
            console.log('[log]response',response.data)
        }).catch((error) => {
            console.log('[log]error',error)
        })
    }
    return 
})


/*
* reserveZoomMeeting

*/
export type reserveZoomMeetingOptions = {
    meetingType : number,
    topic : string,
    startTime : Date,
    autoRecording : boolean,
    joinBeforeHost : boolean,
    jbhTime : number
    timezone : string,
    password?: string
}

export const reserveZoomMeeting = functions.https.onCall( async ({
    meetingType,
    topic,
    startTime,
    autoRecording = true,
    joinBeforeHost = true,
    jbhTime = 0,
    timezone = 'Asia/Tokyo',
    password = undefined,
} : reserveZoomMeetingOptions,context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) {
        return
    }
    const { token } = auth
    const { email } = token
    const { enterpriseId } = token

    const accessTokenRef = db.collection('enterprises').doc(enterpriseId).collection('accessTokens').doc('zoom')
    const accessTokenSnap = await accessTokenRef.get()
    const accessTokenData = await accessTokenSnap.data()

    if(!accessTokenData){
        return 404
    }    

    const {accessToken} = accessTokenData
    const recordingType = autoRecording ? 'cloud' : 'none'

    const payload = {
        topic: topic,
        type: meetingType,
        start_time: Moment(startTime).tz("Asia/Tokyo").format("YYYY-MM-DDTHH:mm:ss"),
        timezone: timezone,
        password: password,
        settings: {
            join_before_host: joinBeforeHost,
            jbh_time: jbhTime,
            auto_recording: recordingType
        }
    }

    const creatMeetingUrl = `https://api.zoom.us/v2/users/${email}/meetings`
    const response = await axios.post(creatMeetingUrl,payload,{
        headers: {
            'Authorization' :`Bearer ${accessToken}`,
            'Content-Type' : 'application/json'
        }
    })

    const { status } = response
    console.log('status',status)

    return status
})

/*
* getReservedZoomMeeting

*/
export const getReservedZoomMeeting = functions.https.onCall( async ({}, context: functions.https.CallableContext) => {
    const { auth } = context
    console.log('auth',auth)
    if (!auth) {
        return
    }
    const { uid } = auth
    const { token } = auth
    const { email } = token
    const { enterpriseId } = token

    console.log('uid',uid)
    console.log('email',email)
    console.log('enterpriseId',enterpriseId)

    const accessTokenRef = db.collection('enterprises').doc(enterpriseId).collection('accessTokens').doc('zoom')
    const accessTokenSnap = await accessTokenRef.get()
    const accessTokenData = await accessTokenSnap.data()

    if(!accessTokenData){
        return 404
    }    
    const {accessToken} = accessTokenData
    const creatMeetingUrl = `https://api.zoom.us/v2/users/${email}/meetings`
    const response = await axios.get(creatMeetingUrl,{
        headers: {
            'Authorization' :`Bearer ${accessToken}`
        }
    })
    const {data} = response
    const {status} = response
    const {meetings} = data

    for( const i in meetings ){
        const meeting = meetings[i]
        const {id} = meeting
        // const reservedMeetingsRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(uid)
        const reservedMeetingsRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(uid).collection('reservedMeetings').doc(String(id))
        await reservedMeetingsRef.set({
            'type': 'video',
            'app': 'zoom',
        ...meeting},{merge: true})
    }

    return status
})