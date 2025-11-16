export interface XSSModule {
  name: string;
  description: string;
  execute: (send: (data: any) => void) => void;
  handleResult: (log: (message: string, type?: string) => void, data: any) => void;
}

export interface Session {
  id: string;
  origin: string;
  adminSocketId?: string;
  clientSocketId?: string;
}

export interface ProxyRequest {
  url: string;
  headers: Record<string, string>;
  method: string;
  body: string;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface SocketMessage {
  type: string;
  [key: string]: any;
}

export interface EvalMessage extends SocketMessage {
  type: 'eval';
  code: string;
  id: string;
}

export interface ResponseMessage extends SocketMessage {
  type: 'response';
  id: string;
  response: ProxyResponse;
}

export interface PingMessage extends SocketMessage {
  type: 'ping';
}

export interface PongMessage extends SocketMessage {
  type: 'pong';
}