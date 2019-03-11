const express = require('express');
const bodyParser = require('body-parser');
var WebSocket = require('websocket').client;
const request = require('request');
const {
    Pool
} = require('pg');

var ws_connections = {};

const app = express();

const clientId = process.env.SLACK_CLIENT_ID;
const clientSecret = process.env.SLACK_CLIENT_SECRET;

const colors = {
    "Error" : "danger",
    "Information" : "#38e000",
    "Warning" : "#ffff00"
}

const pool = new Pool({
    user: "postgres",
    database: "slack_app",
    host: "localhost",
    password: "Eniyan007!",
    port: "5432",
});

const pool1 = new Pool({
    user: "postgres",
    database: "su_pilvi",
    host: "localhost",
    password: "Eniyan007!",
    port: "5432",
});

const reply = (text,event,attachments,access_token)=>{
    request({
        "url": "https://slack.com/api/chat.postMessage",
        method: "POST",
        body: JSON.stringify({
            "text": text,
            "channel": event.channel,
            "attachments": attachments
        }),
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + access_token
        }
    }, (err, res, body) => {
        // console.log("inside");
        if (err) {
            console.log('err');
        } else {
            // console.log(body);
        }
    })
}

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err)
    process.exit(-1)
});

app.use(bodyParser());

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
})

app.get("/oauth/callback", (req, res) => {
    // console.log(req.query.code);

    //request for the access token.
    request({
        url: 'https://slack.com/api/oauth.access', //URL to hit
        qs: {
            code: req.query.code,
            client_id: clientId,
            client_secret: clientSecret
        }, //Query string data
        method: 'GET',

    }, async function (error, response, body) {
        if (error) {
            console.log(error);
        } else {
            body = JSON.parse(body);

            // console.log(body);

            // response is sent
            res.send("<html>thank you for installing</html>");

            //User Access is stored in db
            await pool.connect()
                .then(client => {
                    return client.query('insert into user_acc_token values($1,$2,$3)', [body.user_id, body.access_token, body.team_id])
                        .then(res => {
                            client.release()
                            // console.log(res.rows[0])
                        })
                        .catch(e => {
                            client.release()
                            if (e.message.indexOf("duplicate key value violates unique constrain") != -1) {
                                client.query('update user_acc_token set access_token = $1 where userid like $2', [body.access_token, body.user_id]);
                                // console.log("update");

                            } else {
                                // console.log(e.message);
                            }
                        })
                })

            //bot access token is stored in ythe db
            await pool.connect()
                .then(client => {
                    return client.query('insert into user_acc_token values($1,$2,$3)', [body.bot.bot_user_id, body.bot.bot_access_token, body.team_id])
                        .then(res => {
                            client.release()
                            // console.log(res.rows[0])
                        })
                        .catch(e => {
                            client.release()
                            if (e.message.indexOf("duplicate key value violates unique constrain") != -1) {
                                client.query('update user_acc_token set access_token = $1 where userid like $2', [body.bot.bot_access_token, body.bot.bot_user_id]);
                                // console.log("update");
                            } else {
                                console.log(e.message);
                            }
                        })
                })
        }
    })
});

