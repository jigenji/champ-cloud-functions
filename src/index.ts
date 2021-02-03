import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import admin = require('firebase-admin')
import axios from "axios"
import * as Moment from 'moment-timezone';
import * as camelcaseKeys from 'camelcase-keys'
const {PubSub} = require('@google-cloud/pubsub')

firebase.initializeApp()
const db = firebase.firestore()
const pubsub = new PubSub()

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
    expirationLimitHour? : number // the limited expiration hour of the created key for authorization
}

export const requestZoomAuthorizationUrl = functions.https.onCall( async ({
    expirationLimitHour = 1 // initialized by 1 hour
} : requestZoomAuthorizationUrlParam ,context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) {
        return
    }
    const { uid } = auth
    const { token } = auth
    const { enterpriseId } = token

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

    const defaultZoomAppSnap = await db.collection('externalConfigs').doc('defaultZoomApp').get()
    const defaultZoomAppDate = defaultZoomAppSnap.data()
    if(!defaultZoomAppDate){
        return 
    }

    const {appName} = defaultZoomAppDate
    const zoomAppSnap = await db.collection('externalConnections').doc('zoom').collection('apps').doc(appName).get()
    const zoomAppData = zoomAppSnap.data()
    if(!zoomAppData){
        return 
    }
    
    const {installUrl} = zoomAppData
    console.log("[log]zoom app info:", installUrl)

    const zoomAuthorizePath = `${installUrl}&state=${accessTokenRef.id}`
    return zoomAuthorizePath
});


async function getBase64Code() {
    const defaultZoomAppSnap = await db.collection('externalConfigs').doc('defaultZoomApp').get()
    const defaultZoomAppDate = defaultZoomAppSnap.data()
    if(!defaultZoomAppDate){
        return
    }

    const {appName} = defaultZoomAppDate
    const zoomAppSnap = await db.collection('externalConnections').doc('zoom').collection('apps').doc(appName).get()
    const zoomAppData = zoomAppSnap.data()
    if(!zoomAppData){
        return
    }
    
    const {clientId, clientSecret} = zoomAppData
    console.log("[log]zoom app info", clientId, clientSecret)
        // リクエストヘッダーの生成
    const authorizationCode = `${clientId}:${clientSecret}`
    const buff = Buffer.from(authorizationCode)
    const base64data = buff.toString('base64')

    return base64data
}


