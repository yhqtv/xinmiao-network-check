
const API=(window.XM_CONFIG?.API_BASE||location.origin).replace(/\/$/,"");
const $=s=>document.querySelector(s), esc=s=>String(s??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let BASE=null, QUALITY=null;

async function api(path,opts={}){const r=await fetch(API+path,{cache:"no-store",...opts});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||"请求失败");return d}
function maskIp(ip){if(!ip)return"—";if(ip.includes(".")){let a=ip.split(".");a[3]="***";return a.join(".")}return ip.split(":").slice(0,4).join(":")+"::****"}
function yn(v){return v===true?"是":v===false?"否":"未知"}
function typeOf(q){if(!q)return"未知";if(q.is_tor)return"Tor";if(q.is_vpn)return"VPN";if(q.is_proxy)return"Proxy";if(q.is_datacenter)return"数据中心/机房";if(q.is_mobile)return"移动网络";return"住宅/普通网络"}

document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#nav button").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
 $("#page-"+b.dataset.page).classList.add("active");
 if(b.dataset.page==="gpt") runAI("gpt");
 if(b.dataset.page==="claude") runAI("claude");
 if(b.dataset.page==="status") runStatus();
});

async function ensureBase(){if(!BASE)BASE=await api("/api/ip");return BASE}
async function ensureQuality(ip){if(!QUALITY||ip)QUALITY=await api("/api/quality"+(ip?"?ip="+encodeURIComponent(ip):""));return QUALITY}

const ROUTES=[
 ["Cloudflare","https://1.1.1.1/cdn-cgi/trace"],["Google","https://www.google.com/favicon.ico"],
 ["YouTube","https://www.youtube.com/favicon.ico"],["ChatGPT","https://chatgpt.com/favicon.ico"],
 ["Claude","https://claude.ai/favicon.ico"],["GitHub","https://github.com/favicon.ico"],
 ["淘宝","https://www.taobao.com/favicon.ico"],["百度","https://www.baidu.com/favicon.ico"]
];
async function probe(name,url,timeout=5000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout),s=performance.now();
 try{await fetch(url+(url.includes("?")?"&":"?")+"_="+Date.now(),{mode:"no-cors",cache:"no-store",signal:c.signal});return{name,ok:true,ms:Math.round(performance.now()-s)}}
 catch(e){return{name,ok:false,ms:null}}finally{clearTimeout(t)}
}
async function runHome(){
 $("#heroIp").textContent="检测中…"; BASE=await api("/api/ip");
 $("#heroIp").textContent=BASE.ip||"—"; $("#heroGeo").textContent=[BASE.city,BASE.region,BASE.country].filter(Boolean).join(" · ");
 $("#basicCards").innerHTML=[
 ["IP版本","IPv"+BASE.ip_version],["ASN",BASE.asn||"—"],["运营商",BASE.organization||"—"],["Cloudflare节点",BASE.colo||"—"],
 ["协议",BASE.http_protocol||"—"],["TLS",BASE.tls_version||"—"],["时区",BASE.timezone||"—"],["经纬度",[BASE.latitude,BASE.longitude].filter(x=>x!=null).join(", ")||"—"]
 ].map(x=>`<div class="card"><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`).join("");
 $("#routeGrid").innerHTML="<div class=muted>检测中…</div>";
 const rs=await Promise.all(ROUTES.map(x=>probe(...x)));
 $("#routeGrid").innerHTML=rs.map(r=>`<div class="card"><small>${esc(r.name)}</small><b class="${r.ok?"good":"bad"}">${r.ok?r.ms+" ms":"不可达"}</b></div>`).join("");
}

