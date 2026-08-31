
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
 if(b.dataset.page==="dns") runDnsRisk();
 if(b.dataset.page==="link") runConnectivity();
 if(b.dataset.page==="score") runCurrentIpScore();
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


async function textFetch(url,timeout=6500,fetchOptions={}){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout),s=performance.now();
 try{
  const sep=url.includes("?")?"&":"?";
  const r=await fetch(url+sep+"_xm="+Date.now(),{
    cache:"no-store",
    signal:c.signal,
    credentials:"omit",
    ...fetchOptions
  });
  const text=await r.text();
  return {ok:r.ok,text,ms:Math.round(performance.now()-s),status:r.status};
 }catch(e){
  return {ok:false,error:e.name==="AbortError"?"超时":e.message,ms:null};
 }finally{clearTimeout(t)}
}

function extractIp(text){
 try{
  const j=JSON.parse(text);
  return j.ip || j.query || j.address || j.data?.ip || j.result?.ip || null;
 }catch{}
 const m=String(text||"").match(/(?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+/i);
 return m?m[0]:null;
}

// 中国境内主探针：浏览器直接访问，不经过本站服务端。
async function cnProbeUapis(){
 const url="https://uapis.cn/api/v1/network/myip";
 const r=await textFetch(url,7000);
 return {
  kind:"cn",
  label:"国内测试",
  source:"UAPI 中国境内回显",
  url,
  ok:r.ok,
  ip:r.ok?extractIp(r.text):null,
  ms:r.ms,
  error:r.error||(!r.ok?`HTTP ${r.status||""}`:null)
 };
}

// 中国境内备用探针：PCOnline JSONP。
// JSONP 不受 fetch CORS 限制，而且请求仍然由当前浏览器直接发出，
// 因此服务器看到的是该域名实际走的 DIRECT/PROXY 出口。
function cnProbePconline(timeout=7000){
 return new Promise(resolve=>{
  const cb="XM_CN_"+Date.now()+"_"+Math.random().toString(36).slice(2);
  const timer=setTimeout(()=>finish({ok:false,error:"超时"}),timeout);
  const script=document.createElement("script");
  const started=performance.now();
  let done=false;

  function cleanup(){
    clearTimeout(timer);
    try{delete window[cb]}catch{window[cb]=undefined}
    script.remove();
  }
  function finish(result){
    if(done)return; done=true;
    cleanup();
    resolve({
      kind:"cn",
      label:"国内测试",
      source:"太平洋网络 IP JSONP",
      url:"https://whois.pconline.com.cn/ipJson.jsp",
      ms:Math.round(performance.now()-started),
      ...result
    });
  }

  window[cb]=data=>{
    const ip=data?.ip || data?.data?.ip || null;
    finish({ok:!!ip,ip,error:ip?null:"未返回 IP"});
  };
  script.onerror=()=>finish({ok:false,error:"加载失败"});
  script.src=`https://whois.pconline.com.cn/ipJson.jsp?callback=${encodeURIComponent(cb)}&_xm=${Date.now()}`;
  document.head.appendChild(script);
 });
}

async function foreignProbe(){
 const urls=[
  ["ipify","https://api.ipify.org?format=json"],
  ["Cloudflare Trace","https://www.cloudflare.com/cdn-cgi/trace"]
 ];
 for(const [source,url] of urls){
  const r=await textFetch(url,7000);
  const ip=r.ok?extractIp(r.text):null;
  if(ip) return {kind:"foreign",label:"国外测试",source,url,ok:true,ip,ms:r.ms};
 }
 return {kind:"foreign",label:"国外测试",source:"国际回显",ok:false,error:"国际探针均失败"};
}

async function googleRouteProbe(){
 // 浏览器无法从 google.com 本身直接读取“Google 服务器看到的客户端 IP”。
 // 这里保留一个独立国际回显，作为特殊代理/国际路由的辅助对照。
 // UI 明确标注，不冒充 Google 官方 IP 回显。
 const url="https://api64.ipify.org?format=json";
 const r=await textFetch(url,7000);
 return {
  kind:"google",
  label:"Google测试",
  source:"独立国际回显（非 Google 官方）",
  url,
  ok:r.ok,
  ip:r.ok?extractIp(r.text):null,
  ms:r.ms,
  error:r.error
 };
}


async function lookupEgressGeo(ip){
 if(!ip) return null;
 try{
  return await api("/api/geo?ip="+encodeURIComponent(ip));
 }catch(e){
  return {ok:false,error:e.message};
 }
}

const GEO_ZH={
 country:{
  "China":"中国","United States":"美国","Germany":"德国","Japan":"日本","Singapore":"新加坡",
  "Hong Kong":"中国香港","Taiwan":"中国台湾","South Korea":"韩国","Korea, Republic of":"韩国",
  "United Kingdom":"英国","France":"法国","Netherlands":"荷兰","Canada":"加拿大","Australia":"澳大利亚",
  "Russia":"俄罗斯","Russian Federation":"俄罗斯","India":"印度","Thailand":"泰国","Malaysia":"马来西亚",
  "Indonesia":"印度尼西亚","Vietnam":"越南","Philippines":"菲律宾","United Arab Emirates":"阿联酋",
  "Switzerland":"瑞士","Sweden":"瑞典","Finland":"芬兰","Norway":"挪威","Denmark":"丹麦","Italy":"意大利",
  "Spain":"西班牙","Portugal":"葡萄牙","Poland":"波兰","Austria":"奥地利","Belgium":"比利时",
  "Ireland":"爱尔兰","Brazil":"巴西","Mexico":"墨西哥","Argentina":"阿根廷","Chile":"智利",
  "South Africa":"南非","New Zealand":"新西兰","Turkey":"土耳其","Türkiye":"土耳其","Israel":"以色列",
  "Saudi Arabia":"沙特阿拉伯","Macau":"中国澳门"
 },
 region:{
  "California":"加利福尼亚州","New York":"纽约州","Texas":"得克萨斯州","Virginia":"弗吉尼亚州",
  "Washington":"华盛顿州","Illinois":"伊利诺伊州","Florida":"佛罗里达州","Oregon":"俄勒冈州",
  "Hesse":"黑森州","Bavaria":"巴伐利亚州","Berlin":"柏林","Tokyo":"东京都",
  "Osaka":"大阪府","Singapore":"新加坡","Hong Kong":"香港"
 },
 city:{
  "Frankfurt am Main":"法兰克福","Frankfurt":"法兰克福","Los Angeles":"洛杉矶","San Francisco":"旧金山",
  "New York City":"纽约","New York":"纽约","Chicago":"芝加哥","Seattle":"西雅图","Dallas":"达拉斯",
  "Tokyo":"东京","Osaka":"大阪","Singapore":"新加坡","Hong Kong":"香港","London":"伦敦",
  "Paris":"巴黎","Amsterdam":"阿姆斯特丹","Toronto":"多伦多","Sydney":"悉尼","Seoul":"首尔",
  "Bangkok":"曼谷","Taipei":"台北","Beijing":"北京","Shanghai":"上海","Guangzhou":"广州",
  "Shenzhen":"深圳","Changchun":"长春","Chengdu":"成都","Wuhan":"武汉","Hangzhou":"杭州",
  "Nanjing":"南京","Chongqing":"重庆","Tianjin":"天津","Xi'an":"西安","Xian":"西安"
 }
};

function bilingualGeoPart(value,type){
 if(!value) return null;
 const en=String(value);
 const zh=GEO_ZH[type]?.[en];
 return zh && zh!==en ? `${zh} / ${en}` : en;
}

function formatGeo(g){
 if(!g || g.ok===false) return "地区未知 / Unknown";
 const country=bilingualGeoPart(g.country||g.country_code,"country");
 const state=bilingualGeoPart(g.state,"region");
 const city=bilingualGeoPart(g.city,"city");
 return [country,state,city].filter(Boolean).join(" · ") || "地区未知 / Unknown";
}

function sameIp(a,b){return !!a && !!b && String(a).trim()===String(b).trim()}

function renderEgressResults(rs){
 const root=$("#egressGrid"), verdict=$("#egressVerdict");
 if(!root || !verdict) return;

 root.innerHTML=rs.map((r,i)=>`<div class="egress-card">
   <div class="egress-icon">${["中","外","G"][i]}</div>
   <div class="egress-body">
    <small>${esc(r.label)}</small>
    <b class="${r.ip?"good":"bad"}">${esc(r.ip?displayIp(r.ip):(r.error||"读取失败"))}</b>
    <span>${esc(r.source||"")}${r.ms!=null?" · "+r.ms+" ms":""}</span>
    <div class="egress-geo">
      <strong>${esc(formatGeo(r.geo))}</strong>
      ${r.geo?.asn||r.geo?.organization?`<em>${esc([r.geo?.asn?("AS"+String(r.geo.asn).replace(/^AS/i,"")):"",r.geo?.organization].filter(Boolean).join(" · "))}</em>`:""}
    </div>
    ${r.url?`<a class="probe-source" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">探针地址</a>`:""}
   </div>
 </div>`).join("");

 const cn=rs.find(x=>x.kind==="cn")?.ip;
 const foreign=rs.find(x=>x.kind==="foreign")?.ip;
 const google=rs.find(x=>x.kind==="google")?.ip;

 let msg="", cls="same";
 if(!cn){
   msg="国内探针没有成功返回 IP。请检查该国内域名是否被代理规则拦截或浏览器扩展阻止。";
   cls="";
 }else if(foreign && !sameIp(cn,foreign)){
   msg="国内出口与国外出口不同：分流已经生效。国内卡片显示的是中国境内回显服务实际看到的出口 IP。";
   cls="split";
 }else if(foreign && sameIp(cn,foreign)){
   msg="国内与国外探针看到相同 IP：当前可能是全局代理、全局直连，或这两个探针被分到了同一路由。";
 }else{
   msg="已取得国内出口 IP；国外探针不足，暂时无法完成分流对比。";
 }
 if(google && foreign && !sameIp(google,foreign)){
   msg += " Google/特殊国际对照又出现了另一出口，存在更细粒度分流。";
   cls="split";
 }
 verdict.textContent=msg+" 隐藏 50% IP 只影响页面显示，不影响上述比较。";
 verdict.className="egress-verdict "+cls;
}

async function runEgress(){
 const root=$("#egressGrid"), verdict=$("#egressVerdict");
 root.innerHTML='<div class="muted">正在直接请求中国境内 / 国际出口探针…</div>';
 verdict.textContent="正在判断分流模式…";

 // 两个中国境内探针并行。优先 UAPI；失败时自动采用 PCOnline JSONP。
 const [cn1,cn2,foreign,google]=await Promise.all([
   cnProbeUapis(),
   cnProbePconline(),
   foreignProbe(),
   googleRouteProbe()
 ]);

 let cn;
 if(cn1.ip && cn2.ip){
   // 两个国内探针若一致，可信度最高；若不一致，优先首个并把差异写进来源。
   cn = sameIp(cn1.ip,cn2.ip)
     ? {...cn1,source:`${cn1.source} + ${cn2.source}（一致）`}
     : {...cn1,source:`${cn1.source}；备用探针=${cn2.ip}（两者分流不一致）`};
 }else{
   cn = cn1.ip ? cn1 : cn2;
 }

 let rs=[cn,foreign,google];

 // 对三条出口 IP 并行查询国家 / 地区 / 城市 / ASN / 运营商。
 rs=await Promise.all(rs.map(async r=>{
   if(!r?.ip) return r;
   const geo=await lookupEgressGeo(r.ip);
   return {...r,geo};
 }));

 HOME_EGRESS_RESULTS=rs;
 renderEgressResults(rs);
 return rs;
}


// ---------------- V2.3 DNS 泄露风险检测（无服务器模式） ----------------
async function dohProbe(name,url){
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),5500);
  const started=performance.now();
  try{
    // Use a normal DNS JSON query. We only judge endpoint reachability.
    const r=await fetch(url,{
      method:"GET",
      cache:"no-store",
      credentials:"omit",
      signal:c.signal,
      headers:{"accept":"application/dns-json"}
    });
    let body=null;
    try{ body=await r.json(); }catch{}
    return {
      name,
      ok:r.ok,
      status:r.status,
      ms:Math.round(performance.now()-started),
      dnsStatus:body?.Status ?? null
    };
  }catch(e){
    return {
      name,
      ok:false,
      error:e.name==="AbortError"?"超时":e.message,
      ms:null
    };
  }finally{
    clearTimeout(t);
  }
}

function isPublicIpCandidate(ip){
  if(!ip) return false;
  const s=String(ip).trim();

  // IPv4 private/link-local/loopback exclusions.
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)){
    const p=s.split(".").map(Number);
    if(p.some(n=>n<0||n>255)) return false;
    if(p[0]===10 || p[0]===127) return false;
    if(p[0]===169 && p[1]===254) return false;
    if(p[0]===172 && p[1]>=16 && p[1]<=31) return false;
    if(p[0]===192 && p[1]===168) return false;
    if(p[0]===100 && p[1]>=64 && p[1]<=127) return false;
    return true;
  }

  // IPv6 rough exclusions for loopback, link-local, ULA.
  if(s.includes(":")){
    const low=s.toLowerCase();
    if(low==="::1") return false;
    if(low.startsWith("fe8")||low.startsWith("fe9")||low.startsWith("fea")||low.startsWith("feb")) return false;
    if(low.startsWith("fc")||low.startsWith("fd")) return false;
    return true;
  }
  return false;
}

async function collectWebrtcPublicIps(timeout=5500){
  const ips=new Set();
  let pc=null, timer=null;
  try{
    pc=new RTCPeerConnection({
      iceServers:[
        {urls:"stun:stun.l.google.com:19302"},
        {urls:"stun:stun.cloudflare.com:3478"}
      ]
    });
    pc.createDataChannel("dns-risk");
    pc.onicecandidate=e=>{
      const c=e.candidate?.candidate||"";
      const parts=c.split(/\s+/);
      const candidateIp=parts[4];
      if(isPublicIpCandidate(candidateIp)) ips.add(candidateIp);
    };
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise(resolve=>{
      timer=setTimeout(resolve,timeout);
      pc.onicegatheringstatechange=()=>{
        if(pc.iceGatheringState==="complete"){
          clearTimeout(timer);
          resolve();
        }
      };
    });
  }catch(e){
    return {ok:false,ips:[],error:e.message};
  }finally{
    if(timer) clearTimeout(timer);
    try{pc?.close()}catch{}
  }
  return {ok:true,ips:[...ips]};
}

function renderDnsDoh(results){
  const root=$("#dnsDohGrid");
  if(!root) return;
  root.innerHTML=results.map(r=>`
    <div class="dns-doh-card ${r.ok?"ok":"fail"}">
      <b>${esc(r.name)}</b>
      <span>${r.ok?"可达 / Reachable":"不可达 / Unreachable"}</span>
      <em>${r.ms!=null?`${r.ms} ms`:(r.error||"失败")}</em>
    </div>
  `).join("");
}

async function runDnsRisk(){
  const scoreEl=$("#dnsRiskScore");
  const levelEl=$("#dnsRiskLevel");
  const summaryEl=$("#dnsRiskSummary");
  const ipEl=$("#dnsPublicIp");
  const geoEl=$("#dnsPublicGeo");
  const wrtcStatusEl=$("#dnsWebrtcStatus");
  const wrtcIpsEl=$("#dnsWebrtcIps");
  const findingsEl=$("#dnsFindings");

  if(scoreEl) scoreEl.textContent="检测中…";
  if(levelEl) levelEl.textContent="正在检测";
  if(summaryEl) summaryEl.textContent="正在收集公网出口、WebRTC 和 DoH 信号…";
  if(findingsEl) findingsEl.innerHTML='<div class="muted">检测中…</div>';

  let base=null, geo=null;
  try{
    base=BASE?.ip ? BASE : await api("/api/ip");
  }catch{}
  if(base?.ip){
    try{geo=await lookupEgressGeo(base.ip)}catch{}
  }

  if(ipEl) ipEl.textContent=displayIp(base?.ip||"—");
  if(geoEl) geoEl.textContent=formatGeo(geo);

  const [webrtc,dohCf,dohGoogle,dohQuad9]=await Promise.all([
    collectWebrtcPublicIps(),
    dohProbe("Cloudflare DoH","https://cloudflare-dns.com/dns-query?name=example.com&type=A"),
    dohProbe("Google DoH","https://dns.google/resolve?name=example.com&type=A"),
    dohProbe("Quad9 DoH","https://dns.quad9.net/dns-query?name=example.com&type=A")
  ]);

  const dohResults=[dohCf,dohGoogle,dohQuad9];
  renderDnsDoh(dohResults);

  const wrtcIps=(webrtc?.ips||[]).filter(Boolean);
  const extraPublic=wrtcIps.filter(ip=>base?.ip && ip!==base.ip);

  if(wrtcStatusEl){
    if(!webrtc?.ok) wrtcStatusEl.textContent="检测受限";
    else if(extraPublic.length) wrtcStatusEl.textContent="发现额外公网 IP";
    else if(wrtcIps.length) wrtcStatusEl.textContent="未发现不同出口";
    else wrtcStatusEl.textContent="未暴露公网候选";
  }
  if(wrtcIpsEl){
    wrtcIpsEl.textContent=wrtcIps.length
      ? wrtcIps.map(displayIp).join(" / ")
      : "未检测到";
  }

  // Risk score is a transparent local heuristic, not a proprietary DNS leak score.
  let risk=0;
  const findings=[];

  if(!base?.ip){
    risk+=20;
    findings.push({type:"warn",text:"公网出口 IP 获取失败，检测完整性下降。"});
  }else{
    findings.push({type:"good",text:`已获取公网出口：${displayIp(base.ip)} · ${formatGeo(geo)}`});
  }

  if(extraPublic.length){
    risk+=40;
    findings.push({
      type:"bad",
      text:`WebRTC 发现 ${extraPublic.length} 个与 HTTPS 公网出口不同的公网 IP，存在浏览器侧 IP 泄露风险。`
    });
  }else if(webrtc?.ok){
    findings.push({type:"good",text:"WebRTC 未发现与主公网出口不同的额外公网 IP。"});
  }else{
    risk+=8;
    findings.push({type:"warn",text:"WebRTC 检测受浏览器策略限制，无法完成完整判断。"});
  }

  const reachable=dohResults.filter(x=>x.ok).length;
  if(reachable===0){
    risk+=8;
    findings.push({type:"warn",text:"三个主流 DoH 端点均不可达，可能被网络策略、浏览器扩展或代理规则阻断。"});
  }else{
    findings.push({type:"good",text:`DoH 可达性：${reachable}/3。可达只表示网络能够访问，不代表系统当前 DNS 一定使用这些服务。`});
  }

  // If all three are reachable, that by itself is neutral; don't lower score as a fake "safe" signal.
  if(dohResults.some(x=>!x.ok) && reachable>0){
    risk+=4;
    findings.push({type:"info",text:"不同 DoH 服务的可达性存在差异，说明当前网络可能存在域名/线路级分流或拦截。"});
  }

  // Compare current homepage three-route data when available.
  const egress=Array.isArray(HOME_EGRESS_RESULTS)?HOME_EGRESS_RESULTS:[];
  const cn=egress.find(x=>x.kind==="cn")?.ip;
  const foreign=egress.find(x=>x.kind==="foreign")?.ip;
  if(cn && foreign && cn!==foreign){
    findings.push({type:"good",text:"首页国内/国外出口 IP 不同，说明当前存在分流；DNS 风险检测会结合这一网络状态解读。"});
  }

  risk=Math.max(0,Math.min(100,risk));
  let level,summary,cls;
  if(risk>=45){
    level="高风险 / High";
    summary="发现明显的浏览器侧 IP 泄露或检测异常信号。";
    cls="high";
  }else if(risk>=15){
    level="中等风险 / Medium";
    summary="存在部分泄露或网络策略异常信号，建议结合代理软件 DNS 设置进一步检查。";
    cls="medium";
  }else{
    level="低风险 / Low";
    summary="未发现明显浏览器侧泄露迹象。注意：无权威 DNS 日志时，不能据此证明系统 DNS Resolver 一定没有泄露。";
    cls="low";
  }

  if(scoreEl) scoreEl.textContent=String(100-risk);
  if(levelEl){
    levelEl.textContent=level;
    levelEl.className="dns-risk-level "+cls;
  }
  if(summaryEl) summaryEl.textContent=summary;

  if(findingsEl){
    findingsEl.innerHTML=findings.map(f=>`
      <div class="dns-finding ${f.type}">
        <span>${f.type==="good"?"✓":f.type==="bad"?"!":"•"}</span>
        <p>${esc(f.text)}</p>
      </div>
    `).join("");
  }

  return {risk,trust:100-risk,base,geo,webrtc,doh:dohResults};
}


async function runCurrentIpScore(){
  try{
    if(!BASE?.ip){
      BASE=await api("/api/ip");
    }
    const ip=BASE?.ip;
    if(!ip) return;

    // Fill common IP input fields if the page has one, but do not require user interaction.
    const input =
      document.querySelector('#qualityIp') ||
      document.querySelector('#scoreIp') ||
      document.querySelector('#lookupIp') ||
      document.querySelector('input[data-role="ip-score"]');
    if(input) input.value=ip;

    // Prefer the existing page scoring function if present.
    if(typeof runQuality==="function"){
      return await runQuality(ip);
    }
    if(typeof checkQuality==="function"){
      return await checkQuality(ip);
    }
    if(typeof runScore==="function"){
      return await runScore(ip);
    }
    if(typeof scoreIp==="function"){
      return await scoreIp(ip);
    }

    // Fallback: query the existing quality API and render a compact current-IP score card.
    const q=await api("/api/quality?ip="+encodeURIComponent(ip));
    const host =
      document.querySelector('#qualityResult') ||
      document.querySelector('#scoreResult') ||
      document.querySelector('#lookupResult');
    if(host){
      const risk=q?.risk_score ?? q?.risk ?? q?.score ?? null;
      const trust=q?.trust_score ?? q?.trust ?? (typeof risk==="number"?100-risk:null);
      host.innerHTML=`<div class="panel">
        <h3>当前 IP 自动评分</h3>
        <div class="dns-kv"><span>IP</span><b>${esc(displayIp(ip))}</b></div>
        <div class="dns-kv"><span>风险评分</span><b>${risk??"—"}</b></div>
        <div class="dns-kv"><span>可信评分</span><b>${trust??"—"}</b></div>
      </div>`;
    }
    return q;
  }catch(e){
    console.error("自动评分失败",e);
  }
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
