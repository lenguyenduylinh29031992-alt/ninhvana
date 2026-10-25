import { Injectable } from '@nestjs/common';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import { MockChannelAdapter } from './mock.adapter';
import type { ChannelAdapter } from '../channel.types';

const OTA = ['BOOKING_COM', 'AGODA', 'EXPEDIA', 'AIRBNB', 'TRAVELOKA', 'TRIP_COM', 'GOOGLE_HOTEL_ADS', 'TRIPADVISOR'];
const SOCIAL = ['FACEBOOK', 'INSTAGRAM', 'ZALO', 'TIKTOK', 'WHATSAPP', 'TELEGRAM', 'LINE', 'KAKAOTALK', 'WECHAT'];

@Injectable()
export class ChannelAdapterRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  constructor() {
    for (const code of OTA) this.adapters.set(code, new MockChannelAdapter(code, 'OTA'));
    for (const code of SOCIAL) this.adapters.set(code, new MockChannelAdapter(code, 'SOCIAL'));
    this.adapters.set('DIRECT', new MockChannelAdapter('DIRECT', 'DIRECT'));
  }

  get(code: string): ChannelAdapter {
    const adapter = this.adapters.get(code);
    if (!adapter) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        `Chưa có adapter cho kênh ${code}. Các kênh hỗ trợ: ${[...this.adapters.keys()].join(', ')}`,
        404,
      );
    }
    return adapter;
  }

  codes(): string[] {
    return [...this.adapters.keys()];
  }
}
