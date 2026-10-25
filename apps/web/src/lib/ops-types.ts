export interface ReservationSummary {
  id: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomsCount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  specialRequests: string | null;
  guest: { fullName: string; email: string | null; phone: string | null; vipLevel: number };
  channel: { code: string; name: string } | null;
  rooms: Array<{ id: string; roomNumber: string | null; roomType: string }>;
}

export interface FrontDeskBoard {
  propertyId: string;
  businessDate: string;
  counts: {
    arrivals: number;
    inHouse: number;
    departures: number;
    dirtyRooms: number;
    availableRooms: number;
  };
  arrivals: ReservationSummary[];
  inHouse: ReservationSummary[];
  departures: ReservationSummary[];
}

export interface FolioItem {
  id: string;
  businessDate: string;
  type: string;
  department: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  serviceCharge: number;
  taxAmount: number;
  total: number;
  isVoid: boolean;
  journalized: boolean;
  invoiceId: string | null;
}

export interface FolioDetail {
  id: string;
  number: string;
  status: string;
  balance: number;
  currency: string;
  guest: { fullName: string; email: string | null; phone: string | null; vipLevel: number };
  property: { name: string; code: string; taxCode: string | null; address: string | null };
  reservation: { id: string; code: string; checkIn: string; checkOut: string; rooms: string[] } | null;
  totals: { net: number; serviceCharge: number; vat: number; gross: number; paid: number };
  items: FolioItem[];
  payments: Array<{ id: string; method: string; status: string; amount: number; paidAt: string; reference: string | null }>;
  invoices: Array<{ id: string; number: string; status: string; total: number; balance: number }>;
}

export interface ReservationDetail {
  id: string;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  roomsCount: number;
  currency: string;
  totals: {
    net: number;
    serviceCharge: number;
    vat: number;
    total: number;
    commission: number;
    paid: number;
    balance: number;
    deposit: number;
  };
  specialRequests: string | null;
  notes: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  guest: { id: string; fullName: string; email: string | null; phone: string | null; nationality: string | null; vipLevel: number };
  channel: { code: string; name: string; commissionPct: number } | null;
  company: { id: string; name: string } | null;
  rooms: Array<{
    id: string;
    roomNumber: string | null;
    status: string;
    roomType: { id: string; name: string; code: string };
    adults: number;
    children: number;
    nightlyRate: number;
    totalAmount: number;
    folioId: string | null;
    nights: Array<{ id: string; date: string; rate: number; total: number; posted: boolean }>;
  }>;
  folios: Array<{ id: string; number: string; status: string; balance: number }>;
}

export interface AvailabilityRoom {
  roomTypeId: string;
  code: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  sizeSqm: number | null;
  bedType: string | null;
  available: number;
  ratePlanId: string | null;
  ratePlanName: string | null;
  averageNightly: number;
  net: number;
  serviceCharge: number;
  vat: number;
  total: number;
  currency: string;
  nights: Array<{ date: string; rate: number; total: number }>;
}

export interface PosOutlet {
  id: string;
  name: string;
  code: string;
  type: string;
  serviceChargePct: number;
  areas: Array<{ id: string; name: string; tables: PosTable[] }>;
  tables: PosTable[];
  openOrders: Array<{ id: string; number: string; tableId: string | null; total: number; status: string }>;
}

export interface PosTable {
  id: string;
  name: string;
  seats: number;
  status: string;
  areaId: string | null;
  posX: number;
  posY: number;
  shape: string;
}

export interface PosMenuCategory {
  id: string;
  name: string;
  items: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    price: number;
    station: string;
    tags: string[];
    modifiers: Array<{ id: string; name: string; required: boolean; maxSelect: number; options: Array<{ id: string; name: string; priceDelta: number }> }>;
  }>;
}

export interface PosOrder {
  id: string;
  number: string;
  status: string;
  type: string;
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  table: string | null;
  tableId: string | null;
  reservationId: string | null;
  folioId: string | null;
  outlet: { id: string; name: string };
  items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: string;
    station: string;
    notes: string | null;
    sent: boolean;
  }>;
  payments?: Array<{ id: string; method: string; amount: number; paidAt: string }>;
}

export interface HousekeepingTask {
  id: string;
  type: string;
  status: string;
  priority: number;
  notes: string | null;
  checklist: Array<{ item: string; done: boolean }> | null;
  room: { id: string; number: string; status: string; floor: string | null; roomType: string };
  assignedTo: { id: string; fullName: string } | null;
}

export interface HousekeepingBoard {
  counts: { pending: number; inProgress: number; done: number; blocked: number };
  items: HousekeepingTask[];
}
