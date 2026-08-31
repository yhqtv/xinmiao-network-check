
const API=(window.XM_CONFIG?.API_BASE||location.origin).replace(/\/$/,"");
const $=s=>document.querySelector(s), esc=s=>String(s??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

let BASE=null, QUALITY=null;
let IP_PRIVACY = localStorage.getItem("xm_ip_privacy") === "1";
let HOME_EGRESS_RESULTS = [];

function maskIp50(ip){
  if(!ip) return "—";
  const s=String(ip);

  // IPv4：隐藏后两段，约 50% 地址信息
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)){
    const p=s.split(".");
    return `${p[0]}.${p[1]}.***.***`;
  }

  // IPv6：隐藏后半部分 hextet；兼容压缩格式
  if(s.includes(":")){
    const parts=s.split(":");
    const visible=Math.max(1,Math.ceil(parts.length/2));
    return parts.map((x,i)=>i<visible?x:(x===""?"":"****")).join(":");
  }

  // 其他字符串兜底：隐藏后一半字符
  const n=Math.ceil(s.length/2);
  return s.slice(0,n)+"*".repeat(Math.max(1,s.length-n));
}

function displayIp(ip){
  return IP_PRIVACY ? maskIp50(ip) : (ip || "—");
}

function refreshPrivacyButton(){
  const b=$("#ipPrivacyBtn");
  if(!b) return;
  b.textContent = IP_PRIVACY ? "显示完整 IP" : "隐藏 50% IP";
  b.classList.toggle("privacy-on", IP_PRIVACY);
  b.setAttribute("aria-pressed", IP_PRIVACY ? "true" : "false");
}

function refreshHomeIpDisplays(){
  if(BASE?.ip){
    const h=$("#heroIp");
    if(h) h.textContent=displayIp(BASE.ip);
  }

  if(HOME_EGRESS_RESULTS.length){
    renderEgressResults(HOME_EGRESS_RESULTS);
  }
  refreshPrivacyButton();
}

function toggleIpPrivacy(){
  IP_PRIVACY=!IP_PRIVACY;
  localStorage.setItem("xm_ip_privacy",IP_PRIVACY?"1":"0");
  refreshHomeIpDisplays();
}


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

async function textFetch(url,timeout=6000){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout),s=performance.now();
 try{
  const r=await fetch(url+(url.includes("?")?"&":"?")+"_xm="+Date.now(),{cache:"no-store",signal:c.signal});
  const text=await r.text();
  return {ok:r.ok,text,ms:Math.round(performance.now()-s)};
 }catch(e){return {ok:false,error:e.name==="AbortError"?"超时":e.message,ms:null}}
 finally{clearTimeout(t)}
}
function extractIp(text){
 try{const j=JSON.parse(text);return j.ip||j.query||j.address||null}catch{}
 const m=String(text||"").match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+/i);
 return m?m[0]:null;
}
async function egressProbe(label,url,note){
 const r=await textFetch(url);
 return {label,url,note,ok:r.ok,ip:r.ok?extractIp(r.text):null,ms:r.ms,error:r.error};
}

function renderEgressResults(rs){
 const root=$("#egressGrid"), verdict=$("#egressVerdict");
 if(!root || !verdict) return;
 root.innerHTML=rs.map((r,i)=>`<div class="egress-card">
   <div class="egress-icon">${["中","外","G"][i]}</div>
   <div class="egress-body"><small>${esc(r.label)}</small>
    <b class="${r.ip?"good":"bad"}">${esc(r.ip?displayIp(r.ip):(r.error||"读取失败"))}</b>
    <span>${esc(r.note)}${r.ms!=null?" · "+r.ms+" ms":""}</span>
   </div></div>`).join("");
 const ips=rs.map(x=>x.ip).filter(Boolean), uniq=[...new Set(ips)];
 let msg;
 if(ips.length<2) msg="有效探针不足，暂时无法判断出口是否分流。";
 else if(uniq.length===1) msg="三个探针观察到相同公网 IP：当前更接近全局同一出口。";
 else if(uniq.length===2) msg="检测到 2 个不同出口 IP：当前存在分流/多出口迹象。";
 else msg="检测到 3 个不同出口 IP：当前存在明显的多线路分流。";
 verdict.textContent=msg+" 注意：隐藏功能只改变页面显示，不影响真实检测和分流判断。";
 verdict.className="egress-verdict "+(uniq.length>1?"split":"same");
}

