import { io, Socket } from 'socket.io-client';
import { SocketMessage } from '../types/index.js';

export abstract class CommunicationChannel {
  protected socket: Socket;
  protected sessionId?: string;
  protected adminKey?: string;

  constructor(serverUrl: string, sessionId?: string, adminKey?: string) {
    this.sessionId = sessionId;
    this.adminKey = adminKey;
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', this.onConnect.bind(this));
    this.socket.on('disconnect', this.onDisconnect.bind(this));
    this.socket.on('message', this.onMessage.bind(this));
    this.socket.on('error', this.onError.bind(this));
  }

  protected onConnect(): void {
    console.log('Socket connected');
  }

  protected onDisconnect(): void {
    console.log('Socket disconnected');
  }

  protected onError(error: any): void {
    console.error('Socket error:', error);
  }

  protected abstract onMessage(message: SocketMessage): void;

  protected send(message: SocketMessage): void {
    this.socket.emit('message', message);
  }

  public disconnect(): void {
    this.socket.disconnect();
  }
}