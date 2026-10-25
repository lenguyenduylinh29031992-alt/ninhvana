import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import {
  COOKIE_NAMES,
  changePasswordSchema,
  loginSchema,
  mfaVerifySchema,
  totpCodeSchema,
  twoFactorDisableSchema,
  updateProfileSchema,
  type LoginInput,
} from '@grand-suite/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { cookieOptions } from '../../common/auth/cookies';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { AuthService, type SessionTokens } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password, body.totpCode, this.meta(request));
    if (result.twoFactorRequired) {
      return {
        twoFactorRequired: true,
        mfaToken: result.mfaToken,
        expiresAt: result.expiresAt,
      };
    }
    this.setSessionCookies(response, result.tokens);
    return {
      twoFactorRequired: false,
      user: result.user,
      accessTokenExpiresAt: result.tokens.accessExpiresAt,
      csrfToken: result.tokens.csrfToken,
    };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: { mfaToken: string; code: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.verifyMfa(body.mfaToken, body.code, this.meta(request));
    this.setSessionCookies(response, result.tokens);
    return {
      twoFactorRequired: false,
      user: result.user,
      accessTokenExpiresAt: result.tokens.accessExpiresAt,
      csrfToken: result.tokens.csrfToken,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[COOKIE_NAMES.REFRESH] as string | undefined;
    const result = await this.auth.refresh(token, this.meta(request));
    this.setSessionCookies(response, result.tokens);
    return {
      user: result.user,
      accessTokenExpiresAt: result.tokens.accessExpiresAt,
      csrfToken: result.tokens.csrfToken,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout({
      id: user.id,
      sid: user.sid,
      orgId: user.orgId,
      fullName: user.fullName,
    });
    this.clearSessionCookies(response);
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema))
    body: { fullName?: string; phone?: string; locale?: 'vi' | 'en'; avatarUrl?: string | null },
  ) {
    return this.auth.updateProfile(user.id, body);
  }

  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    this.clearSessionCookies(response);
    return { success: true, reauthRequired: true };
  }

  @Post('2fa/setup')
  @HttpCode(200)
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.auth.setupTwoFactor(user.id);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(totpCodeSchema)) body: { code: string },
  ) {
    return this.auth.enableTwoFactor(user.id, body.code);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(twoFactorDisableSchema)) body: { code: string; password: string },
  ) {
    return this.auth.disableTwoFactor(user.id, body.code, body.password);
  }

  /** Exposes nothing sensitive; used by the web app to know it must refresh. */
  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    const token = crypto.randomUUID().replace(/-/g, '');
    response.cookie(COOKIE_NAMES.CSRF, token, cookieOptions(this.config, 'csrf'));
    return { csrfToken: token };
  }

  private setSessionCookies(response: Response, tokens: SessionTokens): void {
    response.cookie(COOKIE_NAMES.ACCESS, tokens.accessToken, cookieOptions(this.config, 'access'));
    response.cookie(COOKIE_NAMES.REFRESH, tokens.refreshToken, cookieOptions(this.config, 'refresh'));
    response.cookie(COOKIE_NAMES.CSRF, tokens.csrfToken, cookieOptions(this.config, 'csrf'));
  }

  private clearSessionCookies(response: Response): void {
    for (const kind of ['access', 'refresh', 'csrf'] as const) {
      const options = cookieOptions(this.config, kind);
      response.clearCookie(
        kind === 'access' ? COOKIE_NAMES.ACCESS : kind === 'refresh' ? COOKIE_NAMES.REFRESH : COOKIE_NAMES.CSRF,
        { ...options, maxAge: undefined },
      );
    }
  }

  private meta(request: Request): { ip?: string; userAgent?: string } {
    return {
      ip: request.ip,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    };
  }
}
