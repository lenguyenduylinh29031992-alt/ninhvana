import { Injectable } from '@nestjs/common';
import { JournalSource, Prisma, type FolioItem, type JournalEntry } from '@prisma/client';
import {
  buildCommissionDraft,
  buildPaymentDraft,
  buildRevenueDraft,
  type ChargePosting,
  type DepartmentGroup,
  type JournalDraft,
} from '@grand-suite/shared';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PrismaService } from '../../common/prisma/prisma.module';

type Tx = Prisma.TransactionClient;

export interface EntryContext {
  orgId: string;
  propertyId: string;
  businessDate: Date;
  sourceType: JournalSource;
  sourceId?: string | null;
  memo: string;
  postedById?: string | null;
}

export interface PaymentLike {
  method: string;
  amount: Prisma.Decimal | number | string;
  reference?: string | null;
  guestId?: string | null;
  reservationId?: string | null;
}

/**
 * Writes double-entry journals. Every method accepts the caller's transaction so
 * the business document and its accounting effect commit (or roll back) together.
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  async createEntry(tx: Tx, context: EntryContext, draft: JournalDraft): Promise<JournalEntry> {
    const number = await this.sequence.next(tx, context.propertyId, 'JOURNAL');
    return tx.journalEntry.create({
      data: {
        orgId: context.orgId,
        propertyId: context.propertyId,
        businessDate: context.businessDate,
        number,
        sourceType: context.sourceType,
        sourceId: context.sourceId ?? null,
        memo: context.memo,
        postedById: context.postedById ?? null,
        totalDebit: draft.totalDebit,
        totalCredit: draft.totalCredit,
        lines: {
          create: draft.lines.map((line) => ({
            accountCode: line.accountCode,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            department: (line.department ?? null) as DepartmentGroup | null,
            channelId: line.channelId ?? null,
            guestId: line.guestId ?? null,
            reservationId: line.reservationId ?? null,
          })),
        },
      },
    });
  }

  /** Recognises revenue for folio charges and marks them journalised. */
  async postRevenueItems(
    tx: Tx,
    params: {
      orgId: string;
      propertyId: string;
      businessDate: Date;
      items: FolioItem[];
      sourceType: JournalSource;
      sourceId?: string | null;
      postedById?: string | null;
      memo: string;
      debitAccount?: string;
    },
  ): Promise<JournalEntry | null> {
    const items = params.items.filter((item) => !item.isVoid && !item.journalized);
    if (items.length === 0) return null;

    const charges: ChargePosting[] = items.map((item) => ({
      glAccountCode: item.glAccountCode ?? '3200',
      department: item.department,
      net: item.amount,
      serviceCharge: item.serviceCharge,
      vat: item.taxAmount,
      total: item.total,
      description: item.description,
      channelId: item.channelId,
      guestId: null,
      reservationId: null,
      debitAccount: params.debitAccount,
    }));

    const draft = buildRevenueDraft({ memo: params.memo, charges });
    const entry = await this.createEntry(
      tx,
      {
        orgId: params.orgId,
        propertyId: params.propertyId,
        businessDate: params.businessDate,
        sourceType: params.sourceType,
        sourceId: params.sourceId ?? null,
        memo: params.memo,
        postedById: params.postedById ?? null,
      },
      draft,
    );

    await tx.folioItem.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { journalized: true, journalEntryId: entry.id },
    });
    return entry;
  }

  /** Cash/card settlement: Dr cash or bank clearing, Cr A/R. */
  async postPayments(
    tx: Tx,
    params: {
      orgId: string;
      propertyId: string;
      businessDate: Date;
      payments: PaymentLike[];
      sourceType: JournalSource;
      sourceId?: string | null;
      postedById?: string | null;
      memo: string;
    },
  ): Promise<JournalEntry | null> {
    if (params.payments.length === 0) return null;
    const draft = buildPaymentDraft({
      memo: params.memo,
      payments: params.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
        guestId: payment.guestId,
        reservationId: payment.reservationId,
      })),
    });
    return this.createEntry(
      tx,
      {
        orgId: params.orgId,
        propertyId: params.propertyId,
        businessDate: params.businessDate,
        sourceType: params.sourceType,
        sourceId: params.sourceId ?? null,
        memo: params.memo,
        postedById: params.postedById ?? null,
      },
      draft,
    );
  }

  async postCommission(
    tx: Tx,
    params: {
      orgId: string;
      propertyId: string;
      businessDate: Date;
      amount: Prisma.Decimal | number | string;
      channelId?: string | null;
      reservationId?: string | null;
      memo: string;
    },
  ): Promise<JournalEntry | null> {
    const draft = buildCommissionDraft({
      memo: params.memo,
      amount: params.amount,
      channelId: params.channelId,
      reservationId: params.reservationId,
    });
    if (draft.lines.length === 0) return null;
    return this.createEntry(
      tx,
      {
        orgId: params.orgId,
        propertyId: params.propertyId,
        businessDate: params.businessDate,
        sourceType: JournalSource.NIGHT_AUDIT,
        sourceId: params.reservationId ?? null,
        memo: params.memo,
      },
      draft,
    );
  }
}
