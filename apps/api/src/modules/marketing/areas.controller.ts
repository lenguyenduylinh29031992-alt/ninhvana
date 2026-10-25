import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { AreasService } from './areas.service';

@ApiTags('property-map')
@Controller('property-map')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get() @Permissions(PERMISSIONS.PROPERTY_VIEW)
  list(@CurrentUser() actor: AuthUser) { return this.areas.list(actor); }
}
