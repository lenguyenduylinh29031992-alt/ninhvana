import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IamModule } from '../iam/iam.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    IamModule,
    // Secrets are supplied per operation: access and refresh tokens use
    // different keys, so a leaked access key cannot mint refresh tokens.
    JwtModule.register({ global: true }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
