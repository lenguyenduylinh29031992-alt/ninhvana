INSERT INTO "Role" ("id", "code", "name", "nameEn", "description", "scope", "level", "isSystem")
VALUES ('role-hr-staff', 'HR_STAFF', 'Nhân viên nhân sự', 'HR Officer', 'Hồ sơ nhân sự, xếp ca, chấm công; không xem lương toàn bộ hay cấu hình hệ thống.', 'PROPERTY', 3, true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp-hrstaff-' || p."code", 'role-hr-staff', p."id"
FROM "Permission" p
WHERE p."code" IN ('dashboard:view','employee:view','roster:view','attendance:view','leave:view','leave:request','report:view','assistant:use')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
