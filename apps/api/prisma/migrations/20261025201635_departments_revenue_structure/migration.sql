-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "division" TEXT NOT NULL DEFAULT 'SHARED';

-- AlterTable
ALTER TABLE "PropertyArea" ADD COLUMN     "departmentCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "departmentGroups" "DepartmentGroup"[] DEFAULT ARRAY[]::"DepartmentGroup"[];

