export function moscowDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function quickPeriod(offset = 0, now = new Date()) {
  const today = moscowDay(now);
  const day = new Date(Date.parse(today + 'T12:00:00Z') + offset * 86400000)
    .toISOString().slice(0, 10);
  return {from: day, to: day};
}
