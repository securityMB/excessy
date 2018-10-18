"use strict";

class CommunicationChannel {
    constructor(origin, sessid, admin='') {
        this.ws = new WebSocket(this.getWebSocketUrl(origin, sessid, admin));
        this.ws.onopen = () => {
            this.sendPing();
            this.ws.onmessage = this.onMessage.bind(this, this.ws);
        };

    }

    getWebSocketUrl(origin, sessid, admin) {
        const a = document.createElement('a');
        a.href = origin;
        a.protocol = 'ws';
        a.pathname = `/ws`;
        a.search = (admin !== '' ? `admin=${admin}` : '');

        return a.href;
    }

    onMessage(ws, ev) {
        // to be overridden
    }

    send(msg) {
        this.ws.send(JSON.stringify(msg));
    }

    sendPing() {
        this.send({type: 'ping'});
    }
}

