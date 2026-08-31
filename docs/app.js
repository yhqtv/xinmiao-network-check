const $ = s => document.querySelector(s);
const API_BASE = String(window.XM_CONFIG?.API_BASE || window.location.origin).replace(/\/$/, '');
const apiUrl = path => {
  if (!API_BASE) throw new Error('无法确定 Worker API 地址');
  return API_BASE + path;
};
const state = { ip: null, routes: [], split: [], webrtc: [], latency: [] };
let privacy = false;

const esc = s => String(s ?? '—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const maskIp = ip => { if(!ip) return '—'; if(ip.includes(':')) return ip.split(':').slice(0,3).join(':') + ':••••'; const a=ip.split('.'); return a.length===4 ? `${a[0]}.${a[1]}.•••.•••` : ip; };
const shownIp = ip => privacy ? maskIp(ip) : ip;

async function fetchJSON(url, opts={}, timeout=7000){ const c=new AbortController(); const t=setTimeout(()=>c.abort(), timeout); try { const r=await fetch(url,{...opts,signal:c.signal,cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); } }

async function loadIp(){
  try{
    const d=await fetchJSON(apiUrl('/api/ip')); state.ip=d;
    $('#ip').textContent=shownIp(d.ip);
    $('#location').textContent=[d.city,d.region,d.country].filter(Boolean).join(' · ') || '位置未知';
    $('#asn').textContent=d.asn?`AS${d.asn}`:'ASN 未知'; $('#isp').textContent=d.asOrganization||'网络未知'; $('#colo').textContent=d.colo?`CF ${d.colo}`:'CF —'; $('#proto').textContent=d.httpProtocol||location.protocol.replace(':','').toUpperCase();
    const v6=d.ip?.includes(':'); $(v6?'#ipv6':'#ipv4').textContent=shownIp(d.ip); $(v6?'#ipv6s':'#ipv4s').textContent='当前出口';
    $('#httpsStatus').textContent=location.protocol==='https:'?'安全':'非 HTTPS'; $('#dnsHttps').textContent=location.protocol==='https:'?'HTTPS 页面':'非 HTTPS';
  }catch(e){ $('#ip').textContent='读取失败'; $('#location').textContent=e.name==='AbortError'?'连接 Worker 超时，请检查 API 地址或网络':'API 请求失败：'+e.message; }
}

const routeProbes=[
  {name:'Cloudflare', url:'https://1.1.1.1/cdn-cgi/trace', type:'Cloudflare'},
  {name:'IPify', url:'https://api.ipify.org?format=json', type:'独立公网 API'},
  {name:'Amazon CheckIP', url:'https://checkip.amazonaws.com/', type:'AWS'},
  {name:'icanhazip', url:'https://icanhazip.com/', type:'独立公网 API'}
];
async function probeRoute(p){ const start=performance.now(); const c=new AbortController(); const t=setTimeout(()=>c.abort(),6000); try{ const r=await fetch(p.url,{signal:c.signal,cache:'no-store'}); const txt=await r.text(); let ip=''; if(p.name==='Cloudflare') ip=(txt.match(/(?:^|\n)ip=([^\n]+)/)||[])[1]||''; else if(p.name==='IPify'){ try{ip=JSON.parse(txt).ip}catch{} } else ip=(txt.match(/([0-9a-fA-F:.]{3,})/)||[])[1]||''; if(!ip) throw new Error('未返回 IP'); return {...p,ip,ms:Math.round(performance.now()-start),ok:true}; }catch(e){return {...p,ip:'—',ms:null,ok:false,error:e.name==='AbortError'?'超时':'受 CORS/网络限制'};}finally{clearTimeout(t)} }
async function runRoutes(){ const body=$('#routeBody'); body.innerHTML=routeProbes.map(p=>`<tr><td>${esc(p.name)}</td><td>检测中…</td><td>${esc(p.type)}</td><td><span class="pill"><i class="dot"></i>等待</span></td></tr>`).join(''); const res=await Promise.all(routeProbes.map(probeRoute)); state.routes=res; body.innerHTML=res.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(shownIp(r.ip))}</td><td>${esc(r.type)}</td><td><span class="pill ${r.ok?'ok':'warn'}"><i class="dot"></i>${r.ok?`${r.ms} ms`:esc(r.error)}</span></td></tr>`).join(''); return res; }

function parseCandidate(c){ const m=c.match(/candidate:\S+ \d+ \S+ \d+ ([0-9a-fA-F:.]+) \d+ typ (\w+)/); return m?{ip:m[1],type:m[2]}:null; }
async function runWebRTC(){
  $('#webrtcStatus').textContent='检测中'; $('#webrtcList').innerHTML='<div class="row"><span>STUN</span><b>探测中…</b></div>';
  const found=new Map();
  try{
    const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']} ]}); pc.createDataChannel('x');
    pc.onicecandidate=e=>{if(e.candidate){const x=parseCandidate(e.candidate.candidate);if(x && !x.ip.endsWith('.local')) found.set(x.ip,x);}};
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer); await new Promise(r=>setTimeout(r,3500)); pc.close();
    state.webrtc=[...found.values()]; const pub=state.webrtc.filter(x=>!/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(x.ip));
    $('#webrtcList').innerHTML=state.webrtc.length?state.webrtc.map(x=>`<div class="row"><span>${esc(x.type.toUpperCase())}</span><b>${esc(shownIp(x.ip))}</b></div>`).join(''):'<div class="row"><span>没有发现候选地址</span><b>受保护 / 被禁用</b></div>';
    const main=state.ip?.ip; const different=pub.some(x=>x.ip!==main); $('#webrtcStatus').textContent=different?'注意':'正常'; $('#webrtcIp').textContent=pub.length?shownIp(pub[0].ip):'未发现公网 IP';
    $('#webrtcVerdict').className='verdict '+(different?'danger':'success'); $('#webrtcVerdict').textContent=different?'发现与当前 HTTP 出口不同的 WebRTC 公网 IP，请检查 UDP / 代理分流。':'未发现与当前 HTTP 出口冲突的公网 IP。';
  }catch(e){ state.webrtc=[]; $('#webrtcStatus').textContent='不可用'; $('#webrtcList').innerHTML=`<div class="row"><span>WebRTC</span><b>${esc(e.message)}</b></div>`; }
  return state.webrtc;
}

const latencyTargets=[
  ['Baidu','https://www.baidu.com/favicon.ico'],['Taobao','https://www.taobao.com/favicon.ico'],
  ['Cloudflare','https://www.cloudflare.com/favicon.ico'],['GitHub','https://github.com/favicon.ico'],
  ['Google','https://www.google.com/favicon.ico'],['YouTube','https://www.youtube.com/favicon.ico'],
  ['OpenAI','https://openai.com/favicon.ico'],['Anthropic','https://www.anthropic.com/favicon.ico'],
  ['Discord','https://discord.com/assets/favicon.ico'],['Wikipedia','https://www.wikipedia.org/static/favicon/wikipedia.ico']
];
async function latencyOnce(url){
  const target=url+`${url.includes('?')?'&':'?'}_xm=${Date.now()}${Math.random()}`;
  const s=performance.now(); const c=new AbortController(); const t=setTimeout(()=>c.abort(),4500);
  try{
    await fetch(target,{mode:'no-cors',cache:'no-store',signal:c.signal});
    const total=Math.round(performance.now()-s);
    const entries=performance.getEntriesByName(target);
    const ent=entries[entries.length-1];
    const ttfb=(ent && ent.responseStart>0 && ent.requestStart>0)?Math.max(0,Math.round(ent.responseStart-ent.requestStart)):null;
    return {total,ttfb};
  }catch{return null}finally{clearTimeout(t)}
}
async function testLatency(name,url){
  const vals=[];
  for(let i=0;i<3;i++){const v=await latencyOnce(url);if(v)vals.push(v)}
  const med = key => {
    const a=vals.map(v=>v[key]).filter(v=>v!=null).sort((a,b)=>a-b);
    return a.length?a[Math.floor(a.length/2)]:null;
  };
  return {name,url,total_ms:med('total'),ttfb_ms:med('ttfb')};
}
function latencyClass(ms){return ms==null?'bad':ms<250?'ok':ms<700?'warn':'bad'}
async function runLatency(){
  const g=$('#latencyGrid');
  g.innerHTML=latencyTargets.map(([n,u])=>`<div class="latency"><div class="name">${n}</div><div class="url">${u}</div><strong>…</strong></div>`).join('');
  const res=await Promise.all(latencyTargets.map(x=>testLatency(...x))); state.latency=res;
  g.innerHTML=res.map(r=>`<div class="latency ${latencyClass(r.total_ms)}"><div class="name">${esc(r.name)}</div><div class="url">${esc(r.url)}</div><strong>${r.total_ms==null?'超时':r.total_ms}</strong> <small>${r.total_ms==null?'':'ms 总耗时'}</small>${r.ttfb_ms!=null?`<div class="muted">TTFB ${r.ttfb_ms} ms</div>`:'<div class="muted">TTFB：浏览器未暴露</div>'}</div>`).join('');
  return res;
}

function calcScore(){let score=100;if(location.protocol!=='https:')score-=25;const bad=state.latency.filter(x=>x.total_ms==null).length;score-=Math.min(30,bad*4);const main=state.ip?.ip;const diff=state.webrtc.some(x=>x.ip!==main && !/^10\.|^192\.168\.|^172\./.test(x.ip));if(diff)score-=25;score=Math.max(0,score);$('#score').textContent=score;$('#meter').style.width=score+'%';return score}
function buildReport(){const score=calcScore();const lines=[`鑫淼网络检测报告`,`时间: ${new Date().toLocaleString()}`,`HTTP IP: ${shownIp(state.ip?.ip)}`,`位置: ${[state.ip?.city,state.ip?.region,state.ip?.country].filter(Boolean).join(' / ')||'未知'}`,`网络: ${state.ip?.asn?'AS'+state.ip.asn:'—'} ${state.ip?.asOrganization||''}`,`Cloudflare: ${state.ip?.colo||'—'}`,`基础评分: ${score}/100`,'', '出口探针:',...state.routes.map(x=>`- ${x.name}: ${shownIp(x.ip)} ${x.ok?x.ms+'ms':x.error}`),'','WebRTC:',...(state.webrtc.length?state.webrtc.map(x=>`- ${x.type}: ${shownIp(x.ip)}`):['- 未发现候选公网 IP']),'','连通性:',...state.latency.map(x=>`- ${x.name}: ${x.total_ms==null?'超时/不可达':x.total_ms+'ms 总耗时'}`),'','说明: DNS 解析器 IP 需要权威 DNS 探针；站点连通性测试不等同于服务账号地区解锁检测。'];$('#report').textContent=lines.join('\n');$('#reportTime').textContent=`完成于 ${new Date().toLocaleTimeString()}`;return lines.join('\n')}
async function runAll(){ $('#runBtn').disabled=true; $('#runBtn').textContent='检测中…'; await loadIp(); await Promise.all([runRoutes(),runSplit(),runWebRTC(),runLatency(),loadQuality()]); buildReport(); $('#runBtn').disabled=false; $('#runBtn').textContent='重新完整检测'; }

$('#privacyBtn').onclick=()=>{privacy=!privacy;$('#privacyBtn').textContent=privacy?'显示 IP':'隐藏 IP';if(state.ip)$('#ip').textContent=shownIp(state.ip.ip);runRoutesDisplay();runWebRTCDisplay();buildReport()};
function runRoutesDisplay(){if(state.routes.length)$('#routeBody').innerHTML=state.routes.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(shownIp(r.ip))}</td><td>${esc(r.type)}</td><td><span class="pill ${r.ok?'ok':'warn'}"><i class="dot"></i>${r.ok?`${r.ms} ms`:esc(r.error)}</span></td></tr>`).join('')}
function runWebRTCDisplay(){if(state.webrtc.length)$('#webrtcList').innerHTML=state.webrtc.map(x=>`<div class="row"><span>${esc(x.type.toUpperCase())}</span><b>${esc(shownIp(x.ip))}</b></div>`).join('')}
$('#copyIp').onclick=()=>state.ip?.ip&&navigator.clipboard.writeText(state.ip.ip);
$('#runBtn').onclick=runAll; document.querySelectorAll('[data-run]').forEach(b=>b.onclick=async()=>{const k=b.dataset.run;if(k==='route')await Promise.all([runRoutes(),runSplit()]);if(k==='webrtc')await runWebRTC();if(k==='latency')await runLatency();buildReport()});
$('#copyReport').onclick=()=>navigator.clipboard.writeText($('#report').textContent);
$('#lookupForm').onsubmit=async e=>{
  e.preventDefault(); const q=$('#lookupInput').value.trim(); if(!q)return;
  $('#lookupResult').textContent='查询中…';
  try{
    const d=await fetchJSON(apiUrl('/lookup?ip='+encodeURIComponent(q)));
    if(!d.ok) throw new Error(d.error||'查询失败');
    const x=d.quality;
    if(!x?.ok){
      $('#lookupResult').innerHTML=`<b>${esc(q)}</b><br>${esc(x?.message||'IP 质量服务未配置')}`;
      return;
    }
    $('#lookupResult').innerHTML=`<b>${esc(x.ip||q)}</b><br>
      类型：${esc(classifyIp(x))}<br>
      VPN：${esc(boolText(x.is_vpn))} · Proxy：${esc(boolText(x.is_proxy))} · Tor：${esc(boolText(x.is_tor))}<br>
      Hosting：${esc(boolText(x.is_datacenter))} · Abuser：${esc(boolText(x.is_abuser))}<br>
      信任分：${esc(x.trust_score)}/100 · 风险：${esc(x.level)}`;
  }catch(err){ $('#lookupResult').textContent='查询失败：'+err.message; }
};

