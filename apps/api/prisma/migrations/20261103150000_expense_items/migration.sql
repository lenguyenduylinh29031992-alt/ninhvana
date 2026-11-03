CREATE TABLE "ExpenseItem" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "employeeName" TEXT,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'SHOPPING',
  "amount" DECIMAL(18,2) NOT NULL,
  "itemDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ExpenseItem_expenseId_idx" ON "ExpenseItem"("expenseId");
CREATE INDEX "ExpenseItem_employeeName_idx" ON "ExpenseItem"("employeeName");
