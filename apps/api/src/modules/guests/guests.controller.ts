import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { GuestsService } from './guests.service';

const createGuestSchema = z.object({
  propertyId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  nationality: z.string().max(2).optional(),
  country: z.string().max(2).optional(),
  notes: z.string().max(500).optional(),
  vipLevel: z.coerce.number().int().min(0).max(5).optional(),
});
const updateGuestSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  vipLevel: z.coerce.number().int().min(0).max(5).optional(),
  isBlacklisted: z.boolean().optional(),
});

@ApiTags('guests')
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  @Permissions(PERMISSIONS.GUEST_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.guests.list(actor, {
      q,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.GUEST_VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.guests.detail(actor, id);
  }

  @Post()
  @Permissions(PERMISSIONS.GUEST_MANAGE)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createGuestSchema)) body: z.infer<typeof createGuestSchema>,
  ) {
    return this.guests.create(actor, body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.GUEST_MANAGE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGuestSchema)) body: z.infer<typeof updateGuestSchema>,
  ) {
    return this.guests.update(actor, id, body);
  }
}