runAll();
// ===== V1.4 enhanced IP quality + latency semantics =====
function boolText(v){
  if(v === true) return "是";
  if(v === false) return "否";
  return "未知";
}
function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value ?? "—";
}
function classifyIp(q){
  if(!q) return "未知";
  if(q.is_tor) return "Tor 出口";
  if(q.is_vpn) return "VPN";
  if(q.is_proxy) return "Proxy";
  if(q.is_datacenter) return "数据中心";
  if(q.is_mobile) return "移动网络";
  return "普通网络";
}
async function loadQuality(){
  const notice = document.getElementById("qualityNotice");
  try{
    if(notice) notice.textContent = "正在获取真实 IP 质量数据…";
    const base = (window.XM_CONFIG && window.XM_CONFIG.API_BASE || "").replace(/\/$/,"");
    const currentIp = (document.getElementById("ipv4")?.textContent || document.getElementById("ip")?.textContent || "").replace(/[•\s]/g,"");
    const url = base + "/quality" + (currentIp && currentIp.includes(".") ? "?ip="+encodeURIComponent(currentIp) : "");
    const r = await fetch(url,{cache:"no-store"});
    const q = await r.json();
    if(!q.ok){
      setText("trustScore","—");
      setText("riskLevel", q.configured === false ? "需要配置 API Key" : "检测失败");
      if(notice) notice.innerHTML = q.configured === false
        ? '真实 IP 风险检测尚未启用：请在 Cloudflare Worker → Settings → Variables and Secrets 中添加 <b>IPAPI_IS_KEY</b>。'
        : 'IP 质量接口失败：' + (q.error || q.message || "未知错误");
      return;
    }
    setText("trustScore", q.trust_score);
    setText("riskLevel", q.level === "low" ? "低风险" : q.level === "medium" ? "中风险" : "高风险");
    setText("qualityProvider", `数据源：${q.provider || "ipapi.is"} · ${q.provider_elapsed_ms ?? "—"} ms`);
    setText("ipType", classifyIp(q));
    setText("qVpn", boolText(q.is_vpn));
    setText("qProxy", boolText(q.is_proxy));
    setText("qTor", boolText(q.is_tor));
    setText("qHosting", boolText(q.is_datacenter));
    setText("qAbuser", boolText(q.is_abuser));
    setText("qMobile", boolText(q.is_mobile));
    const eg = q.egress_service;
    setText("qEgress", typeof eg === "string" ? eg : (eg?.name || eg?.type || "无"));
    if(notice){
      notice.textContent = `风险分 ${q.risk_score}/100。信任分是本站按公开风险标记加权生成，用于网络诊断，不代表金融或反欺诈授信评分。`;
    }
  }catch(e){
    setText("riskLevel","检测失败");
    if(notice) notice.textContent = "IP 质量检测失败：" + e.message;
  }
}
document.getElementById("qualityRetry")?.addEventListener("click", loadQuality);

