import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { MarketingService } from './marketing.service';

const itemSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'PAUSED']).optional(),
  channel: z.string().trim().max(80).optional(),
  budget: z.coerce.number().min(0).max(1_000_000_000_000).optional(),
  notes: z.string().trim().max(4000).optional(),
  parentId: z.string().min(1).nullable().optional(),
});
const updateSchema = itemSchema.partial();

@ApiTags('marketing')
@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('tree') @Permissions(PERMISSIONS.MARKETING_VIEW)
  tree(@CurrentUser() actor: AuthUser) { return this.marketing.tree(actor); }

  @Post('items') @Permissions(PERMISSIONS.MARKETING_MANAGE)
  create(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(itemSchema)) body: z.infer<typeof itemSchema>) { return this.marketing.create(actor, body); }

  @Patch('items/:id') @Permissions(PERMISSIONS.MARKETING_MANAGE)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>) { return this.marketing.update(actor, id, body); }

  @Delete('items/:id') @Permissions(PERMISSIONS.MARKETING_MANAGE)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.marketing.remove(actor, id); }
}
