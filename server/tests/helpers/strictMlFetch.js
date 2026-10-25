// Expected ML ingestion is a pure test response. Fallback remains the network guard.
function createStrictMlFetch(blockedFetch, receipt) {
  return async function(input, options = {}) {
    let url, body;
    try {
      // Request/stream inputs are deliberately unsupported by this narrow seam.
      if (typeof input !== 'string') throw new Error('input');
      url = new URL(input);
      if (options.method !== 'POST' || url.origin !== 'http://127.0.0.1:5101' || url.pathname !== '/ingest' ||
          url.search || url.hash || url.username || url.password) throw new Error('destination');
      const headers = options.headers || {};
      if (headers['Content-Type'] !== 'application/json' || typeof headers['x-internal-key'] !== 'string' || !headers['x-internal-key']) throw new Error('headers');
      if (typeof options.body !== 'string') throw new Error('body');
      body = JSON.parse(options.body);
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['district','drugCategory','date'].includes(k)) ||
          (body.district !== undefined && typeof body.district !== 'string') || typeof body.drugCategory !== 'string' || !body.drugCategory.trim() ||
          typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || new Date(body.date).toISOString().slice(0,10) !== body.date) throw new Error('payload');
    } catch (_) {
      receipt.rejectedNativeFetch = (receipt.rejectedNativeFetch || 0) + 1;
      return blockedFetch(input, options);
    }
    receipt.mockedNativeIngest = (receipt.mockedNativeIngest || 0) + 1;
    return { ok:true, status:200, json:async()=>({ingested:true,mocked:true}) };
  };
}
module.exports = { createStrictMlFetch };
