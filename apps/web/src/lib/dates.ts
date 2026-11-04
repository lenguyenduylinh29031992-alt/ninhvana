/** Local calendar date (YYYY-MM-DD), independent of UTC offset. */
export function localDate(value: Date = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

/** Local calendar month (YYYY-MM), independent of UTC offset. */
export function localMonth(value: Date = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}
