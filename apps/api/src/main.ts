import 'reflect-metadata';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { COOKIE_NAMES } from '@grand-suite/shared';
import { AppModule } from './app.module';
import { RequestContextMiddleware } from './common/context/request-context';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const webUrl = config.get<string>('PUBLIC_WEB_URL') ?? 'http://localhost:3000';
  const extraOrigins = (config.get<string>('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [webUrl, 'http://localhost:3000', 'http://127.0.0.1:3000', ...extraOrigins];

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser(config.getOrThrow<string>('COOKIE_SECRET')));
  const requestContext = new RequestContextMiddleware();
  app.use((request: Request, response: Response, next: NextFunction) => {
    // Applied directly (no route wildcard) so Express 5 path syntax stays irrelevant.
    requestContext.use(request, response, next);
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token', 'x-property-id', 'x-request-id', 'x-locale'],
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  // Zod validates every route; this pipe only guards stray framework payloads.
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NinhVaNa API')
    .setDescription(
      'Hệ thống quản trị khách sạn & nhà hàng 5 sao — API nội bộ cho PWA và đối tác.',
    )
    .setVersion('1.0')
    .addCookieAuth(COOKIE_NAMES.ACCESS, { type: 'apiKey', in: 'cookie' }, 'accessCookie')
    .addBearerAuth()
    .addTag('auth', 'Đăng nhập, phiên, 2FA')
    .addTag('iam', 'Người dùng, vai trò, quyền')
    .addTag('properties', 'Cơ sở trong tập đoàn')
    .addTag('settings', 'Cấu hình, thuế, tỷ giá, tích hợp')
    .addTag('dashboard', 'Chỉ số điều hành')
    .addTag('audit', 'Nhật ký kiểm toán')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
  });

  const port = config.get<number>('API_PORT') ?? 4000;
  await app.listen(port, '0.0.0.0');

  logger.log(
    `NinhVaNa API ${isProduction ? '(production)' : '(development)'} — http://127.0.0.1:${port}/api/v1 · docs /api/docs`,
  );
}

bootstrap().catch((error) => {
  NestLogger.error('Không khởi động được API', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
