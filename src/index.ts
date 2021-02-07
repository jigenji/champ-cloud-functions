import * as functions from 'firebase-functions'
import * as firebase from 'firebase-admin'
import admin = require('firebase-admin')
import axios from "axios"
import * as Moment from 'moment-timezone';
import * as camelcaseKeys from 'camelcase-keys'
import * as sendgrid from '@sendgrid/mail';
const {PubSub} = require('@google-cloud/pubsub')
sendgrid.setApiKey(functions.config().sendgrid.api_key)

firebase.initializeApp()
const db = firebase.firestore()
const pubsub = new PubSub()


const sendgridTemplates = {
    Champ_Invitation_Email: "d-0642eb46d637437ca6170788767851a2",
};


/*
? functions for authorizing account
* checkInviteKey
    This function is called from web app and check the invitation key is valid or not.
    Then return the result
* addCustomRole
    This function is caleed from web app when new user joins to our app.
    Then add the custom claims based on the requested paramaters.
* initilizeAccount (not used now)
    This function is caleed from web app when new user joins to our app.
* deactivateUserLicense
    This function is caleed from web app, especially called from user whose admin is true
    Then stop the selected user license
* activateUserLicense
    This function is caleed from web app, especially called from user whose admin is true
    Then restart the selected user license
* deleteUserLicense
    This function is caleed from web app, especially called from user whose admin is true
    Then deleting the selected user license
* sendInvitationEmail

* generateInvitationKey
    
*/


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
    const accessTokenRef = db.doc(`/temporalKeys/invitation/keys/${inviteKey}`)
    const accessTokenSnap = await accessTokenRef.get()
    const accessTokenData = accessTokenSnap.data()

    // Access tokenの存在チェック
    if (!accessTokenData) {
        console.log('[log] no access token')
        return { code : 'custom-auth/no-access-token'}
    }

    const { expiredDate } = accessTokenData

    // keyの有効期限チェック
    if(!expiredDate || new Date > expiredDate.toDate()) {
        console.log('[log] expired access token')
        return { code : 'custom-auth/expired-access-token'}
    }    
    
    return { code : 'success', token : accessTokenData }
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
export const addCustomRole = functions.https.onCall( async ( {enterpriseId, defaultPermission, accessLevel} : {
    enterpriseId : string,
    defaultPermission : 'number' | 'admin',
    accessLevel : number
}, context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) {
        return
    }
    const { uid } = auth
    
    console.log(enterpriseId,defaultPermission,accessLevel)
    return admin.auth().setCustomUserClaims(uid, {
        admin: defaultPermission==='admin' ? true : false, 
        enterpriseId:enterpriseId,
        accessLevel: accessLevel
    }).then(()=>{
        return {
            message: `Success! ${uid} has been made an admin`
        }
    }).catch(err=>{
        return err
    })
})

/*
* deactivateUserLicense
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Arges:
    targetUserId : the target id 

return:
    success : none
    failure : cause Error
*/
export const deactivateUserLicense = functions.https.onCall( async ( {targetUserId} : {
    targetUserId : string,
}, context: functions.https.CallableContext) => {
    // check the access is authorised
    const { auth } = context
    if (!auth) { 
        return { code : 'custom-auth/invalid-user'}
    }
    const { uid } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return { code : 'custom-auth/no-auth-token'}
    }
    const { enterpriseId } = token
    console.log('[log]token',token)

    if(!token.admin){
        return { code : 'custom-auth/not-admin-user'}
    }


    const userRecord = admin.auth().updateUser(targetUserId,{
        disabled: true
    })

    const targetUserRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(targetUserId)
    const targetUserSnap = await targetUserRef.get()
    if(!targetUserSnap.exists){
        return { code : 'custom-auth/no-user-exist'}
    }
    await targetUserRef.set({
        disabled: true
    },{merge:true})

    console.log('userRecord',userRecord)
    return { code : 'success'}
})


