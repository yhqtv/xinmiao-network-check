const $ = s => document.querySelector(s);
const API_BASE = String(window.XM_CONFIG?.API_BASE || '').replace(/\/$/, '');
const apiUrl = path => {
  if (!API_BASE || API_BASE.includes('YOUR-WORKER-NAME')) throw new Error('请先在 docs/config.js 配置 Cloudflare Worker API 地址');
  return API_BASE + path;
};
const state = { ip: null, routes: [], webrtc: [], latency: [] };
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
  }catch(e){ $('#ip').textContent='读取失败'; $('#location').textContent=e.message; }
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
  ['Baidu','https://www.baidu.com/favicon.ico'],['Taobao','https://www.taobao.com/favicon.ico'],['Cloudflare','https://www.cloudflare.com/favicon.ico'],['GitHub','https://github.com/favicon.ico'],['Google','https://www.google.com/favicon.ico'],['YouTube','https://www.youtube.com/favicon.ico'],['OpenAI','https://openai.com/favicon.ico'],['Anthropic','https://www.anthropic.com/favicon.ico'],['Discord','https://discord.com/assets/favicon.ico'],['Wikipedia','https://www.wikipedia.org/static/favicon/wikipedia.ico']
];
async function latencyOnce(url){const s=performance.now();const c=new AbortController();const t=setTimeout(()=>c.abort(),4500);try{await fetch(url+`${url.includes('?')?'&':'?'}_=${Date.now()}`,{mode:'no-cors',cache:'no-store',signal:c.signal});return Math.round(performance.now()-s)}catch{return null}finally{clearTimeout(t)}}
async function testLatency(name,url){const vals=[];for(let i=0;i<3;i++){const v=await latencyOnce(url);if(v!==null)vals.push(v)}vals.sort((a,b)=>a-b);return {name,url,ms:vals.length?vals[Math.floor(vals.length/2)]:null}}
function latencyClass(ms){return ms==null?'bad':ms<180?'ok':ms<500?'warn':'bad'}
async function runLatency(){const g=$('#latencyGrid');g.innerHTML=latencyTargets.map(([n,u])=>`<div class="latency"><div class="name">${n}</div><div class="url">${u}</div><strong>…</strong></div>`).join('');const res=await Promise.all(latencyTargets.map(x=>testLatency(...x)));state.latency=res;g.innerHTML=res.map(r=>`<div class="latency ${latencyClass(r.ms)}"><div class="name">${esc(r.name)}</div><div class="url">${esc(r.url)}</div><strong>${r.ms==null?'超时':r.ms}</strong> <small>${r.ms==null?'':'ms'}</small></div>`).join('');return res}

function calcScore(){let score=100;if(location.protocol!=='https:')score-=25;const bad=state.latency.filter(x=>x.ms==null).length;score-=Math.min(30,bad*4);const main=state.ip?.ip;const diff=state.webrtc.some(x=>x.ip!==main && !/^10\.|^192\.168\.|^172\./.test(x.ip));if(diff)score-=25;score=Math.max(0,score);$('#score').textContent=score;$('#meter').style.width=score+'%';return score}
function buildReport(){const score=calcScore();const lines=[`鑫淼网络检测报告`,`时间: ${new Date().toLocaleString()}`,`HTTP IP: ${shownIp(state.ip?.ip)}`,`位置: ${[state.ip?.city,state.ip?.region,state.ip?.country].filter(Boolean).join(' / ')||'未知'}`,`网络: ${state.ip?.asn?'AS'+state.ip.asn:'—'} ${state.ip?.asOrganization||''}`,`Cloudflare: ${state.ip?.colo||'—'}`,`基础评分: ${score}/100`,'', '出口探针:',...state.routes.map(x=>`- ${x.name}: ${shownIp(x.ip)} ${x.ok?x.ms+'ms':x.error}`),'','WebRTC:',...(state.webrtc.length?state.webrtc.map(x=>`- ${x.type}: ${shownIp(x.ip)}`):['- 未发现候选公网 IP']),'','连通性:',...state.latency.map(x=>`- ${x.name}: ${x.ms==null?'超时/不可达':x.ms+'ms'}`),'','说明: DNS 解析器 IP 需要权威 DNS 探针；站点连通性测试不等同于服务账号地区解锁检测。'];$('#report').textContent=lines.join('\n');$('#reportTime').textContent=`完成于 ${new Date().toLocaleTimeString()}`;return lines.join('\n')}
async function runAll(){ $('#runBtn').disabled=true; $('#runBtn').textContent='检测中…'; await loadIp(); await Promise.all([runRoutes(),runWebRTC(),runLatency()]); buildReport(); $('#runBtn').disabled=false; $('#runBtn').textContent='重新完整检测'; }

$('#privacyBtn').onclick=()=>{privacy=!privacy;$('#privacyBtn').textContent=privacy?'显示 IP':'隐藏 IP';if(state.ip)$('#ip').textContent=shownIp(state.ip.ip);runRoutesDisplay();runWebRTCDisplay();buildReport()};
function runRoutesDisplay(){if(state.routes.length)$('#routeBody').innerHTML=state.routes.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(shownIp(r.ip))}</td><td>${esc(r.type)}</td><td><span class="pill ${r.ok?'ok':'warn'}"><i class="dot"></i>${r.ok?`${r.ms} ms`:esc(r.error)}</span></td></tr>`).join('')}
function runWebRTCDisplay(){if(state.webrtc.length)$('#webrtcList').innerHTML=state.webrtc.map(x=>`<div class="row"><span>${esc(x.type.toUpperCase())}</span><b>${esc(shownIp(x.ip))}</b></div>`).join('')}
$('#copyIp').onclick=()=>state.ip?.ip&&navigator.clipboard.writeText(state.ip.ip);
$('#runBtn').onclick=runAll; document.querySelectorAll('[data-run]').forEach(b=>b.onclick=async()=>{const k=b.dataset.run;if(k==='route')await runRoutes();if(k==='webrtc')await runWebRTC();if(k==='latency')await runLatency();buildReport()});
$('#copyReport').onclick=()=>navigator.clipboard.writeText($('#report').textContent);
$('#lookupForm').onsubmit=async e=>{e.preventDefault();const q=$('#lookupInput').value.trim();if(!q)return;$('#lookupResult').textContent='查询中…';try{const d=await fetchJSON(apiUrl('/api/lookup?ip='+encodeURIComponent(q)));if(d.error)throw new Error(d.error);$('#lookupResult').innerHTML=`<b>${esc(d.ip)}</b><br>国家/地区：${esc([d.city,d.region,d.country].filter(Boolean).join(' · '))}<br>网络：${esc(d.connection?.isp||d.connection?.org||'—')}<br>ASN：${esc(d.connection?.asn||'—')}<br>时区：${esc(d.timezone?.id||'—')}`;}catch(err){$('#lookupResult').textContent='查询失败：'+err.message}};

loadIp().then(()=>runAll());