app.post("/actions", async (req, res) => {
    attachments = [];
    action = JSON.parse(req.body.payload);
    // console.log(action.type);
    if (action.type === "interactive_message") {
        var previous_mess = action.original_message;
        var offset = (parseInt(action.actions[0].value))+10;
        pool.connect();
        var split = action.callback_id.split(":");
        var id = split[0];
        var db = split[1].replace(/[\-\.@\^]/g,"_");
        var instance = split[2];
        var date_qr = split[3];
        var pool_action = new Pool({
            user: "postgres",
            database: db,
            host: "localhost",
            password: "Eniyan007!",
            port: "5432",
        });
        if(id === "error"){
            var text = "Hey <@" + action.user.id + "> here is the next 10 error logs from your instance";
            var logs = await pool_action.query(`select * from ${instance} where message like 'Error' offset ${offset} limit 10`);
            if(logs.rowCount === 0){
                text = "Hey <@" + action.user.id + ">";
                attachments = [{
                    text: "I could not find any log in your system",
                    color: "danger",
                }]
            }
            else{
                attachments = [];
                for (var index = 0; index < logs.rows.length; index++) {
                    var log = logs.rows[index];
                    var attachment = {
                        title: "Source : "+log.source_name,
                        fields: [{
                                title: "Event Category",
                                value: log.message,
                                short: true
                            },
                            {
                                title: "Event Code",
                                value: log.event_code,
                                short: true
                            },
                            {
                                title: "Log File",
                                value: log.log_file,
                                short: false
                            },
                            {
                                title: "Log Message",
                                value: log.type
                            }
                        ],
                        color: "danger"
                    }
                    attachments.push(attachment);
                }
                var attachment = {
                    title: "",
                    callback_id: "error:${db}:${instance}:${date_qr}",
                    actions:[
                        {
                            name : "next",
                            text : `Next ${offset} - ${offset+10} Logs`,
                            type   : "button",
                            value  : offset
                        }
                    ],
                    color: "good"
                }
                attachments.push(attachment);
            }
        }
        else if(id === "log"){
            var text = "Hey <@" + action.user.id + "> here is the next 10 logs from your instance";
            var logs = await pool_action.query(`select * from ${instance} offset ${offset} limit 10`);
            if(logs.rowCount === 0){
                text = "Hey <@" + action.user.id + ">";
                attachments = [{
                    text: "I could not find any log in your system",
                    color: "danger",
                }]
            }
            else{
                attachments = [];
                for (var index = 0; index < logs.rows.length; index++) {
                    var log = logs.rows[index];
                    var attachment = {
                        title: "Source : "+log.source_name,
                        fields: [{
                                title: "Event Category",
                                value: log.message,
                                short: true
                            },
                            {
                                title: "Event Code",
                                value: log.event_code,
                                short: true
                            },
                            {
                                title: "Log File",
                                value: log.log_file,
                                short: false
                            },
                            {
                                title: "Log Message",
                                value: log.type
                            }
                        ],
                        color: colors[log.message]
                    }
                    attachments.push(attachment);
                }
                var attachment = {
                    title: "",
                    callback_id: `log:${db}:${instance}:${date_qr}`,
                    actions:[
                        {
                            name : "next",
                            text : `Next ${offset} - ${offset+10} Logs`,
                            type   : "button",
                            value  : offset
                        }
                    ],
                    color: "good"
                }
                attachments.push(attachment);
            }
        }
        return res.status(200).send(({
            "text":previous_mess.text,
            "attachments":attachments
        }));
    } else if (action.type === "message_action") {

    }
})


app.use((req, res, next) => {
    if (req.body.token === process.env.verification_token) {
        next();
    } else {
        res.status(403).send();
    }
})

var attachments = [];

