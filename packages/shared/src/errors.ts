/** Stable machine-readable error codes shared by API and clients. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_INVALID: 'MFA_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  REFRESH_REUSE_DETECTED: 'REFRESH_REUSE_DETECTED',
  CSRF_INVALID: 'CSRF_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  PROPERTY_FORBIDDEN: 'PROPERTY_FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INVALID_STATE: 'INVALID_STATE',
  OVERBOOKING: 'OVERBOOKING',
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  IMMUTABLE_RECORD: 'IMMUTABLE_RECORD',
  UNBALANCED_JOURNAL: 'UNBALANCED_JOURNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES_VI: Record<string, string> = {
  VALIDATION_ERROR: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
  UNAUTHORIZED: 'Bạn cần đăng nhập để tiếp tục.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  ACCOUNT_LOCKED: 'Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau 15 phút.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hoá.',
  MFA_REQUIRED: 'Cần mã xác thực hai lớp.',
  MFA_INVALID: 'Mã xác thực không đúng hoặc đã hết hạn.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn.',
  REFRESH_REUSE_DETECTED: 'Phát hiện sử dụng lại phiên cũ. Vì an toàn, vui lòng đăng nhập lại.',
  CSRF_INVALID: 'Yêu cầu không hợp lệ (CSRF). Vui lòng tải lại trang.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  PROPERTY_FORBIDDEN: 'Bạn không có quyền truy cập cơ sở này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  CONFLICT: 'Dữ liệu đã thay đổi hoặc bị trùng.',
  UNPROCESSABLE: 'Không thể xử lý yêu cầu ở trạng thái hiện tại.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.',
  INTERNAL: 'Đã xảy ra lỗi hệ thống. Chúng tôi đã ghi nhận để xử lý.',
  DATABASE_UNAVAILABLE: 'Không kết nối được cơ sở dữ liệu.',
  INTEGRATION_ERROR: 'Lỗi kết nối với dịch vụ bên ngoài.',
  INVALID_STATE: 'Trạng thái chứng từ không cho phép thao tác này.',
  OVERBOOKING: 'Phòng đã được đặt trong khoảng thời gian này. Vui lòng chọn phòng khác.',
  IDEMPOTENT_REPLAY: 'Yêu cầu này đã được xử lý trước đó.',
  IMMUTABLE_RECORD: 'Bản ghi bất biến, không thể sửa hoặc xoá.',
  UNBALANCED_JOURNAL: 'Bút toán không cân bằng.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, status = 400, details?: unknown) {
    super(message ?? ERROR_MESSAGES_VI[code] ?? code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static unauthorized(message?: string): AppError {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }

  static forbidden(message?: string): AppError {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
  }

  static notFound(message?: string): AppError {
    return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
  }

  static conflict(message?: string, details?: unknown): AppError {
    return new AppError(ERROR_CODES.CONFLICT, message, 409, details);
  }

  static validation(message?: string, details?: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, 422, details);
  }
}
