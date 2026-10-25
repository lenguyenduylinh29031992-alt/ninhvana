import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Field-level cryptography for PII and integration credentials.
 * AES-256-GCM with a random IV per value; the format is versioned so keys can be
 * rotated later without ambiguity.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('APP_ENCRYPTION_KEY') ?? '';
    let key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      // Derive deterministically so a misconfigured value cannot silently weaken AES.
      key = createHash('sha256').update(raw).digest();
      this.logger.warn('APP_ENCRYPTION_KEY không phải 32 byte base64 — đã suy ra khoá sha256');
    }
    this.key = key;
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [version, ivPart, tagPart, dataPart] = payload.split(':');
    if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
      throw new Error('Định dạng dữ liệu mã hoá không hợp lệ');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  hmac(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Constant-time comparison that tolerates different lengths. */
  safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  maskSecret(value: string | null | undefined): string {
    if (!value) return '';
    return `${value.slice(0, 3)}••••${value.slice(-2)}`;
  }
}

@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