/*
* activateUserLicense
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Arges:
    targetUserId : the target id 

return:
    success : none
    failure : cause Error
*/
export const activateUserLicense = functions.https.onCall( async ( {targetUserId} : {
    targetUserId : string,
}, context: functions.https.CallableContext) => {
    const { auth } = context
    if (!auth) {
        return { code : 'custom-auth/invalid-user'}
    }
    const { uid } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return { code : 'custom-auth/no-auth-token'}
    }
    const { enterpriseId } = token
    console.log('[log]token',token)

    if(!token.admin){
        return { code : 'custom-auth/not-admin-user'}
    }

    const uidExists = await admin.auth().getUser(targetUserId).then(() => true).catch((err) => false)
    console.log('[log]targetUserId',targetUserId)
    console.log('[log]uid exists?',uidExists)

    if(!uidExists){
        return { code : 'custom-auth/no-user-exist'}
    }

    const userRecord = admin.auth().updateUser(targetUserId,{
        disabled: false
    })

    const targetUserRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(targetUserId)
    const targetUserSnap = await targetUserRef.get()
    if(!targetUserSnap.exists){
        return { code : 'custom-auth/no-user-document-exist'}
    }
    await targetUserRef.set({
        disabled: false
    },{merge:true})

    console.log('userRecord',userRecord)
    return { code : 'success'}
})

/*
* deleteUserLicense
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Arges:
    targetUserId : the target id 

return:
    success : none
    failure : cause Error
*/
export const deleteUserLicense = functions.https.onCall( async ( {targetUserId} : {
    targetUserId : string,
}, context: functions.https.CallableContext) => {
    const { auth } = context
    if (!auth) {
        return { code : 'custom-auth/invalid-user'}
    }
    const { uid } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return { code : 'custom-auth/no-auth-token'}
    }
    const { enterpriseId } = token
    console.log('[log]token',token)

    if(!token.admin){
        return { code : 'custom-auth/not-admin-user'}
    }


    const deleteUsersResult = await admin.auth().deleteUsers([targetUserId])
    const targetUserRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(targetUserId)
    const deleteRes = await targetUserRef.delete()

    console.log('[log]deleteRes', deleteRes)
    console.log('[deleteUsersResult', deleteUsersResult)
    return { code : 'success'}
})





/*
* updateUserPermission
This function is called by onCall request from app.
After called, this server creates add the custome clames to user whose userID is in context

Arges:
    targetUserId : the requested userId 
    targetPermission : the requested permission

return:
    success : none
    failure : cause Error
*/

// this function is used to update the custome claims
async function updateCustomUserClaims(uid:string, claims:any) {
    const user = await admin.auth().getUser(uid)
    let updatedClaims = user.customClaims || {}

    for (let property in claims) {
        if (Object.prototype.hasOwnProperty.call(claims, property)) {
            updatedClaims[property] = claims[property]
        }
    }
    console.log('[log]updatedClaims:',updatedClaims)
    await admin.auth().setCustomUserClaims(uid, updatedClaims)
}

export const updateUserPermission = functions.https.onCall( async ( {targetUserId,targetPermission} : {
    targetUserId : string,
    targetPermission : string,
}, context: functions.https.CallableContext) => {
    const { auth } = context
    if (!auth) {
        return { code : 'custom-auth/invalid-user'}
    }
    const { uid } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return { code : 'custom-auth/no-auth-token'}
    }
    const { enterpriseId } = token
    console.log('[log]token',token)

    if(!token.admin){
        return { code : 'custom-auth/not-admin-user'}
    }

    if(!targetUserId || !targetPermission){
        return { code : 'custom-auth/invalid-request'}
    }   

    await updateCustomUserClaims(targetUserId, {
        admin: targetPermission==='admin' ? true : false, 
        accessLevel : targetPermission==='admin'? 9 : 3,
    })
    const userRef = db.collection('enterprises').doc(enterpriseId).collection('users').doc(targetUserId)
    await userRef.set({
        permission: targetPermission==='admin' ? 'admin' : 'member', 
        accessLevel : targetPermission==='admin'? 9 : 3,
    },{merge:true})

    return { code : 'success'}
})

