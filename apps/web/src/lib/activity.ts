const ACTIVITY_LABELS: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'auth.logout': 'Đăng xuất',
  'auth.login_failed': 'Đăng nhập thất bại',
  'auth.account_locked': 'Tài khoản bị tạm khoá',
  'auth.mfa_challenge': 'Yêu cầu xác thực 2 lớp',
  'auth.2fa_enabled': 'Bật xác thực 2 lớp',
  'auth.2fa_disabled': 'Tắt xác thực 2 lớp',
  'auth.password_changed': 'Đổi mật khẩu',
  'auth.profile_updated': 'Cập nhật hồ sơ',
  'auth.refresh_reuse_detected': 'Cảnh báo phiên bất thường',
  'system.seed': 'Khởi tạo dữ liệu nền tảng',
  'property.created': 'Tạo cơ sở',
  'property.updated': 'Cập nhật cơ sở',
  'iam.user_created': 'Tạo người dùng',
  'iam.user_updated': 'Cập nhật người dùng',
  'iam.password_reset': 'Đặt lại mật khẩu',
  'iam.role_permissions_updated': 'Thay đổi quyền vai trò',
  'settings.updated': 'Cập nhật cấu hình',
  'settings.tax_rate_created': 'Thêm biểu thuế',
  'settings.tax_rate_updated': 'Sửa biểu thuế',
  'settings.exchange_rate_upserted': 'Cập nhật tỷ giá',
  'settings.integration_updated': 'Cập nhật tích hợp',
  'reservation.created': 'Tạo đặt phòng',
  'reservation.updated': 'Cập nhật đặt phòng',
  'reservation.cancelled': 'Huỷ đặt phòng',
  'reservation.checked_in': 'Khách nhận phòng',
  'reservation.checked_out': 'Khách trả phòng',
  'folio.settled': 'Quyết toán folio',
  'folio.voided': 'Huỷ khoản tính tiền',
  'invoice.issued': 'Phát hành hoá đơn',
  'payment.refunded': 'Hoàn tiền',
  'night_audit.completed': 'Chốt ngày (night audit)',
  'night_audit.reopened': 'Mở lại ngày',
  'pos.order.paid': 'Thanh toán order',
  'expense.approved': 'Duyệt chi phí',
  'payroll.approved': 'Duyệt bảng lương',
  'channel.sync.failed': 'Đồng bộ kênh thất bại',
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}

const ENTITY_LABELS: Record<string, string> = {
  User: 'người dùng',
  Property: 'cơ sở',
  Role: 'vai trò',
  SystemSetting: 'cấu hình',
  TaxRate: 'thuế',
  ExchangeRate: 'tỷ giá',
  IntegrationConfig: 'tích hợp',
  System: 'hệ thống',
  Reservation: 'đặt phòng',
  Folio: 'folio',
  Invoice: 'hoá đơn',
  Payment: 'thanh toán',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.toLowerCase();
}
