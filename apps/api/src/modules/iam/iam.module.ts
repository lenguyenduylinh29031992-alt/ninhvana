import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { RolesController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, RolesController],
  providers: [AccessService, UsersService],
  exports: [AccessService, UsersService],
})
export class IamModule {}