/*
* sendInvitationEmail

Arges:
    targetUserId : the target id 

return:
    success : none
    failure : cause Error
*/
export type TmpImvitationKey = {
    createdDate : Date,
    expiredDate : Date,
    allowedDomain : [string], 
    defaultPermission : 'admin' | 'member',
    accessLevel : number,
    enterpriseId : string,
    enterpriseName : string,
    type : 'sharedUrl' | 'invitationEmail'
    invitedEmail? : string
}

export const sendInvitationEmail = functions.https.onCall( async ( {
    targetEmail, 
    targetPermission,
    expirationLimitHour = 24*3
} : {
    targetEmail : string,
    targetPermission : string,
    expirationLimitHour :number
}, context: functions.https.CallableContext) => {
    const { auth } = context
    if (!auth) {
        return
    }
    console.log('[log]auth',auth)
    const { uid } = auth
    // const { display } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return
    }
    const { enterpriseId } = token
    const { name } = token
    console.log('[log]token',token)

    if(!token.admin){
        return
    }

    const enterpriseRef = db.collection('enterprises').doc(enterpriseId)
    const enterpriseSnap = await enterpriseRef.get()
    const enterpriseData = await enterpriseSnap.data()

    if(!enterpriseData){
        return
    }
    console.log('[log]targetPermission',targetPermission)

    const { allowedDomain, enterpriseName } = enterpriseData

    // create the temporarily key document
    const invitationKeyRef = db.collection(`temporalKeys`).doc('invitation').collection('keys').doc()
    const createdDate = new Date()
    const expiredDate = new Date()
    expiredDate.setHours(expiredDate.getHours() + expirationLimitHour)
    const keyInfo: TmpImvitationKey = {
        createdDate : createdDate,
        expiredDate : expiredDate,
        allowedDomain : allowedDomain, 
        defaultPermission : targetPermission==='admin'? 'admin' : 'member',
        accessLevel : targetPermission==='admin'? 9 : 3,
        invitedEmail : targetEmail,
        enterpriseId : enterpriseId,
        enterpriseName : enterpriseName,
        type : 'invitationEmail'
    }
    await invitationKeyRef.set(keyInfo)

    const invitationLink = `http://bddf4e349713.ngrok.io/invite/${invitationKeyRef.id}`
    console.log('functions.config().sendgrid.api_key',functions.config().sendgrid.api_key)
    console.log('sendgridTemplates',sendgridTemplates['Champ_Invitation_Email'])
    const msg = {
        to: targetEmail, // Change to your recipient
        from: 'support@planck.co.jp', // Change to your verified sender
        templateId: sendgridTemplates['Champ_Invitation_Email'],
        dynamic_template_data: {
            invitee_name: name,
            app_name : "Champ",
            invitation_link: invitationLink
        }
    }

    await sendgrid.send(msg)
    console.log('[log] send email to',targetEmail)
    return 
})


