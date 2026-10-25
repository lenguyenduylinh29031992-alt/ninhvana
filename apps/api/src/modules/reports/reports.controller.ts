import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import type { Response } from 'express';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ReportsService, type REPORT_TEMPLATES } from './reports.service';

type TemplateKey = (typeof REPORT_TEMPLATES)[number]['key'];

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('templates')
  @Permissions(PERMISSIONS.REPORT_VIEW)
  templates() {
    return this.reports.templates();
  }

  @Get('run')
  @Permissions(PERMISSIONS.REPORT_VIEW)
  run(@CurrentUser() actor: AuthUser, @Query('template') template: TemplateKey, @Query('propertyId') propertyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.reports.run(actor, template, propertyId, from, to);
  }

  @Get('export.csv')
  @Permissions(PERMISSIONS.REPORT_EXPORT)
  async export(@CurrentUser() actor: AuthUser, @Query('template') template: TemplateKey, @Query('propertyId') propertyId: string, @Query('from') from: string, @Query('to') to: string, @Res() response: Response) {
    const result = await this.reports.export(actor, template, propertyId, from, to);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.csv);
  }
}
