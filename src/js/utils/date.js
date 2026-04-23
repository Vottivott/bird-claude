export function toLocalDateString(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayDiff(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00:00');
  const b = new Date(dateStrB + 'T00:00:00');
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

export function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday = 0
}

export function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateFull(date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function today() {
  return toLocalDateString(new Date());
}