// Use Resource Timing where available: separate browser connection/TTFB from total API response.
async function measuredFetch(url, opts={}){
  const started = performance.now();
  const cacheBust = (url.includes("?") ? "&" : "?") + "_xm=" + Date.now() + Math.random();
  const target = url + cacheBust;
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), opts.timeout || 7000);
  try{
    const r = await fetch(target,{mode:opts.mode || "cors",cache:"no-store",signal:ctl.signal});
    const total = Math.round(performance.now()-started);
    let network = null, ttfb = null;
    const entries = performance.getEntriesByName(target);
    const ent = entries[entries.length-1];
    if(ent){
      if(ent.responseStart && ent.requestStart) ttfb = Math.max(0, Math.round(ent.responseStart-ent.requestStart));
      if(ent.connectEnd && ent.connectStart) network = Math.max(0, Math.round(ent.connectEnd-ent.connectStart));
    }
    return {ok:r.ok,total_ms:total,connect_ms:network,ttfb_ms:ttfb,response:r};
  } finally {
    clearTimeout(timer);
  }
}

// V1.4 split-routing catalog. Browser-side checks preserve the user's actual routing decisions.
window.XM_PROBE_CATALOG = [
  {group:"国内", name:"百度", url:"https://www.baidu.com/favicon.ico"},
  {group:"国内", name:"淘宝", url:"https://www.taobao.com/favicon.ico"},
  {group:"国际", name:"Cloudflare", url:"https://www.cloudflare.com/favicon.ico"},
  {group:"国际", name:"Google", url:"https://www.google.com/favicon.ico"},
  {group:"国际", name:"YouTube", url:"https://www.youtube.com/favicon.ico"},
  {group:"AI", name:"ChatGPT / OpenAI", url:"https://chatgpt.com/favicon.ico"},
  {group:"AI", name:"Claude", url:"https://claude.ai/favicon.ico"},
  {group:"AI", name:"Gemini", url:"https://gemini.google.com/favicon.ico"},
  {group:"AI", name:"Grok", url:"https://x.ai/favicon.ico"},
  {group:"开发", name:"GitHub", url:"https://github.com/favicon.ico"},
  {group:"开发", name:"npm", url:"https://www.npmjs.com/favicon.ico"},
  {group:"开发", name:"GitLab", url:"https://gitlab.com/favicon.ico"},
  {group:"金融", name:"Wise", url:"https://wise.com/favicon.ico"},
  {group:"金融", name:"PayPal", url:"https://www.paypal.com/favicon.ico"}
];


