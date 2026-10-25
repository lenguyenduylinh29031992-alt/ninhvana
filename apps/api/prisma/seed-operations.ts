import type { PrismaClient } from '@prisma/client';

const CHANNELS: Array<{
  code: string;
  name: string;
  type: 'OTA' | 'SOCIAL' | 'DIRECT' | 'B2B' | 'OFFLINE';
  commission: number;
}> = [
  { code: 'DIRECT', name: 'Website trực tiếp', type: 'DIRECT', commission: 0 },
  { code: 'WALK_IN', name: 'Khách đến trực tiếp', type: 'OFFLINE', commission: 0 },
  { code: 'PHONE', name: 'Điện thoại', type: 'OFFLINE', commission: 0 },
  { code: 'EMAIL', name: 'Email / Sales', type: 'OFFLINE', commission: 0 },
  { code: 'BOOKING_COM', name: 'Booking.com', type: 'OTA', commission: 15 },
  { code: 'AGODA', name: 'Agoda', type: 'OTA', commission: 16 },
  { code: 'EXPEDIA', name: 'Expedia', type: 'OTA', commission: 18 },
  { code: 'AIRBNB', name: 'Airbnb', type: 'OTA', commission: 14 },
  { code: 'TRAVELOKA', name: 'Traveloka', type: 'OTA', commission: 17 },
  { code: 'TRIP_COM', name: 'Trip.com', type: 'OTA', commission: 15 },
  { code: 'GOOGLE_HOTEL_ADS', name: 'Google Hotel Ads', type: 'OTA', commission: 12 },
  { code: 'TRIPADVISOR', name: 'Tripadvisor', type: 'OTA', commission: 12 },
  { code: 'FACEBOOK', name: 'Facebook', type: 'SOCIAL', commission: 8 },
  { code: 'INSTAGRAM', name: 'Instagram', type: 'SOCIAL', commission: 8 },
  { code: 'ZALO', name: 'Zalo OA', type: 'SOCIAL', commission: 5 },
  { code: 'TIKTOK', name: 'TikTok Shop', type: 'SOCIAL', commission: 10 },
  { code: 'WHATSAPP', name: 'WhatsApp Business', type: 'SOCIAL', commission: 5 },
  { code: 'TELEGRAM', name: 'Telegram', type: 'SOCIAL', commission: 5 },
  { code: 'LINE', name: 'LINE', type: 'SOCIAL', commission: 5 },
  { code: 'KAKAOTALK', name: 'KakaoTalk', type: 'SOCIAL', commission: 5 },
  { code: 'WECHAT', name: 'WeChat', type: 'SOCIAL', commission: 5 },
  { code: 'TRAVEL_AGENT', name: 'Đại lý du lịch', type: 'B2B', commission: 10 },
  { code: 'CORPORATE', name: 'Hợp đồng doanh nghiệp', type: 'B2B', commission: 0 },
  { code: 'GROUP_MICE', name: 'Đoàn / MICE', type: 'B2B', commission: 5 },
  { code: 'REFERRAL', name: 'Giới thiệu', type: 'DIRECT', commission: 0 },
];

const COMPANIES = [
  { name: 'Công ty CP Du lịch Hà Nội', taxCode: '0101234567', contactName: 'Nguyễn Văn An', email: 'mice@hanoitravel.vn' },
  { name: 'Tập đoàn FPT', taxCode: '0101248141', contactName: 'Trần Thu Hằng', email: 'travel@fpt.com.vn' },
  { name: 'Vietcombank', taxCode: '0100112437', contactName: 'Lê Quang Minh', email: 'events@vietcombank.com.vn' },
  { name: 'Công ty TNHH Samsung VN', taxCode: '0101244939', contactName: 'Park Min Ho', email: 'booking@samsung.vn' },
  { name: 'Vietjet Air', taxCode: '0102548338', contactName: 'Đỗ Thanh Hà', email: 'crew@vietjetair.com' },
  { name: 'Công ty CP Vinamilk', taxCode: '0300471540', contactName: 'Phạm Thị Mai', email: 'mice@vinamilk.com.vn' },
  { name: 'Đại lý Du lịch Á Châu', taxCode: '0201234567', contactName: 'Lê Hoàng Long', email: 'booking@asia-travel.vn' },
  { name: 'Công ty May 10', taxCode: '0100100436', contactName: 'Nguyễn Thu Trang', email: 'admin@may10.vn' },
];

