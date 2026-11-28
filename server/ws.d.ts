declare module 'ws' {
  import type { IncomingMessage } from 'http';
  import type { Duplex } from 'stream';
  import type { EventEmitter } from 'events';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly readyState: number;
    send(data: string | Buffer | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: { noServer?: boolean; path?: string });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      upgradeHead: Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void
    ): void;
    on(
      event: 'connection',
      listener: (ws: WebSocket, request: IncomingMessage) => void
    ): this;
  }
}
