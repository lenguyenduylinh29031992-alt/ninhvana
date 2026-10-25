import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Thin façade over the Socket.IO server so domain services can push events
 * without depending on the gateway implementation.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  emitToProperty(propertyId: string, event: string, payload: unknown): void {
    this.server?.to(`property:${propertyId}`).emit(event, payload);
  }

  emitToOrg(orgId: string, event: string, payload: unknown): void {
    this.server?.to(`org:${orgId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  get connected(): boolean {
    return Boolean(this.server);
  }

  log(event: string): void {
    this.logger.debug(`emit ${event}`);
  }
}
