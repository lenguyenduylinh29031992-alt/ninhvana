import { Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@ApiTags('realtime')
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Short-lived, single-purpose token for the WebSocket handshake.
   * The httpOnly access cookie cannot be read by the browser, and the API may
   * live on a different port, so the socket authenticates with this ticket.
   */
  @Post('ticket')
  async ticket(@CurrentUser() user: AuthUser) {
    const token = await this.jwt.signAsync(
      {
        userId: user.id,
        orgId: user.orgId,
        roles: user.roles.map((role) => ({ p: role.propertyId, r: role.roleCode })),
        typ: 'ws',
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: 120,
      },
    );
    return { token, expiresIn: 120 };
  }
}
