const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Cache-Control": "no-store"
};

const json = (data, status=200, extra={}) => new Response(JSON.stringify(data,null,2), {
  status, headers: {"content-type":"application/json; charset=utf-8", ...CORS, ...extra}
});

const ipOf = req => req.headers.get("CF-Connecting-IP") || "";
const ipVersion = ip => ip?.includes(":") ? 6 : ip?.includes(".") ? 4 : null;

function cfInfo(req){
  const cf = req.cf || {}, ip = ipOf(req);
  return {
    ok:true, ip, ip_version:ipVersion(ip),
    country:cf.country||null, region:cf.region||cf.regionCode||null, city:cf.city||null,
    postal_code:cf.postalCode||null, timezone:cf.timezone||null,
    latitude:cf.latitude??null, longitude:cf.longitude??null,
    asn:cf.asn ? `AS${cf.asn}` : null, asn_number:cf.asn||null,
    organization:cf.asOrganization||null, colo:cf.colo||null,
    continent:cf.continent||null, http_protocol:cf.httpProtocol||null,
    tls_version:cf.tlsVersion||null, tls_cipher:cf.tlsCipher||null,
    tls_client_hello_length:cf.tlsClientHelloLength??null,
    tls_client_ciphers_sha1:cf.tlsClientCiphersSha1||null,
    tls_client_extensions_sha1:cf.tlsClientExtensionsSha1||null
  };
}

async function fetchJson(url, options={}, timeout=8000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  const started=Date.now();
  try{
    const r=await fetch(url,{...options,signal:c.signal});
    const txt=await r.text(); let data;
    try{data=JSON.parse(txt)}catch{throw new Error(`Upstream invalid JSON (${r.status})`)}
    if(!r.ok) throw new Error(data?.message||data?.error||`Upstream HTTP ${r.status}`);
    return {data,status:r.status,elapsed_ms:Date.now()-started};
  }finally{clearTimeout(t)}
}

function riskScore(q){
  let risk=0;
  const w={is_bogon:100,is_tor:45,is_abuser:30,is_proxy:25,is_vpn:20,is_datacenter:18,is_crawler:10,is_satellite:3};
  for(const [k,v] of Object.entries(w)) if(q?.[k]===true) risk+=v;
  risk=Math.min(100,risk);
  return {risk_score:risk,trust_score:100-risk,level:risk>=60?"high":risk>=25?"medium":"low"};
}

async function quality(ip, env){
  const key=env.IPAPI_IS_KEY;
  const qs = new URLSearchParams({q:ip});
  if(key) qs.set("key",key);
  const {data,elapsed_ms}=await fetchJson(`https://api.ipapi.is/?${qs.toString()}`,{},7000);
  if(data.error) throw new Error(typeof data.error==="string"?data.error:"ipapi.is error");
  const normalized={
    ip:data.ip||ip,
    is_bogon:data.is_bogon??null, is_mobile:data.is_mobile??null,
    is_satellite:data.is_satellite??null, is_crawler:data.is_crawler??null,
    is_datacenter:data.is_datacenter??null, is_tor:data.is_tor??null,
    is_proxy:data.is_proxy??null, is_vpn:data.is_vpn??null, is_abuser:data.is_abuser??null,
    egress_service:data.egress_service??null,
    company:data.company??(data.company_name?{name:data.company_name}:null),
    datacenter:data.datacenter??null,
    asn:data.asn??(data.asn_num?{asn:data.asn_num,org:data.asn_org}:null),
    location:data.location??(data.cc?{country_code:data.cc,latitude:data.lat,longitude:data.lon}:null),
    provider:"ipapi.is", provider_elapsed_ms:elapsed_ms, authenticated:!!key
  };
  return {ok:true,...normalized,...riskScore(normalized)};
}