/*
* initializeZoomAccessToken
This function is called by https request.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const initializeZoomAccessToken = functions.https.onRequest( async (req, res) => {
    const { code } = req.query
    const { state } = req.query

    if (!state || !code) {
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=invalidAccessToken`)
        return
    }

    console.log("[log]state", state, "code", code)
    const tmpKeyRef = db.collection('temporalKeys').doc('zoom').collection('keys').doc(String(state))
    const tmpKeySnap = await tmpKeyRef.get()
    const tmpKeyData = await tmpKeySnap.data()

    // アクセスkeyがない場合
    if(!tmpKeyData){
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=invalidAccessToken`)
        return
    }

    const { enterpriseId, expiredDate, userId } = tmpKeyData
    console.log("[log]tmpKey info", expiredDate, expiredDate.toDate() , "enterpriseId", enterpriseId, "userId",userId)

    // keyの有効性チェック
    if(new Date > expiredDate.toDate()) {
        console.log('[log] invalidAccessToken : expired ',new Date > expiredDate.toDate())
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=invalidAccessToken`)
        return
    }    

    const defaultZoomAppSnap = await db.collection('externalConfigs').doc('defaultZoomApp').get()
    const defaultZoomAppDate = defaultZoomAppSnap.data()
    if(!defaultZoomAppDate){
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=internalError`)
        return
    }

    const {appName} = defaultZoomAppDate
    const zoomAppSnap = await db.collection('externalConnections').doc('zoom').collection('apps').doc(appName).get()
    const zoomAppData = zoomAppSnap.data()
    if(!zoomAppData){
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=internalError`)
        return
    }
    
    const {clientId, clientSecret} = zoomAppData
    console.log("[log]zoom app info", clientId, clientSecret)


    // リクエストヘッダーの生成
    const authorizationCode = `${clientId}:${clientSecret}`
    const buff = Buffer.from(authorizationCode)
    const base64data = buff.toString('base64')
    console.log('[log]base64data', base64data)


    // アクセストークンのリクエスト
    const accessTokenUrl = `https://zoom.us/oauth/token?grant_type=authorization_code&code=${code}&redirect_uri=https://us-central1-react-tutorial-tailwind.cloudfunctions.net/initializeZoomAccessToken`
    await axios.post(accessTokenUrl,{},{
        headers: {
            'Authorization' :`Basic ${base64data}`,
        }
    }).then( async (response)=>{
        const { data } = response
        const {access_token, token_type, refresh_token, expires_in, scope} = data
        const accessTokenRef = db.collection('enterprises').doc(enterpriseId).collection('accessTokens').doc('zoom')
        
        // アクセストークンが取得できなかった場合
        if(!access_token){
            res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=internalError`)
            return
        }

        const createdDate = new Date()
        await accessTokenRef.set({
            accessToken : access_token,
            refreshToken : refresh_token,
            tokenType : token_type,
            expiresIn : expires_in,
            scope : scope,
            createdDate : createdDate,
            updatedDate : createdDate,
        },{merge: true})

        const userRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(userId)
        await userRef.set({
            authorizeZoom : true
        },{merge:true})

    }).catch((err)=>{
        console.log('[log]post request error :',err)
        res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=internalError`)  
        return
    })

    res.status(302).redirect(`https://c7dbd2fa769d.ngrok.io?authorizeZoom=success`)
    return  
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
        
        const base64data = await getBase64Code()
        console.log('[log]base64data', base64data)

        if(!base64data){
            continue
        }
    
        const refleshUrl = `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${accessTokenData.refreshToken}`
        await axios.post(refleshUrl,{},{
            headers: {Authorization :`Basic ${base64data}`}
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
* refleshZoomAccessToken
This function is called by https request.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const refleshZoomAccessToken = functions.https.onRequest( async (req, res) => {
    const snapshot = await db.collection('enterprises').get()
    if (!snapshot) {
        res.status(200).send(`fail to update access_token`)
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

        const base64data = await getBase64Code()
        console.log('[log]base64data', base64data)

        if(!base64data){
            continue
        }
    
        const refleshUrl = `https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=${accessTokenData.refreshToken}`
        await axios.post(refleshUrl,{},{
            headers: {Authorization :`Basic ${base64data}`}
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
    return
})

/*
* zoomRecordingHandler
This function is called by https request.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const zoomRecordingHandler = functions.https.onRequest( async (req, res) => {
    console.log("[log]req.body.payload:",req.body.payload.object);

    const {host_email} = req.body.payload.object
    console.log('[log]host_email',host_email)


    if(!host_email){
        res.sendStatus(200)
    }

    const dataBuffer = Buffer.from(JSON.stringify({
        userEmail: host_email,
        taskType: 'getExistedRecordings'
    }))

    const messageId = await pubsub.topic('connect-zoom').publish(dataBuffer).catch((err: any) => {
    console.error(err.message, err)
    })
    console.log(`Message ${messageId} published.`)

    res.sendStatus(200)

})

/*
* zoomMeetingHandler
This function is called by https request.
After called, this server gets the current access token information especially the refresh token.
Then it sends the post request to Zoom api server to get new access token and save it to firestore
*/
export const zoomMeetingHandler = functions.https.onRequest( async (req, res) => {

    console.log("recieve request", req)
    console.log("[log]req.body:",req.body)

    const {host_email} = req.body

    console.log('[log]host_email',host_email)

    // const dataBuffer = Buffer.from(JSON.stringify({
    //     userEmail: host_email,
    //     taskType: 'getExistedRecordings'
    // }))

    // const messageId = await pubSub.topic('create-features').publish(dataBuffer).catch((err: any) => {
    // console.error(err.message, err)
    // })
    // console.log(`Message ${messageId} published.`)

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
        return
    }    
    const {accessToken} = accessTokenData
    const creatMeetingUrl = `https://api.zoom.us/v2/users/${email}/meetings`
    const response = await axios.get(creatMeetingUrl,{
        headers: {
            'Authorization' :`Bearer ${accessToken}`
        }
    })
    const {data} = response
    const {meetings} = data

    for( const i in meetings ){
        const meeting = meetings[i]
        const camelcaseMeeting = camelcaseKeys(meeting)
        console.log('[log]camelcase Meeting:',camelcaseMeeting)
        const {id} = meeting
        const {startTime} = camelcaseMeeting
        const {createdAt} = camelcaseMeeting
        // const {timezone} = meeting
        console.log('[log]start_time at default',startTime,Moment(startTime))
        console.log('[log]start_time at Asia/Tokyo',startTime,Moment(startTime).tz("Asia/Tokyo"))
        console.log('[log]created_at ',createdAt)
        // console.log('[log]time ',created_at,Moment(created_at, timezone))
        // const reservedMeetingsRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(uid)
        const reservedMeetingsRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(uid).collection('reservedMeetings').doc(String(id))
        const payload = {
            'type': 'video',
            'app': 'zoom',
            ...meeting
        }
        
        payload['start_time'] = Moment(startTime)
        payload['created_at'] = Moment(createdAt)
        
        await reservedMeetingsRef.set(payload,{merge: true})
    }

    return
})