app.post("/slack", async (req, res) => {
    if (req.body.type === "url_verification") {
        res.status(200).send({
            "challenge": req.body.challenge
        });
    } else {
        attachments = [];
        res.status(200).send();
        var event = req.body.event;
        if (event.type === "message" || event.type === "app_mention") {
            if (event.subtype === 'bot_message' || event.subtype === 'message_changed' || event.subtype === 'bot_add') {
                return;
            }
            await pool.connect()
                .then(async client => {
                    await client.query("select access_token from user_acc_token where userid like '" + req.body.authed_users[0] + "'")
                        .then(async res => {
                            client.release()
                            // console.log(res.rows[0])
                            access_token = res.rows[0].access_token;
                            message = event.text;
                            var text = "";
                            if(ws_connections[event.user]){
                                return;
                            }
                            if (event.channel_type === 'im') {
                                if (message === 'hi') {
                                    text = "Hi <@" + event.user + ">";
                                    attachments = [{
                                        text: "I could help you in monitoring your cloud resources. Say config to configure your account.",
                                        color: "good",
                                    }]
                                }
                                else if(message === "config"){
                                    text = "Hi <@" + event.user + ">";
                                    ws_connections[event.user] = {};
                                    attachments = [{
                                        text: "Say your email id to config",
                                        color: "good",
                                    }]
                                    request({
                                        url:"https://slack.com/api/rtm.connect",
                                        qs:{
                                            token:access_token,
                                        },
                                        method:"GET"
                                    },(err,res,body)=>{
                                        body = JSON.parse(body);
                                        // console.log(body.url);
                                        var ws = new WebSocket();
                                        ws.on('connect',(connection)=>{
                                            console.log("connected");
                                            connection.on('message',async (data)=>{
                                               var ws_event = JSON.parse(data.utf8Data);
                                               if(ws_event.type === "message" && ws_event.subtype !== "bot_message"){
                                                   if(ws_event.text.includes("<mailto:")){
                                                        ws_connections[ws_event.user].email = ws_event.text.split('|')[1].split('>')[0];
                                                        text = "Enter your password to verify.";
                                                        var attachment = [];
                                                        reply(text,event,attachment,access_token);
                                                   }
                                                   else{
                                                       if(ws_event.text === "cancel"){
                                                            text = "Exit from config";
                                                            var attachment = []; 
                                                            connection.close();
                                                            delete ws_connections[ws_event.user];
                                                            reply(text,event,attachment,access_token);
                                                       }
                                                        else if(ws_connections[ws_event.user].email){
                                                            ws_connections[ws_event.user].pass = ws_event.text;
                                                            var client = await pool1.connect();
                                                            await client.query('SELECT password FROM user_login WHERE email = $1',[ws_connections[ws_event.user].email])
                                                            .then(async (rows)=>{
                                                                if(rows.rowCount === 0){
                                                                    text = "No user found.";
                                                                    var attachment = [{
                                                                        text:"Signup in Su Pilvi and continue to configure.",
                                                                        color:"danger"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                else if(rows.rows[0].password === ws_event.text){
                                                                    var client1 = await pool.connect();
                                                                    await client1.query(`UPDATE user_acc_token SET email=$1 WHERE userid = $2`,[ws_connections[ws_event.user].email,req.body.authed_users[0]]);
                                                                    text = "Config successful.";
                                                                    var attachment = [{
                                                                        text:"Try saying show logs or show error logs.",
                                                                        color:"good"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                else{
                                                                    text = "Wrong Password";
                                                                    var attachment = [{
                                                                        text:"Try again.",
                                                                        color:"danger"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                delete ws_connections[ws_event.user];
                                                                reply(text,event,attachment,access_token);
                                                            })
                                                            client.release();
                                                        }
                                                        else{
                                                            text = "Enter your mail id first.";
                                                            var attachment = [];
                                                            reply(text,event,attachment,access_token);
                                                        }
                                                   }
                                               }
                                            })
                                        })
                                        ws.on('connectFailed',(err)=>{
                                            console.log(err);
                                        })
                                        ws.connect(body.url);
                                    })
                                } 
                                else if (message.includes('show error logs')) {
                                    if(!message.includes('of')){
                                        text = "Hey <@" + event.user + ">";
                                        attachments = [{
                                            text: "No instance specified",
                                            color: "danger",
                                        },{

                                            text: "Please specify a instance",
                                            color: "good",
                                        }]
                                    }
                                    else{
                                        var date_qr = ``;
                                        if(message.includes("from")){
                                            var date = message.split("from ")[1];
                                            date = new Date(date);
                                            date = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2)
                                            date_qr = `AND date>${date}`;
                                        }
                                        var instance = message.split("of ")[1];
                                        instance = instance.replace(/[\-\.@\^]/g,"_");
                                        text = "Hey <@" + event.user + "> here is the error logs from your instance";
                                        attachments = [];
                                        await pool.query(`select email from user_acc_token where userid=$1`,[req.body.authed_users[0]])
                                        .then(async rows=>{
                                            var db = rows.rows[0].email;
                                            var log_pool = new Pool({
                                                database:db.replace(/[\.@\^]/g,"_"),
                                                port:"5432",
                                                user:"postgres",
                                                password:"Eniyan007!"
                                            })
                                            var log_client = await log_pool.connect();
                                            var logs = await log_client.query(`SELECT * FROM ${instance} where message like 'Error'${date_qr} offset 0 limit 10`);
                                            if(logs.rowCount === 0){
                                                text = "Hey <@" + event.user + ">";
                                                attachments = [{
                                                    text: "I could not find any error log in your system",
                                                    color: "danger",
                                                }]
                                            }
                                            else{
                                                for (var index = 0; index < logs.rows.length; index++) {
                                                    var log = logs.rows[index];
                                                    var attachment = {
                                                        title: "Source : "+log.source_name,
                                                        fields: [{
                                                                title: "Event Category",
                                                                value: log.message,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Event Code",
                                                                value: log.event_code,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Log File",
                                                                value: log.log_file,
                                                                short: false
                                                            },
                                                            {
                                                                title: "Log Message",
                                                                value: log.type
                                                            }
                                                        ],
                                                        color: "danger"
                                                    }
                                                    attachments.push(attachment);
                                                }
                                                var attachment = {
                                                    title: "",
                                                    callback_id: `error:${db}:${instance}:${date_qr}`,
                                                    actions:[
                                                        {
                                                            name : "next",
                                                            text : "Next 10 Logs",
                                                            type   : "button",
                                                            value  : 10
                                                        }
                                                    ],
                                                    color: "good"
                                                }
                                                attachments.push(attachment);
                                            }
                                            log_client.release();
                                        })
                                    }
                                    // console.log(logs.rows);
                                }
                                else if (message.includes('show logs')) {
                                    if(!message.includes('of')){
                                        text = "Hey <@" + event.user + ">";
                                        attachments = [{
                                            text: "No instance specified",
                                            color: "danger",
                                        },{

                                            text: "Please specify a instance",
                                            color: "good",
                                        }]
                                    }
                                    else{
                                        var date_qr = ``;
                                        var instance;
                                        if(message.includes("from")){
                                            var date = message.split("from ")[1];
                                            date = new Date(date);
                                            console.log(date.getMonth());
                                            date = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2)
                                            date_qr = `WHERE date >= '${date}'`;
                                            instance = message.split("of ")[1].split(" ")[0];
                                        }
                                        else{
                                            instance = message.split("of ")[1];                                            
                                        }
                                        instance = instance.replace(/[\-\.@\^]/g,"_");
                                        console.log(instance);
                                        text = "Hey <@" + event.user + "> here is the logs from your instance";
                                        pool.connect();
                                        attachments = [];
                                        await pool.query(`select email from user_acc_token where userid=$1`,[req.body.authed_users[0]])
                                        .then(async rows=>{
                                            var db = rows.rows[0].email;
                                            var log_pool = new Pool({
                                                database:db.replace(/[\.@\^]/g,"_"),
                                                port:"5432",
                                                user:"postgres",
                                                password:"Eniyan007!"
                                            })
                                            var log_client = await log_pool.connect();
                                            var logs = await log_client.query(`SELECT * FROM ${instance} ${date_qr} offset 0 limit 10`);
                                            if(logs.rowCount === 0){
                                                text = "Hey <@" + event.user + ">";
                                                attachments = [{
                                                    text: "I could not find any log in your system",
                                                    color: "danger",
                                                }]
                                            }
                                            else{
                                                for (var index = 0; index < logs.rows.length; index++) {
                                                    var log = logs.rows[index];
                                                    var attachment = {
                                                        title: "Source : "+log.source_name,
                                                        fields: [{
                                                                title: "Event Category",
                                                                value: log.message,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Event Code",
                                                                value: log.event_code,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Log File",
                                                                value: log.log_file,
                                                                short: false
                                                            },
                                                            {
                                                                title: "Log Message",
                                                                value: log.type
                                                            }
                                                        ],
                                                        color: colors[log.message]
                                                    }
                                                    attachments.push(attachment);
                                                }
                                                var attachment = {
                                                    title: "",
                                                    callback_id: `log:${db}:${instance}:${date_qr}`,
                                                    actions:[
                                                        {
                                                            name : "next",
                                                            text : "Next 10 Logs",
                                                            type   : "button",
                                                            value  : 10
                                                        }
                                                    ],
                                                    color: "good"
                                                }
                                                attachments.push(attachment);
                                            }
                                            log_client.release();
                                        })
                                    }
                                }
                            } 
                            else if (!event.channel_type) {
                                if (message.includes(' hi')) {
                                    text = "Hi <@" + event.user + ">";
                                    attachments = [{
                                        text: "I could help you in monitoring your cloud resources",
                                        color: "good",
                                    }]
                                }
                                else if(message.includes(" config")){
                                    text = "Hi <@" + event.user + ">";
                                    ws_connections[event.user] = {};
                                    attachments = [{
                                        text: "Say your email id to config",
                                        color: "good",
                                    }]
                                    request({
                                        url:"https://slack.com/api/rtm.connect",
                                        qs:{
                                            token:access_token,
                                        },
                                        method:"GET"
                                    },(err,res,body)=>{
                                        body = JSON.parse(body);
                                        // console.log(body.url);
                                        var ws = new WebSocket();
                                        ws.on('connect',(connection)=>{
                                            console.log("connected");
                                            connection.on('message',async (data)=>{
                                               var ws_event = JSON.parse(data.utf8Data);
                                               if(ws_event.type === "message" && ws_event.subtype !== "bot_message"){
                                                   if(ws_event.text.includes("<mailto:")){
                                                        ws_connections[ws_event.user].email = ws_event.text.split('|')[1].split('>')[0];
                                                        text = "Enter your password to verify.";
                                                        var attachment = [];
                                                        reply(text,event,attachment,access_token);
                                                   }
                                                   else{
                                                       if(ws_event.text === "cancel"){
                                                            text = "Exit from config";
                                                            var attachment = []; 
                                                            connection.close();
                                                            delete ws_connections[ws_event.user];
                                                            reply(text,event,attachment,access_token);
                                                       }
                                                        else if(ws_connections[ws_event.user].email){
                                                            ws_connections[ws_event.user].pass = ws_event.text;
                                                            var client = await pool1.connect();
                                                            await client.query('SELECT password FROM user_login WHERE email = $1',[ws_connections[ws_event.user].email])
                                                            .then(async (rows)=>{
                                                                if(rows.rowCount === 0){
                                                                    text = "No user found.";
                                                                    var attachment = [{
                                                                        text:"Signup in Su Pilvi and continue to configure.",
                                                                        color:"danger"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                else if(rows.rows[0].password === ws_event.text){
                                                                    var client1 = await pool.connect();
                                                                    await client1.query(`UPDATE user_acc_token SET email=$1 WHERE userid = $2`,[ws_connections[ws_event.user].email,req.body.authed_users[0]]);
                                                                    text = "Config successful.";
                                                                    var attachment = [{
                                                                        text:"Try saying show logs or show error logs.",
                                                                        color:"good"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                else{
                                                                    text = "Wrong Password";
                                                                    var attachment = [{
                                                                        text:"Try again.",
                                                                        color:"danger"
                                                                    }];
                                                                    connection.close();
                                                                }
                                                                delete ws_connections[ws_event.user];
                                                                reply(text,event,attachment,access_token);
                                                            })
                                                            client.release();
                                                        }
                                                        else{
                                                            text = "Enter your mail id first.";
                                                            var attachment = [];
                                                            reply(text,event,attachment,access_token);
                                                        }
                                                   }
                                               }
                                            })
                                        })
                                        ws.on('connectFailed',(err)=>{
                                            console.log(err);
                                        })
                                        ws.connect(body.url);
                                    })
                                } 
                                else if (message.includes(' show error logs')) {
                                    if(!message.includes('of')){
                                        text = "Hey <@" + event.user + ">";
                                        attachments = [{
                                            text: "No instance specified",
                                            color: "danger",
                                        },{

                                            text: "Please specify a instance",
                                            color: "good",
                                        }]
                                    }
                                    else{
                                        var date_qr = ``;
                                        if(message.includes("from")){
                                            var date = message.split("from ")[1];
                                            date = new Date(date);
                                            date = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2)
                                            date_qr = `AND date>${date}`;
                                        }
                                        var instance = message.split("of ")[1];
                                        instance = instance.replace(/[\-\.@\^]/g,"_");
                                        text = "Hey <@" + event.user + "> here is the error logs from your instance";
                                        attachments = [];
                                        await pool.query(`select email from user_acc_token where userid=$1`,[req.body.authed_users[0]])
                                        .then(async rows=>{
                                            var db = rows.rows[0].email;
                                            var log_pool = new Pool({
                                                database:db.replace(/[\.@\^]/g,"_"),
                                                port:"5432",
                                                user:"postgres",
                                                password:"Eniyan007!"
                                            })
                                            var log_client = await log_pool.connect();
                                            var logs = await log_client.query(`SELECT * FROM ${instance} where message like 'Error'${date_qr} offset 0 limit 10`);
                                            if(logs.rowCount === 0){
                                                text = "Hey <@" + event.user + ">";
                                                attachments = [{
                                                    text: "I could not find any error log in your system",
                                                    color: "danger",
                                                }]
                                            }
                                            else{
                                                for (var index = 0; index < logs.rows.length; index++) {
                                                    var log = logs.rows[index];
                                                    var attachment = {
                                                        title: "Source : "+log.source_name,
                                                        fields: [{
                                                                title: "Event Category",
                                                                value: log.message,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Event Code",
                                                                value: log.event_code,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Log File",
                                                                value: log.log_file,
                                                                short: false
                                                            },
                                                            {
                                                                title: "Log Message",
                                                                value: log.type
                                                            }
                                                        ],
                                                        color: "danger"
                                                    }
                                                    attachments.push(attachment);
                                                }
                                                var attachment = {
                                                    title: "",
                                                    callback_id: `error:${db}:${instance}:${date_qr}`,
                                                    actions:[
                                                        {
                                                            name : "next",
                                                            text : "Next 10 Logs",
                                                            type   : "button",
                                                            value  : 10
                                                        }
                                                    ],
                                                    color: "good"
                                                }
                                                attachments.push(attachment);
                                            }
                                            log_client.release();
                                        })
                                    }
                                    // console.log(logs.rows);
                                }
                                else if (message.includes(' show logs')) {
                                    if(!message.includes('of')){
                                        text = "Hey <@" + event.user + ">";
                                        attachments = [{
                                            text: "No instance specified",
                                            color: "danger",
                                        },{

                                            text: "Please specify a instance",
                                            color: "good",
                                        }]
                                    }
                                    else{
                                        var date_qr = ``;
                                        var instance;
                                        if(message.includes("from")){
                                            var date = message.split("from ")[1];
                                            date = new Date(date);
                                            console.log(date.getMonth());
                                            date = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2)
                                            date_qr = `WHERE date >= '${date}'`;
                                            instance = message.split("of ")[1].split(" ")[0];
                                        }
                                        else{
                                            instance = message.split("of ")[1];                                            
                                        }
                                        instance = instance.replace(/[\-\.@\^]/g,"_");
                                        console.log(instance);
                                        text = "Hey <@" + event.user + "> here is the logs from your instance";
                                        pool.connect();
                                        attachments = [];
                                        await pool.query(`select email from user_acc_token where userid=$1`,[req.body.authed_users[0]])
                                        .then(async rows=>{
                                            var db = rows.rows[0].email;
                                            var log_pool = new Pool({
                                                database:db.replace(/[\.@\^]/g,"_"),
                                                port:"5432",
                                                user:"postgres",
                                                password:"Eniyan007!"
                                            })
                                            var log_client = await log_pool.connect();
                                            var logs = await log_client.query(`SELECT * FROM ${instance} ${date_qr} offset 0 limit 10`);
                                            if(logs.rowCount === 0){
                                                text = "Hey <@" + event.user + ">";
                                                attachments = [{
                                                    text: "I could not find any log in your system",
                                                    color: "danger",
                                                }]
                                            }
                                            else{
                                                for (var index = 0; index < logs.rows.length; index++) {
                                                    var log = logs.rows[index];
                                                    var attachment = {
                                                        title: "Source : "+log.source_name,
                                                        fields: [{
                                                                title: "Event Category",
                                                                value: log.message,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Event Code",
                                                                value: log.event_code,
                                                                short: true
                                                            },
                                                            {
                                                                title: "Log File",
                                                                value: log.log_file,
                                                                short: false
                                                            },
                                                            {
                                                                title: "Log Message",
                                                                value: log.type
                                                            }
                                                        ],
                                                        color: colors[log.message]
                                                    }
                                                    attachments.push(attachment);
                                                }
                                                var attachment = {
                                                    title: "",
                                                    callback_id: `log:${db}:${instance}:${date_qr}`,
                                                    actions:[
                                                        {
                                                            name : "next",
                                                            text : "Next 10 Logs",
                                                            type   : "button",
                                                            value  : 10
                                                        }
                                                    ],
                                                    color: "good"
                                                }
                                                attachments.push(attachment);
                                            }
                                            log_client.release();
                                        })
                                    }
                                }
                            }
                            reply(text,event,attachments,access_token);
                        })
                        .catch(e => {
                            client.release()
                            console.log(e.message);
                            if(e.message.match(/relation "[a-z A-Z _]*" does not exist/g)){
                                text = "Hey <@" + event.user + ">";
                                attachments = [{
                                    text: "There is no such instance you created in Su Pilvi",
                                    color: "good",
                                }]
                                reply(text,event,attachments,access_token);
                            }
                            else if(e.message.match(/database "[a-z A-Z _]*" does not exist/g)){
                                text = "Hey <@" + event.user + ">";
                                attachments = [{
                                    text: "Config your account to access the logs.",
                                    color: "good",
                                }]
                                reply(text,event,attachments,access_token);
                            }
                        })
                })
                .catch(err => {
                    console.log(err.message,"vauva");
                });
        }
    }
});

app.listen(5000, () => {
    console.log("listening")
});