const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

const j = (obj, status=200, extra={}) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", ...cors, ...extra }
  });

function cfIp(req){
  return req.headers.get("CF-Connecting-IP") || "";
}

function ipVersion(ip=""){
  return ip.includes(":") ? 6 : (ip.includes(".") ? 4 : null);
}

function baseIp(req){
  const cf = req.cf || {};
  const ip = cfIp(req);
  return {
    ok: true,
    ip,
    ip_version: ipVersion(ip),
    country: cf.country || null,
    region: cf.region || cf.regionCode || null,
    city: cf.city || null,
    postal_code: cf.postalCode || null,
    timezone: cf.timezone || null,
    latitude: cf.latitude ?? null,
    longitude: cf.longitude ?? null,
    asn: cf.asn ? `AS${cf.asn}` : null,
    asn_number: cf.asn || null,
    organization: cf.asOrganization || null,
    colo: cf.colo || null,
    http_protocol: cf.httpProtocol || null,
    tls_version: cf.tlsVersion || null,
    tls_cipher: cf.tlsCipher || null
  };
}

async function fetchJson(url, ms=6000, headers={}){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms);
  const started = Date.now();
  try{
    const r = await fetch(url, {signal: ctl.signal, headers});
    const text = await r.text();
    let data;
    try{ data = JSON.parse(text); }catch{ throw new Error(`upstream invalid json (${r.status})`); }
    if(!r.ok) throw new Error(data?.message || data?.error || `upstream ${r.status}`);
    return {data, elapsed_ms: Date.now()-started};
  } finally {
    clearTimeout(t);
  }
}

function riskScore(q){
  // Transparent local score: risk flags only; not a fraud-provider proprietary score.
  let risk = 0;
  const weights = {
    is_bogon: 100,
    is_tor: 45,
    is_abuser: 30,
    is_proxy: 25,
    is_vpn: 20,
    is_datacenter: 18,
    is_crawler: 10,
    is_satellite: 3
  };
  for(const [k,w] of Object.entries(weights)){
    if(q?.[k] === true) risk += w;
  }
  risk = Math.min(100, risk);
  return {
    trust_score: 100-risk,
    risk_score: risk,
    level: risk >= 60 ? "high" : risk >= 25 ? "medium" : "low"
  };
}

async function qualityLookup(ip, env){
  const key = env.IPAPI_IS_KEY;
  if(!key){
    return {
      ok:false,
      configured:false,
      provider:"ipapi.is",
      message:"未配置 IPAPI_IS_KEY。Cloudflare Worker 添加该 Secret 后即可启用真实 VPN/Proxy/Tor/Hosting/Abuser 检测。"
    };
  }
  const url = `https://api.ipapi.is/?q=${encodeURIComponent(ip)}&key=${encodeURIComponent(key)}`;
  const {data, elapsed_ms} = await fetchJson(url, 7000);
  if(data.error) throw new Error(typeof data.error === "string" ? data.error : "ipapi.is error");
  const score = riskScore(data);
  return {
    ok:true,
    configured:true,
    provider:"ipapi.is",
    provider_elapsed_ms: elapsed_ms,
    ip:data.ip || ip,
    rir:data.rir ?? null,
    is_bogon:data.is_bogon ?? null,
    is_mobile:data.is_mobile ?? null,
    is_satellite:data.is_satellite ?? null,
    is_crawler:data.is_crawler ?? null,
    is_datacenter:data.is_datacenter ?? null,
    is_tor:data.is_tor ?? null,
    is_proxy:data.is_proxy ?? null,
    is_vpn:data.is_vpn ?? null,
    is_abuser:data.is_abuser ?? null,
    egress_service:data.egress_service ?? null,
    company:data.company ?? null,
    datacenter:data.datacenter ?? null,
    asn:data.asn ?? null,
    location:data.location ?? null,
    ...score
  };
}

async function handleLookup(url, env){
  const q = (url.searchParams.get("ip") || url.searchParams.get("q") || "").trim();
  if(!q) return j({ok:false,error:"missing ip"},400);
  try{
    const quality = await qualityLookup(q, env);
    return j({ok:true, query:q, quality});
  }catch(e){
    return j({ok:false,error:e.message},502);
  }
}

export default {
  async fetch(req, env){
    if(req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
    const url = new URL(req.url);

    if(url.pathname === "/health" || url.pathname === "/api/health"){
      return j({ok:true,service:"XinMiao Network API",version:"1.6.0",frontend:"worker-static-assets"});
    }

    if(url.pathname === "/ip" || url.pathname === "/api/ip"){
      return j(baseIp(req));
    }

    if(url.pathname === "/quality" || url.pathname === "/api/quality"){
      const ip = (url.searchParams.get("ip") || cfIp(req)).trim();
      if(!ip) return j({ok:false,error:"ip unavailable"},400);
      try{
        return j(await qualityLookup(ip, env));
      }catch(e){
        return j({ok:false,configured:true,provider:"ipapi.is",error:e.message},502);
      }
    }

    if(url.pathname === "/lookup" || url.pathname === "/api/lookup"){
      return handleLookup(url, env);
    }

    // 非 API 路径交给 Cloudflare Static Assets。
    // 这样访问 Worker 根地址 / 就会直接显示完整前端页面。
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(req);
      if (assetResponse.status !== 404) return assetResponse;

      // 对无扩展名的前端路径回退到 index.html。
      if (!url.pathname.includes(".")) {
        const indexUrl = new URL("/index.html", url.origin);
        return env.ASSETS.fetch(new Request(indexUrl, req));
      }
      return assetResponse;
    }

    return j({ok:false,error:"static assets binding unavailable"},500);
  }
};
