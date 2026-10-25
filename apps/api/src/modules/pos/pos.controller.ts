import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  addPosItemsSchema,
  chargeToRoomSchema,
  createPosOrderSchema,
  kdsStatusSchema,
  posPaySchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { PosService } from './pos.service';

@ApiTags('pos')
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('outlets')
  @Permissions(PERMISSIONS.POS_VIEW)
  outlets(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) {
    return this.pos.outlets(actor, propertyId);
  }

  @Get('menu')
  @Permissions(PERMISSIONS.POS_VIEW)
  menu(@CurrentUser() actor: AuthUser, @Query('outletId') outletId: string) {
    return this.pos.menu(actor, outletId);
  }

  @Get('orders')
  @Permissions(PERMISSIONS.POS_VIEW)
  orders(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId?: string,
    @Query('outletId') outletId?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.pos.listOrders(actor, {
      propertyId,
      outletId,
      status,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
    });
  }

  @Post('orders')
  @Permissions(PERMISSIONS.POS_ORDER)
  open(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createPosOrderSchema)) body: z.infer<typeof createPosOrderSchema>,
  ) {
    return this.pos.openOrder(actor, body);
  }

  @Get('orders/:id')
  @Permissions(PERMISSIONS.POS_VIEW)
  order(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.pos.getOrder(actor, id);
  }

  @Post('orders/:id/items')
  @Permissions(PERMISSIONS.POS_ORDER)
  addItems(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addPosItemsSchema)) body: z.infer<typeof addPosItemsSchema>,
  ) {
    return this.pos.addItems(actor, id, body);
  }

  @Post('orders/:id/send')
  @Permissions(PERMISSIONS.POS_ORDER)
  send(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.pos.send(actor, id);
  }

  @Post('orders/:id/pay')
  @Permissions(PERMISSIONS.POS_SETTLE)
  pay(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(posPaySchema)) body: z.infer<typeof posPaySchema>,
  ) {
    return this.pos.pay(actor, id, body);
  }

  @Post('orders/:id/charge-to-room')
  @Permissions(PERMISSIONS.POS_SETTLE)
  charge(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chargeToRoomSchema)) body: z.infer<typeof chargeToRoomSchema>,
  ) {
    return this.pos.chargeToRoom(actor, id, body);
  }

  @Post('orders/:id/void')
  @Permissions(PERMISSIONS.POS_VOID)
  void(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.pos.voidOrder(actor, id, body.reason ?? 'Huỷ theo yêu cầu');
  }

  @Get('kds/tickets')
  @Permissions(PERMISSIONS.KDS_VIEW)
  kds(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId?: string,
    @Query('station') station?: string,
    @Query('status') status?: string,
  ) {
    return this.pos.kdsTickets(actor, propertyId, station, status);
  }

  @Patch('kds/tickets/:id')
  @Permissions(PERMISSIONS.KDS_UPDATE)
  updateKds(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(kdsStatusSchema)) body: z.infer<typeof kdsStatusSchema>,
  ) {
    return this.pos.updateKds(actor, id, body.status);
  }
}
