import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import type { Response } from 'express';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get(':dataset')
  @Permissions(PERMISSIONS.REPORT_EXPORT)
  async export(
    @CurrentUser() actor: AuthUser,
    @Param('dataset') dataset: string,
    @Query('format') format: string,
    @Res() response: Response,
  ) {
    const normalized = ['xlsx', 'docx', 'csv', 'tsv'].includes(format) ? format as 'xlsx' | 'docx' | 'csv' | 'tsv' : 'xlsx';
    const result = await this.exports.export(actor, dataset, normalized);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.body);
  }
}
