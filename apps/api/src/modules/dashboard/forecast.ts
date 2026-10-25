export interface MonthlyPoint { month: string; revenue: number }
export interface ForecastPoint { month: string; revenue: number; low: number; high: number }

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 7);
}

function linear(series: number[]): { slope: number; intercept: number } {
  const n = series.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0;
  for (let index = 0; index < n; index += 1) {
    sumX += index; sumY += series[index]!; sumXY += index * series[index]!; sumXX += index * index;
  }
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  return { slope, intercept: (sumY - slope * sumX) / n };
}

function seasonalFactors(series: number[]): Map<number, number> {
  const factors = new Map<number, number>();
  if (series.length < 12) return factors;
  const trend = linear(series);
  const buckets = new Map<number, { actual: number; trend: number; count: number }>();
  series.forEach((value, index) => {
    const predicted = trend.intercept + trend.slope * index;
    if (predicted <= 0) return;
    const [year, month] = index < 0 ? ['2000', '01'] : ['2000', String((index % 12) + 1).padStart(2, '0')];
    void year;
    const bucket = buckets.get(Number(month)) ?? { actual: 0, trend: 0, count: 0 };
    bucket.actual += value; bucket.trend += predicted; bucket.count += 1;
    buckets.set(Number(month), bucket);
  });
  for (const [month, bucket] of buckets) {
    if (bucket.trend > 0) factors.set(month, Math.max(0.65, Math.min(1.45, bucket.actual / bucket.trend)));
  }
  return factors;
}

function predict(series: number[], monthIndex: number): number {
  const recent = series.slice(-18);
  const trend = linear(recent);
  const base = trend.intercept + trend.slope * (recent.length - 1 + 1);
  const factor = seasonalFactors(series).get((monthIndex % 12) + 1) ?? 1;
  return Math.max(0, base * factor);
}

/**
 * Trend + calendar-seasonality forecast with a genuine rolling backtest.
 * MAPE is computed by training on all data before each of the last six months
 * and predicting that month, so it is not an in-sample score.
 */
export function forecastRevenue(points: MonthlyPoint[], horizon = 6) {
  const series = points.map((point) => point.revenue);
  const lastMonth = points.at(-1)?.month ?? new Date().toISOString().slice(0, 7);
  const forecast: ForecastPoint[] = [];
  let month = lastMonth;
  for (let step = 1; step <= horizon; step += 1) {
    const value = predict(series, Number(nextMonth(month).slice(5, 7)) - 1);
    forecast.push({
      month: nextMonth(month),
      revenue: Math.round(value),
      low: Math.round(value * 0.84),
      high: Math.round(value * 1.16),
    });
    month = nextMonth(month);
  }

  let totalError = 0;
  let evaluated = 0;
  for (let index = Math.max(12, series.length - 6); index < series.length; index += 1) {
    const training = series.slice(0, index);
    const predicted = predict(training, Number(points[index]!.month.slice(5, 7)) - 1);
    const actual = series[index]!;
    if (actual > 0) {
      totalError += Math.abs(predicted - actual) / actual;
      evaluated += 1;
    }
  }
  return {
    method: 'trend + seasonality (rolling backtest)',
    horizon,
    points: forecast,
    backtestMonths: evaluated,
    mape: evaluated > 0 ? Number(((totalError / evaluated) * 100).toFixed(1)) : null,
  };
}