const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const GIVEN_NAMES = ['Văn An', 'Thu Hà', 'Minh Tuấn', 'Thị Lan', 'Quang Huy', 'Ngọc Anh', 'Đức Long', 'Thảo Vy', 'Hoài Nam', 'Mai Linh', 'Kim Chi', 'Bảo Ngọc'];
const INTERNATIONAL = [
  { first: 'James', last: 'Smith', country: 'US' },
  { first: 'Emma', last: 'Wilson', country: 'AU' },
  { first: 'Hiroshi', last: 'Tanaka', country: 'JP' },
  { first: 'Min-jun', last: 'Kim', country: 'KR' },
  { first: 'Sophie', last: 'Martin', country: 'FR' },
  { first: 'Lukas', last: 'Muller', country: 'DE' },
  { first: 'Chen', last: 'Wei', country: 'CN' },
  { first: 'Pim', last: 'Sukhum', country: 'TH' },
];

const MENU: Record<string, Array<{ category: string; items: Array<[string, string, number, string, 'KITCHEN' | 'BAR' | 'SPA', string]> }>> = {
  RESTAURANT: [
    {
      category: 'Khai vị',
      items: [
        ['Súp hành Pháp', 'French onion soup', 180_000, 'Súp hành, bánh mì phô mai', 'KITCHEN', 'VAT8'],
        ['Gỏi cuốn tôm càng', 'Mekong prawn spring rolls', 240_000, 'Tôm càng, rau thơm, tương đậu', 'KITCHEN', 'VAT8'],
        ['Sashimi cá hồi Na Uy', 'Norwegian salmon sashimi', 420_000, '5 miếng, wasabi, gừng', 'KITCHEN', 'VAT8'],
        ['Phô mai burrata', 'Burrata & heirloom tomato', 380_000, 'Cà chua di truyền, pesto húng quế', 'KITCHEN', 'VAT8'],
      ],
    },
    {
      category: 'Món chính',
      items: [
        ['Bò Úc sốt tiêu đen', 'Wagyu MB5 black pepper', 1_250_000, 'Bò Wagyu 200g, khoai tây truffle', 'KITCHEN', 'VAT8'],
        ['Cá tuyết áp chảo', 'Pan-seared cod', 680_000, 'Rau mầm, sốt beurre blanc', 'KITCHEN', 'VAT8'],
        ['Cơm chiên hải sản', 'Seafood fried rice', 320_000, 'Tôm, mực, điệp, trứng muối', 'KITCHEN', 'VAT8'],
        ['Phở bò Grand Suite', 'Grand Suite beef pho', 280_000, 'Nước dùng 12 giờ, bò tái, gân', 'KITCHEN', 'VAT8'],
        ['Risotto nấm truffle', 'Truffle mushroom risotto', 450_000, 'Gạo carnaroli, nấm đen, parmesan', 'KITCHEN', 'VAT8'],
      ],
    },
    {
      category: 'Tráng miệng',
      items: [
        ['Crème brûlée vanilla', 'Vanilla crème brûlée', 180_000, 'Đậu vanilla Madagascar', 'KITCHEN', 'VAT8'],
        ['Bánh chocolate 70%', '70% chocolate fondant', 220_000, 'Kem vani, sốt cacao', 'KITCHEN', 'VAT8'],
        ['Đĩa trái cây nhiệt đới', 'Tropical fruit platter', 260_000, 'Xoài, thanh long, chôm chôm', 'KITCHEN', 'VAT8'],
      ],
    },
    {
      category: 'Đồ uống',
      items: [
        ['Nước suối Acqua Panna', 'Acqua Panna 750ml', 120_000, '', 'BAR', 'VAT8'],
        ['Cà phê Espresso', 'Espresso', 90_000, 'Hạt Arabica Đà Lạt', 'BAR', 'VAT8'],
        ['Trà sen hồng', 'Lotus tea', 110_000, 'Trà sen Tây Hồ', 'BAR', 'VAT8'],
      ],
    },
  ],
  BAR: [
    {
      category: 'Cocktail signature',
      items: [
        ['Champagne Negroni', 'Champagne Negroni', 380_000, 'Gin, Campari, vermouth, champagne', 'BAR', 'VAT10'],
        ['Saigon Sunset', 'Saigon Sunset', 320_000, 'Rum, chanh dây, grenadine', 'BAR', 'VAT10'],
        ['Hanoi Martini', 'Hanoi Martini', 350_000, 'Vodka, vermouth, olive', 'BAR', 'VAT10'],
      ],
    },
    {
      category: 'Rượu vang',
      items: [
        ['Ly vang trắng House', 'House white wine', 260_000, 'Sauvignon Blanc, Chile', 'BAR', 'VAT10'],
        ['Ly vang đỏ House', 'House red wine', 280_000, 'Cabernet Sauvignon, Chile', 'BAR', 'VAT10'],
        ['Chai Moët & Chandon', 'Moët & Chandon Brut', 3_200_000, '750ml', 'BAR', 'VAT10'],
      ],
    },
    {
      category: 'Bia & soft drink',
      items: [
        ['Bia Heineken', 'Heineken', 120_000, 'Chai 330ml', 'BAR', 'VAT10'],
        ['Bia Tiger', 'Tiger', 110_000, 'Chai 330ml', 'BAR', 'VAT10'],
        ['Nước chanh tươi', 'Fresh lime juice', 95_000, '', 'BAR', 'VAT8'],
      ],
    },
  ],
  ROOM_SERVICE: [
    {
      category: 'Món nhẹ 24/7',
      items: [
        ['Club sandwich', 'Club sandwich', 280_000, 'Gà, bacon, trứng, khoai tây', 'KITCHEN', 'VAT8'],
        ['Bò burger Grand', 'Grand beef burger', 350_000, 'Bò Úc, cheddar, khoai tây truffle', 'KITCHEN', 'VAT8'],
        ['Phở bò đêm', 'Midnight beef pho', 290_000, 'Phục vụ 24/7', 'KITCHEN', 'VAT8'],
      ],
    },
  ],
  POOL: [
    {
      category: 'Pool',
      items: [
        ['Pizza Margherita', 'Margherita pizza', 320_000, 'Cà chua San Marzano, basil', 'KITCHEN', 'VAT8'],
        ['Gỏi đu đủ', 'Papaya salad', 180_000, 'Tôm khô, đậu phộng', 'KITCHEN', 'VAT8'],
        ['Dừa tươi', 'Fresh coconut', 90_000, '', 'BAR', 'VAT8'],
        ['Margarita', 'Margarita', 240_000, 'Tequila, triple sec, chanh', 'BAR', 'VAT10'],
      ],
    },
  ],
  SPA: [
    {
      category: 'Liệu trình',
      items: [
        ['Massage Thái 60 phút', 'Thai massage 60 min', 1_200_000, '', 'SPA', 'VAT8'],
        ['Massage đá nóng 90 phút', 'Hot stone 90 min', 1_800_000, '', 'SPA', 'VAT8'],
        ['Facial Hydra', 'HydraFacial', 2_200_000, '', 'SPA', 'VAT8'],
      ],
    },
  ],
  BANQUET: [
    {
      category: 'Tiệc',
      items: [
        ['Set menu tiệc 10 khách', 'Banquet set menu 10 pax', 12_000_000, '5 món, nước uống', 'KITCHEN', 'VAT8'],
        ['Coffee break 1 người', 'Coffee break per person', 220_000, '', 'BAR', 'VAT8'],
      ],
    },
  ],
};

