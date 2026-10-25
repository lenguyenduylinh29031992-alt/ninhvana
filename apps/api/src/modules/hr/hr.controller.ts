import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, attendanceSchema, employeeSchema, payrollRunSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { HrService } from './hr.service';

@ApiTags('hr')
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('employees') @Permissions(PERMISSIONS.PAYROLL_VIEW)
  employees(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.hr.employees(actor, propertyId); }

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
