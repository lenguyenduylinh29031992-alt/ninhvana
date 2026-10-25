import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createPropertySchema,
  propertyQuerySchema,
  updatePropertySchema,
  type CreatePropertyInput,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PropertiesService } from './properties.service';

@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @Permissions(PERMISSIONS.PROPERTY_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(propertyQuerySchema)) query: z.infer<typeof propertyQuerySchema>,
  ) {
    return this.properties.list(actor, query.includeInactive);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PROPERTY_VIEW)
  get(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.properties.get(actor, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PROPERTY_MANAGE)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createPropertySchema)) body: CreatePropertyInput,
  ) {
    return this.properties.create(actor, body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PROPERTY_MANAGE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePropertySchema))
    body: Partial<Omit<CreatePropertyInput, 'code'>>,
  ) {
    return this.properties.update(actor, id, body);
  }
}
