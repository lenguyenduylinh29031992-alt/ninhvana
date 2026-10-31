import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { OperationsService } from './operations.service';

@ApiTags('budgets')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly operations: OperationsService) {}
  @Get() @Permissions(PERMISSIONS.BUDGET_VIEW)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string, @Query('period') period?: string) { return this.operations.budgets(actor, propertyId, period); }
  @Post() @Permissions(PERMISSIONS.BUDGET_MANAGE)
  save(@CurrentUser() actor: AuthUser, @Body() body: { propertyId?: string; department: string; period: string; category: string; planned: number; actual?: number; notes?: string }) { return this.operations.saveBudget(actor, body); }
}

@ApiTags('roster')
@Controller('roster')
export class RosterController {
  constructor(private readonly operations: OperationsService) {}
  @Get() @Permissions(PERMISSIONS.ROSTER_VIEW)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string, @Query('from') from?: string, @Query('to') to?: string) { return this.operations.shifts(actor, propertyId, from, to); }
  @Post() @Permissions(PERMISSIONS.ROSTER_MANAGE)
  create(@CurrentUser() actor: AuthUser, @Body() body: { propertyId?: string; department: string; employeeId?: string; employeeName: string; date: string; startTime: string; endTime: string; role?: string; notes?: string }) { return this.operations.saveShift(actor, body); }
  @Patch(':id') @Permissions(PERMISSIONS.ROSTER_MANAGE)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status?: string; notes?: string }) { return this.operations.updateShift(actor, id, body); }
  @Delete(':id') @Permissions(PERMISSIONS.ROSTER_MANAGE)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.operations.deleteShift(actor, id); }
}

@ApiTags('banquet')
@Controller('banquet')
export class BanquetController {
  constructor(private readonly operations: OperationsService) {}
  @Get() @Permissions(PERMISSIONS.BANQUET_VIEW)
  list(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.operations.events(actor, propertyId); }
  @Post() @Permissions(PERMISSIONS.BANQUET_MANAGE)
  save(@CurrentUser() actor: AuthUser, @Body() body: { propertyId?: string; code?: string; name: string; eventDate: string; startTime?: string; endTime?: string; venue?: string; guests?: number; status?: string; contractValue?: number; deposit?: number; contactName?: string; contactPhone?: string; notes?: string }) { return this.operations.saveEvent(actor, body); }
  @Patch(':id') @Permissions(PERMISSIONS.BANQUET_MANAGE)
  update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status?: string; deposit?: number; notes?: string }) { return this.operations.updateEvent(actor, id, body); }
}

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly operations: OperationsService) {}
  @Post('ask') @Permissions(PERMISSIONS.ASSISTANT_USE)
  ask(@CurrentUser() actor: AuthUser, @Body() body: { question: string; propertyId?: string }) { return this.operations.assistant(actor, body.question ?? '', body.propertyId); }
}