/** Idempotent operational master data: channels, companies, guests, menus, tables. */
export async function seedOperations(
  prisma: PrismaClient,
  orgId: string,
  propertyIds: Map<string, string>,
): Promise<{ channels: number; guests: number; menuItems: number; tables: number }> {
  for (const channel of CHANNELS) {
    await prisma.channel.upsert({
      where: { orgId_code: { orgId, code: channel.code } },
      update: {
        name: channel.name,
        type: channel.type,
        commissionPct: channel.commission,
      },
      create: {
        orgId,
        code: channel.code,
        name: channel.name,
        type: channel.type,
        commissionPct: channel.commission,
        isActive: true,
        settings: { mock: true },
      },
    });
  }

  const companyCount = await prisma.company.count({ where: { orgId } });
  if (companyCount === 0) {
    await prisma.company.createMany({
      data: COMPANIES.map((company, index) => ({
        orgId,
        name: company.name,
        type: index < 6 ? 'CORPORATE' : 'AGENCY',
        taxCode: company.taxCode,
        contactName: company.contactName,
        email: company.email,
        phone: `+84 24 3000 ${String(index + 1).padStart(4, '0')}`,
        address: 'Hà Nội, Việt Nam',
        creditLimit: index < 4 ? 200_000_000 : 50_000_000,
        paymentTermDays: 30,
        commissionPct: index >= 6 ? 10 : 0,
      })),
    });
  }

  const guestCount = await prisma.guest.count({ where: { orgId } });
  if (guestCount < 50) {
    let random = 987654321;
    const next = () => {
      random = (random * 1664525 + 1013904223) % 4294967296;
      return random / 4294967296;
    };
    const rows = Array.from({ length: 180 }).map((_, index) => {
      const foreign = next() < 0.28;
      const person = foreign
        ? INTERNATIONAL[Math.floor(next() * INTERNATIONAL.length)]!
        : {
            first: GIVEN_NAMES[Math.floor(next() * GIVEN_NAMES.length)]!,
            last: FAMILY_NAMES[Math.floor(next() * FAMILY_NAMES.length)]!,
            country: 'VN',
          };
      const vipLevel = next() < 0.08 ? 3 : next() < 0.25 ? 2 : next() < 0.5 ? 1 : 0;
      return {
        orgId,
        code: `G-${String(1000 + index).padStart(5, '0')}`,
        firstName: person.first,
        lastName: person.last,
        fullName: `${person.last} ${person.first}`,
        email: `${person.first.toLowerCase().replace(/[^a-z]/g, '')}.${person.last.toLowerCase().replace(/[^a-z]/g, '')}${index}@example.com`,
        phone: `+84 9${String(10000000 + Math.floor(next() * 89999999)).slice(0, 8)}`,
        nationality: person.country,
        country: person.country,
        vipLevel,
        totalStays: Math.floor(next() * 8),
        totalNights: Math.floor(next() * 20),
        lifetimeValue: Math.floor(next() * 180_000_000),
      };
    });
    await prisma.guest.createMany({ data: rows, skipDuplicates: true });
  }

  let menuItems = 0;
  let tables = 0;
  const outlets = await prisma.outlet.findMany({ where: { propertyId: { in: [...propertyIds.values()] } } });

  for (const outlet of outlets) {
    const catalog = MENU[outlet.type] ?? [];
    if (catalog.length === 0) continue;
    const existingCategories = await prisma.menuCategory.count({ where: { outletId: outlet.id } });
    if (existingCategories === 0) {
      for (const [categoryIndex, category] of catalog.entries()) {
        const createdCategory = await prisma.menuCategory.create({
          data: { outletId: outlet.id, name: category.category, sortOrder: categoryIndex },
        });
        await prisma.menuItem.createMany({
          data: category.items.map((item, itemIndex) => ({
            outletId: outlet.id,
            categoryId: createdCategory.id,
            code: `${outlet.code}-${categoryIndex + 1}${String(itemIndex + 1).padStart(2, '0')}`,
            name: item[0],
            nameEn: item[1],
            description: item[3],
            price: item[2],
            cost: Math.round(item[2] * 0.34),
            taxRateCode: item[5],
            station: item[4],
            allergens: [],
            tags: itemIndex === 0 ? ['signature'] : [],
            sortOrder: itemIndex,
          })),
        });
        menuItems += category.items.length;
      }
    }

    if (['RESTAURANT', 'BAR', 'POOL'].includes(outlet.type)) {
      const existingTables = await prisma.posTable.count({ where: { outletId: outlet.id } });
      if (existingTables === 0) {
        const areaCount = outlet.type === 'RESTAURANT' ? 2 : 1;
        for (let areaIndex = 0; areaIndex < areaCount; areaIndex += 1) {
          const area = await prisma.tableArea.create({
            data: {
              outletId: outlet.id,
              name: areaIndex === 0 ? 'Sảnh chính' : 'Sân thượng',
              sortOrder: areaIndex,
            },
          });
          const count = outlet.type === 'RESTAURANT' ? (areaIndex === 0 ? 12 : 6) : 8;
          await prisma.posTable.createMany({
            data: Array.from({ length: count }).map((_, index) => ({
              outletId: outlet.id,
              areaId: area.id,
              name: `${areaIndex === 0 ? 'A' : 'B'}${String(index + 1).padStart(2, '0')}`,
              seats: index % 3 === 0 ? 6 : index % 2 === 0 ? 4 : 2,
              status: 'FREE',
              posX: (index % 4) * 120 + 20,
              posY: Math.floor(index / 4) * 120 + 20,
              shape: index % 4 === 0 ? 'round' : 'square',
            })),
          });
          tables += count;
        }
      }
    }
  }


  // Channel room mappings for OTA connectors.
  const hotel = await prisma.property.findFirst({ where: { code: 'GSL-HAN' } });
  if (hotel) {
    const roomTypes = await prisma.roomType.findMany({ where: { propertyId: hotel.id, isActive: true } });
    const otaChannels = await prisma.channel.findMany({
      where: { orgId, type: 'OTA' },
    });
    for (const channel of otaChannels) {
      for (const roomType of roomTypes) {
        await prisma.channelRoomMapping.upsert({
          where: { channelId_roomTypeId: { channelId: channel.id, roomTypeId: roomType.id } },
          update: { isActive: true },
          create: {
            channelId: channel.id,
            roomTypeId: roomType.id,
            externalRoomTypeId: `${channel.code}-${roomType.code}`,
            externalRatePlanId: `${channel.code}-BAR`,
          },
        });
      }
    }
  }

  // Social commerce conversations across every supported messaging channel.
  const conversationCount = await prisma.conversation.count({ where: { orgId } });
  if (conversationCount === 0) {
    const socialChannels = await prisma.channel.findMany({
      where: { orgId, code: { in: ['FACEBOOK', 'INSTAGRAM', 'ZALO', 'TIKTOK', 'WHATSAPP', 'TELEGRAM', 'LINE', 'KAKAOTALK', 'WECHAT'] } },
    });
    const guestsData = [
      { name: 'Nguyễn Thu Hà', handle: '@thuha.travel', subject: 'Hỏi phòng Deluxe cuối tuần' },
      { name: 'Emma Wilson', handle: '@emma.w', subject: 'Airport transfer request' },
      { name: 'Trần Minh Quân', handle: 'Zalo 0903 221 118', subject: 'Đặt tiệc sinh nhật 20 khách' },
      { name: 'Lê Ngọc Anh', handle: '@ngocanh.le', subject: 'Combo spa & stay 2 đêm' },
      { name: 'Phạm Đức Long', handle: '+84 912 338 776', subject: 'Hỏi chính sách huỷ phòng' },
      { name: 'Sofia Garcia', handle: '@sofia.g', subject: 'Late check-out on Sunday' },
      { name: 'Hiroshi Tanaka', handle: 'LINE h.tanaka', subject: 'Room upgrade availability' },
      { name: 'Kim Min-jun', handle: 'Kakao minjun.k', subject: 'Group booking for 8 rooms' },
      { name: 'Chen Wei', handle: 'WeChat chenwei88', subject: 'Restaurant reservation for 6' },
    ];
    for (const [index, channel] of socialChannels.entries()) {
      const guest = guestsData[index % guestsData.length]!;
      const createdAt = new Date(Date.now() - (index + 1) * 3600_000);
      await prisma.conversation.create({
        data: {
          orgId,
          propertyId: hotel?.id ?? null,
          channelId: channel.id,
          externalThreadId: `${channel.code}-THREAD-${String(index + 1).padStart(3, '0')}`,
          guestName: guest.name,
          guestHandle: guest.handle,
          subject: guest.subject,
          status: index % 4 === 0 ? 'PENDING' : 'OPEN',
          priority: index % 3 === 0 ? 1 : 2,
          unreadCount: (index % 3) + 1,
          lastMessageAt: new Date(Date.now() - index * 900_000),
          messages: {
            create: [
              {
                direction: 'INBOUND',
                externalId: `${channel.code}-MSG-${index}-1`,
                senderName: guest.name,
                body: `Xin chào, ${guest.subject.toLowerCase()}. Bên mình còn phòng không ạ?`,
                sentAt: createdAt,
              },
              {
                direction: 'OUTBOUND',
                externalId: `${channel.code}-MSG-${index}-2`,
                senderName: 'Lễ tân Grand Suite',
                body: 'Chào anh/chị, Grand Suite rất vui được hỗ trợ. Anh/chị cho em xin ngày dự kiến và số khách để kiểm tra phòng tốt nhất ạ.',
                sentAt: new Date(createdAt.getTime() + 600_000),
              },
              {
                direction: 'INBOUND',
                externalId: `${channel.code}-MSG-${index}-3`,
                senderName: guest.name,
                body: 'Mình dự kiến cuối tuần này, 2 người lớn. Có ưu đãi gì không?',
                sentAt: new Date(createdAt.getTime() + 1_200_000),
              },
            ],
          },
        },
      });
    }
  }

  return { channels: CHANNELS.length, guests: await prisma.guest.count({ where: { orgId } }), menuItems, tables };
}
