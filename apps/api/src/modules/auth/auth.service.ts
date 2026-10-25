import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ERROR_CODES,
  LOGIN_LOCK_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  MFA_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
  ROLE_MAP,
  AppError,
  type SessionUser,
} from '@grand-suite/shared';
import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { AuditService } from '../../common/audit/audit.service';
import { CryptoService } from '../../common/crypto/crypto.module';
import { PrismaService } from '../../common/prisma/prisma.module';
import { hashPassword, verifyPassword } from '../../common/auth/password';
import { AccessService } from '../iam/access.service';
import type { MfaPayload, RefreshPayload } from '../../common/auth/auth.types';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: string;
}

export interface LoginSuccess {
  twoFactorRequired: false;
  user: SessionUser;
  tokens: SessionTokens;
}

export interface LoginChallenge {
  twoFactorRequired: true;
  mfaToken: string;
  expiresAt: string;
}

export type LoginResult = LoginSuccess | LoginChallenge;

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const RECOVERY_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Authentication: password + optional TOTP/recovery code, rotating refresh
 * tokens with reuse detection, and re-computed permissions after rotation.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {
    // Unknown emails still pay the Argon2 cost, keeping response time uniform.
    this.dummyHash = hashPassword('timing-equalizer-not-a-real-password');
    authenticator.options = { window: 1 };
  }

  async login(
    email: string,
    password: string,
    totpCode: string | undefined,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await verifyPassword(await this.dummyHash, password);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, undefined, 401);
    }

    if (!user.isActive) {
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, undefined, 403);
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_LOCKED,
        `Tài khoản tạm khoá đến ${user.lockedUntil.toLocaleTimeString('vi-VN')}`,
        423,
      );
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts, user.orgId, email, meta);
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, undefined, 401);
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (user.twoFactorEnabled) {
      if (!totpCode) {
        const mfaToken = await this.jwt.signAsync(
          { sub: user.id, typ: 'mfa' } satisfies MfaPayload,
          {
            secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
            expiresIn: MFA_TOKEN_TTL_SECONDS,
          },
        );
        await this.audit.record({
          orgId: user.orgId,
          actorId: user.id,
          actorName: user.fullName,
          action: 'auth.mfa_challenge',
          entityType: 'User',
          entityId: user.id,
          metadata: { ip: meta.ip, userAgent: meta.userAgent },
        });
        return {
          twoFactorRequired: true,
          mfaToken,
          expiresAt: new Date(Date.now() + MFA_TOKEN_TTL_SECONDS * 1000).toISOString(),
        };
      }
      await this.verifySecondFactor(user.id, totpCode);
    }

    const session = await this.issueSession(user.id, meta);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      orgId: user.orgId,
      actorId: user.id,
      actorName: user.fullName,
      actorRole: session.user.roles[0]?.roleCode,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        ip: meta.ip,
        userAgent: meta.userAgent,
        orgWide: session.user.orgWide,
        roles: session.user.roles.map((role) => role.roleCode),
      },
    });

    return { twoFactorRequired: false, user: session.user, tokens: session.tokens };
  }

  async verifyMfa(mfaToken: string, code: string, meta: RequestMeta): Promise<LoginSuccess> {
    let payload: MfaPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaPayload>(mfaToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new AppError(ERROR_CODES.MFA_INVALID, 'Phiên xác thực đã hết hạn', 401);
    }
    if (payload.typ !== 'mfa') {
      throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 401);
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, undefined, 403);
    }
    await this.verifySecondFactor(user.id, code);

    const session = await this.issueSession(user.id, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      orgId: user.orgId,
      actorId: user.id,
      actorName: user.fullName,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      metadata: { ip: meta.ip, userAgent: meta.userAgent, method: '2fa' },
    });
    return { twoFactorRequired: false, user: session.user, tokens: session.tokens };
  }

  async refresh(refreshToken: string | undefined, meta: RequestMeta): Promise<LoginSuccess> {
    if (!refreshToken) {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }

    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }
    if (payload.typ !== 'refresh') {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!stored) {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }

    // A rotated token being presented again means the cookie leaked: revoke all.
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      await this.audit.record({
        orgId: (await this.prisma.user.findUnique({ where: { id: stored.userId } }))?.orgId ?? '',
        actorId: stored.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'RefreshToken',
        entityId: stored.id,
        metadata: { ip: meta.ip, userAgent: meta.userAgent },
      });
      throw new AppError(ERROR_CODES.REFRESH_REUSE_DETECTED, undefined, 401);
    }

    if (stored.expiresAt.getTime() < Date.now() || stored.tokenHash !== this.crypto.sha256(refreshToken)) {
      await this.revokeFamily(stored.familyId);
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }

    const snapshot = await this.access.buildAccess(stored.userId);
    const tokens = await this.rotateToken(stored.id, stored.userId, stored.familyId, meta);
    return {
      twoFactorRequired: false,
      user: snapshot.user,
      tokens: { ...tokens, csrfToken: this.crypto.randomToken(24) },
    };
  }

  async logout(user: { id: string; sid: string; orgId: string; fullName: string }): Promise<void> {
    await this.revokeFamily(user.sid);
    await this.audit.record({
      orgId: user.orgId,
      actorId: user.id,
      actorName: user.fullName,
      action: 'auth.logout',
      entityType: 'User',
      entityId: user.id,
    });
  }

  async me(userId: string): Promise<SessionUser> {
    const snapshot = await this.access.buildAccess(userId);
    return snapshot.user;
  }

  async updateProfile(
    userId: string,
    input: { fullName?: string; phone?: string; locale?: 'vi' | 'en'; avatarUrl?: string | null },
  ): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, undefined, 404);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    });
    await this.audit.record({
      orgId: updated.orgId,
      actorId: userId,
      actorName: updated.fullName,
      action: 'auth.profile_updated',
      entityType: 'User',
      entityId: userId,
      before: { fullName: user.fullName, phone: user.phone, locale: user.locale },
      after: { fullName: updated.fullName, phone: updated.phone, locale: updated.locale },
    });
    return this.me(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, undefined, 404);
    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Mật khẩu hiện tại không đúng', 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      orgId: user.orgId,
      actorId: userId,
      actorName: user.fullName,
      action: 'auth.password_changed',
      entityType: 'User',
      entityId: userId,
    });
    return { success: true };
  }

  // ───────────────────────────── 2FA ─────────────────────────────

  async setupTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, undefined, 404);
    if (user.twoFactorEnabled) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Xác thực hai lớp đã được bật', 409);
    }
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: this.crypto.encrypt(secret), twoFactorEnabled: false },
    });
    const otpauthUrl = authenticator.keyuri(user.email, 'Grand Suite', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 260 });
    return { secret, otpauthUrl, qrDataUrl };
  }

  async enableTwoFactor(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, undefined, 404);
    if (user.twoFactorEnabled) {
      throw new AppError(ERROR_CODES.CONFLICT, 'Xác thực hai lớp đã được bật', 409);
    }
    if (!user.twoFactorSecret) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chưa khởi tạo xác thực hai lớp', 409);
    }
    const secret = this.crypto.decrypt(user.twoFactorSecret);
    const step = Math.floor(Date.now() / 30_000);
    if (!authenticator.check(code, secret)) {
      throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 400);
    }

    const recoveryCodes = Array.from({ length: 8 }, () => this.generateRecoveryCode());
    const hashed = recoveryCodes.map((value) => this.crypto.sha256(this.normalizeRecoveryCode(value)));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorRecovery: hashed,
        twoFactorLastStep: step,
      },
    });
    await this.audit.record({
      orgId: user.orgId,
      actorId: userId,
      actorName: user.fullName,
      action: 'auth.2fa_enabled',
      entityType: 'User',
      entityId: userId,
    });
    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, code: string, password: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, undefined, 404);
    if (!user.twoFactorEnabled) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Xác thực hai lớp chưa được bật', 409);
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Mật khẩu không đúng', 400);
    }
    await this.verifySecondFactor(userId, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecovery: Prisma.JsonNull,
        twoFactorLastStep: null,
      },
    });
    await this.audit.record({
      orgId: user.orgId,
      actorId: userId,
      actorName: user.fullName,
      action: 'auth.2fa_disabled',
      entityType: 'User',
      entityId: userId,
    });
    return { success: true };
  }

  // ─────────────────────────── internals ───────────────────────────

  private async issueSession(
    userId: string,
    meta: RequestMeta,
  ): Promise<{ user: SessionUser; tokens: SessionTokens }> {
    const snapshot = await this.access.buildAccess(userId);
    const familyId = randomUUID();
    const csrfToken = this.crypto.randomToken(24);

    const accessToken = await this.jwt.signAsync(
      {
        sub: snapshot.user.id,
        sid: familyId,
        orgId: snapshot.user.orgId,
        email: snapshot.user.email,
        name: snapshot.user.fullName,
        orgWide: snapshot.orgWide,
        roles: snapshot.roles.map((role) => ({ p: role.propertyId, r: role.roleCode })),
        perms: snapshot.permissions,
        typ: 'access',
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = await this.createRefreshToken(userId, familyId, meta);
    return {
      user: snapshot.user,
      tokens: {
        accessToken,
        refreshToken,
        csrfToken,
        accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
      },
    };
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<string> {
    const jti = randomUUID();
    const token = await this.jwt.signAsync(
      { sub: userId, sid: familyId, jti, typ: 'refresh' } satisfies RefreshPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      },
    );
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: this.crypto.sha256(token),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 400),
      },
    });
    return token;
  }

  private async rotateToken(
    oldId: string,
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<SessionTokens> {
    const newJti = randomUUID();
    const token = await this.jwt.signAsync(
      { sub: userId, sid: familyId, jti: newJti, typ: 'refresh' } satisfies RefreshPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      },
    );
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          id: newJti,
          userId,
          tokenHash: this.crypto.sha256(token),
          familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 400),
        },
      }),
      this.prisma.refreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date(), replacedByTokenId: newJti },
      }),
    ]);

    const snapshot = await this.access.buildAccess(userId);
    const accessToken = await this.jwt.signAsync(
      {
        sub: snapshot.user.id,
        sid: familyId,
        orgId: snapshot.user.orgId,
        email: snapshot.user.email,
        name: snapshot.user.fullName,
        orgWide: snapshot.orgWide,
        roles: snapshot.roles.map((role) => ({ p: role.propertyId, r: role.roleCode })),
        perms: snapshot.permissions,
        typ: 'access',
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      refreshToken: token,
      csrfToken: this.crypto.randomToken(24),
      accessExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
    orgId: string,
    email: string,
    meta: RequestMeta,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const lock = attempts >= MAX_LOGIN_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: lock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
      },
    });
    await this.audit.record({
      orgId,
      actorId: userId,
      actorName: email,
      action: lock ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'User',
      entityId: userId,
      metadata: { attempts, ip: meta.ip, userAgent: meta.userAgent },
    });
  }

  private async verifySecondFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 400);
    }

    const normalized = code.trim().toUpperCase();
    if (RECOVERY_CODE_REGEX.test(normalized)) {
      const hashes = Array.isArray(user.twoFactorRecovery)
        ? (user.twoFactorRecovery as string[])
        : [];
      const hash = this.crypto.sha256(this.normalizeRecoveryCode(normalized));
      const index = hashes.findIndex((candidate) => this.crypto.safeEqual(candidate, hash));
      if (index === -1) throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 401);
      const remaining = hashes.filter((_, position) => position !== index);
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorRecovery: remaining },
      });
      return;
    }

    if (!/^\d{6}$/.test(normalized)) {
      throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 401);
    }
    const secret = this.crypto.decrypt(user.twoFactorSecret);
    const step = Math.floor(Date.now() / 30_000);
    if (user.twoFactorLastStep && step <= user.twoFactorLastStep) {
      throw new AppError(ERROR_CODES.MFA_INVALID, 'Mã đã được sử dụng, vui lòng chờ mã mới', 401);
    }
    if (!authenticator.check(normalized, secret)) {
      throw new AppError(ERROR_CODES.MFA_INVALID, undefined, 401);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorLastStep: step },
    });
  }

  private generateRecoveryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let value = '';
    for (let index = 0; index < 8; index += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `${value.slice(0, 4)}-${value.slice(4)}`;
  }

  private normalizeRecoveryCode(code: string): string {
    return code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  }
}

export function roleLabel(roleCode: string, locale: 'vi' | 'en' = 'vi'): string {
  const role = ROLE_MAP[roleCode];
  return role ? (locale === 'en' ? role.nameEn : role.name) : roleCode;
}

