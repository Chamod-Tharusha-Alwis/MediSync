export function trustedMapEmbedUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let url; try { url = new URL(value); } catch (_) { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.google.com', 'maps.google.com', 'google.com'].includes(url.hostname)) return '';
  if (url.pathname.startsWith('/maps/embed')) return url.href;
  return 'https://maps.google.com/maps?q=' + encodeURIComponent(url.href) + '&output=embed';
}
