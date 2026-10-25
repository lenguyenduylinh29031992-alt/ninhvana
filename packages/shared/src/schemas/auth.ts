import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants';
import { localeSchema } from './common';

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(128, 'Mật khẩu tối đa 128 ký tự')
  .regex(/[A-Za-zÀ-ỹ]/, 'Mật khẩu phải có ít nhất một chữ cái')
  .regex(/\d/, 'Mật khẩu phải có ít nhất một chữ số');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email không hợp lệ')
  .max(190, 'Email quá dài');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(128),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số')
    .optional(),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(20, 'Phiên xác thực không hợp lệ'),
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số'),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const totpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên quá ngắn').max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  locale: localeSchema.optional(),
  avatarUrl: z.string().trim().url().max(1000).nullable().optional(),
});

export const twoFactorDisableSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Mã xác thực gồm 6 chữ số'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
