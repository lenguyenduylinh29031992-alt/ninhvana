import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, attendanceSchema, employeeSchema, payrollRunSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { HrService } from './hr.service';
import { GoogleSheetSyncService } from './google-sheet-sync.service';

@ApiTags('hr')
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService, private readonly sheets: GoogleSheetSyncService) {}

  @Get('sheets/status') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  sheetStatus(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.sheets.status(actor, propertyId); }

  @Get('sheets/config') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  sheetConfig(@CurrentUser() actor: AuthUser) { return this.sheets.config(actor); }

  @Put('sheets/config') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  updateSheetConfig(@CurrentUser() actor: AuthUser, @Body() body: { key: string; url: string; label?: string; department?: string; enabled?: boolean }) { return this.sheets.updateConfig(actor, body); }

  @Post('sheets/sync') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  syncSheets(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.sheets.sync(actor, propertyId); }

  @Post('sheets/:key/sync') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  syncSheet(@CurrentUser() actor: AuthUser, @Param('key') key: string, @Query('propertyId') propertyId?: string) { return this.sheets.sync(actor, propertyId, key); }

  @Get('departments') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  departments(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) {
    return this.hr.departments(actor, propertyId);
  }

  @Get('attendance') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  attendanceRange(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.hr.attendanceRange(actor, propertyId, from, to);
  }

  @Get('employees') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  employees(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.hr.employees(actor, propertyId); }

  @Post('employees/account') @Permissions(PERMISSIONS.EMPLOYEE_MANAGE)
  createEmployeeWithAccount(@CurrentUser() actor: AuthUser, @Body() body: {
    propertyId?: string; code?: string; fullName: string; position: string; department: string; hireDate: string; baseSalary: number; employmentType?: 'OFFICIAL' | 'PROBATION'; email: string; password: string; roleCode?: string; phone?: string;
  }) { return this.hr.createEmployeeWithAccount(actor, body); }

  @Post('employees') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  createEmployee(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(employeeSchema)) body: z.infer<typeof employeeSchema>) {
    return this.hr.createEmployee(actor, body);
  }

  @Post('attendance') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  attendance(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(attendanceSchema)) body: z.infer<typeof attendanceSchema>) {
    return this.hr.recordAttendance(actor, body);
  }

  @Get('payroll') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  runs(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) { return this.hr.payrollRuns(actor, propertyId); }

  @Post('payroll/run') @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  run(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(payrollRunSchema)) body: z.infer<typeof payrollRunSchema>) {
    return this.hr.runPayroll(actor, body.propertyId, body.period);
  }

  @Post('payroll/:id/post') @Permissions(PERMISSIONS.PAYROLL_APPROVE)
  post(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.hr.postPayroll(actor, id); }

  @Post('payroll/:id/pay') @Permissions(PERMISSIONS.PAYROLL_APPROVE)
  pay(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.hr.payPayroll(actor, id); }
}