async function runEgress(){
 const root=$("#egressGrid"), verdict=$("#egressVerdict");
 root.innerHTML='<div class="muted">正在从三条独立探针读取出口 IP…</div>';
 const probes=[
  ["国内测试",API+"/api/ip","同源 Cloudflare Worker"],
  ["国外测试","https://api.ipify.org?format=json","ipify 公网回显"],
  ["Google测试","https://www.cloudflare.com/cdn-cgi/trace","独立国际回显探针"]
 ];
 const rs=await Promise.all(probes.map(x=>egressProbe(...x)));
 HOME_EGRESS_RESULTS=rs;
 renderEgressResults(rs);
 return rs;
}

async function runHome(){
 refreshPrivacyButton();
 runEgress();
 $("#heroIp").textContent="检测中…"; BASE=await api("/api/ip");
 $("#heroIp").textContent=displayIp(BASE.ip); $("#heroGeo").textContent=[BASE.city,BASE.region,BASE.country].filter(Boolean).join(" · ");
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
 {group:"中国",name:"DeepSeek",url:"https://www.deepseek.com/",domain:"www.deepseek.com"},
 {group:"中国",name:"抖音",url:"https://www.douyin.com/",domain:"www.douyin.com"},
 {group:"中国",name:"哔哩哔哩",url:"https://www.bilibili.com/",domain:"www.bilibili.com"},
 {group:"中国",name:"京东",url:"https://www.jd.com/",domain:"www.jd.com"},
 {group:"中国",name:"腾讯QQ",url:"https://www.qq.com/",domain:"www.qq.com"},
 {group:"中国",name:"微信",url:"https://weixin.qq.com/",domain:"weixin.qq.com"},
 {group:"中国",name:"小红书",url:"https://www.xiaohongshu.com/",domain:"www.xiaohongshu.com"},
 {group:"中国",name:"新浪微博",url:"https://weibo.com/",domain:"weibo.com"},
 {group:"中国",name:"百度",url:"https://www.baidu.com/",domain:"www.baidu.com"},
 {group:"中国",name:"网易",url:"https://www.163.com/",domain:"www.163.com"},
 {group:"中国",name:"淘宝",url:"https://www.taobao.com/",domain:"www.taobao.com"},
 {group:"中国",name:"小米",url:"https://www.mi.com/",domain:"www.mi.com"},
 {group:"日本",name:"Sony",url:"https://www.sony.jp/",domain:"www.sony.jp"},
 {group:"日本",name:"任天堂",url:"https://www.nintendo.co.jp/",domain:"www.nintendo.co.jp"},
 {group:"日本",name:"Yahoo! JP",url:"https://www.yahoo.co.jp/",domain:"www.yahoo.co.jp"},
 {group:"日本",name:"LINE",url:"https://line.me/",domain:"line.me"},
 {group:"美国",name:"Apple",url:"https://www.apple.com/",domain:"www.apple.com"},
 {group:"美国",name:"Google",url:"https://www.google.com/",domain:"www.google.com"},
 {group:"美国",name:"YouTube",url:"https://www.youtube.com/",domain:"www.youtube.com"},
 {group:"美国",name:"GitHub",url:"https://github.com/",domain:"github.com"},
 {group:"美国",name:"Cloudflare",url:"https://www.cloudflare.com/",domain:"www.cloudflare.com"},
 {group:"美国",name:"Claude",url:"https://claude.ai/",domain:"claude.ai"},
 {group:"美国",name:"ChatGPT",url:"https://chatgpt.com/",domain:"chatgpt.com"},
 {group:"美国",name:"AI Studio",url:"https://aistudio.google.com/",domain:"aistudio.google.com"},
 {group:"美国",name:"Amazon",url:"https://www.amazon.com/",domain:"www.amazon.com"},
 {group:"美国",name:"Bing",url:"https://www.bing.com/",domain:"www.bing.com"},
 {group:"美国",name:"Steam",url:"https://store.steampowered.com/",domain:"store.steampowered.com"},
 {group:"美国",name:"Oracle",url:"https://www.oracle.com/",domain:"www.oracle.com"},
 {group:"美国",name:"Zoom",url:"https://zoom.us/",domain:"zoom.us"},
 {group:"美国",name:"Facebook",url:"https://www.facebook.com/",domain:"www.facebook.com"},
 {group:"美国",name:"Instagram",url:"https://www.instagram.com/",domain:"www.instagram.com"},
 {group:"美国",name:"X",url:"https://x.com/",domain:"x.com"},
 {group:"美国",name:"Reddit",url:"https://www.reddit.com/",domain:"www.reddit.com"},
 {group:"美国",name:"LinkedIn",url:"https://www.linkedin.com/",domain:"www.linkedin.com"},
 {group:"美国",name:"Twitch",url:"https://www.twitch.tv/",domain:"www.twitch.tv"},
 {group:"美国",name:"Netflix",url:"https://www.netflix.com/",domain:"www.netflix.com"},
 {group:"全球",name:"TikTok",url:"https://www.tiktok.com/",domain:"www.tiktok.com"},
 {group:"全球",name:"Spotify",url:"https://www.spotify.com/",domain:"www.spotify.com"},
 {group:"全球",name:"npm",url:"https://www.npmjs.com/",domain:"www.npmjs.com"},
 {group:"全球",name:"Takealot",url:"https://www.takealot.com/",domain:"www.takealot.com"},
 {group:"全球",name:"PixPix",url:"https://www.pixpix.com/",domain:"www.pixpix.com"},
 {group:"全球",name:"Naver",url:"https://www.naver.com/",domain:"www.naver.com"},
 {group:"全球",name:"Noon",url:"https://www.noon.com/",domain:"www.noon.com"},
 {group:"全球",name:"Wikipedia",url:"https://www.wikipedia.org/",domain:"www.wikipedia.org"},
 {group:"全球",name:"BBC",url:"https://www.bbc.com/",domain:"www.bbc.com"},
 {group:"全球",name:"Mistral AI",url:"https://mistral.ai/",domain:"mistral.ai"},
 {group:"全球",name:"Yandex",url:"https://yandex.com/",domain:"yandex.com"},
 {group:"全球",name:"MercadoLibre",url:"https://www.mercadolibre.com/",domain:"www.mercadolibre.com"}
];
async function multiProbe(n,u){const a=[];for(let i=0;i<3;i++){const x=await probe(n,u);if(x.ok)a.push(x.ms)}a.sort((a,b)=>a-b);return{name:n,ms:a.length?a[Math.floor(a.length/2)]:null}}
function faviconUrl(domain){
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent("https://"+domain)}`;
}
function siteCard(s){
  const status=s.ms==null
    ? `<b class="bad">超时</b>`
    : `<b class="${s.ms<200?"good":s.ms<600?"warn":"bad"}">${s.ms} ms</b>`;
  return `<a class="site-card" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
    <div class="site-left">
      <div class="site-icon-wrap">
        <img class="site-icon" src="${faviconUrl(s.domain)}" alt="" loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <span class="site-icon-fallback">${esc(s.name.slice(0,2))}</span>
      </div>
      <div class="site-copy">
        <div class="site-name">${esc(s.name)}</div>
        <div class="site-url">${esc(s.url)}</div>
      </div>
    </div>
    <div class="site-status">${status}<small>HTTP 中位数</small></div>
  </a>`;
}
async function runConnectivity(){
  $("#linkGrid").innerHTML="<div class=muted>正在测试 48 个网站，请稍候…</div>";
  const rs=await Promise.all(CONNECT.map(async s=>({...s,...await multiProbe(s.name,s.url)})));
  const order=["中国","日本","美国","全球"];
  $("#linkGrid").innerHTML=order.map(group=>{
    const list=rs.filter(x=>x.group===group);
    const ok=list.filter(x=>x.ms!=null);
    const avg=ok.length?Math.round(ok.reduce((a,b)=>a+b.ms,0)/ok.length):null;
    return `<section class="site-group">
      <div class="site-group-head">
        <div><span class="group-badge">${esc(group)}</span><strong>${esc(group)}</strong></div>
        <div class="group-summary">可达 ${ok.length}/${list.length}${avg!=null?` · 平均 ${avg} ms`:""}</div>
      </div>
      <div class="site-list">${list.map(siteCard).join("")}</div>
    </section>`;
  }).join("");
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

refreshPrivacyButton();
runHome();
