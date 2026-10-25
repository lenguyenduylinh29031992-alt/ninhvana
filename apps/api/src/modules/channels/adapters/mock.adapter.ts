import type {
  ChannelAdapter,
  InboundReservation,
  PullContext,
  PushAvailabilityItem,
  PushRateItem,
  PushResult,
} from '../channel.types';

const FIRST_NAMES = ['Minh', 'Lan', 'Huy', 'Thảo', 'James', 'Emma', 'Hiroshi', 'Sofia', 'Daniel', 'Linh'];
const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Smith', 'Wilson', 'Tanaka', 'Garcia', 'Kim', 'Vũ'];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Mock connector used for every partner in the demo. It behaves like a real
 * adapter: pull returns external reservations, push validates payloads, and
 * webhooks are mapped through the same status dictionary. A real connector only
 * replaces this class behind the same interface.
 */
export class MockChannelAdapter implements ChannelAdapter {
  constructor(
    readonly code: string,
    readonly category: string,
  ) {}

  async pullReservations(context: PullContext): Promise<InboundReservation[]> {
    const batch = Math.floor(Date.now() / 1000);
    return Array.from({ length: context.count }).map((_, index) => {
      const first = FIRST_NAMES[(batch + index) % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(batch + index * 3) % LAST_NAMES.length]!;
      return {
        externalId: `${this.code}-PULL-${batch}-${index}`,
        status: 'CONFIRMED',
        propertyCode: context.propertyCode,
        roomTypeCode: context.roomTypeCodes[index % context.roomTypeCodes.length] ?? context.roomTypeCodes[0]!,
        checkIn: addDays(context.startDate, index * 2),
        checkOut: addDays(context.startDate, index * 2 + 2),
        guest: {
          firstName: first,
          lastName: last,
          email: `${first.toLowerCase()}.${index}.${batch}@mock-${this.code.toLowerCase()}.test`,
          phone: `+84 9${String(10000000 + ((batch + index) % 89999999)).slice(0, 8)}`,
          nationality: last === 'Smith' || last === 'Wilson' ? 'US' : 'VN',
        },
        adults: 2,
        children: 0,
        specialRequests: index === 0 ? 'Phòng yên tĩnh, tầng cao' : undefined,
        raw: { mock: true, provider: this.code, source: 'pull' },
      };
    });
  }

  async pushAvailability(items: PushAvailabilityItem[]): Promise<PushResult> {
    if (items.some((item) => item.available < 0)) {
      return { ok: false, message: 'Tồn phòng âm không hợp lệ' };
    }
    return { ok: true, externalRef: `${this.code}-ARI-${Date.now()}` };
  }

  async pushRates(items: PushRateItem[]): Promise<PushResult> {
    if (items.some((item) => item.amounts.some((amount) => amount.amount <= 0))) {
      return { ok: false, message: 'Giá phòng phải lớn hơn 0' };
    }
    return { ok: true, externalRef: `${this.code}-RATE-${Date.now()}` };
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<InboundReservation | null> {
    if (!payload.externalId) return null;
    const mapping = this.mapStatus(String(payload.status ?? 'confirmed'));
    return {
      externalId: String(payload.externalId),
      status: mapping,
      propertyCode: String(payload.propertyCode),
      roomTypeCode: String(payload.roomTypeCode),
      checkIn: String(payload.checkIn),
      checkOut: String(payload.checkOut),
      guest: payload.guest as InboundReservation['guest'],
      adults: Number(payload.adults ?? 2),
      children: Number(payload.children ?? 0),
      totalAmount: payload.totalAmount ? Number(payload.totalAmount) : undefined,
      specialRequests: payload.specialRequests ? String(payload.specialRequests) : undefined,
      raw: payload,
    };
  }

  mapStatus(externalStatus: string): 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW' {
    const normalized = externalStatus.trim().toLowerCase();
    if (['cancelled', 'canceled', 'void', 'declined'].includes(normalized)) return 'CANCELLED';
    if (['no_show', 'noshow', 'no-show'].includes(normalized)) return 'NO_SHOW';
    return 'CONFIRMED';
  }

  async sendMessage(threadId: string, body: string): Promise<{ externalId: string; ok: boolean }> {
    if (!body.trim()) return { externalId: '', ok: false };
    return { externalId: `${this.code}-MSG-${Date.now()}-${threadId.slice(-4)}`, ok: true };
  }
}