function renderScore(q){
 const cls=q.level==="low"?"good":q.level==="medium"?"warn":"bad";
 const loc=q.location||{}, asn=q.asn||{}, co=q.company||{};
 return `<div class="quality">
 <div class="card scorebox"><div><small>IP 信任分</small><div class="scorebig ${cls}">${esc(q.trust_score)}</div><b>${q.level==="low"?"低风险":q.level==="medium"?"中风险":"高风险"}</b><p class=muted>${esc(q.ip)}</p></div></div>
 <div><div class="flags">
 ${[["IP类型",typeOf(q)],["VPN",yn(q.is_vpn)],["Proxy",yn(q.is_proxy)],["Tor",yn(q.is_tor)],["Crawler",yn(q.is_crawler)],["Abuser",yn(q.is_abuser)],["Hosting",yn(q.is_datacenter)],["移动网络",yn(q.is_mobile)]].map(x=>`<div class=flag><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join("")}
 </div><div class="panel" style="margin-top:12px"><div class=kv>
 <div>地区</div><div>${esc(loc.city||"")} ${esc(loc.state||loc.region||"")} ${esc(loc.country||loc.country_code||"")}</div>
 <div>ASN</div><div>${esc(asn.asn||asn.num||asn.number||"—")} ${esc(asn.org||asn.organization||"")}</div>
 <div>组织</div><div>${esc(co.name||co.company||"—")}</div>
 <div>数据源</div><div>${esc(q.provider)} · ${esc(q.provider_elapsed_ms)} ms</div>
 </div></div></div></div>`;
}
$("#scoreForm").onsubmit=async e=>{e.preventDefault();$("#scoreResult").innerHTML="查询中…";try{const q=$("#scoreInput").value.trim();const d=await api("/api/quality"+(q?"?ip="+encodeURIComponent(q):""));$("#scoreResult").innerHTML=renderScore(d)}catch(e){$("#scoreResult").innerHTML=`<div class="notice bad">${esc(e.message)}</div>`}};

function deviceInfo(){
 const gl=(()=>{try{const c=document.createElement("canvas"),g=c.getContext("webgl")||c.getContext("experimental-webgl");const d=g.getExtension("WEBGL_debug_renderer_info");return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):"受保护"}catch{return"不可用"}})();
 return {timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,language:navigator.language,platform:navigator.platform,touch:navigator.maxTouchPoints||0,connection:navigator.connection?.effectiveType||"未知",dnt:navigator.doNotTrack||"未知",webgl:gl};
}
async function aiConnectivity(kind){
 const targets=kind==="gpt"?[["chatgpt.com","https://chatgpt.com/favicon.ico"],["api.openai.com","https://api.openai.com"]]:[["claude.ai","https://claude.ai/favicon.ico"],["anthropic.com","https://www.anthropic.com/favicon.ico"]];
 return Promise.all(targets.map(x=>probe(...x)));
}
async function runWebRTC(){
 const found=new Set();
 const pcs=[];
 for(const server of ["stun:stun.l.google.com:19302","stun:stun.cloudflare.com:3478"]){
  try{
   const pc=new RTCPeerConnection({iceServers:[{urls:server}]});pcs.push(pc);pc.createDataChannel("x");
   pc.onicecandidate=e=>{if(e.candidate){const m=e.candidate.candidate.match(/(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{3,}/ig)||[];m.forEach(x=>{if(x.includes(".")||x.includes(":"))found.add(x)})}};
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  }catch{}
 }
 await new Promise(r=>setTimeout(r,2400));pcs.forEach(p=>p.close());
 return [...found].filter(x=>!/^0\.0\.0\.0/.test(x));
}
async function runAI(kind){
 const root=$("#"+kind+"Result");root.innerHTML='<div class=panel>检测中…</div>';
 try{
  const [b,q,conn,rtc]=await Promise.all([ensureBase(),ensureQuality(),aiConnectivity(kind),runWebRTC()]);
  const dev=deviceInfo(), title=kind==="gpt"?"ChatGPT / Codex":"Claude AI";
  const historyKey="xm_"+kind+"_history";let hist=JSON.parse(localStorage.getItem(historyKey)||"[]");hist.unshift({t:new Date().toISOString(),ip:b.ip,score:q.trust_score});hist=hist.slice(0,30);localStorage.setItem(historyKey,JSON.stringify(hist));
  root.innerHTML=`<div class=panel>${renderScore(q)}</div>
  <div class=panel><h2>${title} 可用性检测</h2><div class=cards>${conn.map(x=>`<div class=card><small>${esc(x.name)}</small><b class="${x.ok?"good":"bad"}">${x.ok?x.ms+" ms":"不可达"}</b></div>`).join("")}</div></div>
  <div class=panel><h2>DNS / WebRTC UDP</h2><div class=cards><div class=card><small>DNS 泄露</small><b class=warn>需权威 DNS 探针</b></div><div class=card><small>UDP / WebRTC IP</small><b>${esc(rtc.join(", ")||"未发现公网 Candidate")}</b></div></div></div>
  <div class=panel><h2>用户设备信息</h2><div class=kv>${Object.entries(dev).map(([k,v])=>`<div>${esc(k)}</div><div>${esc(v)}</div>`).join("")}</div></div>
  <div class=panel><h2>本地历史</h2><div class=tablewrap><table><thead><tr><th>时间</th><th>IP</th><th>信任分</th></tr></thead><tbody>${hist.map(x=>`<tr><td>${esc(new Date(x.t).toLocaleString())}</td><td>${esc(x.ip)}</td><td>${esc(x.score)}</td></tr>`).join("")}</tbody></table></div><p class=muted>仅保存在当前浏览器 localStorage。</p></div>`;
 }catch(e){root.innerHTML=`<div class="panel notice bad">${esc(e.message)}</div>`}
}

const CONNECT=[
 ["百度","https://www.baidu.com/favicon.ico"],["淘宝","https://www.taobao.com/favicon.ico"],["Cloudflare","https://www.cloudflare.com/favicon.ico"],
 ["Google","https://www.google.com/favicon.ico"],["YouTube","https://www.youtube.com/favicon.ico"],["ChatGPT","https://chatgpt.com/favicon.ico"],
 ["Claude","https://claude.ai/favicon.ico"],["Gemini","https://gemini.google.com/favicon.ico"],["Grok","https://x.ai/favicon.ico"],
 ["GitHub","https://github.com/favicon.ico"],["npm","https://www.npmjs.com/favicon.ico"],["Discord","https://discord.com/favicon.ico"],
 ["Wikipedia","https://www.wikipedia.org/static/favicon/wikipedia.ico"],["PayPal","https://www.paypal.com/favicon.ico"],["Wise","https://wise.com/favicon.ico"]
];
async function multiProbe(n,u){const a=[];for(let i=0;i<3;i++){const x=await probe(n,u);if(x.ok)a.push(x.ms)}a.sort((a,b)=>a-b);return{name:n,ms:a.length?a[Math.floor(a.length/2)]:null}}
async function runConnectivity(){
 $("#linkGrid").innerHTML="<div class=muted>检测中…</div>";
 const rs=await Promise.all(CONNECT.map(x=>multiProbe(...x)));
 $("#linkGrid").innerHTML=rs.map(r=>`<div class=latency><small>${esc(r.name)}</small><b class="${r.ms==null?"bad":r.ms<300?"good":r.ms<800?"warn":"bad"}">${r.ms==null?"超时":r.ms+" ms"}</b><div class=muted>HTTP 请求中位数</div></div>`).join("");
}

async function checkDnsArchitecture(){try{const d=await api("/api/dns-leak");$("#dnsResult").innerHTML=`<div class="notice ${d.ready?"good":"warning"}">${esc(d.message)}</div>`}catch(e){$("#dnsResult").innerHTML=esc(e.message)}}
async function runWebRTCPage(){
 $("#webrtcResult").innerHTML="检测中…";const [b,ips]=await Promise.all([ensureBase(),runWebRTC()]);
 const different=ips.filter(x=>x!==b.ip);
 $("#webrtcResult").innerHTML=`<div class=panel><div class=cards><div class=card><small>HTTPS 公网 IP</small><b>${esc(b.ip)}</b></div><div class=card><small>STUN / UDP IP</small><b>${esc(ips.join(", ")||"未发现公网 Candidate")}</b></div><div class=card><small>判断</small><b class="${different.length?"bad":"good"}">${different.length?"发现不同公网 IP，需检查":"未发现明显泄露"}</b></div></div></div>`;
}

$("#pingForm").onsubmit=async e=>{
 e.preventDefault();const target=$("#pingTarget").value.trim();if(!target)return;
 $("#pingResult").innerHTML='<div class=notice>正在创建全球分布式 Ping…</div>';
 try{
  const d=await api("/api/globalping",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({target})});
  let result=null;
  for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,1200));result=await api("/api/globalping/"+d.id);if(result.status!=="in-progress")break}
  const rows=(result.results||[]).map(x=>{
   const p=x.probe||{},r=x.result||{},s=r.stats||{},loc=p.location||{};
   return `<tr><td>${esc([loc.city,loc.country].filter(Boolean).join(" · ")||p.name||"节点")}</td><td>${esc(s.min??"—")}</td><td>${esc(s.avg??"—")}</td><td>${esc(s.max??"—")}</td><td>${esc(s.loss??s.packetLoss??"—")}</td></tr>`
  });
  $("#pingResult").innerHTML=`<div class=tablewrap><table><thead><tr><th>节点</th><th>最小 ms</th><th>平均 ms</th><th>最大 ms</th><th>丢包</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
 }catch(e){$("#pingResult").innerHTML=`<div class="notice bad">${esc(e.message)}</div>`}
};

