'use strict';
// Presentation only: never changes a stored Date, UTC wire value or process TZ.
const TIME_ZONE = 'Asia/Colombo';
const ZONE_LABEL = 'Sri Lanka time, UTC+05:30';
function displayDate(value) {
  if (!(value instanceof Date) && !['string','number'].includes(typeof value)) return null;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const day=new Date(value+'T00:00:00Z');
      if (!Number.isFinite(+day)||day.toISOString().slice(0,10)!==value)return null;
      return day;
    }
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value))return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function zoneLabel(date) {
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value.replace('GMT','UTC');
  return 'Sri Lanka time, '+offset;
}
function formatSriLankaDateTime(value, locale = 'en-US', options) {
  const date = displayDate(value); if (!date) return '—';
  const selected = options || { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true };
  return new Intl.DateTimeFormat(locale || 'en-US', { ...selected, timeZone:TIME_ZONE }).format(date) + ' (' + zoneLabel(date) + ')';
}
function formatSriLankaDate(value, locale = 'en-US', options) {
  const date = displayDate(value); if (!date) return '—';
  return new Intl.DateTimeFormat(locale || 'en-US', { ...(options || {year:'numeric',month:'numeric',day:'numeric'}), timeZone:TIME_ZONE }).format(date) + ' (' + zoneLabel(date) + ')';
}
function formatCalendarDate(value, locale = 'en-US', options) {
  const date=displayDate(value);if(!date)return '—';
  return new Intl.DateTimeFormat(locale || 'en-US', {...(options || {year:'numeric',month:'numeric',day:'numeric'}),timeZone:'UTC'}).format(date);
}
module.exports={TIME_ZONE,ZONE_LABEL,formatSriLankaDateTime,formatSriLankaDate,formatCalendarDate};
