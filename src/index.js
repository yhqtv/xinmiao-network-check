const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store'
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*')
    .split(',').map(x => x.trim()).filter(Boolean);
  const allowOrigin = allowed.includes('*') || allowed.includes(origin) ? (allowed.includes('*') ? '*' : origin) : '';
  return {
    ...(allowOrigin ? {'Access-Control-Allow-Origin': allowOrigin} : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(data, request, env, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...JSON_HEADERS, ...corsHeaders(request, env), ...extra}
  });
}

function validIP(ip) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every(x => Number(x) >= 0 && Number(x) <= 255);
  }
  return /^[0-9a-fA-F:]{2,}$/.test(ip) && ip.includes(':');
}

async function handleIp(request, env) {
  const cf = request.cf || {};
  const headers = request.headers;
  const ip = headers.get('CF-Connecting-IP') || headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || null;
  return json({
    ip,
    country: cf.country || null,
    city: cf.city || null,
    region: cf.region || null,
    regionCode: cf.regionCode || null,
    postalCode: cf.postalCode || null,
    timezone: cf.timezone || null,
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    asn: cf.asn || null,
    asOrganization: cf.asOrganization || null,
    colo: cf.colo || null,
    continent: cf.continent || null,
    httpProtocol: cf.httpProtocol || null,
    tlsVersion: cf.tlsVersion || null,
    tlsCipher: cf.tlsCipher || null
  }, request, env);
}

async function handleLookup(request, env) {
  const u = new URL(request.url);
  const ip = (u.searchParams.get('ip') || '').trim();
  if (!ip || !validIP(ip)) return json({error:'请输入有效 IP 地址'}, request, env, 400);
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: {'User-Agent':'XinMiao-Network-Check/1.1'}
    });
    const d = await r.json();
    if (!r.ok || d.success === false) return json({error:d.message || '上游查询失败'}, request, env, 502);
    return json(d, request, env, 200, {'Cache-Control':'public, max-age=3600'});
  } catch {
    return json({error:'IP 查询服务暂时不可用'}, request, env, 502);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {status:204, headers:corsHeaders(request, env)});
    }
    if (request.method !== 'GET') return json({error:'Method Not Allowed'}, request, env, 405);
    const {pathname} = new URL(request.url);
    if (pathname === '/' || pathname === '/health') return json({ok:true, service:'XinMiao Network API', version:'1.3.0'}, request, env);
    if (pathname === '/api/ip') return handleIp(request, env);
    if (pathname === '/api/lookup') return handleLookup(request, env);
    return json({error:'Not Found'}, request, env, 404);
  }
};
