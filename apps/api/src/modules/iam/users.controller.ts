import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userListQuerySchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('iam')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USER_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(userListQuerySchema)) query: z.infer<typeof userListQuerySchema>,
  ) {
    return this.users.list(actor, query);
  }

  @Post()
  @Permissions(PERMISSIONS.USER_MANAGE)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
    return this.users.create(actor, body);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USER_VIEW)
  get(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.get(actor, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.USER_MANAGE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(actor, id, body);
  }

  @Post(':id/reset-password')
  @Permissions(PERMISSIONS.USER_MANAGE)
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema.extend({ reason: z.string().trim().max(300).optional() })))
    body: { newPassword: string; requireChange: boolean; reason?: string },
  ) {
    return this.users.resetPassword(actor, id, body.newPassword, body.reason);
  }
}

const rolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(3)).max(500),
  reason: z.string().trim().min(5, 'Vui lòng nhập lý do (ít nhất 5 ký tự)').max(300),
});

@ApiTags('iam')
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USER_VIEW)
  list(@CurrentUser() actor: AuthUser) {
    return this.users.listRoles(actor);
  }

  @Get('permissions')
  @Permissions(PERMISSIONS.USER_VIEW)
  permissions() {
    return this.users.listPermissions();
  }

  @Patch(':code/permissions')
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  updatePermissions(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(rolePermissionsSchema))
    body: { permissions: string[]; reason: string },
  ) {
    return this.users.updateRolePermissions(actor, code, body.permissions, body.reason);
  }
}
