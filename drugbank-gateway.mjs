// Deploy this module as a private-key gateway. GitHub Pages serves only the planner.
const origin = 'https://sneakyzebra.github.io';
const validId = value => typeof value === 'string' && /^DBPC\d{7,10}$/.test(value);
const hasText = value => typeof value === 'string' && Boolean(value.trim());

function response(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'X-Content-Type-Options': 'nosniff'
  }});
}

function upstreamURL(path, body) {
  const url = new URL('https://api.drugbank.com/v1/' + (path === '/search' ? 'product_concepts' : 'ddi'));
  url.searchParams.set('region', 'us');
  if (path === '/search') {
    if (!hasText(body?.name) || body.name.trim().length < 2 || body.name.length > 240) return null;
    url.searchParams.set('q', body.name.trim());
    url.searchParams.set('min_level', '3');
  } else {
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 40 || !ids.every(validId) || new Set(ids).size !== ids.length) return null;
    url.searchParams.set('product_concept_id', ids.join(','));
  }
  return url;
}

function publicData(path, data, ids) {
  if (path === '/search') {
    if (!Array.isArray(data) || data.some(p => !validId(p?.drugbank_pcid) || !hasText(p.name))) return null;
    return {products: data.slice(0, 12).map(p => ({id: p.drugbank_pcid, name: p.name}))};
  }
  if (!Array.isArray(data?.interactions) || data.total_results !== data.interactions.length) return null;
  const findings = [];
  for (const row of data.interactions) {
    if (!ids.includes(row?.product_concept_id) || !ids.includes(row.affected_product_concept_id) ||
        !hasText(row.description) || !hasText(row.severity)) return null;
    findings.push({first: row.product_concept_id, second: row.affected_product_concept_id,
      severity: row.severity, description: row.description});
  }
  return {findings};
}

async function requestDrugBank(url, key) {
  const options = {headers: {Authorization: key, Accept: 'application/json'},
    signal: AbortSignal.timeout(10000), redirect: 'manual', cache: 'no-store'};
  let target = url;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetch(target, options);
    if (![301, 302, 303, 307, 308].includes(result.status)) return result;
    const location = result.headers.get('Location');
    if (!location) break;
    target = new URL(location, target);
    if (target.origin !== url.origin || target.username || target.password) break;
  }
  throw Error('Unexpected upstream redirect');
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!['/search', '/check'].includes(path)) return response({}, 404);
    if (request.headers.get('Origin') !== origin) return response({}, 403);
    if (request.method === 'OPTIONS') return response(null, 204);
    if (request.method !== 'POST') return response({}, 405);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return response({}, 415);
    if (!env.DRUGBANK_API_KEY || !env.CHECK_LIMIT) return response({}, 503);
    try {
      const {success} = await env.CHECK_LIMIT.limit({key: request.headers.get('CF-Connecting-IP') || 'unknown'});
      if (!success) return response({}, 429);
      if (Number(request.headers.get('Content-Length')) > 4096) return response({}, 413);
      const reader = request.body?.getReader();
      if (!reader) return response({}, 400);
      let size = 0, raw = '';
      const decoder = new TextDecoder();
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return response({}, 413); }
        raw += decoder.decode(value, {stream: true});
      }
      let body;
      try { body = JSON.parse(raw + decoder.decode()); } catch { return response({}, 400); }
      const url = upstreamURL(path, body);
      if (!url) return response({}, 400);
      const result = await requestDrugBank(url, env.DRUGBANK_API_KEY);
      if (!result.ok) return response({}, result.status === 429 ? 429 : 503);
      const payload = publicData(path, await result.json(), body.ids);
      return payload ? response(payload) : response({}, 502);
    } catch {
      return response({}, 503);
    }
  }
};