const STATUS_SERVICES = [
  ["OpenAI / ChatGPT","AI","https://status.openai.com/api/v2/status.json","https://status.openai.com"],
  ["Anthropic / Claude","AI","https://status.anthropic.com/api/v2/status.json","https://status.anthropic.com"],
  ["GitHub","开发","https://www.githubstatus.com/api/v2/status.json","https://www.githubstatus.com"],
  ["Cloudflare","云服务","https://www.cloudflarestatus.com/api/v2/status.json","https://www.cloudflarestatus.com"],
  ["Discord","社区","https://discordstatus.com/api/v2/status.json","https://discordstatus.com"],
  ["Atlassian","开发","https://status.atlassian.com/api/v2/status.json","https://status.atlassian.com"],
  ["Vercel","云服务","https://www.vercel-status.com/api/v2/status.json","https://www.vercel-status.com"],
  ["Netlify","云服务","https://www.netlifystatus.com/api/v2/status.json","https://www.netlifystatus.com"],
  ["Supabase","云服务","https://status.supabase.com/api/v2/status.json","https://status.supabase.com"],
  ["Twilio","开发","https://status.twilio.com/api/v2/status.json","https://status.twilio.com"],
  ["SendGrid","开发","https://status.sendgrid.com/api/v2/status.json","https://status.sendgrid.com"],
  ["Zoom","社区","https://status.zoom.us/api/v2/status.json","https://status.zoom.us"]
];

async function statusAll(){
  const out=await Promise.all(STATUS_SERVICES.map(async ([name,category,api,site])=>{
    try{
      const {data,elapsed_ms}=await fetchJson(api,{},5000);
      const s=data.status||{};
      return {name,category,site,ok:true,indicator:s.indicator||"unknown",description:s.description||"Unknown",elapsed_ms};
    }catch(e){
      return {name,category,site,ok:false,indicator:"unknown",description:"状态接口不可用",error:e.message};
    }
  }));
  return {ok:true,updated_at:new Date().toISOString(),services:out};
}

function rdapUrl(q){
  const x=q.trim();
  if(/^AS\d+$/i.test(x)) return `https://rdap.org/autnum/${x.replace(/^AS/i,"")}`;
  if(/^[0-9a-f:.]+$/i.test(x) && (x.includes(".")||x.includes(":"))) return `https://rdap.org/ip/${encodeURIComponent(x)}`;
  return `https://rdap.org/domain/${encodeURIComponent(x.toLowerCase())}`;
}

async function doRdap(q){
  if(!q) throw new Error("请输入域名、IP 或 ASN");
  const {data,elapsed_ms}=await fetchJson(rdapUrl(q),{headers:{"accept":"application/rdap+json, application/json"}},9000);
  return {ok:true,query:q,elapsed_ms,data};
}

const GLOBALPING_LOCATIONS = [
  {city:"Los Angeles",country:"US",label:"美国·洛杉矶"},
  {city:"New York",country:"US",label:"美国·纽约"},
  {city:"Toronto",country:"CA",label:"加拿大·多伦多"},
  {city:"London",country:"GB",label:"英国·伦敦"},
  {city:"Frankfurt",country:"DE",label:"德国·法兰克福"},
  {city:"Paris",country:"FR",label:"法国·巴黎"},
  {city:"Amsterdam",country:"NL",label:"荷兰·阿姆斯特丹"},
  {city:"Warsaw",country:"PL",label:"波兰·华沙"},
  {city:"Tokyo",country:"JP",label:"日本·东京"},
  {city:"Osaka",country:"JP",label:"日本·大阪"},
  {city:"Singapore",country:"SG",label:"新加坡"},
  {city:"Hong Kong",country:"HK",label:"中国香港"},
  {city:"Seoul",country:"KR",label:"韩国·首尔"},
  {city:"Sydney",country:"AU",label:"澳大利亚·悉尼"},
  {city:"Mumbai",country:"IN",label:"印度·孟买"},
  {city:"Dubai",country:"AE",label:"阿联酋·迪拜"},
  {city:"Sao Paulo",country:"BR",label:"巴西·圣保罗"},
  {city:"Johannesburg",country:"ZA",label:"南非·约翰内斯堡"},
  {city:"Mexico City",country:"MX",label:"墨西哥城"},
  {city:"Stockholm",country:"SE",label:"瑞典·斯德哥尔摩"}
];

