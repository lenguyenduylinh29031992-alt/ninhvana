INSERT INTO "Role" ("id", "code", "name", "nameEn", "description", "scope", "level", "isSystem")
VALUES
  ('role-department-head', 'DEPARTMENT_HEAD', 'Trưởng bộ phận', 'Department Head', 'Quản lý nhân sự, ca làm, chấm công và ngân sách trong bộ phận được phân công.', 'PROPERTY', 5, true),
  ('role-probation', 'PROBATION', 'Nhân viên thử việc', 'Probation Employee', 'Tài khoản thử việc: chỉ dashboard và đơn nghỉ phép.', 'PROPERTY', 0, true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp-dept-' || p."code", 'role-department-head', p."id"
FROM "Permission" p
WHERE p."code" IN (
  'dashboard:view','employee:view','employee:manage','user:view','user:manage',
  'roster:view','roster:manage','attendance:view','attendance:manage',
  'leave:view','leave:approve','payroll:view','budget:view','report:view','report:export','assistant:use'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp-prob-' || p."code", 'role-probation', p."id"
FROM "Permission" p
WHERE p."code" IN ('dashboard:view','leave:request','leave:view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp-hr-' || p."code", r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" = 'HR_MANAGER' AND p."code" IN ('user:view','user:manage','report:export')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
