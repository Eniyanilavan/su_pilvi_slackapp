const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const {
    Pool
} = require('pg');

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
    database: "postgres",
    host: "localhost",
    password: "Eniyan007!",
    port: "5432",
});

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
        if(action.callback_id === "error"){
            var text = "Hey <@" + action.user.id + "> here is the next 10 error logs from your instance";
            var logs = await pool.query(`select * from logs where message like 'Error' offset ${offset} limit 10`);
            // console.log(logs.rows);
            attachments = [];
            for (var index = 0; index < logs.rows.length; index++) {
                var log = logs.rows[index];
                var attachment = {
                    title: "Source : "+log.source_name,
                    fields: [{
                            title: "Event Category",
                            value: log.category,
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
                callback_id: "error",
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
        else if(action.callback_id === "log"){
            var text = "Hey <@" + action.user.id + "> here is the next 10 logs from your instance";
            var logs = await pool.query(`select * from logs offset ${offset} limit 10`);
            // console.log(logs.rows);
            attachments = [];
            for (var index = 0; index < logs.rows.length; index++) {
                var log = logs.rows[index];
                var attachment = {
                    title: "Source : "+log.source_name,
                    fields: [{
                            title: "Event Category",
                            value: log.category,
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
                callback_id: "error",
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
                            if (event.channel_type === 'im') {
                                if (message === 'hi') {
                                    text = "Hi <@" + event.user + ">";
                                    attachments = [{
                                        text: "I could help you in monitoring your cloud resources",
                                        colur: "good",
                                    }]
                                } 
                                else if (message === 'show error logs') {
                                    text = "Hey <@" + event.user + "> here is the error logs from your instance";
                                    var logs = await pool.query("select * from logs where message like 'Error' offset 0 limit 10");
                                    // console.log(logs.rows);
                                    attachments = [];
                                    for (var index = 0; index < logs.rows.length; index++) {
                                        var log = logs.rows[index];
                                        var attachment = {
                                            title: "Source : "+log.source_name,
                                            fields: [{
                                                    title: "Event Category",
                                                    value: log.category,
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
                                        callback_id: "error",
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
                                else if (message === 'show logs') {
                                    text = "Hey <@" + event.user + "> here is the logs from your instance";
                                    pool.connect();
                                    var logs = await pool.query("select * from logs offset 0 limit 10");
                                    // console.log(logs.rows);
                                    attachments = [];
                                    for (var index = 0; index < logs.rows.length; index++) {
                                        var log = logs.rows[index];
                                        var attachment = {
                                            title: "Source : "+log.source_name,
                                            fields: [{
                                                    title: "Event Category",
                                                    value: log.category,
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
                                                    short: true
                                                },
                                                {
                                                    title: "Log Type",
                                                    value: log.message,
                                                    short: true
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
                                        callback_id: "log",
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
                            } else if (!event.channel_type) {
                                if (message.includes(' hi')) {
                                    text = "Hi <@" + event.user + ">";
                                    attachments = [{
                                        text: "I could help you in monitoring your cloud resources",
                                        colur: "good",
                                    }]
                                }
                                else if (message.includes(' show error logs')) {
                                    text = "Hey <@" + event.user + "> here is the error logs from your instance";
                                    var logs = await pool.query("select * from logs where message like 'Error' offset 0 limit 10");
                                    // console.log(logs.rows);
                                    attachments = [];
                                    for (var index = 0; index < logs.rows.length; index++) {
                                        var log = logs.rows[index];
                                        var attachment = {
                                            title: "Source : "+log.source_name,
                                            fields: [{
                                                    title: "Event Category",
                                                    value: log.category,
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
                                        callback_id: "error",
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
                                else if (message.includes(' show logs')) {
                                    text = "Hey <@" + event.user + "> here is the logs from your instance";
                                    pool.connect();
                                    var logs = await pool.query("select * from logs offset 0 limit 10");
                                    // console.log(logs.rows);
                                    attachments = [];
                                    for (var index = 0; index < logs.rows.length; index++) {
                                        var log = logs.rows[index];
                                        var attachment = {
                                            title: "Source : "+log.source_name,
                                            fields: [{
                                                    title: "Event Category",
                                                    value: log.category,
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
                                                    short: true
                                                },
                                                {
                                                    title: "Log Type",
                                                    value: log.message,
                                                    short: true
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
                                        callback_id: "log",
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
                            }
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
                        })
                        .catch(e => {
                            client.release()
                            console.log(e.stack)
                        })
                })
                .catch(err => {

                });
        }
    }
});

app.listen(3000, () => {
    console.log("listening")
});