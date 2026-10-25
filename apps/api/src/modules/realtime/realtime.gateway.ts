import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

interface SocketIdentity {
  userId: string;
  orgId: string;
  roles: Array<{ p: string | null; r: string }>;
  typ: 'ws';
}

const allowedOrigins = [
  process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: allowedOrigins, credentials: false },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log('WebSocket gateway sẵn sàng tại /ws');
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const rawToken =
        (client.handshake.auth?.token as string | undefined) ??
        (typeof client.handshake.query.token === 'string' ? client.handshake.query.token : undefined);
      if (!rawToken) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync<SocketIdentity>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.typ !== 'ws' || !payload.orgId) throw new Error('invalid token type');

      client.data.userId = payload.userId;
      client.join(`org:${payload.orgId}`);
      client.join(`user:${payload.userId}`);
      for (const role of payload.roles) {
        if (role.p) client.join(`property:${role.p}`);
      }
      client.emit('realtime.ready', {
        userId: payload.userId,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(`Từ chối kết nối WS: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS ngắt kết nối ${client.id}`);
  }
}
