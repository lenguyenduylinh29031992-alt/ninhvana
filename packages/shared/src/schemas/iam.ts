import { z } from 'zod';
import { isOrgWideRole, isRoleCode } from '../rbac';
import { emailSchema, passwordSchema } from './auth';
import { localeSchema, optionalText } from './common';

export const roleAssignmentSchema = z.object({
  roleCode: z.string().refine(isRoleCode, 'Vai trò không hợp lệ'),
  propertyId: z.string().min(1).nullable().optional().default(null),
});

export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;

/** Org-wide roles must not be scoped to a property; property roles must be scoped. */
export const rolesArraySchema = z
  .array(roleAssignmentSchema)
  .min(1, 'Cần ít nhất một vai trò')
  .superRefine((roles, ctx) => {
    const seen = new Set<string>();
    for (const [index, role] of roles.entries()) {
      const key = `${role.propertyId ?? 'org'}:${role.roleCode}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vai trò bị trùng',
          path: [index],
        });
      }
      seen.add(key);
      if (isOrgWideRole(role.roleCode) && role.propertyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vai trò cấp tập đoàn không gắn với cơ sở',
          path: [index, 'propertyId'],
        });
      }
      if (!isOrgWideRole(role.roleCode) && !role.propertyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng chọn cơ sở cho vai trò này',
          path: [index, 'propertyId'],
        });
      }
    }
  });

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, 'Họ tên quá ngắn').max(120),
  departmentCode: z.string().trim().max(40).nullable().optional(),
  phone: optionalText(20),
  password: passwordSchema,
  locale: localeSchema.default('vi'),
  avatarUrl: z.string().trim().url().max(1000).optional(),
  isActive: z.boolean().default(true),
  roles: rolesArraySchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  departmentCode: z.string().trim().max(40).nullable().optional(),
  phone: optionalText(20),
  locale: localeSchema.optional(),
  avatarUrl: z.string().trim().url().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  roles: rolesArraySchema.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
  requireChange: z.boolean().default(true),
});

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: optionalText(200),
  roleCode: optionalText(40),
  propertyId: optionalText(64),
  isActive: z
    .preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean().optional()),
});

export const rolePermissionUpdateSchema = z.object({
  permissions: z.array(z.string().min(1)).max(500),
});
