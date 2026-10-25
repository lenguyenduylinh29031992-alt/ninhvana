import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'node:path';
import { validateEnv } from './common/config/env';
import { AuditModule } from './common/audit/audit.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { LockModule } from './common/locks/lock.module';
import { SequenceModule } from './common/sequence/sequence.module';
import { CsrfGuard } from './common/auth/csrf.guard';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { PublicModule } from './modules/public/public.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { FoliosModule } from './modules/folios/folios.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { NightAuditModule } from './modules/night-audit/night-audit.module';
import { PosModule } from './modules/pos/pos.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { GuestsModule } from './modules/guests/guests.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { BookingModule } from './modules/booking/booking.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { HrModule } from './modules/hr/hr.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CrmModule } from './modules/crm/crm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [
        join(process.cwd(), '../../.env.local'),
        join(process.cwd(), '.env.local'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
      ],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const isTest = config.get<string>('NODE_ENV') === 'test';
        return {
          pinoHttp: {
            level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      colorize: true,
                      translateTime: 'SYS:HH:MM:ss',
                      ignore: 'pid,hostname,context',
                    },
                  },
                }),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
                'req.body.credentials',
                '*.passwordHash',
                '*.twoFactorSecret',
                '*.credentialsEnc',
                '*.tokenHash',
              ],
              censor: '[redacted]',
            },
            autoLogging: isTest
              ? false
              : {
                  ignore: (request: { url?: string }) => Boolean(request.url?.includes('/health')),
                },
            customProps: () => ({ service: 'grand-suite-api' }),
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    LockModule,
    SequenceModule,

    AuthModule,
    IamModule,
    PropertiesModule,
    PublicModule,
    SettingsModule,
    HealthModule,
    DashboardModule,
    NotificationsModule,
    RealtimeModule,

    AccountingModule,
    ReservationsModule,
    FoliosModule,
    PaymentsModule,
    InvoicesModule,
    NightAuditModule,
    PosModule,
    HousekeepingModule,
    GuestsModule,
    RoomsModule,
    ChannelsModule,
    BookingModule,
    InboxModule,
    FinanceModule,
    ProcurementModule,
    HrModule,
    ReportsModule,
    CrmModule,
  ],
  providers: [
    // Order matters: rate limit → authentication → CSRF → authorisation.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