async function runStatus(){
 $("#statusGrid").innerHTML="<div class=muted>加载官方状态接口…</div>";
 try{
  const d=await api("/api/status");const sv=d.services.sort((a,b)=>(a.indicator==="none")-(b.indicator==="none"));
  $("#statusGrid").innerHTML=sv.map(s=>`<div class=status-card><div><b>${esc(s.name)}</b><div class=tag>${esc(s.category)}</div></div><div class="${s.indicator==="none"?"good":s.indicator==="unknown"?"warn":"bad"}">${esc(s.description)}</div></div>`).join("");
 }catch(e){$("#statusGrid").innerHTML=`<div class=notice>${esc(e.message)}</div>`}
}

$("#whoisForm").onsubmit=async e=>{
 e.preventDefault();const q=$("#whoisInput").value.trim();if(!q)return;$("#whoisResult").innerHTML="查询中…";
 try{
  const d=await api("/api/rdap?q="+encodeURIComponent(q)),x=d.data;
  const events=(x.events||[]).map(e=>`${e.eventAction}: ${e.eventDate}`).join("<br>");
  $("#whoisResult").innerHTML=`<div class=panel><div class=kv><div>Handle</div><div>${esc(x.handle)}</div><div>名称</div><div>${esc(x.ldhName||x.name)}</div><div>类型</div><div>${esc(x.objectClassName)}</div><div>国家</div><div>${esc(x.country)}</div><div>状态</div><div>${esc((x.status||[]).join(", "))}</div><div>事件</div><div>${events||"—"}</div></div></div><details><summary>原始 RDAP JSON</summary><pre>${esc(JSON.stringify(x,null,2))}</pre></details>`;
 }catch(e){$("#whoisResult").innerHTML=`<div class="notice bad">${esc(e.message)}</div>`}
};

runHome();