async function splitProbeOnce(p){
  const started=performance.now(); const c=new AbortController(); const t=setTimeout(()=>c.abort(),5000);
  const target=p.url+(p.url.includes("?")?"&":"?")+"_xm="+Date.now()+Math.random();
  try{
    await fetch(target,{mode:"no-cors",cache:"no-store",signal:c.signal});
    return {...p,ok:true,total_ms:Math.round(performance.now()-started)};
  }catch(e){
    return {...p,ok:false,total_ms:null,error:e.name==="AbortError"?"超时":"被阻止"};
  }finally{ clearTimeout(t); }
}
function renderSplit(items){
  const root=document.getElementById("splitProbeGroups"); if(!root) return;
  const groups=[...new Set(window.XM_PROBE_CATALOG.map(x=>x.group))];
  root.innerHTML=groups.map(group=>{
    const rows=items.filter(x=>x.group===group);
    return `<div class="split-group"><div class="split-group-head">${esc(group)}</div><div class="split-items">${
      rows.map(x=>`<div class="split-item"><span>${esc(x.name)}</span><b class="${x.ok?'status-ok':'status-bad'}">${x.ok?`${x.total_ms} ms 总耗时`:esc(x.error||'失败')}</b></div>`).join("")
    }</div></div>`;
  }).join("");
}
function splitModeVerdict(items){
  const el=document.getElementById("splitVerdict"); if(!el) return;
  const by=g=>items.filter(x=>x.group===g);
  const ratio=g=>{const a=by(g);return a.length?a.filter(x=>x.ok).length/a.length:0};
  const domestic=ratio("国内"), intl=ratio("国际"), ai=ratio("AI");
  let text="检测完成：这里判断的是各服务是否能从当前浏览器线路建立请求，不等于目标服务确认的账号地区解锁。";
  if(domestic>=.5 && intl>=.5 && ai>=.5) text="多数国内、国际和 AI 服务均可建立请求；当前线路整体连通性较完整。";
  else if(domestic>=.5 && intl<.5) text="国内连通较好，国际服务连通较弱；可能存在直连线路限制或代理规则未覆盖。";
  else if(domestic>=.5 && intl>=.5 && ai<.5) text="国内与国际基础服务可达，但部分 AI 服务不可达；建议检查 AI 域名分流规则。";
  el.className="verdict "+(items.some(x=>!x.ok)?"neutral":"success");
  el.textContent=text;
}
async function runSplit(){
  const root=document.getElementById("splitProbeGroups");
  if(root) root.innerHTML='<div class="muted">正在检测国内 / 国际 / AI / 开发 / 金融服务…</div>';
  const res=await Promise.all(window.XM_PROBE_CATALOG.map(splitProbeOnce));
  state.split=res; renderSplit(res); splitModeVerdict(res); return res;
}

// Fire quality detection after initial IP load has had time to complete.