async function createGlobalPing(target, env){
  if(!target) throw new Error("请输入目标 IP 或域名");
  const headers={"content-type":"application/json","accept":"application/json"};
  if(env.GLOBALPING_TOKEN) headers.authorization=`Bearer ${env.GLOBALPING_TOKEN}`;
  const body={
    target,
    type:"ping",
    locations:GLOBALPING_LOCATIONS.map(x=>({city:x.city,country:x.country})),
    measurementOptions:{packets:3}
  };
  const {data}=await fetchJson("https://api.globalping.io/v1/measurements",{
    method:"POST",headers,body:JSON.stringify(body)
  },10000);
  return {ok:true,id:data.id,labels:GLOBALPING_LOCATIONS};
}

async function getGlobalPing(id, env){
  if(!id) throw new Error("missing measurement id");
  const headers={"accept":"application/json"};
  if(env.GLOBALPING_TOKEN) headers.authorization=`Bearer ${env.GLOBALPING_TOKEN}`;
  const {data}=await fetchJson(`https://api.globalping.io/v1/measurements/${encodeURIComponent(id)}`,{headers},10000);
  return {ok:true,...data};
}

async function handle(req, env){
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  const u=new URL(req.url), p=u.pathname;

  if(p==="/health"||p==="/api/health")
    return json({ok:true,service:"XinMiao Network API",version:"2.0.0",frontend:"worker-static-assets"});

  if((p==="/ip"||p==="/api/ip") && req.method==="GET") return json(cfInfo(req));

  if((p==="/quality"||p==="/api/quality") && req.method==="GET"){
    try{return json(await quality((u.searchParams.get("ip")||ipOf(req)).trim(),env))}
    catch(e){return json({ok:false,error:e.message},502)}
  }

  if((p==="/lookup"||p==="/api/lookup") && req.method==="GET"){
    const q=(u.searchParams.get("ip")||u.searchParams.get("q")||"").trim();
    if(!q) return json({ok:false,error:"missing query"},400);
    try{return json({ok:true,query:q,quality:await quality(q,env)})}
    catch(e){return json({ok:false,error:e.message},502)}
  }

  if(p==="/api/status" && req.method==="GET"){
    try{return json(await statusAll())}catch(e){return json({ok:false,error:e.message},502)}
  }

  if(p==="/api/rdap" && req.method==="GET"){
    try{return json(await doRdap((u.searchParams.get("q")||"").trim()))}
    catch(e){return json({ok:false,error:e.message},502)}
  }

  if(p==="/api/globalping" && req.method==="POST"){
    try{
      const body=await req.json();
      return json(await createGlobalPing(String(body.target||"").trim(),env));
    }catch(e){return json({ok:false,error:e.message},502)}
  }

  if(p.startsWith("/api/globalping/") && req.method==="GET"){
    try{return json(await getGlobalPing(p.split("/").pop(),env))}
    catch(e){return json({ok:false,error:e.message},502)}
  }

  // True authoritative DNS leak observation cannot be obtained from ordinary Worker HTTP requests.
  if(p==="/api/dns-leak" && req.method==="GET"){
    return json({
      ok:true, mode:"authoritative-required", ready:false,
      message:"真实 DNS Resolver 泄露检测需要唯一随机域名和权威 DNS 查询日志。当前 Worker 本身无法观察递归解析器来源。",
      options:["配置自有权威 DNS 探针","接入第三方 DNS Leak Probe"]
    });
  }

  if(env.ASSETS){
    const r=await env.ASSETS.fetch(req);
    if(r.status!==404) return r;
    if(!p.includes(".")) return env.ASSETS.fetch(new Request(new URL("/index.html",u.origin),req));
    return r;
  }
  return json({ok:false,error:"not found"},404);
}

export default { fetch: handle };
