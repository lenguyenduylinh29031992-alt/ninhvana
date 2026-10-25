import { roundMoney } from './money';

export interface PayrollInput {
  baseSalary: number;
  allowances: number;
  overtimeHours: number;
  dependents: number;
}

export interface PayrollResult {
  baseSalary: number;
  allowances: number;
  overtimePay: number;
  gross: number;
  insuranceEmployee: number;
  unionFee: number;
  taxableIncome: number;
  tax: number;
  net: number;
  insuranceEmployer: number;
  totalCost: number;
}

const PERSONAL_DEDUCTION = 11_000_000;
const DEPENDENT_DEDUCTION = 4_400_000;

/** Vietnam PIT on monthly taxable income (simplified 7-bracket table). */
export function personalIncomeTax(taxable: number): number {
  const brackets: Array<[number, number]> = [
    [5_000_000, 0.05],
    [10_000_000, 0.1],
    [18_000_000, 0.15],
    [32_000_000, 0.2],
    [52_000_000, 0.25],
    [80_000_000, 0.3],
    [Number.POSITIVE_INFINITY, 0.35],
  ];
  let remaining = Math.max(0, taxable);
  let previous = 0;
  let tax = 0;
  for (const [limit, rate] of brackets) {
    const slice = Math.min(remaining, limit - previous);
    if (slice <= 0) break;
    tax += slice * rate;
    remaining -= slice;
    previous = limit;
  }
  return Number(tax.toFixed(2));
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const money = (value: number) => Number(roundMoney(value));
  const base = money(input.baseSalary);
  const allowances = money(input.allowances);
  const hourly = base / 26 / 8;
  const overtimePay = money(hourly * 1.5 * input.overtimeHours);
  const gross = money(base + allowances + overtimePay);
  const insuranceEmployee = money(base * 0.105);
  const unionFee = money(base * 0.01);
  const taxableIncome = Math.max(
    0,
    gross - insuranceEmployee - PERSONAL_DEDUCTION - input.dependents * DEPENDENT_DEDUCTION,
  );
  const tax = personalIncomeTax(taxableIncome);
  const net = money(gross - insuranceEmployee - unionFee - tax);
  const insuranceEmployer = money(base * 0.215);
  return {
    baseSalary: base,
    allowances,
    overtimePay,
    gross,
    insuranceEmployee,
    unionFee,
    taxableIncome,
    tax,
    net,
    insuranceEmployer,
    totalCost: money(gross + insuranceEmployer),
  };
}

export function payrollAccrual(input: {
  gross: number;
  employerInsurance: number;
  employeeInsurance: number;
  unionFee: number;
  tax: number;
  net: number;
  department?: string;
}) {
  const lines = [
    { accountCode: '6000', debit: input.gross, credit: 0, department: input.department },
    { accountCode: '6010', debit: input.employerInsurance, credit: 0, department: input.department },
    { accountCode: '3340', debit: 0, credit: input.net },
    { accountCode: '3380', debit: 0, credit: input.employeeInsurance + input.unionFee + input.employerInsurance },
    { accountCode: '3335', debit: 0, credit: input.tax },
  ].filter((line) => line.debit > 0 || line.credit > 0);
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Bút toán lương không cân bằng: ${totalDebit} ≠ ${totalCredit}`);
  }
  return lines;
}
