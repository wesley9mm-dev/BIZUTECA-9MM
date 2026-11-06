'use strict';
(function expose(factory) {
  const dates = factory();
  if (typeof module === 'object' && module.exports) module.exports = dates;
  else globalThis.BizDates = dates;
})(function datesModule() {
  const pad = n => String(n).padStart(2, '0');
  const key = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parts = day => day.split('-').map(Number);
  function parse(day) {
    if (typeof day !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(day)) return null;
    const [y, m, d] = parts(day);
    const date = new Date(y, m - 1, d, 12);
    return key(date) === day ? date : null;
  }
  function daysBetween(a, b) {
    const ordinal = value => {
      const [year, month, day] = parts(value);
      return Date.UTC(year, month - 1, day) / 86400000;
    };
    return ordinal(b) - ordinal(a);
  }
  function nextEvent(events, now = new Date()) {
    const today = key(now);
    return events.filter(event => {
      const date = parse(event.day);
      if (!date || event.day < today) return false;
      if (!event.time) return true;
      date.setHours(...event.time.split(':').map(Number), 0, 0);
      return date >= now;
    }).sort((a, b) => a.day.localeCompare(b.day) ||
      a.time.localeCompare(b.time) || a.id - b.id)[0] || null;
  }
  return { key, parse, daysBetween, nextEvent };
});
