import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, isoDateSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RatesService } from './rates.service';

const createSchema = z.object({
  propertyId: z.string().min(1),
  roomTypeId: z.string().min(1),
  proposedRate: z.coerce.number().positive().max(1_000_000_000),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.optional(),
  reason: z.string().trim().min(5).max(1000),
  departments: z.array(z.string().min(2).max(40)).min(1).max(8).optional(),
});
const decideSchema = z.object({
  departmentCode: z.string().min(2).max(40),
  signature: z.string().trim().min(2).max(120),
  comment: z.string().trim().max(500).optional(),
});

@ApiTags('rates')
@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get('requests')
  @Permissions(PERMISSIONS.RATE_UPDATE)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) {
    return this.rates.list(actor, propertyId);
  }

  @Post('requests')
  @Permissions(PERMISSIONS.RATE_UPDATE)
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.rates.create(actor, body);
  }

  @Post('requests/:id/approve')
  @Permissions(PERMISSIONS.RATE_UPDATE)
  approve(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(decideSchema)) body: z.infer<typeof decideSchema>) {
    return this.rates.decide(actor, id, 'approve', body);
  }

  @Post('requests/:id/reject')
  @Permissions(PERMISSIONS.RATE_UPDATE)
  reject(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(decideSchema)) body: z.infer<typeof decideSchema>) {
    return this.rates.decide(actor, id, 'reject', body);
  }
}
