export interface InboundReservation {
  externalId: string;
  status: string;
  propertyCode: string;
  roomTypeCode: string;
  checkIn: string;
  checkOut: string;
  guest: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    nationality?: string;
  };
  adults: number;
  children: number;
  totalAmount?: number;
  specialRequests?: string;
  raw: Record<string, unknown>;
}

export interface PullContext {
  channelCode: string;
  propertyCode: string;
  roomTypeCodes: string[];
  startDate: string;
  count: number;
}

export interface PushAvailabilityItem {
  date: string;
  roomTypeCode: string;
  externalRoomTypeId: string;
  available: number;
  rate: number;
  currency: string;
}

export interface PushRateItem {
  roomTypeCode: string;
  externalRoomTypeId: string;
  externalRatePlanId: string;
  from: string;
  to: string;
  amounts: Array<{ date: string; amount: number; currency: string }>;
}

export interface PushResult {
  ok: boolean;
  externalRef?: string;
  message?: string;
}

export interface ChannelAdapter {
  readonly code: string;
  readonly category: string;
  pullReservations(context: PullContext): Promise<InboundReservation[]>;
  pushAvailability(items: PushAvailabilityItem[]): Promise<PushResult>;
  pushRates(items: PushRateItem[]): Promise<PushResult>;
  handleWebhook(payload: Record<string, unknown>): Promise<InboundReservation | null>;
  mapStatus(externalStatus: string): 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW';
  sendMessage(threadId: string, body: string): Promise<{ externalId: string; ok: boolean }>;
}