/*
* generateInvitationKey

Arges:
    targetPermission : admin | member
    expirationLimitHour :  

return:
    success : none
    failure : cause Error
*/
export const generateInvitationKey = functions.https.onCall( async ( {
    targetPermission = 'member',
    expirationLimitHour = 24*30*6 // 24 hours * days
} : {
    targetPermission : string,
    expirationLimitHour :number
}, context: functions.https.CallableContext) => {
    const { auth } = context
    if (!auth) {
        return { code : 'custom-auth/invalid-user'}
    }
    console.log('[log]auth',auth)
    const { uid } = auth
    // const { display } = auth
    console.log('[log]uid',uid)

    const { token } = auth
    if (!token) {
        return { code : 'custom-auth/no-auth-token'}
    }
    const { enterpriseId } = token
    console.log('[log]token',token)

    if(!token.admin){
        return { code : 'custom-auth/not-admin-user'}
    }

    const enterpriseRef = db.collection('enterprises').doc(enterpriseId)
    const enterpriseSnap = await enterpriseRef.get()
    const enterpriseData = await enterpriseSnap.data()

    if(!enterpriseData){
        return { code : 'custom-auth/invalid-enterprise'}
    }
    console.log('[log]targetPermission',targetPermission)

    const { allowedDomain, enterpriseName } = enterpriseData

    // create the temporarily key document
    const invitationKeyRef = db.collection(`temporalKeys`).doc('invitation').collection('keys').doc()
    const createdDate = new Date()
    const expiredDate = new Date()
    expiredDate.setHours(expiredDate.getHours() + expirationLimitHour)
    const keyInfo: TmpImvitationKey = {
        createdDate : createdDate,
        expiredDate : expiredDate,
        allowedDomain : allowedDomain, 
        defaultPermission : targetPermission==='admin'? 'admin' : 'member',
        accessLevel : targetPermission==='admin'? 9 : 3,
        enterpriseId : enterpriseId,
        enterpriseName : enterpriseName,
        type : 'sharedUrl'
    }
    await invitationKeyRef.set(keyInfo)

    return { code : 'success'}
})

/*
? functions for connecting zoom
* requestZoomAuthorizationUrl
    This function returns the url with temoporal key to authorize zoom for our app
* initializeZoomAccessToken
    This function is caleed from zoom and request the access token to Zoom official.
    Then storing the access token to firestore under enterprise document that is specified by the temporal key
* scheduledRefleshZoomAccessToken
    This function is called at fixed intervals( currently 25 minutes ).
    Re-request the access token to Zoom official and stores it to firestore.
* refleshZoomAccessToken
    This function is called by https request
    Re-request the access token to Zoom official and stores it to firestore.
* zoomRecordingHandler
    This function is called from Zoom after recording is finished
* zoomMeetingHandler
    This function is called from Zoom after meeting is reserved
*/

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

    console.log('functions.config()',functions.config())
    const { domain } = functions.config().app
    console.log(`[log]domain ${domain}`)

    if (!state || !code) {
        res.status(302).redirect(`${domain}?authorizeZoom=invalidAccessToken`)
        return
    }

    console.log("[log]state", state, "code", code)
    const tmpKeyRef = db.collection('temporalKeys').doc('zoom').collection('keys').doc(String(state))
    const tmpKeySnap = await tmpKeyRef.get()
    const tmpKeyData = await tmpKeySnap.data()

    // アクセスkeyがない場合
    if(!tmpKeyData){
        res.status(302).redirect(`${domain}?authorizeZoom=invalidAccessToken`)
        return
    }

    const { enterpriseId, expiredDate, userId } = tmpKeyData
    console.log("[log]tmpKey info", expiredDate, expiredDate.toDate() , "enterpriseId", enterpriseId, "userId",userId)

    // keyの有効性チェック
    if(new Date > expiredDate.toDate()) {
        console.log('[log] invalidAccessToken : expired ',new Date > expiredDate.toDate())
        res.status(302).redirect(`${domain}?authorizeZoom=invalidAccessToken`)
        return
    }    

    const defaultZoomAppSnap = await db.collection('externalConfigs').doc('defaultZoomApp').get()
    const defaultZoomAppDate = defaultZoomAppSnap.data()
    if(!defaultZoomAppDate){
        res.status(302).redirect(`${domain}?authorizeZoom=internalError`)
        return
    }

    const {appName} = defaultZoomAppDate
    const zoomAppSnap = await db.collection('externalConnections').doc('zoom').collection('apps').doc(appName).get()
    const zoomAppData = zoomAppSnap.data()
    if(!zoomAppData){
        res.status(302).redirect(`${domain}?authorizeZoom=internalError`)
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
            res.status(302).redirect(`${domain}?authorizeZoom=internalError`)
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
        res.status(302).redirect(`${domain}?authorizeZoom=internalError`)  
        return
    })

    res.status(302).redirect(`${domain}?authorizeZoom=success`)
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