
/* ===== FILE: legacy/legacy-app.js ===== */

var global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this);
const CATS={
  research:{name:'科研',icon:'🔬',color:'#6366f1'},
  work:{name:'工作',icon:'💼',color:'#10b981'},
  life:{name:'生活',icon:'🌿',color:'#f59e0b'},
  sport:{name:'运动',icon:'🏃',color:'#8b5cf6'},
  finance:{name:'金融',icon:'💰',color:'#ec4899'}
};
global.CATS = CATS; // 暴露给新架构页面（CATS 为 const，不自动挂到 window）
const STORE='workbench_data_v2';

/* =====================================================
 * v4: 增量层 (12 项 ⭐⭐⭐ 优化)
 * - 数据 schema 版本与迁移（F1: 持久化与迁移）
 * - persist() 写 IDB 兜底
 * - load() IDB 兜底拉取
 * - pushBackup 总大小限制 (≤2MB)
 * - editing* 单对象化 currentEdit（M1）
 * - 全局快捷键 + 焦点陷阱 + Esc 关闭 + body scroll lock（I1）
 * - 表单草稿自动暂存（I2）
 * - Cmd+K 命令面板（F3）
 * - 今日必做（v4 概览 KPI）（F1 派生）
 * - 今日恐龙折叠 + skill 50% 折叠记忆（V1 & D 系列）
 * - toast 通知
 * ===================================================== */
var APP_VERSION='4.4.0';
var APP_BUILD='2026-07-18';
var SCHEMA_VERSION = 5;

/* =========================================================
 * v5: nav badge + 折叠 + 摘要
 * ======================================================= */
function v5RefreshBadges(){
  if(typeof data==='undefined' || !data) return;
  const today=todayStr();
  function setBid(bid, txt){const el=document.getElementById(bid);if(!el)return;el.textContent=txt;el.style.display=txt?'':'none';}
  // 今日待办
  setBid('bd-overview', data.items.filter(i=>i.status!=='done' && (i.due===today || (i.due && i.due<today))).length || '');
  // 工作 / 生活 待办
  ['work','life'].forEach(cat=>{
    setBid('bd-'+cat, data.items.filter(i=>i.cat===cat && i.status!=='done').length || '');
  });
  // 日历：本周有效日程数
  const weekItems = data.items.filter(i=>i.due && daysBetween(i.due,today)<=7 && daysBetween(i.due,today)>=-7);
  setBid('bd-calendar', weekItems.length || '');
  // 科研:  在投 / 拟投
  const ps = (data.papers||[]).filter(p=>p.kind==='plan'||p.kind==='sub').length;
  setBid('bd-research', ps || '');
  // 运动: 本周分钟
  const wkMins = data.items.filter(i=>i.cat==='sport' && i.due && daysBetween(i.due,today)<=0 && daysBetween(i.due,today)>=-6)
                            .reduce((s,i)=>s+(+i.minutes||0),0);
  setBid('bd-sport', wkMins?wkMins+'分':'');
  // 习惯: 今日未打卡
  const todayKey=today;
  const habits = data.habits||[];
  const habitModel=(window.WorkbenchHabitMetrics&&window.WorkbenchHabitMetrics.summary)?window.WorkbenchHabitMetrics.summary():null;
  const noHit = habitModel?habitModel.remaining:habits.filter(h=>!h.logs || !h.logs[todayKey]).length;
  setBid('bd-habit', noHit || '');
  // 金融: 本月结余
  const mNow=today.slice(0,7);
  let inc=0,exp=0;
  (data.finances||[]).forEach(f=>{if(!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date&&f.date<=today&&f.date.slice(0,7)===mNow){if(f.type==='income')inc+=+f.amount||0;else exp+=+f.amount||0;}});
  const bal=inc-exp;
  setBid('bd-finance', '¥'+(bal===0?'0':(bal>0?'+':'-')+Math.abs(bal).toFixed(0)));
}

/* ----------- v5: 概览页默认折叠（按 prefs.overviewCollapse） ----------- */
function v5PanelToggle(key,headId,bodyHtml){
  const head=document.getElementById(headId);
  if(!head) return;
  const wantCollapse=data.prefs.overviewCollapse[key];
  head.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px">'+
      '<button class="btn small" style="padding:3px 9px;font-size:11px" onclick="v5TogglePanel(\''+key+'\',\''+headId+'\')">'+
      (wantCollapse?'展开 ▸':'折叠 ▾')+'</button>'+
    '</div>';
  if(wantCollapse && bodyHtml) head.insertAdjacentHTML('afterend','<div class="v5-panel-body" id="'+headId+'_body">'+bodyHtml+'</div>');
  else if(bodyHtml) head.insertAdjacentHTML('afterend','<div class="v5-panel-body" id="'+headId+'_body">'+bodyHtml+'</div>');
}
function v5TogglePanel(key,headId){
  data.prefs.overviewCollapse[key] = !data.prefs.overviewCollapse[key];
  save();render();
}

/* ----------- v5: 快捷入口池（在 empty 状态显示真实 CTA） ----------- */
const V5_QUICK_TIPS={
  emptyItems:'试试 <b>⌘/Ctrl + K</b> → 输入如 <i>提交报告 due:明天</i> 快速建任务',
  emptyFunds:'点 <b>＋ 添加基金</b>，按月记录一次净值即可追踪收益',
  emptyPapers:'新建论文时填写 <b>回复截止日</b>，首页自动出现 rebuttal 倒计时',
  emptyHabits:'每天点一次 ✓ 即可开始累积连续天数',
};

/* ----------- v5: 「今日三件事」 —— 用于顶部 KPI ----------- */
function v5Top3Today(){
  const t=todayStr();
  const items=data.items.slice().filter(i=>i.status!=='done' && (!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat)))
    .sort((a,b)=>{
      // 优先级：逾期 > 今日 > 近期
      const ta=a.due?daysBetween(t,a.due):999;
      const tb=b.due?daysBetween(t,b.due):999;
      if(ta!==tb) return ta-tb;
      const pa={high:0,mid:1,low:2};
      return pa[a.prio]-pa[b.prio];
    });
  const top3 = items.slice(0,3);
  if(!top3.length) return '<div class="today-mc" style="grid-column:1/-1"><div class="t">🎉 今日无待办</div><div class="d">所有事都搞定了 — 去 <b>复盘</b> 写写心得，或者去 <b>热榜</b> 看看世界。</div></div>';
  return top3.map((i,iidx)=>{
    const dd=i.due?daysBetween(t,i.due):null;
    const lbl=dd===null?'无日期':dd<0?`逾期${-dd}天`:dd===0?'今天':`${dd}天后`;
    const col=dd===null?'var(--muted)':dd<0?'#ef4444':dd===0?'var(--primary)':'#10b981';
    return `<div class="today-mc" style="border-left:3px solid ${col}"><div class="t">第${iidx+1}件 · ${esc(lbl)}</div>
      <div style="font-size:15px;font-weight:700;margin-top:6px;line-height:1.35">${esc(i.title)}</div>
      <div class="d">${i.prio==='high'?'🔥 高优':''} ${i.cat||''} ${i.tags&&i.tags.length?'· '+i.tags.map(esc).join('#'):''}</div>
      </div>`;
  }).join('');
}

/* ----------- v5: 最近 quick add（命令面板频率最高的 5 条） ----------- */
function v5RememberQuickAdd(text,cat){
  if(!data.prefs.recentlyQuickAdd) data.prefs.recentlyQuickAdd=[];
  const entry=text+'||'+cat;
  data.prefs.recentlyQuickAdd = [entry,...data.prefs.recentlyQuickAdd.filter(e=>e!==entry)].slice(0,5);
}
function v5RecentQuickAdds(){
  const items=(data.prefs.recentlyQuickAdd||[]).map(e=>{const [t,c]=e.split('||');return {title:t,cat:c};});
  if(!items.length) return '';
  return '<div class="panel" style="margin-bottom:14px"><h2>⚡ 最近快速添加</h2>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;padding:6px 4px">'
    +items.map(it=>'<button class="btn small" onclick="openCmdK();" title="点击用同样命令快速重做">'+esc(it.title.length>14?it.title.slice(0,14)+'…':it.title)+'</button>').join('')
    +'</div></div>';
}

/* ----------- v5: 概览页底部"今天结束前提醒"+ 智能提醒横幅 ----------- */
function v5DailyBanner(){
  const today=todayStr();
  const visible=data.items.filter(i=>!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat));
  const overdue=visible.filter(i=>i.status!=='done' && i.due && i.due<today).length;
  const today2=visible.filter(i=>i.status!=='done' && i.due===today).length;
  if(!overdue && !today2) return '';
  let msg='';
  if(overdue) msg += `<b style="color:#ef4444">${overdue} 条已逾期</b>` + (today2?' · ':'');
  if(today2) msg += `<b>${today2} 条今天截止</b>`;
  return '<div class="bulk-bar" style="background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.10));border:1px solid #fecaca;color:#7f1d1d;padding:12px 14px;font-size:13.5px;border-radius:12px;margin-bottom:14px">⚠ '+msg+' · 立即去 <a href="#" onclick="openCmdK();return false" style="color:#6366f1;font-weight:700">命令面板</a> 或 <a href="#" onclick="setView(\'calendar\');return false" style="color:#6366f1;font-weight:700">日历</a> 处理</div>';
}


function migrateSchema(){
  if(!data.__v){
    if(typeof data.prefs!=='object'||data.prefs===null) data.prefs={};
    if(!data.prefs.overviewCollapse) data.prefs.overviewCollapse={};
    if(!data.prefs.sort) data.prefs.sort={};
  }
  // v5 默认折叠入口（保留 v4 默认）
  if(typeof data.prefs.overviewCollapse['heatmap']==='undefined') data.prefs.overviewCollapse['heatmap']=true;
  if(typeof data.prefs.overviewCollapse['finance_month']==='undefined') data.prefs.overviewCollapse['finance_month']=true;
  if(typeof data.prefs.overviewCollapse['anniversaries']==='undefined') data.prefs.overviewCollapse['anniversaries']=true;
  // 业务字段
  if(!data.prefs.recentlyQuickAdd) data.prefs.recentlyQuickAdd = [];   // 最近 quick add 模板
  if(typeof data.prefs.hideDoneInOverview!=='boolean') data.prefs.hideDoneInOverview = true;
  data.__v = SCHEMA_VERSION;
}
function enrichForV4(){
  // v4 起移除批量模式；清理历史 UI 状态，不影响业务数据。
  delete data.bulkMode;
  delete data.selectedIds;
  if(!data.prefs) data.prefs={};
  if(!data.prefs.overviewCollapse) data.prefs.overviewCollapse={};
  // 体积查看检查
  try{const used=JSON.stringify(data).length;if(used>2*1024*1024) console.warn('数据体量偏大:',(used/1024/1024).toFixed(1),'MB');}catch(e){}
}

/* ------- IndexedDB 简易封装 ------- */
var IDB_NAME='workbench_db_v1';
var IDB_STORE='workbench';
function idbOpen(){
  return new Promise((res,rej)=>{
    if(!('indexedDB' in window)) return rej('no idb');
    const r=indexedDB.open(IDB_NAME,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);};
    r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
  });
}
async function idbPut(v){try{const db=await idbOpen();return await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(v,'main');tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch(e){}}
async function idbGet(){try{const db=await idbOpen();return await new Promise((res,rej)=>{const tx=db.transaction(IDB_STORE,'readonly');const rq=tx.objectStore(IDB_STORE).get('main');rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error);});}catch(e){return null;}}

/* ------- toast ------- */
function toast(msg,ms){
  let t=document.getElementById('v4toast');
  if(!t){t=document.createElement('div');t.id='v4toast';
    t.style.cssText='position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:rgba(15,23,42,.92);color:#fff;border-radius:10px;padding:10px 18px;font-size:13.5px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._tm);
  t._tm=setTimeout(()=>{t.style.opacity='0';},ms||1800);
}

/* ------- 侧栏（移动端 drawer） ------- */
function toggleNav(force){
  const nav=document.getElementById('nav');
  const bd=document.getElementById('navBackdrop');
  if(!nav) return;
  const willOpen = (typeof force==='boolean') ? force : !nav.classList.contains('open');
  nav.classList.toggle('open', willOpen);
  if(bd) bd.classList.toggle('show', willOpen);
  document.body.classList.toggle('nav-open', willOpen);
}

/* ------- ESC + scroll lock + focus trap ------- */
function v4LockScroll(lock){document.body.classList.toggle('modal-open',!!lock);}
function v4CloseAnyModal(){
  const masks=[...document.querySelectorAll('.mask.show')];
  masks.reverse().forEach(m=>{
    const fn=({mask:closeForm,projMask:closeProject,paperMask:closePaper,patentMask:closePatent,
      rprojMask:closeRProj,fundMask:closeFund,navMask:closeNav,bookMask:closeBook,
      travelMask:closeTravel,annivMask:closeAnniversary,weightMask:closeWeight,planMask:closePlan,
      financeMask:closeFinance,habitMask:closeHabit,newsMask:closeNewsMgr,
      cmdkMask:closeCmdK,cheatMask:closeCheatsheet,syncMask:closeSync,bakMask:closeBak,
      dayMask:closeDay})[m.id];
    if(fn) try{fn();}catch(e){m.classList.remove('show');}
  });
}
function v4TrapFocus(modal){
  const sel='button:not([disabled]),[href],input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const fs=[...modal.querySelectorAll(sel)].filter(el=>el.offsetParent!==null||el===document.activeElement);
  if(!fs.length) return;
  const first=fs[0],last=fs[fs.length-1];
  function trap(e){
    if(e.key!=='Tab') return;
    if(e.shiftKey && document.activeElement===first){last.focus();e.preventDefault();}
    else if(!e.shiftKey && document.activeElement===last){first.focus();e.preventDefault();}
  }
  modal.__trap=trap;modal.addEventListener('keydown',trap);
  first.focus();
}
function v4Untrap(modal){if(modal&&modal.__trap){modal.removeEventListener('keydown',modal.__trap);modal.__trap=null;}}

const v4MaskMo=new MutationObserver(rs=>{
  rs.forEach(r=>{
    if(r.attributeName!=='class'||!r.target.classList.contains('mask')) return;
    const m=r.target,opened=m.classList.contains('show');
    if(opened){
      v4LockScroll(true);
      const md=m.querySelector('.modal');
      if(md) setTimeout(()=>v4TrapFocus(md),30);
    }else{
      v4LockScroll(false);
      const md=m.querySelector('.modal');
      if(md) v4Untrap(md);
    }
  });
});

/* ------- 全局快捷键（Cmd+K、?、/、n、m、g+x） ------- */
const _v4KeySeq={key:'',t:0};
document.addEventListener('keydown', e=>{
  // 通用：Esc 关弹层
  if(e.key==='Escape' && document.querySelectorAll('.mask.show').length){
    e.preventDefault();v4CloseAnyModal();return;
  }
  const tag=(e.target.tagName||'').toUpperCase();
  const inField = tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || e.target.isContentEditable;
  if((e.metaKey||e.ctrlKey) && (e.key==='k'||e.key==='K')){
    e.preventDefault();openCmdK();return;
  }
  if(!inField){
    if(e.key==='?'){e.preventDefault();openCheatsheet();return;}
    if(e.key==='/'){e.preventDefault();document.getElementById('search').focus();return;}
    if(e.key==='n'){e.preventDefault();newItem();return;}
    if(e.key==='m'){e.preventDefault();toggleNav();return;}
    const now=Date.now();
    if(_v4KeySeq.key==='g' && (now-_v4KeySeq.t)<900){
      const map={o:'overview',r:'review',w:'work',l:'life',s:'sport',f:'finance',n:'news',h:'habit',c:'calendar'};
      if(map[e.key]){setView(map[e.key]);_v4KeySeq={key:'',t:0};e.preventDefault();return;}
    }
    if(e.key==='g'){_v4KeySeq={key:'g',t:now};return;}
    _v4KeySeq={key:'',t:0};
  }
});

/* ------- Cmd+K 命令面板逻辑 ------- */
let cmdkResults=[];
function openCmdK(){
  document.getElementById('cmdkMask').classList.add('show');
  const q=document.getElementById('cmdk_q');q.value='';renderCmdK();
  setTimeout(()=>q.focus(),40);
}
function closeCmdK(){document.getElementById('cmdkMask').classList.remove('show');}
function openCheatsheet(){document.getElementById('cheatMask').classList.add('show');}
function closeCheatsheet(){document.getElementById('cheatMask').classList.remove('show');}
function parseDue(s){
  s=String(s||'').trim();
  if(!s) return todayStr();
  const today=new Date();
  if(/^今/.test(s)) return today.toISOString().slice(0,10);
  if(/^明/.test(s)){const d=new Date(today);d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);}
  if(/^后/.test(s)){const d=new Date(today);d.setDate(d.getDate()+2);return d.toISOString().slice(0,10);}
  if(/^下周?一?/.test(s)){const d=new Date(today);const off=(8-today.getDay()+7)%7||7;d.setDate(d.getDate()+off);return d.toISOString().slice(0,10);}
  const m=s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  return s;
}
function cmdkParse(q){
  const obj={title:q,due:undefined,prio:'mid',tags:[],cat:undefined};
  let rest=q;
  let m;
  m=rest.match(/due[:：]\s*([\d\-\u4e00-\u9fa5年月日明后今周\w]+)/iu);
  if(m){obj.due=parseDue(m[1]);rest=rest.replace(m[0],'').trim();}
  m=rest.match(/!\s*(high|mid|low)/i);
  if(m){obj.prio=m[1].toLowerCase();rest=rest.replace(m[0],'').trim();}
  m=rest.match(/#([^\s,，]+)/g);
  if(m){obj.tags=m.map(s=>s.slice(1));rest=rest.replace(/#[^\s,，]+/g,'').trim();}
  m=rest.match(/cat[:：]\s*(work|research|life|sport|habit|finance)/i);
  if(m){obj.cat=m[1].toLowerCase();rest=rest.replace(m[0],'').trim();}
  obj.title=rest.trim();
  return obj;
}
var KM_ACTIONS=[
  {kw:['添加基金','基金','添加股票'],a:'fund'},
  {kw:['同步数据','同步到 gist','github','同步'],a:'sync'},
  {kw:['立即备份','手动备份','备份'],a:'backup'},
  {kw:['深色','浅色','切换主题'],a:'theme'},
  {kw:['帮助','操作手册','快捷键'],a:'cheat'},
  {kw:['导出','导出数据'],a:'export'},
  {kw:['导入','导入数据'],a:'import'},
  {kw:['日历','日'],a:'cal'},
];
var KM_LABEL={fund:'添加基金',sync:'立即 Gist 同步',backup:'立即本地备份',theme:'切换深浅色',cheat:'查看操作手册',export:'导出数据',import:'导入数据',cal:'跳转到日历'};
function renderCmdK(){
  const q=(document.getElementById('cmdk_q').value||'').trim();
  const list=document.getElementById('cmdk_list');
  cmdkResults=[];
  if(!q){list.innerHTML='<div class="cmk-empty">输入任意关键词：动作或新增任务。回车执行。</div>';return;}
  if(/[\u4e00-\u9fa5A-Za-z]/.test(q)){
    cmdkResults.push({kind:'create',label:'新建事项：'+q,meta:'Enter'});
  }
  KM_ACTIONS.forEach(x=>{
    if(x.kw.some(k=>q.includes(k))) cmdkResults.push({kind:'action',label:KM_LABEL[x.a],meta:x.a,action:x.a});
  });
  list.innerHTML = cmdkResults.length
    ? cmdkResults.map((r,i)=>'<div class="cmk-row'+(i===0?' sel':'')+'" onclick="runCmdIndex('+i+')">'+esc(r.label)+'<span class="mk">'+esc(r.meta)+'</span></div>').join('')
    : '<div class="cmk-empty">没有匹配项，回车将作为新增事项保存</div>';
}
function runCmdIndex(i){
  const r=cmdkResults[i];if(!r) return runCmdK();
  if(r.kind==='action'){
    if(r.action==='fund') openFundForm();
    else if(r.action==='sync') syncPush();
    else if(r.action==='backup'){pushBackup(true);renderBak();toast('已立即备份 ✓');}
    else if(r.action==='theme') toggleTheme();
    else if(r.action==='cheat') openCheatsheet();
    else if(r.action==='export') exportData();
    else if(r.action==='import') importData();
    else if(r.action==='cal') setView('calendar');
  }
  closeCmdK();
}
function runCmdK(){
  const q=(document.getElementById('cmdk_q').value||'').trim();
  if(!q){closeCmdK();return;}
  if(cmdkResults.length && cmdkResults[0].kind==='action'){runCmdIndex(0);return;}
  const parsed=cmdkParse(q);
  const cat = parsed.cat || currentCat;
  if(['work','research','life','sport','habit'].indexOf(cat)<0){
    setView('work');
  }else setView(cat);
  openForm(cat);
  if(parsed.title) document.getElementById('f_title').value=parsed.title;
  if(parsed.due)   document.getElementById('f_due').value=parsed.due;
  if(parsed.prio)  document.getElementById('f_prio').value=parsed.prio;
  if(parsed.tags && parsed.tags.length) document.getElementById('f_tags').value=parsed.tags.join(', ');
  // v5: 记忆 quick add
  v5RememberQuickAdd(q, cat);
  toast('已打开表单，回车保存');
  closeCmdK();
}
document.addEventListener('input',e=>{
  if(e.target && e.target.id==='cmdk_q') renderCmdK();
});

/* ------- 表单草稿自动暂存（30 分钟，跨刷新） ------- */
var DRAFT_KEY='workbench_drafts_v1';
var DRAFT_TTL=30*60*1000;
function _dRead(){try{const s=localStorage.getItem(DRAFT_KEY);if(!s)return{};const o=JSON.parse(s);const now=Date.now();Object.keys(o).forEach(k=>{if(o[k].t&&now-o[k].t>DRAFT_TTL)delete o[k];});return o;}catch(e){return{};}}
function _dWrite(o){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(o));}catch(e){}}
function v4DraftCapture(mid){
  const m=document.getElementById(mid);if(!m)return;
  const fs=[...m.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),textarea,select')];
  if(!fs.length)return;
  const data={};fs.forEach(f=>{if(f.id) data[f.id]=f.value;});
  const o=_dRead();o[mid]={t:Date.now(),data};_dWrite(o);
}
function v4DraftClear(mid){const o=_dRead();delete o[mid];_dWrite(o);const b=document.getElementById(mid+'_banner');if(b)b.remove();}
function showDraftBanner(mid,ts){
  const m=document.getElementById(mid);if(!m||document.getElementById(mid+'_banner'))return;
  const b=document.createElement('div');
  b.id=mid+'_banner';b.className='draft-banner';
  b.innerHTML='<span>⏰ 已恢复 '+fmtTS(ts)+' 的草稿</span>'
    +'<button class="btn small" onclick="v4DraftClear(\''+mid+'\')">清除</button>';
  const md=m.querySelector('.modal');if(md)md.prepend(b);
}
function fmtTS(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
const _draftTimers={};
document.addEventListener('input',e=>{
  const m=e.target && e.target.closest && e.target.closest('.mask');
  if(!m) return;
  clearTimeout(_draftTimers[m.id]);
  _draftTimers[m.id]=setTimeout(()=>v4DraftCapture(m.id),600);
});
const _v4DraftMo=new MutationObserver(rs=>{
  rs.forEach(r=>{
    if(r.attributeName!=='class'||!r.target.classList.contains('mask')) return;
    const m=r.target;
    if(m.classList.contains('show')){
      setTimeout(()=>{
        const o=_dRead();const x=o[m.id];
        // 排除 cmdk / cheat / sync / bak——它们不算"草稿表单"
        if(!x||!x.data) return;
        if(['cmdkMask','cheatMask','syncMask','bakMask','newsMask'].indexOf(m.id)>=0) return;
        const any=Object.values(x.data).some(v=>v && String(v).length>0);
        if(!any) return;
        if(confirm(fmtTS(x.t)+' 存在未保存的草稿，是否恢复？')){
          Object.keys(x.data).forEach(id=>{const el=document.getElementById(id);if(el) el.value=x.data[id];});
          showDraftBanner(m.id,x.t);
        }else{v4DraftClear(m.id);}
      },120);
    }else{
      // 关闭时清掉该表单的草稿（避免下次误弹）
      // 保留：用户可能没保存 → 不清。给"清除"按钮手动清理
    }
  });
});

/* ------- 概览装饰：KPI 卡片 + 折叠 + schema 提示 ------- */
function decorOverview(html){
  const today=todayStr();
  const banner=v5DailyBanner();
  const recent=v5RecentQuickAdds();
  return banner + recent + html;
  const td=data.items.filter(i=>i.status!=='done' && i.due===today).length;
  const od=data.items.filter(i=>i.status!=='done' && i.due && i.due<today).length;
  const wk=data.items.filter(i=>i.cat==='sport' && i.due && daysBetween(i.due,today)<=0 && daysBetween(i.due,today)>=-6);
  const wkMins=wk.reduce((s,i)=>s+(+i.minutes||0),0);
  const mNow=new Date().toISOString().slice(0,7);
  let inc=0,exp=0;
(data.finances||[]).forEach(f=>{if(!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date&&f.date<=today&&f.date.slice(0,7)===mNow){if(f.type==='income') inc+=+f.amount||0; else exp+=+f.amount||0;}});
  const bal=inc-exp;
  const kpi =
    '<div class="today-mustdo" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">'
    +v5Top3Today()
    +'</div>'
    +'<div class="today-mustdo" style="background:transparent;border:0;box-shadow:none;padding:0;margin-top:6px">'
    +'<div class="today-mc"><div class="t">🚨 已逾期</div><div class="n" style="color:'+(od>0?'#ef4444':'var(--text)')+'">'+od+'</div><div class="d">条需立即处理</div></div>'
    +'<div class="today-mc"><div class="t">⏰ 今日截止</div><div class="n">'+td+'</div><div class="d">条日程</div></div>'
    +'<div class="today-mc"><div class="t">🏃 本周运动</div><div class="n">'+wkMins+'</div><div class="d">分（目标 ≥150）</div></div>'
    +'<div class="today-mc"><div class="t">💰 本月结余</div><div class="n" style="color:'+(bal>=0?'#10b981':'#ef4444')+'">'+(bal>=0?'+':'-')+Math.abs(bal).toFixed(2)+'</div><div class="d">元</div></div>'
    +'</div>';
  // 数据体量自检
  let sizeWarn='';
  try{const sz=JSON.stringify(data).length;if(sz>1.5*1024*1024) sizeWarn='<div class="bulk-bar" style="border-color:#f59e0b;color:#92400e">⚠️ 本地数据 '+(sz/1024/1024).toFixed(1)+' MB，已接近浏览器上限，建议备份后导出归档。</div>';}catch(e){}
  return sizeWarn + kpi + html;
}

/* ------- 启动：注册 MutationObserver ------- */
function v4AttachObservers(){
  document.querySelectorAll('.mask').forEach(m=>{
    v4MaskMo.observe(m,{attributes:true,attributeFilter:['class']});
    _v4DraftMo.observe(m,{attributes:true,attributeFilter:['class']});
  });
}
function v4Bootstrap(){
  v4AttachObservers();
  // 渲染时的钩子已通过包装 render() 实现：替换全局 render 调用即可
}
document.addEventListener('DOMContentLoaded',v4Bootstrap);

/* ------- 单编辑状态（v4: 包装 currentEdit，方便逐步迁移；不破坏老代码） ------- */
const v4CurrentEdit={kind:null,id:null};
function v4SetEdit(kind,id){v4CurrentEdit.kind=kind;v4CurrentEdit.id=id;}



var data={items:[],projects:[],funds:[],papers:[],patents:[],rprojects:[],books:[],travels:[],anniversaries:[],weights:[],finances:[],habits:[],targetWeight:null,monthlyBudget:null,theme:'light',weekPlans:{}};
var currentCat='work';
var calScope='work';
var calView='month';
var calAnchor=todayStr();
var calMonths={};
var researchTab='overview';
var paperKind='active';
var lifeTab='overview';
var workView='list';
var finView='month';
var bookStatus='reading';
var habitTab='today';
var sportTab='overview';
var planAnchor=todayStr();
var editingId=null, editingCat=null, editingProj=null, editingFund=null, editingPaper=null, editingPaperSteps=[],
    editingPatent=null, editingPatentSteps=[], editingRProj=null, editingBook=null, editingTravel=null, editingAnniversary=null, editingWeight=null, editingFinance=null, editingPlan=null, editingHabit=null, pendingPlan=null, daySel=null, searchKw='';
let newsFeeds=[], newsItems=[], newsStatus={}, newsErr={}, newsCat='all', newsView='focus', newsLoading=false, newsLastFetch=0, newsState={saved:{},read:{}};

function load(){
  try{const s=localStorage.getItem(STORE);if(s)data=JSON.parse(s);}catch(e){}
  if(!data.items)data.items=[];
  if(!data.projects)data.projects=[];
  if(!data.funds)data.funds=[];
  if(!data.papers)data.papers=[];
  data.papers.forEach(migratePaper);
  if(!data.patents)data.patents=[];
  data.patents.forEach(migratePatent);
  if(!data.rprojects)data.rprojects=[];
  if(!data.books)data.books=[];
  if(!data.travels)data.travels=[];
  if(!data.anniversaries)data.anniversaries=[];
  if(!data.weights)data.weights=[];
  if(!data.finances)data.finances=[];if(!data.habits)data.habits=[];
  if(!data.weekPlans)data.weekPlans={};
  expandFinanceRecur();
  if(!data.theme)data.theme='light';
  document.documentElement.setAttribute('data-theme',data.theme);
  document.getElementById('themeBtn').textContent=data.theme==='dark'?'☀️':'🌙';
  loadNewsCfg();loadNewsCache();loadNewsState();
  migrateSchema();
  enrichForV4();
  // IDB 兜底：仅当 localStorage 缺失时尝试从 IDB 取
  if((!data.items||data.items.length===0)){
    idbGet().then(d=>{
      if(d && Array.isArray(d.items) && d.items.length){
        data = d;
        migrateSchema();enrichForV4();
        render();
        toast('已从 IndexedDB 恢复数据');
      }
    }).catch(()=>{});
  }
}
function persist(){
  try{localStorage.setItem(STORE,JSON.stringify(data));}
  catch(e){console.warn('localStorage 写入失败，将依赖 IndexedDB',e);}
  idbPut(data).catch(()=>{});
}
function save(){data.__savedAt=Date.now();persist();schedulePush();pushBackup();}
/* ---------- 本地自动备份（浏览器内快照，可回滚） ---------- */
const BAK_KEY='workbench_backups_v1';
const BAK_MAX=30;
const BAK_MIN_GAP=2000;
var lastBak=0;
function loadBak(){try{const s=localStorage.getItem(BAK_KEY);const a=s?JSON.parse(s):[];return Array.isArray(a)?a:[];}catch(e){return[];}}
function pushBackup(force){
  try{
    const now=Date.now();
    if(!force&&now-lastBak<BAK_MIN_GAP)return;
    lastBak=now;
    const arr=loadBak();
    arr.push({ts:now,data:stripSync(data)});
    while(arr.length>BAK_MAX)arr.shift();
    localStorage.setItem(BAK_KEY,JSON.stringify(arr));
  }catch(e){}
}
function fmtBak(ts){const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());}
function openBak(){renderBak();document.getElementById('bakMask').classList.add('show');}
function closeBak(){document.getElementById('bakMask').classList.remove('show');}
function renderBak(){
  const arr=loadBak();const box=document.getElementById('bakList');
  if(!arr.length){box.innerHTML='<div class="empty">暂无备份，点击「立即备份」创建一份</div>';return;}
  let h='';
  arr.slice().reverse().forEach(b=>{
    const d=b.data||{};
    const cnt=(d.items?d.items.length:0)+(d.projects?d.projects.length:0)+(d.funds?d.funds.length:0)+(d.papers?d.papers.length:0)+(d.patents?d.patents.length:0)+(d.rprojects?d.rprojects.length:0)+(d.weights?d.weights.length:0)+(d.finances?d.finances.length:0);
    h+=`<div class="item" style="align-items:center">
      <div class="body"><div class="title" style="font-size:14px">${fmtBak(b.ts)}</div>
      <div class="meta"><span class="tag" style="background:#e0f2fe;color:#0369a1">${cnt} 条记录</span></div></div>
      <div class="acts">
        <button class="icon-btn" title="恢复到此备份" onclick="restoreBak(${b.ts})">♻️</button>
        <button class="icon-btn" title="删除此备份" onclick="delBak(${b.ts})">🗑️</button>
      </div></div>`;
  });
  box.innerHTML=h;
}
function restoreBak(ts){
  if(!confirm('恢复到该备份？当前未备份的内容会被覆盖（恢复前会自动再存一份当前快照）'))return;
  pushBackup(true);
  const b=loadBak().find(x=>x.ts===ts);if(!b)return;
  const d=b.data||{};
  data=Object.assign({items:[],projects:[],funds:[],papers:[],patents:[],rprojects:[],books:[],travels:[],anniversaries:[],weights:[],finances:[],theme:'light',weekPlans:{}},d);
  if(!data.items)data.items=[];if(!data.projects)data.projects=[];if(!data.funds)data.funds=[];if(!data.papers)data.papers=[];if(!data.patents)data.patents=[];if(!data.rprojects)data.rprojects=[];if(!data.books)data.books=[];if(!data.travels)data.travels=[];if(!data.anniversaries)data.anniversaries=[];if(!data.weights)data.weights=[];if(!data.finances)data.finances=[];if(!data.habits)data.habits=[];if(!data.weekPlans)data.weekPlans={};if(!data.theme)data.theme='light';
  save();render();renderBak();
  alert('已恢复到 '+fmtBak(ts));
}
function delBak(ts){localStorage.setItem(BAK_KEY,JSON.stringify(loadBak().filter(x=>x.ts!==ts)));renderBak();}
function bakNow(){pushBackup(true);renderBak();}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function todayStr(){return new Date().toISOString().slice(0,10);}
function daysBetween(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
function fmtPct(x){return (x>=0?'+':'')+(x||0).toFixed(2)+'%';}
function chgColor(x){return x>0?'#ef4444':x<0?'#16a34a':'#64748b';}
/* ---------- 通用辅助：搜索 / 资产 / 连续打卡 ---------- */
function kwOf(s){return !searchKw||(s||'').toLowerCase().includes(searchKw);}
function fundValue(f){const sh=(+f.shares)||0;const lv=fundLatest(f);return (sh>0&&lv)?sh*lv:0;}
function fundCost(f){const sh=(+f.shares)||0;const c=(+f.costNav)||0;return (sh>0&&c)?sh*c:0;}
function totalAssets(){let v=0;const td=todayStr();(data.funds||[]).forEach(f=>v+=fundValue(f));(data.finances||[]).forEach(x=>{if(x.gen||x.planState==='skipped'||x.status==='planned'||x.date>td)return;v+=(x.type==='income'?1:-1)*(+x.amount||0);});return v;}
function streak(arr){ // arr:[{date}] 升序 → 截至今日连续天数
  if(!arr||!arr.length)return 0;const set=new Set(arr.map(a=>a.date));let s=0;let d=new Date();
  if(!set.has(d.toISOString().slice(0,10))){d.setDate(d.getDate()-1);}
  while(set.has(d.toISOString().slice(0,10))){s++;d.setDate(d.getDate()-1);}
  return s;
}
function holidayOf(y,m,d){ // 返回公休节假日名（仅固定公历节假日，保证正确）
  const k=m+'-'+d;
  const map={'1-1':'元旦','5-1':'劳动节','10-1':'国庆节','10-2':'国庆','10-3':'国庆','6-1':'儿童节'};
  return map[k]||null;
}

/* ---------- fund helpers ---------- */
function fundRecs(f){return (f.records||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));}
function fundLatest(f){const r=fundRecs(f);return r.length?r[r.length-1].nav:(f.costNav||0);}
function fundPrev(f){const r=fundRecs(f);return r.length>1?r[r.length-2].nav:(f.costNav||0);}
function dailyChg(f){const l=fundLatest(f),p=fundPrev(f);return p?((l-p)/p*100):0;}
function rangeChg(f){const l=fundLatest(f);const first=fundRecs(f);const f0=first.length?first[0].nav:f.costNav;return (f0&&l)?((l-f0)/f0*100):0;}
function holdProfit(f){if(f.shares&&f.costNav)return (fundLatest(f)-f.costNav)*f.shares;return null;}
function holdRet(f){if(f.shares&&f.costNav)return (fundLatest(f)-f.costNav)/f.costNav*100;return null;}
function sparkline(records){
  if(!records||records.length<2)return '';
  const rs=fundRecs(records);const vals=rs.map(r=>r.nav);const min=Math.min(...vals),max=Math.max(...vals);
  const w=140,h=30,span=(max-min)||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-(v-min)/span*h).toFixed(1)}`).join(' ');
  const col=vals[vals.length-1]>=vals[0]?'var(--up)':'var(--down)';
  return '<svg width="'+w+'" height="'+h+'" style="margin-top:6px"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="1.6"/></svg>';
}

function setView(c){
  currentCat=c;searchKw='';document.getElementById('search').value='';
  if(c==='calendar')calScope='all';
  document.querySelectorAll('#nav .tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===c));
  render();
  v5RefreshBadges();
  // scroll to top smoothly
  window.scrollTo({top:0,behavior:'smooth'});
}
function onSearch(v){searchKw=v.trim().toLowerCase();render();}
function setResearchTab(t){researchTab=t;render();}
function setPaperKind(k){paperKind=k;render();}
function setLifeTab(t){lifeTab=t;render();}
function setBookStatus(s){bookStatus=s;render();}

function filtered(){
  let items=data.items.slice();
  if(currentCat!=='overview'&&currentCat!=='calendar'&&currentCat!=='review'&&currentCat!=='habit')items=items.filter(i=>i.cat===currentCat);
  if(searchKw){
    const tags=[];let kw=searchKw.replace(/tag[:：]([^\s,，]+)/g,(m,t)=>{tags.push(t.toLowerCase());return '';});kw=kw.trim();
    items=items.filter(i=>{
      const hay=(i.title+' '+(i.note||'')+' '+(i.sportType||'')+' '+((data.projects.find(p=>p.id===i.projectId)||{}).name||'')+' '+((i.tags||[]).join(' '))).toLowerCase();
      if(kw&&!hay.includes(kw))return false;
      if(tags.length&&!tags.every(t=>(i.tags||[]).map(x=>x.toLowerCase()).includes(t)))return false;
      return true;
    });
  }
  return items.sort((a,b)=>{const o={todo:0,doing:1,done:2};if(o[a.status]!==o[b.status])return o[a.status]-o[b.status];const pa={high:0,mid:1,low:2};return pa[a.prio]-pa[b.prio];});
}

function render(){
  const app=document.getElementById('app');
  // 同步运行时状态到新架构 store（legacy 全局 → store），保证 selectors 取到最新 currentCat / searchKw
  try { if(global.WorkbenchStore && typeof global.WorkbenchStore.setState==='function') global.WorkbenchStore.setState({ currentCat: currentCat, searchKw: searchKw }); } catch(e){}
  // 新架构统一入口：已注册模块优先走 ModuleRegistry（含错误隔离），失败再回退下方 legacy 实现
  if(['work','research','life','sport','finance','overview','habit','review'].indexOf(currentCat)>=0){
    try {
      if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.render==='function'){
        var _html = global.WorkbenchModuleRegistry.render(currentCat);
        if(_html != null && _html !== ''){
          app.innerHTML = _html;
          v5RefreshBadges();
          return;
        }
      }
    } catch(e){ console.error('[Workbench] registry render failed, falling back to legacy', e); }
  }
  if(currentCat==='overview'){app.innerHTML=decorOverview(renderOverview());return;}
  if(currentCat==='review'){app.innerHTML=renderReview();return;}
  if(currentCat==='habit'){app.innerHTML=renderHabits();return;}
  if(currentCat==='news'){renderNews();return;}
  if(currentCat==='calendar'){
    const sc=calScope;
    let head='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    head+='<div class="chips"><span class="ctab '+(calView==='month'?'on':'')+'" onclick="setCalView(\'month\')">📅 月</span><span class="ctab '+(calView==='week'?'on':'')+'" onclick="setCalView(\'week\')">🗓️ 周</span><span class="ctab '+(calView==='agenda'?'on':'')+'" onclick="setCalView(\'agenda\')">📋 日程</span></div>';
    head+='<span class="spacer" style="flex:1"></span>';
    head+='<div class="chips"><span class="ctab '+(sc==='all'?'on':'')+'" onclick="setCalScope(\'all\')">全部</span>';
    for(const c in CATS)head+='<span class="ctab '+(sc===c?'on':'')+'" onclick="setCalScope(\''+c+'\')">'+CATS[c].name+'</span>';
    head+='</div></div>';
    let body;
    if(calView==='week')body=renderWeek(sc);
    else if(calView==='agenda')body=renderAgenda(sc);
    else body=renderCalendar(sc);
    app.innerHTML=head+body;
    return;
  }
  if(currentCat==='finance'){app.innerHTML=renderFunds();return;}
  if(['work','research','life','sport','habit'].indexOf(currentCat)>=0){
    app.innerHTML=renderModule(currentCat);
  } else app.innerHTML=renderModule(currentCat);
  v5RefreshBadges();
}

/* ---------- item row ---------- */
function itemHTML(i){
  const cls=i.status==='done'?'done':'';
  let dueTag='';
  if(i.due){const d=daysBetween(todayStr(),i.due);const lbl=d<0?`逾期${-d}天`:d===0?'今天':`${d}天后`;const dc=d<0?'due-over':(d<=3?'due-soon':'');dueTag=`<span class="tag ${dc}">${esc(i.due)} ${lbl}</span>`;}
  let extra='';
  if(i.cat==='sport')extra=`<span class="tag" style="background:#8b5cf622;color:var(--sport)">${esc(i.sportType||'运动')}·${i.minutes||0}分</span>`;
  let proj='';
  if(i.cat==='work'&&i.projectId){const p=data.projects.find(x=>x.id===i.projectId);if(p)proj=`<span class="tag" style="background:#10b98122;color:var(--work)">📁${esc(p.name)}</span>`;}
  const mile=i.cat==='work'&&i.isMilestone?'<span class="tag" style="background:#fde68a;color:#92400e">★里程碑</span>':'';
  let hw='';
  if(i.estH||i.actH)hw='<span class="tag" style="background:#6366f122;color:#6366f1">⏱ '+(i.estH?('估'+i.estH+'h'):'')+(i.actH?('·实'+i.actH+'h'):'')+'</span>';
  let rb='';
  if(i.recur&&i.recur!=='none')rb='<span class="tag" style="background:#8b5cf622;color:#8b5cf6">🔁 '+(i.recur==='daily'?'每日':i.recur==='weekly'?'每周':'每月')+'</span>';
  return `<div class="item ${cls}">
    <input type="checkbox" class="chk" ${i.status==='done'?'checked':''} onchange="toggle('${i.id}')">
    <div class="body">
      <div class="title">${i.cat==='work'&&i.isMilestone?'★ ':''}${esc(i.title)}</div>
      ${i.note?`<div class="meta">${esc(i.note)}</div>`:''}
      <div class="meta">
        <span class="tag prio-${i.prio}">${i.prio==='high'?'高':i.prio==='mid'?'中':'低'}优先级</span>
        <span class="tag" style="background:${CATS[i.cat].color}22;color:${CATS[i.cat].color}">${i.status==='todo'?'待办':i.status==='doing'?'进行中':'已完成'}</span>
        ${rb}${proj}${mile}${hw}${extra}${dueTag}${(i.tags&&i.tags.length)?i.tags.map(t=>`<span class="tag" style="background:#6366f122;color:var(--primary)">#${esc(t)}</span>`).join(''):''}
      </div>
    </div>
    <div class="acts"><button class="icon-btn" onclick="openForm('${i.cat}','${i.id}')">✏️</button><button class="icon-btn" onclick="del('${i.id}')">🗑️</button></div>
  </div>`;
}

/* ---------- overview ---------- */
function renderOverview(){
  let html='<div class="grid cards">';
  for(const c in CATS){
    if(c==='finance'){
      const ta=totalAssets();const fv=(data.funds||[]).reduce((s,f)=>s+fundValue(f),0);const cash=ta-fv;
      html+=`<div class="card finance"><div class="t">💰 总资产</div><div class="n">${ta.toFixed(0)}</div><div class="d">${ta?('基金 '+(fv/ta*100).toFixed(0)+'% · 现金 '+(cash/ta*100).toFixed(0)+'%'):'基金市值 + 现金结余(元)'}</div></div>`;
      continue;
    }
    const its=data.items.filter(i=>i.cat===c);
    const done=its.filter(i=>i.status==='done').length;
    const total=its.length||1;const pct=Math.round(done/total*100);
    html+=`<div class="card ${c}"><div class="t">${CATS[c].icon} ${CATS[c].name}</div>
      <div class="n">${its.length}</div>
      <div class="bar"><i style="width:${pct}%;background:${CATS[c].color}"></i></div></div>`;
  }
  html+='</div>';

  // 今日聚焦
  const today=todayStr();
  const focus=(data.items||[]).filter(i=>i.status!=='done'&&i.due&&(i.due===today||daysBetween(today,i.due)<0)).sort((a,b)=>a.due.localeCompare(b.due));
  const lateN=focus.filter(i=>i.due<today).length;
  html+='<div class="panel" style="margin-top:14px"><h2>📌 今日聚焦（'+today+'）</h2>';
  if(!focus.length)html+='<div class="empty">今天没有待办 / 逾期，状态很好 ✨</div>';
  else{
    html+='<div class="list">'+focus.slice(0,8).map(itemHTML).join('')+'</div>';
    if(lateN)html+='<div class="d" style="color:#ef4444;margin-top:6px">⚠️ 其中有 '+lateN+' 项已逾期</div>';
  }
  html+='</div>';

  // 进行中项目
  const projs=data.projects.filter(p=>p.status!=='done');
  if(projs.length){
    html+='<div class="panel" style="margin-top:14px"><h2>📁 进行中项目</h2><div class="list">';
    projs.forEach(p=>{
      const items=data.items.filter(i=>i.cat==='work'&&i.projectId===p.id);
      const ms=items.filter(i=>i.isMilestone);
      const msDone=ms.filter(i=>i.status==='done').length;
      const done=items.filter(i=>i.status==='done').length;const tot=items.length||1;const pct=Math.round(done/tot*100);
      const tasks=items.filter(i=>!i.isMilestone).length;
      const od=items.filter(i=>i.status!=='done'&&i.due&&i.due<todayStr()).length;
      html+=`<div class="item"><div class="body"><div class="title">${esc(p.name)}</div>
        <div class="meta"><span class="tag" style="background:#10b98122;color:var(--work)">里程碑 ${msDone}/${ms.length}</span><span class="tag" style="background:#10b98122;color:var(--work)">任务 ${tasks}</span>${od?'<span class="tag" style="background:#ef444422;color:#ef4444">逾期 '+od+'</span>':''}</div>
        <div class="bar"><i style="width:${pct}%;background:var(--work)"></i></div></div>
        <div class="acts"><button class="icon-btn" onclick="setView('work')">↗</button></div></div>`;
    });
    html+='</div></div>';
  }

  // 近期截止
  const soon=data.items.filter(i=>i.status!=='done'&&i.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);
  html+='<div class="panel" style="margin-top:14px"><h2>⏰ 近期待办 / 截止</h2>';
  if(!soon.length)html+='<div class="empty">暂无带日期的待办，轻松～</div>';
  else html+='<div class="list">'+soon.map(itemHTML).join('')+'</div>';
  html+='</div>';

  // 运动周报
  const wk=data.items.filter(i=>i.cat==='sport'&&i.due&&daysBetween(i.due,todayStr())>=-6&&daysBetween(i.due,todayStr())<=0);
  const mins=wk.reduce((s,i)=>s+(+i.minutes||0),0);
  html+=`<div class="panel" style="margin-top:14px"><h2>🏃 近 7 天运动</h2>
    <div class="card sport"><div class="t">累计时长</div><div class="n">${mins} 分钟</div>
    <div class="d">${wk.length} 次训练 · 目标建议 ≥150 分钟/周</div></div></div>`;

  // 今日运动计划
  const tkey=mondayOf(todayStr()); const tdi=(new Date(todayStr()+'T00:00:00').getDay()+6)%7; const ts=weekPlanSlots(tkey)[tdi];
  if(ts){
    const td=planDone(tkey,tdi);
    html+='<div class="panel" style="margin-top:14px"><h2>🏃 今日运动计划</h2><div class="card sport"><div class="t">'+esc(ts.type)+'</div><div class="n">'+ts.minutes+' 分</div><div class="d">'+(td?'<span style="color:#10b981">✅ 已完成</span>':esc(ts.note||'加油，今天也要动起来～'))+'</div></div>'+(td?'':'<div style="margin-top:8px"><button class="btn primary" onclick="completePlan(\''+tkey+'\','+tdi+'\')">✅ 标记完成</button></div>')+'</div>';
  }

  // 连续记录
  const sportStreak=streak((data.items||[]).filter(i=>i.cat==='sport'&&i.due).map(i=>({date:i.due})));
  const wStreak=streak((data.weights||[]).map(w=>({date:w.date})));
  html+='<div class="panel" style="margin-top:14px"><h2>🔥 连续记录</h2><div class="grid cards" style="grid-template-columns:repeat(2,1fr)">';
  html+=`<div class="card sport"><div class="t">运动连续打卡</div><div class="n">${sportStreak}</div><div class="d">天（坚持就是胜利）</div></div>`;
  html+=`<div class="card sport"><div class="t">体重连续记录</div><div class="n">${wStreak}</div><div class="d">天</div></div></div></div>`;

  html+=`<div class="panel" style="margin-top:14px"><h2>🗓️ 近半年活动热力图</h2>${heatmap()}</div>`;

  // 本月收支
  const mNow=new Date().toISOString().slice(0,7);
  let mInc=0,mExp=0;(data.finances||[]).forEach(f=>{if(!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date&&f.date<=todayStr()&&f.date.slice(0,7)===mNow){if(f.type==='income')mInc+=+f.amount||0;else mExp+=+f.amount||0;}});
  html+=`<div class="panel" style="margin-top:14px"><h2>💰 本月收支（${mNow}）</h2>
    <div class="grid cards" style="grid-template-columns:repeat(3,1fr)">
      <div class="card finance"><div class="t">本月收入</div><div class="n" style="color:#10b981">${mInc.toFixed(2)}</div><div class="d">元</div></div>
      <div class="card finance"><div class="t">本月支出</div><div class="n" style="color:#ef4444">${mExp.toFixed(2)}</div><div class="d">元</div></div>
      <div class="card finance"><div class="t">本月结余</div><div class="n" style="color:${mInc-mExp>=0?'#10b981':'#ef4444'}">${(mInc-mExp>=0?'+':'-')+Math.abs(mInc-mExp).toFixed(2)}</div><div class="d">元</div></div>
    </div></div>`;

  // 近期待缴费专利
  const fees=(data.patents||[]).filter(p=>p.feeDue&&daysBetween(today,p.feeDue)<=90).sort((a,b)=>a.feeDue.localeCompare(b.feeDue));
  if(fees.length){
    html+='<div class="panel" style="margin-top:14px"><h2>⏰ 近期待缴费专利</h2><div class="list">';
    fees.forEach(p=>{html+='<div class="item"><div class="body"><div class="title">'+esc(p.title)+' '+patentFeeBadge(p)+'</div></div></div>';});
    html+='</div></div>';
  }
  // 即将到来：纪念日 + 出行
  const upAn=(data.anniversaries||[]).map(a=>({a,na:nextAnniv(a.date)})).filter(x=>x.na&&x.na.days<=30).sort((x,y)=>x.na.days-y.na.days).slice(0,3);
  const upTv=(data.travels||[]).filter(t=>t.start&&t.start>=today).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,3);
  if(upAn.length||upTv.length){
    html+='<div class="panel" style="margin-top:14px"><h2>🎉 即将到来</h2><div class="list">';
    upAn.forEach(x=>{const t=ANNIV_TYPE[x.a.type]||ANNIV_TYPE.birthday;html+='<div class="item"><div class="body"><div class="title">'+t.emoji+' '+esc(x.a.name)+' <span class="tag" style="background:'+t.color+'22;color:'+t.color+'">还有 '+x.na.days+' 天</span></div></div></div>';});
    upTv.forEach(t=>{html+='<div class="item"><div class="body"><div class="title">🧳 '+esc(t.title)+' <span class="tag" style="background:#f59e0b22;color:#f59e0b">'+esc(t.start)+' 出发</span></div></div></div>';});
    html+='</div></div>';
  }

  html+=`<div class="hint"><b>使用说明：</b><br>
    • <b>工作</b>模块支持<b>项目管理</b>：建项目→加任务/里程碑，进度条按该项目全部工作任务的<b>整体完成率</b>自动算（里程碑单独标注为关键节点）；不便归入项目的零散工作，用「📝 临时任务」记录。<br>
    • <b>科研</b>模块是一个统一的<b>学术管理中枢</b>，顶部可在「📄 论文 / 📜 专利 / 🏛️ 科研项目」三个子模块间切换：<br>
      &nbsp;&nbsp;– <b>论文</b>：再细分为 <b>📝 拟投 / 📨 在投 / 🤝 合作</b> 三个板块（每篇论文选一个分类），每篇记录标题、期刊/会议、中科院分区、CCF 等级、投稿状态与投稿时间线（含拒稿转投）；<br>
      &nbsp;&nbsp;– <b>专利</b>：记录名称、类型（发明/实用新型/外观/软著）、申请号与生命周期（递交→受理→实审→授权/驳回/转让）；<br>
      &nbsp;&nbsp;– <b>科研项目</b>：记录名称、来源（国家自然科学基金/国家重点研发/省部级/横向/企业）、角色、状态、经费与起止时间。<br>
    • <b>金融</b>模块是<b>基金涨幅看板 + 收支账本</b>：① 添加基金（可填持仓份额+成本净值），定期「记录净值」，自动算<b>当日涨幅 / 区间涨幅 / 持仓收益</b>，配净值走势迷你图（红涨绿跌）；② <b>💵 收支记录</b>：点「＋ 记一笔」记录收入 / 支出（工资、理财收益、开销等），自动汇总<b>总收入 / 总支出 / 结余</b>并画<b>近 6 个月收支柱状图</b>（绿=收入、红=支出）。<br>
    • <b>运动</b>模块顶部是<b>⚖️ 体重记录</b>：点「＋ 记录体重」按日期记录体重，自动画<b>体重变化曲线</b>（含最新体重、较首次变化、记录天数）；下方仍是日历 + 按日期的日程（记录跑步、健身等训练）。<br>
    • <b>生活</b>模块顶部在「📋 任务 / 📚 读书 / 🧳 旅行 / 🎉 纪念日」四个子板块间切换：<br>
      &nbsp;&nbsp;– <b>任务</b>：通用生活待办（含日历+日程，同其他模块）；<br>
      &nbsp;&nbsp;– <b>读书</b>：书单按 <b>想读 / 在读 / 已读</b> 分类，可标星级评分与笔记；<br>
      &nbsp;&nbsp;– <b>旅行 & 出行</b>：记目的地、起止日期、预算、签证与行李清单，<b>出行区间自动标到日历</b>（生活/总览日历显示 🧳）；<br>
      &nbsp;&nbsp;– <b>纪念日 & 生日</b>：记录名称、类型（生日 🎂 / 纪念日 💝）与日期（MM-DD），按<b>距下次天数</b>自动排序与倒计时，当天在日历与日详情自动标注提醒。<br>
    • 每个模块都有<b>日历 + 按日期的日程</b>；顶部「📅 日历」是跨模块总览。<br>
    • 点日历某天可看/加当天安排；勾选方框标记完成；✏️编辑 🗑️删除。<br>
    • <b>导出</b>备份 JSON，<b>导入</b>恢复；数据仅存本机浏览器，不上传。</div>`;
  return html;
}

/* ---------- v3: 周复盘 ---------- */
function renderReview(){
  const today=todayStr();
  const mon=mondayOf(today);
  const monD=new Date(mon+'T00:00:00');
  const sunD=new Date(monD);sunD.setDate(sunD.getDate()+6);const sun=ymdL(sunD);
  const lastMonD=new Date(monD);lastMonD.setDate(lastMonD.getDate()-7);const lastMon=ymdL(lastMonD);
  const lastSunD=new Date(lastMonD);lastSunD.setDate(lastSunD.getDate()+6);const lastSun=ymdL(lastSunD);
  const nextMonD=new Date(monD);nextMonD.setDate(nextMonD.getDate()+7);const nextMon=ymdL(nextMonD);
  const nextSunD=new Date(nextMonD);nextSunD.setDate(nextSunD.getDate()+6);const nextSun=ymdL(nextSunD);
  const inR=(d,a,b)=>d&&d>=a&&d<=b;
  const its=data.items||[];
  const doneThis=its.filter(i=>i.status==='done'&&inR(i.completedAt||i.due,mon,sun));
  const doneLast=its.filter(i=>i.status==='done'&&inR(i.completedAt||i.due,lastMon,lastSun));
  const overdue=its.filter(i=>i.status!=='done'&&i.due&&i.due<today);
  const stalled=its.filter(i=>i.status!=='done'&&i.cat!=='sport'&&((i.due&&daysBetween(today,i.due)<-3)||((!i.due)&&i.created&&daysBetween(i.created,today)>14)));
  const nextWeek=its.filter(i=>i.status!=='done'&&i.due&&i.due>=nextMon&&i.due<=nextSun);
  const sportW=its.filter(i=>i.cat==='sport'&&i.status==='done'&&i.due&&inR(i.due,mon,sun));
  const sportMin=sportW.reduce((s,i)=>s+(+i.minutes||0),0);
  const sportGoals=(global.WorkbenchHealthMetrics&&global.WorkbenchHealthMetrics.healthGoals)?global.WorkbenchHealthMetrics.healthGoals():{weeklyMinutes:150,weeklySessions:3};
  const fin=(data.finances||[]).filter(f=>!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date<=todayStr()&&inR(f.date,mon,sun));
  let wInc=0,wExp=0;fin.forEach(f=>{if(f.type==='income')wInc+=+f.amount||0;else wExp+=+f.amount||0;});
  const wSave=wInc-wExp;
  let habitChecks=0;(data.habits||[]).forEach(h=>{const logs=h.logs||{};let d=new Date(mon+'T00:00:00');for(let k=0;k<7;k++){if(logs[ymdL(d)])habitChecks++;d.setDate(d.getDate()+1);}});
  const delta=doneThis.length-doneLast.length;
  let html=`<div class="panel"><div class="sec-head"><h2>📈 周复盘 · ${mon} ~ ${sun}</h2><span class="tag" style="background:#6366f122;color:var(--primary)">本周完成 ${doneThis.length} · 上周 ${doneLast.length} ${delta>=0?'↑':'↓'}${Math.abs(delta)}</span></div></div>`;
  html+='<div class="grid cards" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">';
  html+=`<div class="card work"><div class="t">✅ 本周完成</div><div class="n">${doneThis.length}</div><div class="d">较上周 ${delta>=0?'+':''}${delta}</div></div>`;
  html+=`<div class="card"><div class="t">⚠️ 逾期未完成</div><div class="n" style="color:#ef4444">${overdue.length}</div><div class="d">需尽快处理或改期</div></div>`;
  html+=`<div class="card"><div class="t">😴 停滞风险</div><div class="n" style="color:#f59e0b">${stalled.length}</div><div class="d">长期未推进</div></div>`;
  html+=`<div class="card"><div class="t">📅 下周待办</div><div class="n" style="color:#6366f1">${nextWeek.length}</div><div class="d">${nextMon} 起</div></div>`;
  html+='</div>';
  html+='<div class="grid cards" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:14px">';
  html+=`<div class="card sport"><div class="t">🏃 本周运动</div><div class="n">${sportMin} 分钟</div><div class="d">${sportW.length} 次 / ${sportGoals.weeklySessions} 次 · 时长目标 ${sportGoals.weeklyMinutes} 分钟</div></div>`;
  html+=`<div class="card finance"><div class="t">💰 本周结余</div><div class="n" style="color:${wSave>=0?'#10b981':'#ef4444'}">${wSave>=0?'+':''}${wSave.toFixed(0)}</div><div class="d">收 ${wInc.toFixed(0)} · 支 ${wExp.toFixed(0)}</div></div>`;
  html+=`<div class="card"><div class="t">🔥 习惯打卡</div><div class="n" style="color:#8b5cf6">${habitChecks}</div><div class="d">本周次数</div></div>`;
  html+='</div>';
  const sec=(title,arr,empty)=>{let h=`<div class="panel" style="margin-top:14px"><h2>${title} <span style="font-weight:400;color:var(--muted);font-size:13px">${arr.length?'('+arr.length+')':''}</span></h2>`;if(!arr.length)h+=`<div class="empty">${empty}</div>`;else h+='<div class="list">'+arr.slice(0,12).map(itemHTML).join('')+'</div>';h+='</div>';return h;};
  html+=sec('✅ 本周完成',doneThis,'本周还没有完成的事项，加油～');
  html+=sec('⚠️ 逾期未完成',overdue,'没有逾期，状态很好 ✨');
  html+=sec('😴 停滞风险（建议清理或推进）',stalled,'没有停滞事项');
  html+=sec('📅 下周待办',nextWeek,'下周暂无计划，可以提前安排');
  html+=`<div class="hint"><b>复盘小贴士：</b>每周日花 10 分钟过一遍这页——处理逾期、清理停滞、确认下周计划。坚持复盘比记更多事更重要。</div>`;
  return html;
}

/* ---------- v3: 习惯打卡 ---------- */
function renderHabits(){
  let html='<div class="panel"><div class="sec-head"><h2>🔥 习惯打卡</h2><button class="btn primary" onclick="openHabitForm()">＋ 新建习惯</button></div>';
  const hs=data.habits||[];
  if(!hs.length)html+='<div class="empty">还没有习惯。添加一个想坚持的习惯，每天来打个卡吧～</div>';
  else{
    html+='<div class="grid cards" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))">';
    const today=todayStr();
    hs.forEach(h=>{
      const logs=h.logs||{};
      let days='';
      for(let i=6;i>=0;i--){const dd=new Date();dd.setDate(dd.getDate()-i);const ds=ymdL(dd);const on=logs[ds];days+=`<span class="hday ${on?'on':''} ${ds===today?'today':''}" onclick="toggleHabit('${h.id}','${ds}')" title="${ds}">${ds.slice(8)}</span>`;}
      let s=0;let d=new Date();while(logs[ymdL(d)]){s++;d.setDate(d.getDate()-1);}
      const mon=mondayOf(today);let wk=0;for(let k in logs){if(k>=mon&&k<=today)wk++;}
      const freqLbl=h.freq==='weekly'?(h.target?'每周 '+h.target+' 次':'每周'):'每日';
      const rate=h.freq==='weekly'&&h.target?(wk>=h.target?100:Math.round(wk/h.target*100)):(logs[today]?100:0);
      html+=`<div class="card habit-card">
        <div class="t">${esc(h.name)} <span class="tag" style="background:#8b5cf622;color:#8b5cf6">${freqLbl}</span></div>
        <div class="n">${s}</div><div class="d">连续打卡天数</div>
        <div class="hdays">${days}</div>
        <div class="d" style="margin-top:6px">本周 ${wk} 次${h.freq==='weekly'&&h.target?(' · '+rate+'%'):''}</div>
        <div class="acts" style="margin-top:8px"><button class="btn ${logs[today]?'':'primary'}" onclick="toggleHabit('${h.id}','${today}')">${logs[today]?'✅ 今日已打卡':'打卡今日'}</button><button class="icon-btn" onclick="openHabitForm('${h.id}')">✏️</button><button class="icon-btn" onclick="delHabit('${h.id}')">🗑️</button></div>
      </div>`;
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function toggleHabit(id,ds){const h=(data.habits||[]).find(x=>x.id===id);if(!h)return;if(!h.logs)h.logs={};if(!h.skips)h.skips={};delete h.skips[ds];if(h.logs[ds])delete h.logs[ds];else h.logs[ds]=true;save();render();}
function habitFreqChanged(){const weekly=document.getElementById('h_freq').value==='weekly';document.getElementById('h_target_box').style.display=weekly?'block':'none';document.getElementById('h_days_box').style.display=weekly?'none':'block';}
function openHabitForm(id){
  editingHabit=id||null;const h=id?(data.habits||[]).find(x=>x.id===id):null,days=h&&Array.isArray(h.days)&&h.days.length?h.days:[0,1,2,3,4,5,6];
  document.getElementById('habitTitle').textContent=id?'编辑习惯':'新建一个小习惯';document.getElementById('h_name').value=h?h.name:'';document.getElementById('h_freq').value=h?h.freq:'daily';document.getElementById('h_target').value=h?(h.target||''):3;document.getElementById('h_status').value=h?(h.status||'active'):'active';
  document.getElementById('h_minimum').value=h?(h.minimum||''):'';document.getElementById('h_cue').value=h?(h.cue||''):'';document.getElementById('h_why').value=h?(h.why||''):'';
  for(let i=0;i<7;i++)document.getElementById('h_day_'+i).checked=days.includes(i);habitFreqChanged();document.getElementById('habitMask').classList.add('show');document.getElementById('h_name').focus();
}
function closeHabit(){document.getElementById('habitMask').classList.remove('show');editingHabit=null;}
function submitHabit(){
  const name=document.getElementById('h_name').value.trim();if(!name){alert('请填写习惯名称');return;}const freq=document.getElementById('h_freq').value,days=[];for(let i=0;i<7;i++)if(document.getElementById('h_day_'+i).checked)days.push(i);if(freq==='daily'&&!days.length){alert('请至少选择一天');return;}
  const target=freq==='weekly'?Math.max(1,Math.min(7,+document.getElementById('h_target').value||3)):undefined;
  const obj={name,freq,target,days:freq==='daily'?days:undefined,status:document.getElementById('h_status').value,minimum:document.getElementById('h_minimum').value.trim(),cue:document.getElementById('h_cue').value.trim(),why:document.getElementById('h_why').value.trim()};
  if(editingHabit){const h=data.habits.find(x=>x.id===editingHabit);Object.assign(h,obj);}else data.habits.push(Object.assign({id:uid(),created:todayStr(),logs:{},skips:{}},obj));save();closeHabit();render();
}
function delHabit(id){if(confirm('删除该习惯及其打卡记录？')){data.habits=data.habits.filter(x=>x.id!==id);save();render();}}

/* ---------- v3: 年度活动热力图 ---------- */
function heatmap(){
  const map={};
  const add=d=>{if(!d)return;map[d]=(map[d]||0)+1;};
  (data.items||[]).forEach(i=>{if(i.status==='done')add(i.completedAt||i.due);if(i.cat==='sport'&&i.due)add(i.due);});
  (data.weights||[]).forEach(w=>add(w.date));
  (data.finances||[]).forEach(f=>{if(!f.gen)add(f.date);});
  (data.habits||[]).forEach(h=>{Object.keys(h.logs||{}).forEach(add);});
  const weeks=26;
  const today=new Date();today.setHours(0,0,0,0);
  const dow=(today.getDay()+6)%7;
  const end=new Date(today);end.setDate(end.getDate()+(6-dow));
  const cols=[];let activeDays=0;
  for(let w=weeks-1;w>=0;w--){
    const col=[];
    for(let d=0;d<7;d++){
      const dd=new Date(end);dd.setDate(dd.getDate()-w*7-d);
      const ds=ymdL(dd);const v=map[ds]||0;if(v>0)activeDays++;
      let cls='';if(v>=4)cls='l4';else if(v===3)cls='l3';else if(v===2)cls='l2';else if(v>=1)cls='l1';
      col.push(`<div class="heat-cell ${cls}" title="${ds} · ${v} 项"></div>`);
    }
    cols.push('<div class="heat-col">'+col.join('')+'</div>');
  }
  return '<div class="heat">'+cols.join('')+'</div><div class="legend"><span>少</span><i class="heat-cell"></i><i class="heat-cell l1"></i><i class="heat-cell l2"></i><i class="heat-cell l3"></i><i class="heat-cell l4"></i><span>多</span><span style="margin-left:8px">· 近半年活跃 '+activeDays+' 天</span></div>';
}

/* ---------- module (work/research/life/sport) ---------- */
var collapseState={};
try{collapseState=JSON.parse(localStorage.getItem('workbench_collapse')||'{}');}catch(e){collapseState={};}
function toggleCollapse(key){
  collapseState[key]=!collapseState[key];
  try{localStorage.setItem('workbench_collapse',JSON.stringify(collapseState));}catch(e){}
  const el=document.querySelector('[data-collapse="'+key+'"]');
  if(el)el.classList.toggle('collapsed',!!collapseState[key]);
}
function renderModule(cat){
  let html='';
  if(cat==='work'){
    html+=renderWorkProjects();
    const tmp=data.items.filter(i=>i.cat==='work'&&!i.projectId);
    html+=`<div class="panel collapsible ${collapseState['tmp_work']?'collapsed':''}" style="margin-top:14px" data-collapse="tmp_work">
      <div class="panel-h" onclick="toggleCollapse('tmp_work')"><h2>📝 临时任务（${tmp.length}）</h2>
        <span style="display:flex;align-items:center;gap:8px"><button class="btn primary" onclick="event.stopPropagation();openForm('work')">＋ 新建</button><span class="caret">▾</span></span></div>
      <div class="panel-b">${tmp.length?'<div class="list">'+tmp.map(itemHTML).join('')+'</div>':'<div class="empty">暂无临时任务，点「＋ 新建」记录零散工作。</div>'}</div></div>`;
    html+=`<div class="chips" style="margin-top:14px"><span class="ctab ${workView==='list'?'on':''}" onclick="setWorkView('list')">☰ 列表</span><span class="ctab ${workView==='board'?'on':''}" onclick="setWorkView('board')">🗂️ 看板</span></div>`;
  }
  if(cat==='research'){
    html+=researchReminder();
    html+=`<div class="chips" style="margin-bottom:16px">
      <span class="ctab ${researchTab==='paper'?'on':''}" onclick="setResearchTab('paper')">📄 论文</span>
      <span class="ctab ${researchTab==='patent'?'on':''}" onclick="setResearchTab('patent')">📜 专利</span>
      <span class="ctab ${researchTab==='project'?'on':''}" onclick="setResearchTab('project')">🏛️ 科研项目</span>
    </div>`;
    if(researchTab==='paper'){
      const pc={plan:0,sub:0,collab:0};(data.papers||[]).forEach(p=>{const k=(p.kind&&PAPER_KIND[p.kind])?p.kind:'sub';pc[k]++;});
      html+=`<div class="chips" style="margin-bottom:16px">
        <span class="ctab ${paperKind==='plan'?'on':''}" onclick="setPaperKind('plan')">📝 拟投论文（${pc.plan}）</span>
        <span class="ctab ${paperKind==='sub'?'on':''}" onclick="setPaperKind('sub')">📨 在投论文（${pc.sub}）</span>
        <span class="ctab ${paperKind==='collab'?'on':''}" onclick="setPaperKind('collab')">🤝 合作论文（${pc.collab}）</span>
      </div>`;
      html+=renderPapers(paperKind);
    }
    else if(researchTab==='patent')html+=renderPatents();
    else html+=renderRProjects();
  }
  if(cat==='life'){
    const bc=(data.books||[]).length, tc=(data.travels||[]).length, ac=(data.anniversaries||[]).length;
    html+=`<div class="chips" style="margin-bottom:16px">
      <span class="ctab ${lifeTab==='tasks'?'on':''}" onclick="setLifeTab('tasks')">📋 任务</span>
      <span class="ctab ${lifeTab==='books'?'on':''}" onclick="setLifeTab('books')">📚 读书（${bc}）</span>
      <span class="ctab ${lifeTab==='travel'?'on':''}" onclick="setLifeTab('travel')">🧳 旅行（${tc}）</span>
      <span class="ctab ${lifeTab==='anniversary'?'on':''}" onclick="setLifeTab('anniversary')">🎉 纪念日（${ac}）</span>
    </div>`;
    if(lifeTab==='books'){html+=renderBooks();return html;}
    if(lifeTab==='travel'){html+=renderTravels();return html;}
    if(lifeTab==='anniversary'){html+=renderAnniversaries();return html;}
  }
  if(cat==='sport'){
    html+='<div class="chips" style="margin-bottom:16px">'
      +'<span class="ctab '+(sportTab==='plan'?'on':'')+'" onclick="setSportTab(\'plan\')">📅 周计划</span>'
      +'<span class="ctab '+(sportTab==='log'?'on':'')+'" onclick="setSportTab(\'log\')">🏃 完成记录（'+(data.items.filter(i=>i.cat==='sport').length)+'）</span>'
      +'<span class="ctab '+(sportTab==='weight'?'on':'')+'" onclick="setSportTab(\'weight\')">⚖️ 体重</span>'
      +'</div>';
    if(sportTab==='plan')html+=renderSportPlan();
    else if(sportTab==='log')html+=renderSportLog();
    else html+=renderWeights();
  }
  const k={cal:'cal_'+cat,ag:'ag_'+cat,all:'all_'+cat};
  html+=`<div class="panel collapsible ${collapseState[k.cal]?'collapsed':''}" data-collapse="${k.cal}">
    <div class="panel-h" onclick="toggleCollapse('${k.cal}')"><h2>📅 ${CATS[cat].name}日历</h2><span class="caret">▾</span></div>
    <div class="panel-b">${renderCalendar(cat)}</div></div>`;
  const ag=data.items.filter(i=>i.cat===cat&&i.due).sort((a,b)=>a.due.localeCompare(b.due));
  if(cat!=='sport'){
  html+=`<div class="panel collapsible ${collapseState[k.ag]?'collapsed':''}" style="margin-top:14px" data-collapse="${k.ag}">
    <div class="panel-h" onclick="toggleCollapse('${k.ag}')"><h2>🗓️ 日程（按日期）</h2><span class="caret">▾</span></div>
    <div class="panel-b">${ag.length?'<div class="list">'+ag.map(itemHTML).join('')+'</div>':'<div class="empty">暂无带日期的日程</div>'}</div></div>`;
  }
  const items=filtered();
  let allInner;
  if(cat==='work'&&workView==='board')allInner=renderKanban('work');
  else allInner=items.length?'<div class="list">'+items.map(itemHTML).join('')+'</div>':'<div class="empty">还没有内容，点右上角「＋新建」开始记录吧。</div>';
  if(cat!=='sport'){
  html+=`<div class="panel collapsible ${collapseState[k.all]?'collapsed':''}" style="margin-top:14px" data-collapse="${k.all}">
    <div class="panel-h" onclick="toggleCollapse('${k.all}')"><h2>${CATS[cat].icon} ${CATS[cat].name}全部（${items.length}）</h2><span class="caret">▾</span></div>
    <div class="panel-b">${allInner}</div></div>`;
  }
  return html;
}
function setWorkView(v){workView=v;render();}
function renderKanban(cat){
  const items=(cat==='work')?data.items.filter(i=>i.cat==='work'):filtered();
  const cols=[{s:'todo',n:'待办',c:'#94a3b8'},{s:'doing',n:'进行中',c:'#f59e0b'},{s:'done',n:'已完成',c:'#10b981'}];
  let h='<div class="kanban">';
  cols.forEach(col=>{
    const list=items.filter(i=>i.status===col.s);
    h+=`<div class="kcol"><div class="khead" style="color:${col.c}">${col.n}（${list.length}）</div><div class="kbody" ondrop="dropStatus(event,'${col.s}')" ondragover="event.preventDefault()">`;
    list.forEach(i=>{const p=(data.projects||[]).find(x=>x.id===i.projectId);h+=`<div class="kcard" draggable="true" ondragstart="event.dataTransfer.setData('id','${i.id}')"><div class="kt">${esc(i.title)}</div>${p?`<div class="kd">📁 ${esc(p.name)}</div>`:''}<div class="acts"><button class="icon-btn" onclick="openForm('${cat}','${i.id}')">✏️</button><button class="icon-btn" onclick="del('${i.id}')">🗑️</button></div></div>`;});
    h+='</div></div>';
  });
  h+='</div><div class="d" style="margin-top:8px;color:var(--muted);font-size:12px">拖动卡片到另一列即可变更状态</div>';
  return h;
}
function dropStatus(e,status){const id=e.dataTransfer.getData('id');const i=data.items.find(x=>x.id===id);if(i){i.status=status;save();render();}}

/* ---------- work projects ---------- */
function renderWorkProjects(){
  let html='<div class="panel"><div class="sec-head"><h2>📁 项目管理</h2><button class="btn primary" onclick="openProjectForm()">＋ 新项目</button></div>';
  if(!data.projects.length){html+='<div class="empty">还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。</div>';}
  else{
    html+='<div class="grid cards">';
    data.projects.forEach(p=>{
      const items=data.items.filter(i=>i.cat==='work'&&i.projectId===p.id);
      const ms=items.filter(i=>i.isMilestone);
      const msDone=ms.filter(i=>i.status==='done').length;
      const done=items.filter(i=>i.status==='done').length;const tot=items.length||1;const pct=Math.round(done/tot*100);
      const tasks=items.filter(i=>!i.isMilestone).length;
      const hrs=items.reduce((s,i)=>s+(+i.actH||0),0);
      const today=todayStr();
      const overdue=items.filter(i=>i.status!=='done'&&i.due&&i.due<today).length;
      const riskMs=items.filter(i=>i.isMilestone&&i.status!=='done'&&i.due&&daysBetween(today,i.due)<=7&&daysBetween(today,i.due)>=0).length;
      const estSum=items.reduce((s,i)=>s+(+i.estH||0),0),actSum=items.reduce((s,i)=>s+(+i.actH||0),0);
      const acc=(estSum&&actSum)?(actSum/estSum*100):null;
      const hlth=(p.status==='done')?'green':(overdue>=3||riskMs>0?'red':overdue>0?'amber':'green');
      const hlthMap={green:['#10b981','健康'],amber:['#f59e0b','注意'],red:['#ef4444','风险']};
      const sorted=[...items].sort((a,b)=>(a.status==='done')-(b.status==='done'));
      const taskList=items.length?sorted.map(i=>`<div class="ptask"><input type="checkbox" class="chk" ${i.status==='done'?'checked':''} onchange="toggle('${i.id}')"><span class="ptitle ${i.status==='done'?'done':''}" onclick="openForm('work','${i.id}')">${esc(i.title)}</span>${i.isMilestone?'<span class="star" title="里程碑">★</span>':''}</div>`).join(''):'<div class="empty">暂无任务，点「＋任务」添加</div>';
      html+=`<div class="card work">
        <div class="t">${esc(p.name)} ${p.status==='done'?'✅':'<span class="tag" style="background:'+hlthMap[hlth][0]+'22;color:'+hlthMap[hlth][0]+';margin-left:4px;font-size:11px">'+hlthMap[hlth][1]+'</span>'}</div>
        <div class="n">${pct}%</div>
        <div class="d">里程碑 ${msDone}/${ms.length} · 任务 ${tasks}${overdue?' · 逾期 '+overdue:''}${riskMs?' · ⚠风险里程碑 '+riskMs:''}${acc!==null?(' · 估算准确率 '+acc.toFixed(0)+'%'):''}</div>
        <div class="bar"><i style="width:${pct}%;background:var(--work)"></i></div>
        <div class="ptasks">
          <div class="ph"><span>任务清单</span><span>${done}/${items.length}</span></div>
          ${taskList}
        </div>
        <div class="acts" style="margin-top:10px">
          <button class="btn" onclick="openForm('work',null,null,'${p.id}')">＋任务</button>
          <button class="icon-btn" onclick="openProjectForm('${p.id}')">✏️</button>
          <button class="icon-btn" onclick="delProject('${p.id}')">🗑️</button>
        </div></div>`;
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}

/* ---------- papers (在投论文) ---------- */
const PAPER_STATUS={
  idea:{name:'想法',color:'#94a3b8'},
  draft:{name:'拟投稿',color:'#94a3b8'},
  writing:{name:'撰写中',color:'#8b5cf6'},
  internal:{name:'内部审阅',color:'#0ea5e9'},
  preparing:{name:'准备投稿',color:'#6366f1'},
  submitted:{name:'已投稿',color:'#6366f1'},
  review:{name:'审稿中',color:'#3b82f6'},
  major:{name:'大修',color:'#f59e0b'},
  minor:{name:'小修',color:'#f59e0b'},
  revision:{name:'修改中',color:'#f59e0b'},
  rereview:{name:'再审',color:'#8b5cf6'},
  accepted:{name:'录用',color:'#10b981'},
  published:{name:'已发表',color:'#059669'},
  rejected:{name:'拒稿',color:'#ef4444'},
  transferred:{name:'转投',color:'#ec4899'},
  archived:{name:'已归档',color:'#64748b'}
};
function paperBadge(st){const s=PAPER_STATUS[st]||PAPER_STATUS.draft;return `<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`;}
const PAPER_ZONE={
  z1:{name:'一区',color:'#ef4444'},
  z2:{name:'二区',color:'#f97316'},
  z3:{name:'三区',color:'#3b82f6'},
  z4:{name:'四区',color:'#64748b'},
  ei:{name:'EI 期刊',color:'#10b981'}
};
const PAPER_CCF={
  a:{name:'CCF-A',color:'#ef4444'},
  b:{name:'CCF-B',color:'#f59e0b'},
  c:{name:'CCF-C',color:'#3b82f6'}
};
function zoneBadge(z){const s=PAPER_ZONE[z];return s?`<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`:'';}
function ccfBadge(c){const s=PAPER_CCF[c];return s?`<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`:'';}
const PAPER_KIND={plan:{name:'拟投'},sub:{name:'在投'},collab:{name:'合作'}};
const PAPER_ROLE={first:'第一作者',corresponding:'通讯作者',cofirst:'共同一作',collaborator:'合作者',supervisor:'指导教师',other:'其他'};
const PAPER_FILTERS={active:'全部进行中',writing:'撰写中',submitted:'投稿/审稿',revision:'修改中',done:'已录用',archived:'已归档'};
function paperStage(p){const s=curStep(p);return s&&s.status?s.status:(p.status||'idea');}
function paperRoleOf(p){return (p&&p.role)||(p&&p.kind==='collab'?'collaborator':'first');}
function paperRoleBadge(role){const name=PAPER_ROLE[role]||PAPER_ROLE.other;return `<span class="pstatus" style="background:#0ea5e922;color:#0369a1">${name}</span>`;}
function paperMatchesFilter(p,filter){
  const st=paperStage(p);
  if(filter==='writing')return ['idea','draft','writing','internal','preparing'].includes(st);
  if(filter==='submitted')return ['submitted','review','rereview','transferred'].includes(st);
  if(filter==='revision')return ['major','minor','revision'].includes(st);
  if(filter==='done')return ['accepted','published'].includes(st);
  if(filter==='archived')return ['rejected','archived'].includes(st);
  return !['accepted','published','rejected','archived'].includes(st);
}
function paperActionDueBadge(p){
  const due=p.waitingFor?(p.followUpAt||p.nextDue||p.rebuttalDue):(p.nextDue||p.rebuttalDue||p.followUpAt);
  if(!due)return '';
  const d=daysBetween(todayStr(),due);
  if(d<0)return `<span class="pstatus" style="background:#ef444422;color:#ef4444">已逾期 ${-d}天</span>`;
  if(d===0)return '<span class="pstatus" style="background:#ef444422;color:#ef4444">今天截止</span>';
  if(d<=7)return `<span class="pstatus" style="background:#f59e0b22;color:#b45309">还剩 ${d}天</span>`;
  return `<span class="pstatus" style="background:#3b82f622;color:#2563eb">${esc(due)}</span>`;
}
/* 旧版单状态数据迁移为时间线 steps（load 时调用） */
function migratePaper(p){
  if(!p)return;
  if(!Array.isArray(p.steps)){
    p.steps = p.status ? [{status:p.status, journal:p.journal||'', date:p.submittedAt||'', note:p.note||''}] : [];
  }
  if(!p.role)p.role=p.kind==='collab'?'collaborator':'first';
  const last=p.steps[p.steps.length-1];
  if(last&&last.status)p.status=last.status;
}
function curStep(p){return (p.steps&&p.steps.length)?p.steps[p.steps.length-1]:null;}
function renderPapers(filter){
  const all=data.papers||[];
  filter=PAPER_FILTERS[filter]?filter:'active';
  const ps=all.filter(p=>paperMatchesFilter(p,filter));
  const kn=PAPER_FILTERS[filter];
  let html='<div class="panel collapsible '+(collapseState['papers']?'collapsed':'')+'" data-collapse="papers">';
  html+='<div class="panel-h" onclick="toggleCollapse(\'papers\')"><h2>📄 '+kn+'（'+ps.length+'）</h2>';
  html+='<span style="display:flex;align-items:center;gap:8px"><button class="btn primary" onclick="event.stopPropagation();openPaperForm(null,\''+filter+'\')">＋ 新建论文</button><span class="caret">▾</span></span></div>';
  html+='<div class="panel-b">';
  if(!ps.length) html+='<div class="empty">这个阶段还没有论文。</div>';
  else{
    html+='<div class="list">';
    ps.forEach(p=>{
      const meta=[];
      meta.push(paperBadge(paperStage(p)));
      meta.push(paperRoleBadge(paperRoleOf(p)));
      if(p.round)meta.push(`<span class="pstatus" style="background:#8b5cf622;color:#8b5cf6">#R${p.round}</span>`);
      var projName = '';
      if (p.projectId && data.rprojects) {
        var rp = data.rprojects.find(function(x){return x.id===p.projectId;});
        if (rp) projName = rp.title;
      }
      if (projName) meta.push('<span class="pstatus" style="background:#6366f122;color:var(--research)">🔬 '+esc(projName)+'</span>');
      const cs=curStep(p);
      const shownJ=(cs&&cs.journal)?cs.journal:(p.journal||'');
      html+='<div class="paper-card"><div class="body"><div class="ptitle">'+esc(p.title||'未命名')+'</div>';
      if(shownJ)html+='<div class="pjournal">📚 '+esc(shownJ)+'</div>';
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(p.waitingFor){
        html+='<div class="paper-next waiting"><div><span>等待中</span><b>'+esc(p.waitingFor)+'</b></div>'+paperActionDueBadge(p)+'</div>';
      }else if(p.nextAction){
        html+='<div class="paper-next"><div><span>下一步</span><b>'+esc(p.nextAction)+'</b></div>'+paperActionDueBadge(p)+'</div>';
      }else if(paperMatchesFilter(p,'active')){
        html+='<button class="paper-next missing" onclick="openPaperForm(\''+p.id+'\')">＋ 添加下一步行动</button>';
      }
      if(p.steps&&p.steps.length){
        html+='<details class="paper-history"><summary>查看阶段历史（'+p.steps.length+'）</summary><div class="ptl">';
        p.steps.forEach((s,i)=>{
          const cur=i===p.steps.length-1;
          html+='<div class="ptl-item'+(cur?' cur':'')+'">';
          html+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+paperBadge(s.status);
          if(s.journal)html+='<span style="font-size:12.5px;font-weight:600">'+esc(s.journal)+'</span>';
          if(s.date)html+='<span style="font-size:12px;color:var(--muted)">🗓️ '+esc(s.date)+'</span>';
          html+='</div>';
          if(s.note)html+='<div style="font-size:12px;color:var(--muted);margin-top:3px">'+esc(s.note)+'</div>';
          html+='</div>';
        });
        html+='</div></details>';
      }
      html+='</div>';
      html+='<div class="acts"><button class="icon-btn" onclick="openObsById(\'paper\',\''+p.id+'\')" title="在 Obsidian 中打开相关笔记">📓</button><button class="icon-btn" onclick="openPaperForm(\''+p.id+'\')">✏️</button><button class="icon-btn" onclick="delPaper(\''+p.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div></div>';
  return html;
}
/* v3-A1: 审稿回复倒计时徽章 + 科研 tab 倒计时横幅 */
function rebuttalBadge(p){
  if(!p.rebuttalDue)return '';
  const d=daysBetween(todayStr(),p.rebuttalDue);
  if(d<0)return `<span class="pstatus" style="background:#ef444422;color:#ef4444">⏰ 回复已逾期 ${-d}天</span>`;
  if(d===0)return `<span class="pstatus" style="background:#ef444422;color:#ef4444">⏰ 今天回复截止！</span>`;
  if(d<=30)return `<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">⏰ 回复还剩 ${d}天</span>`;
  return `<span class="pstatus" style="background:#3b82f622;color:#3b82f6">📅 回复 ${d}天后</span>`;
}
function researchReminder(){
  const ps=(data.papers||[]).filter(p=>p.rebuttalDue&&p.status!=='accepted'&&p.status!=='rejected');
  if(!ps.length)return '<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>⏰ 审稿回复倒计时</h2></div><div class="empty">还没有论文设置「回复截止日」。编辑在投 / 外审中的论文 → 填写 <b>审稿回复截止日</b> 与 <b>审稿轮次</b>，这里会自动出现 rebuttal 倒计时，逾期将标红提醒。</div></div>';
  ps.sort((a,b)=>a.rebuttalDue.localeCompare(b.rebuttalDue));
  let h='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>⏰ 审稿回复倒计时</h2></div><div class="list">';
  ps.forEach(p=>{
    h+='<div class="item"><div class="body"><div class="title">'+esc(p.title||'未命名')+(p.round?(' #R'+p.round):'')+'</div><div class="meta">'+rebuttalBadge(p)+'</div></div>'
      +'<div class="acts"><button class="icon-btn" onclick="openObsById(\'paper\',\''+p.id+'\')" title="Obsidian 笔记">📓</button><button class="icon-btn" onclick="openPaperForm(\''+p.id+'\')">✏️</button></div></div>';
  });
  h+='</div></div>';
  return h;
}
/* v3-A2: Obsidian 一键打开（按 id 取标题，避免标题含引号破坏 onclick） */
function openObsById(type,id){
  let t='',link='';
  if(type==='paper'){const x=(data.papers||[]).find(y=>y.id===id);t=x?x.title:'';link=x?x.obsLink:'';}
  else if(type==='patent'){const x=(data.patents||[]).find(y=>y.id===id);t=x?x.title:'';link=x?x.obsLink:'';}
  else if(type==='rproj'){const x=(data.rprojects||[]).find(y=>y.id===id);t=x?x.title:'';link=x?x.obsLink:'';}
  if(link){
    const L=link.trim();
    location.href=L.startsWith('obsidian://')?L:('obsidian://open?file='+encodeURIComponent(L));
    return;
  }
  if(t)location.href='obsidian://search?query='+encodeURIComponent(t);
}
function populateProjectSelect(selectId, selectedId){
  var sel = document.getElementById(selectId);
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  (data.rprojects || []).forEach(function(p){
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.title;
    if (selectedId && p.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}
function populateTravelSelect(selectId, selectedId){
  var sel=document.getElementById(selectId);if(!sel)return;
  while(sel.options.length>1)sel.remove(1);
  (data.travels||[]).slice().sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999')).forEach(function(t){
    var opt=document.createElement('option');opt.value=t.id;opt.textContent=t.title||'未命名出行';if(selectedId&&t.id===selectedId)opt.selected=true;sel.appendChild(opt);
  });
}
function openPaperForm(id,filter){
  editingPaper=id||null;
  const p=id?data.papers.find(x=>x.id===id):null;
  const defaultStage={writing:'writing',submitted:'submitted',revision:'revision',done:'accepted',archived:'archived'}[filter]||'idea';
  document.getElementById('paperTitle').textContent=id?'编辑论文':'新建论文';
  document.getElementById('pa_title').value=p?p.title:'';
  document.getElementById('pa_journal').value=p?p.journal:'';
  document.getElementById('pa_zone').value=p?p.zone:'';
  document.getElementById('pa_ccf').value=p?p.ccf:'';
  const savedStage=p?paperStage(p):defaultStage;
  document.getElementById('pa_stage').value=savedStage==='draft'?'idea':savedStage==='transferred'?'preparing':savedStage;
  document.getElementById('pa_role').value=p?paperRoleOf(p):'first';
  document.getElementById('pa_next').value=p?(p.nextAction||''):'';
  document.getElementById('pa_next_due').value=p?(p.nextDue||''):'';
  document.getElementById('pa_waiting_for').value=p?(p.waitingFor||''):'';
  document.getElementById('pa_followup').value=p?(p.followUpAt||''):'';
  document.getElementById('pa_note').value=p?p.note:'';
  document.getElementById('pa_obs').value=p?p.obsLink:'';
  populateProjectSelect('pa_rproject', p ? p.projectId : '');
  document.getElementById('pa_rebuttal').value=(p&&p.rebuttalDue)||'';
  document.getElementById('pa_round').value=(p&&p.round)||'';
  editingPaperSteps=p&&p.steps?JSON.parse(JSON.stringify(p.steps)):[];
  renderPaperSteps();
  document.getElementById('paperMask').classList.add('show');
  document.getElementById('pa_title').focus();
}
function renderPaperSteps(){
  const box=document.getElementById('pa_steps');
  if(!editingPaperSteps.length){box.innerHTML='<div class="ptl-empty">还没有投稿记录，在下方添加第一条（如：已投稿 → 审稿中 → 录用）。</div>';return;}
  let h='<div class="ptl">';
  editingPaperSteps.forEach((s,i)=>{
    const cur=i===editingPaperSteps.length-1;
    h+='<div class="ptl-item'+(cur?' cur':'')+'">';
    h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+paperBadge(s.status);
    if(s.journal)h+='<span style="font-size:12.5px;font-weight:600">'+esc(s.journal)+'</span>';
    if(s.date)h+='<span style="font-size:12px;color:var(--muted)">🗓️ '+esc(s.date)+'</span>';
    h+='<button class="icon-btn" style="margin-left:auto" onclick="delStep('+i+')" title="删除这条记录">🗑️</button></div>';
    if(s.note)h+='<div style="font-size:12px;color:var(--muted);margin-top:3px">'+esc(s.note)+'</div>';
    h+='</div>';
  });
  h+='</div>';
  box.innerHTML=h;
}
function delStep(i){editingPaperSteps.splice(i,1);renderPaperSteps();}
function closePaper(){document.getElementById('paperMask').classList.remove('show');editingPaper=null;editingPaperSteps=[];}
function syncPaperActionItem(p){
  if(!p||!p.id)return;
  const existing=(data.items||[]).find(i=>i.researchPaperId===p.id&&i.sourceType==='paper-action');
  if(['accepted','published','rejected','archived'].includes(p.status)){
    if(existing&&existing.status!=='done')data.items=data.items.filter(i=>i!==existing);
    return;
  }
  let action=p.waitingFor?('跟进：'+p.waitingFor):(p.nextAction||'').trim();
  let due=p.waitingFor?(p.followUpAt||p.nextDue||''):(p.nextDue||'');
  if(!action&&p.rebuttalDue){action='回复审稿意见';due=p.rebuttalDue;}
  if(!action){
    if(existing&&existing.status!=='done')data.items=data.items.filter(i=>i!==existing);
    return;
  }
  const title='论文 · '+action;
  const signature=title+'|'+due;
  const obj={cat:'research',title,note:p.title||'',due,status:'todo',prio:(due&&daysBetween(todayStr(),due)<=7)?'high':'mid',tags:['论文'],researchPaperId:p.id,sourceType:'paper-action',sourceSignature:signature};
  if(existing){
    const keepDone=existing.status==='done'&&existing.sourceSignature===signature;
    Object.assign(existing,obj,{status:keepDone?'done':'todo',completedAt:keepDone?existing.completedAt:null});
  }else data.items.push(Object.assign({id:uid(),created:todayStr()},obj));
}
function submitPaper(){
  const title=document.getElementById('pa_title').value.trim();
  if(!title){alert('请填写论文标题');return;}
  const journal=document.getElementById('pa_journal').value.trim();
  const stage=document.getElementById('pa_stage').value||'idea';
  const last=editingPaperSteps[editingPaperSteps.length-1];
  if(!last||last.status!==stage){
    editingPaperSteps.push({status:stage,journal,date:todayStr(),note:last?'阶段变更':'创建论文'});
  }
  const current=editingPaperSteps[editingPaperSteps.length-1];
  const obj={
    title, journal,
    kind:['idea','draft','writing','internal','preparing'].includes(stage)?'plan':'sub',
    role:document.getElementById('pa_role').value||'first',
    nextAction:document.getElementById('pa_next').value.trim(),
    nextDue:document.getElementById('pa_next_due').value||undefined,
    waitingFor:document.getElementById('pa_waiting_for').value.trim(),
    followUpAt:document.getElementById('pa_followup').value||undefined,
    zone:document.getElementById('pa_zone').value,
    ccf:document.getElementById('pa_ccf').value,
    note:document.getElementById('pa_note').value.trim(),
    obsLink:document.getElementById('pa_obs').value.trim()||undefined,
    rebuttalDue:document.getElementById('pa_rebuttal').value||undefined,
    round:document.getElementById('pa_round').value?+document.getElementById('pa_round').value:undefined,
    steps:JSON.parse(JSON.stringify(editingPaperSteps)),
    projectId:(document.getElementById('pa_rproject')||{}).value || ''
  };
  obj.journal=journal;
  obj.status=stage;
  let paper;
  if(editingPaper){paper=data.papers.find(x=>x.id===editingPaper);Object.assign(paper,obj);}
  else {paper=Object.assign({id:uid()},obj);data.papers.push(paper);}
  syncPaperActionItem(paper);
  save();closePaper();render();
}
function delPaper(id){
  if(!confirm('确定删除这篇论文记录？'))return;
  data.papers=data.papers.filter(p=>p.id!==id);
  data.items=data.items.filter(i=>i.researchPaperId!==id);
  save();render();
}

/* ---------- patents (专利) ---------- */
const PATENT_STATUS={
  draft:{name:'撰写中',color:'#94a3b8'},
  filed:{name:'已递交',color:'#6366f1'},
  accepted:{name:'受理',color:'#3b82f6'},
  examined:{name:'实审',color:'#f59e0b'},
  granted:{name:'授权',color:'#10b981'},
  rejected:{name:'驳回',color:'#ef4444'},
  transferred:{name:'转让',color:'#ec4899'}
};
const PATENT_TYPE={
  invention:{name:'发明专利',color:'#6366f1'},
  utility:{name:'实用新型',color:'#10b981'},
  design:{name:'外观设计',color:'#f59e0b'},
  soft:{name:'软件著作权',color:'#8b5cf6'}
};
function patStatusBadge(st){const s=PATENT_STATUS[st]||PATENT_STATUS.draft;return `<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`;}
function patTypeBadge(t){const s=PATENT_TYPE[t];return s?`<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`:'';}
function migratePatent(p){
  if(!p)return;
  if(!Array.isArray(p.steps)){
    p.steps = p.status ? [{status:p.status, date:p.filedDate||'', note:p.note||''}] : [];
  }
}
function curPatStep(p){return (p.steps&&p.steps.length)?p.steps[p.steps.length-1]:null;}
function patentFeeBadge(p){
  if(!p.feeDue)return '';
  const d=daysBetween(todayStr(),p.feeDue);
  if(d<0)return `<span class="pstatus" style="background:#ef444422;color:#ef4444">⚠️ 年费已逾期 ${-d}天</span>`;
  if(d<=30)return `<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">⏰ 年费还剩 ${d}天</span>`;
  if(d<=90)return `<span class="pstatus" style="background:#3b82f622;color:#3b82f6">📅 年费 ${d}天后</span>`;
  return '';
}
function renderPatents(){
  const ps=data.patents||[];
  let html='<div class="panel collapsible '+(collapseState['patents']?'collapsed':'')+'" data-collapse="patents">';
  html+='<div class="panel-h" onclick="toggleCollapse(\'patents\')"><h2>📜 专利（'+ps.length+'）</h2>';
  html+='<span style="display:flex;align-items:center;gap:8px"><button class="btn primary" onclick="event.stopPropagation();openPatentForm()">＋ 新建</button><span class="caret">▾</span></span></div>';
  html+='<div class="panel-b">';
  if(!ps.length) html+='<div class="empty">还没有专利，点「＋ 新建」记录你的专利/软著吧。</div>';
  else{
    html+='<div class="list">';
    ps.forEach(p=>{
      const cs=curPatStep(p);
      const meta=[];
      meta.push(patStatusBadge(cs?cs.status:(p.status||'draft')));
      if(p.type)meta.push(patTypeBadge(p.type));
      if(p.feeDue)meta.push(patentFeeBadge(p));
      var patProjName = '';
      if (p.projectId && data.rprojects) {
        var prp = data.rprojects.find(function(x){return x.id===p.projectId;});
        if (prp) patProjName = prp.title;
      }
      if (patProjName) meta.push('<span class="pstatus" style="background:#6366f122;color:var(--research)">🔬 '+esc(patProjName)+'</span>');
      html+='<div class="paper-card" style="border-left-color:var(--research)"><div class="body"><div class="ptitle">'+esc(p.title||'未命名')+'</div>';
      if(p.number)html+='<div class="pjournal">🔖 '+(esc(p.number)||'—')+'</div>';
      if(p.filedDate)html+='<div class="pjournal">🗓️ 申请日 '+esc(p.filedDate)+'</div>';
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(p.steps&&p.steps.length){
        html+='<div class="ptl">';
        p.steps.forEach((s,i)=>{
          const cur=i===p.steps.length-1;
          html+='<div class="ptl-item'+(cur?' cur':'')+'">';
          html+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+patStatusBadge(s.status);
          if(s.date)html+='<span style="font-size:12px;color:var(--muted)">🗓️ '+esc(s.date)+'</span>';
          html+='</div>';
          if(s.note)html+='<div style="font-size:12px;color:var(--muted);margin-top:3px">'+esc(s.note)+'</div>';
          html+='</div>';
        });
        html+='</div>';
      }
      if(p.note)html+='<div class="pmeta" style="margin-top:6px">📝 '+esc(p.note)+'</div>';
      html+='</div>';
      html+='<div class="acts"><button class="icon-btn" onclick="openObsById(\'patent\',\''+p.id+'\')" title="在 Obsidian 中打开相关笔记">📓</button><button class="icon-btn" onclick="openPatentForm(\''+p.id+'\')">✏️</button><button class="icon-btn" onclick="delPatent(\''+p.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div></div>';
  return html;
}
function openPatentForm(id){
  editingPatent=id||null;
  const p=id?data.patents.find(x=>x.id===id):null;
  document.getElementById('patentTitle').textContent=id?'编辑专利':'新建 · 专利';
  document.getElementById('pt_title').value=p?p.title:'';
  document.getElementById('pt_type').value=p?p.type:'invention';
  document.getElementById('pt_date').value=p?p.filedDate:'';
  document.getElementById('pt_number').value=p?p.number:'';
  document.getElementById('pt_fee').value=p?p.feeDue:'';
  document.getElementById('pt_note').value=p?p.note:'';
  document.getElementById('pt_obs').value=p?p.obsLink:'';
  populateProjectSelect('pt_rproject', p ? p.projectId : '');
  editingPatentSteps=p&&p.steps?JSON.parse(JSON.stringify(p.steps)):[];
  renderPatentSteps();
  document.getElementById('pt_new_status').value='filed';
  document.getElementById('pt_new_date').value='';
  document.getElementById('pt_new_note').value='';
  document.getElementById('patentMask').classList.add('show');
  document.getElementById('pt_title').focus();
}
function renderPatentSteps(){
  const box=document.getElementById('pt_steps');
  if(!editingPatentSteps.length){box.innerHTML='<div class="ptl-empty">还没有生命周期记录，在下方添加第一条（如：已递交 → 受理 → 实审）。</div>';return;}
  let h='<div class="ptl">';
  editingPatentSteps.forEach((s,i)=>{
    const cur=i===editingPatentSteps.length-1;
    h+='<div class="ptl-item'+(cur?' cur':'')+'">';
    h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+patStatusBadge(s.status);
    if(s.date)h+='<span style="font-size:12px;color:var(--muted)">🗓️ '+esc(s.date)+'</span>';
    h+='<button class="icon-btn" style="margin-left:auto" onclick="delPatentStep('+i+')" title="删除这条记录">🗑️</button></div>';
    if(s.note)h+='<div style="font-size:12px;color:var(--muted);margin-top:3px">'+esc(s.note)+'</div>';
    h+='</div>';
  });
  h+='</div>';
  box.innerHTML=h;
}
function addPatentStep(){
  const status=document.getElementById('pt_new_status').value;
  const date=document.getElementById('pt_new_date').value;
  const note=document.getElementById('pt_new_note').value.trim();
  if(!status)return;
  editingPatentSteps.push({status,date,note});
  renderPatentSteps();
  document.getElementById('pt_new_date').value='';
  document.getElementById('pt_new_note').value='';
}
function delPatentStep(i){editingPatentSteps.splice(i,1);renderPatentSteps();}
function closePatent(){document.getElementById('patentMask').classList.remove('show');editingPatent=null;editingPatentSteps=[];}
function submitPatent(){
  const title=document.getElementById('pt_title').value.trim();
  if(!title){alert('请填写专利名称');return;}
  // 安全网：保存时若下方还有未点「＋ 添加」的临时步骤（状态/日期/备注），先补加，避免日期丢失
  const ps=document.getElementById('pt_new_status').value;
  const pd=document.getElementById('pt_new_date').value;
  const pn=document.getElementById('pt_new_note').value.trim();
  if(ps||pd||pn){editingPatentSteps.push({status:ps,date:pd,note:pn});
    document.getElementById('pt_new_status').value='filed';document.getElementById('pt_new_date').value='';document.getElementById('pt_new_note').value='';}
  const last=editingPatentSteps[editingPatentSteps.length-1];
  const obj={
    title,
    type:document.getElementById('pt_type').value,
    filedDate:document.getElementById('pt_date').value,
    number:document.getElementById('pt_number').value.trim(),
    feeDue:document.getElementById('pt_fee').value||undefined,
    note:document.getElementById('pt_note').value.trim(),
    obsLink:document.getElementById('pt_obs').value.trim()||undefined,
    steps:JSON.parse(JSON.stringify(editingPatentSteps)),
    projectId:(document.getElementById('pt_rproject')||{}).value || ''
  };
  obj.status=last?last.status:'draft';
  if(editingPatent){const p=data.patents.find(x=>x.id===editingPatent);Object.assign(p,obj);}
  else data.patents.push(Object.assign({id:uid()},obj));
  save();closePatent();render();
}
function delPatent(id){
  if(!confirm('确定删除这条专利记录？'))return;
  data.patents=data.patents.filter(p=>p.id!==id);
  save();render();
}

/* ---------- research projects (科研项目) ---------- */
const RPROJ_STATUS={
  applying:{name:'申报中',color:'#94a3b8'},
  approved:{name:'已获批',color:'#3b82f6'},
  active:{name:'在研',color:'#f59e0b'},
  closed:{name:'结题',color:'#10b981'},
  rejected:{name:'未获批',color:'#ef4444'}
};
const RPROJ_SOURCE={
  nsfc:{name:'国家自然科学基金',color:'#ef4444'},
  key:{name:'国家重点研发',color:'#f59e0b'},
  provincial:{name:'省部级',color:'#3b82f6'},
  horizontal:{name:'横向课题',color:'#10b981'},
  enterprise:{name:'企业合作',color:'#ec4899'},
  other:{name:'其他',color:'#64748b'}
};
const RPROJ_ROLE={host:'主持',core:'骨干',member:'参与'};
function rpStatusBadge(st){const s=RPROJ_STATUS[st]||RPROJ_STATUS.applying;return `<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`;}
function rpSourceBadge(s){const x=RPROJ_SOURCE[s];return x?`<span class="pstatus" style="background:${x.color}22;color:${x.color}">${x.name}</span>`:'';}
function renderRProjects(){
  const ps=data.rprojects||[];
  let html='<div class="panel collapsible '+(collapseState['rprojects']?'collapsed':'')+'" data-collapse="rprojects">';
  html+='<div class="panel-h" onclick="toggleCollapse(\'rprojects\')"><h2>🏛️ 科研项目（'+ps.length+'）</h2>';
  html+='<span style="display:flex;align-items:center;gap:8px"><button class="btn primary" onclick="event.stopPropagation();openRProjectForm()">＋ 新建</button><span class="caret">▾</span></span></div>';
  html+='<div class="panel-b">';
  if(!ps.length) html+='<div class="empty">还没有科研项目，点「＋ 新建」记录基金/课题/横向项目吧。</div>';
  else{
    html+='<div class="list">';
    ps.forEach(p=>{
      const meta=[];
      meta.push(rpStatusBadge(p.status));
      if(p.source)meta.push(rpSourceBadge(p.source));
      if(p.role)meta.push(`<span class="pstatus" style="background:#6366f122;color:var(--research)">${RPROJ_ROLE[p.role]||p.role}</span>`);
      if(p.fund)meta.push(`<span class="pstatus" style="background:#10b98122;color:var(--work)">${p.fund}万</span>`);
      var paperCnt = (data.papers||[]).filter(function(x){return x.projectId===p.id;}).length;
      var patentCnt = (data.patents||[]).filter(function(x){return x.projectId===p.id;}).length;
      if (paperCnt > 0) meta.push('<span class="pstatus" style="background:#6366f122;color:#6366f1">📄 论文 ×'+paperCnt+'</span>');
      if (patentCnt > 0) meta.push('<span class="pstatus" style="background:#ec489922;color:var(--research)">📜 专利 ×'+patentCnt+'</span>');
      var projFins = (data.finances||[]).filter(function(f){return f.rprojectId===p.id;});
      var finInc=0, finExp=0;
      projFins.forEach(function(f){
        if (f.type==='income') finInc += +f.amount||0;
        else finExp += +f.amount||0;
      });
      if (projFins.length > 0) {
        meta.push('<span class="pstatus" style="background:#10b98122;color:#10b981">💰 经费执行 ¥'+(finExp/10000).toFixed(1)+'万</span>');
        if (p.fund) {
          var pct = Math.round(finExp/10000/p.fund*100);
          meta.push('<span class="pstatus" style="background:'+(pct>=90?'#ef444422':'#f59e0b22')+';color:'+(pct>=90?'#ef4444':'#b45309')+'">执行率 '+pct+'%</span>');
        }
      }
      const period=(p.start||p.end)?`🗓️ ${p.start||'?'} ~ ${p.end||'进行中'}`:'';
      html+='<div class="paper-card" style="border-left-color:var(--research)"><div class="body"><div class="ptitle">'+esc(p.title||'未命名')+'</div>';
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(period)html+='<div class="pmeta" style="margin-top:4px">'+period+'</div>';
      if(p.note)html+='<div class="pmeta" style="margin-top:6px">📝 '+esc(p.note)+'</div>';
      html+='</div>';
      html+='<div class="acts"><button class="icon-btn" onclick="openObsById(\'rproj\',\''+p.id+'\')" title="在 Obsidian 中打开相关笔记">📓</button><button class="icon-btn" onclick="openRProjectForm(\''+p.id+'\')">✏️</button><button class="icon-btn" onclick="delRProject(\''+p.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div></div>';
  return html;
}
function openRProjectForm(id){
  editingRProj=id||null;
  const p=id?data.rprojects.find(x=>x.id===id):null;
  document.getElementById('rprojTitle').textContent=id?'编辑科研项目':'新建 · 科研项目';
  document.getElementById('rp_title').value=p?p.title:'';
  document.getElementById('rp_source').value=p?p.source:'nsfc';
  document.getElementById('rp_role').value=p?p.role:'host';
  document.getElementById('rp_status').value=p?p.status:'active';
  document.getElementById('rp_fund').value=p?p.fund:'';
  document.getElementById('rp_start').value=p?p.start:'';
  document.getElementById('rp_end').value=p?p.end:'';
  document.getElementById('rp_note').value=p?p.note:'';
  document.getElementById('rp_obs').value=p?p.obsLink:'';
  document.getElementById('rprojMask').classList.add('show');
  document.getElementById('rp_title').focus();
}
function closeRProj(){document.getElementById('rprojMask').classList.remove('show');editingRProj=null;}
function submitRProj(){
  const title=document.getElementById('rp_title').value.trim();
  if(!title){alert('请填写项目名称');return;}
  const obj={
    title,
    source:document.getElementById('rp_source').value,
    role:document.getElementById('rp_role').value,
    status:document.getElementById('rp_status').value,
    fund:document.getElementById('rp_fund').value?+document.getElementById('rp_fund').value:undefined,
    start:document.getElementById('rp_start').value,
    end:document.getElementById('rp_end').value,
    note:document.getElementById('rp_note').value.trim(),
    obsLink:document.getElementById('rp_obs').value.trim()||undefined
  };
  if(editingRProj){const p=data.rprojects.find(x=>x.id===editingRProj);Object.assign(p,obj);}
  else data.rprojects.push(Object.assign({id:uid()},obj));
  save();closeRProj();render();
}
function delRProject(id){
  if(!confirm('确定删除这个科研项目？'))return;
  data.rprojects=data.rprojects.filter(p=>p.id!==id);
  save();render();
}

/* ---------- finance / funds ---------- */
function renderFunds(){
  const fs=(data.funds||[]).filter(f=>kwOf((f.name||'')+' '+(f.code||'')+' '+(f.type||'')));
  let up=0,down=0;fs.forEach(f=>{const c=dailyChg(f);if(c>0)up++;else if(c<0)down++;});
  let holdTot=0;fs.forEach(f=>{const p=holdProfit(f);if(p)holdTot+=p;});
  const mktTot=fs.reduce((s,f)=>s+fundValue(f),0);
  let html=renderFinances()+'<div class="grid cards">';
  html+=`<div class="card finance"><div class="t">跟踪基金</div><div class="n">${fs.length}</div><div class="d">今日涨 ${up} · 跌 ${down}</div></div>`;
  html+=`<div class="card finance"><div class="t">基金市值(持有)</div><div class="n" style="color:var(--finance)">${mktTot.toFixed(2)}</div><div class="d">份额×最新净值(元)</div></div>`;
  html+=`<div class="card finance"><div class="t">持仓总收益</div><div class="n" style="color:${holdTot>=0?'var(--up)':'var(--down)'}">${holdTot>=0?'+':'-'}${Math.abs(holdTot).toFixed(2)}</div><div class="d">成本持仓盈亏(元)</div></div>`;
  html+='</div>';
  html+='<div style="font-size:12px;color:var(--muted);margin:10px 2px 0">颜色：<span style="color:var(--up);font-weight:700">红=涨</span> · <span style="color:var(--down);font-weight:700">绿=跌</span>（A股习惯）</div>';

  html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>💰 基金持仓 / 自选</h2><button class="btn primary" onclick="openFundForm()">＋ 添加基金</button></div>';
  if(!fs.length)html+='<div class="empty">还没有基金。添加你关注的基金（名称/代码/类型），定期「记录净值」即可看当日涨幅与走势。</div>';
  else{
    fs.forEach(f=>{
      const dc=dailyChg(f),rc=rangeChg(f),hp=holdProfit(f),hr=holdRet(f);
      const latest=fundLatest(f);const mv=fundValue(f);
      html+=`<div class="item"><div class="body">
        <div class="title">${esc(f.name)} <span class="tag" style="background:#ec489922;color:var(--finance)">${esc(f.code||'—')}</span> ${esc(f.type||'')}</div>
        <div class="meta">
          <span class="tag">最新净值 ${latest?latest.toFixed(4):'—'}</span>
          <span class="tag" style="background:${chgColor(dc)}22;color:${chgColor(dc)}">当日 ${fmtPct(dc)}</span>
          <span class="tag" style="background:${chgColor(rc)}22;color:${chgColor(rc)}">区间 ${fmtPct(rc)}</span>
          ${f.shares?`<span class="tag" style="background:#10b98122;color:#10b981">市值 ${mv.toFixed(2)}</span>`:''}
          ${hp!==null?`<span class="tag" style="background:${chgColor(hp)}22;color:${chgColor(hp)}">持仓 ${hp>=0?'+':''}${hp.toFixed(2)} (${fmtPct(hr)})</span>`:''}
        </div>
        ${sparkline(f.records)}
      </div>
      <div class="acts">
        <button class="icon-btn" title="记录净值" onclick="openNavForm('${f.id}')">📈</button>
        <button class="icon-btn" onclick="openFundForm('${f.id}')">✏️</button>
        <button class="icon-btn" onclick="delFund('${f.id}')">🗑️</button>
      </div></div>`;
    });
  }
  html+='</div>';

  html+='<div class="panel" style="margin-top:14px"><h2>📅 基金净值记录日历</h2>'+renderCalendar('finance')+'</div>';

  const recs=[];
  (data.funds||[]).forEach(f=>(f.records||[]).forEach(r=>recs.push({f,r})));
  recs.sort((a,b)=>b.r.date.localeCompare(a.r.date));
  html+='<div class="panel" style="margin-top:14px"><h2>🗓️ 净值记录（按日期）</h2>';
  if(!recs.length)html+='<div class="empty">还没有净值记录</div>';
  else html+='<div class="list">'+recs.slice(0,40).map(o=>`<div class="item"><div class="body"><div class="title">${esc(o.f.name)} <span class="tag" style="background:#ec489922;color:var(--finance)">${esc(o.f.code||'—')}</span></div><div class="meta"><span class="tag">${o.r.date}</span><span class="tag" style="background:#ec489922;color:var(--finance)">净值 ${o.r.nav}</span></div></div></div>`).join('')+'</div>';
  html+='</div>';
  return html;
}

/* ---------- fund form ---------- */
function openFundForm(id){
  editingFund=id||null;
  document.getElementById('fundTitle').textContent=id?'编辑基金':'添加基金';
  const f=id?data.funds.find(x=>x.id===id):null;
  document.getElementById('fu_name').value=f?f.name:'';
  document.getElementById('fu_code').value=f?f.code:'';
  document.getElementById('fu_type').value=f?f.type:'股票型';
  document.getElementById('fu_shares').value=f?f.shares:'';
  document.getElementById('fu_cost').value=f?f.costNav:'';
  document.getElementById('fundMask').classList.add('show');
  document.getElementById('fu_name').focus();
}
function closeFund(){document.getElementById('fundMask').classList.remove('show');editingFund=null;}
function submitFund(){
  const name=document.getElementById('fu_name').value.trim();
  if(!name){alert('请填写基金名称');return;}
  const obj={name,code:document.getElementById('fu_code').value.trim(),type:document.getElementById('fu_type').value,
    shares:document.getElementById('fu_shares').value?+document.getElementById('fu_shares').value:undefined,
    costNav:document.getElementById('fu_cost').value?+document.getElementById('fu_cost').value:undefined};
  if(editingFund){const f=data.funds.find(x=>x.id===editingFund);Object.assign(f,obj);}
  else data.funds.push(Object.assign({id:uid(),records:[]},obj));
  save();closeFund();render();
}
function delFund(id){if(confirm('删除该基金及其所有净值记录？')){data.funds=data.funds.filter(x=>x.id!==id);save();render();}}

/* ---------- nav record ---------- */
function openNavForm(fid,ds){
  document.getElementById('nv_fund').value=fid;
  document.getElementById('nv_date').value=ds||todayStr();
  document.getElementById('nv_nav').value='';
  document.getElementById('navMask').classList.add('show');
  document.getElementById('nv_nav').focus();
}
function closeNav(){document.getElementById('navMask').classList.remove('show');}
function submitNav(){
  const fid=document.getElementById('nv_fund').value;
  const date=document.getElementById('nv_date').value;
  const nav=document.getElementById('nv_nav').value;
  if(!date||!nav){alert('请填写日期和净值');return;}
  const f=data.funds.find(x=>x.id===fid);if(!f){closeNav();return;}
  if(!f.records)f.records=[];
  const ex=f.records.find(r=>r.date===date);
  if(ex)ex.nav=+nav;else f.records.push({date,nav:+nav});
  f.records.sort((a,b)=>a.date.localeCompare(b.date));
  save();closeNav();render();
}

/* ---------- calendar ---------- */
function calShift(scope,n){
  const cur=getCalMonth(scope);
  let y=+cur.slice(0,4),m=+cur.slice(5,7)-1+n;
  y+=Math.floor(m/12);m=((m%12)+12)%12;
  calMonths[scope]=`${y}-${String(m+1).padStart(2,'0')}`;
  render();
}
function calReset(scope){calMonths[scope]=new Date().toISOString().slice(0,7);render();}
function setCalScope(s){calScope=s;render();}
function getCalMonth(scope){ if(!calMonths[scope])calMonths[scope]=new Date().toISOString().slice(0,7); return calMonths[scope]; }

/* ---------- 读书清单 ---------- */
const BOOK_STATUS={want:{name:'想读',color:'#94a3b8'},reading:{name:'在读',color:'#3b82f6'},done:{name:'已读',color:'#10b981'}};
function bookBadge(st){const s=BOOK_STATUS[st]||BOOK_STATUS.want;return `<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`;}
function starStr(n){n=+n||0;let s='';for(let i=1;i<=5;i++)s+=i<=n?'★':'☆';return s;}
function renderBooks(){
  const bs=(data.books||[]);
  const list=bookStatus==='all'?bs:bs.filter(b=>b.status===bookStatus);
  let html='<div class="panel"><div class="sec-head"><h2>📚 读书清单</h2><button class="btn primary" onclick="openBookForm()">＋ 添加</button></div>';
  html+='<div class="chips" style="margin:10px 0 4px">';
  html+='<span class="ctab '+(bookStatus==='all'?'on':'')+'" onclick="setBookStatus(\'all\')">全部（'+bs.length+'）</span>';
  for(const s in BOOK_STATUS)html+='<span class="ctab '+(bookStatus===s?'on':'')+'" onclick="setBookStatus(\''+s+'\')">'+BOOK_STATUS[s].name+'（'+bs.filter(b=>b.status===s).length+'）</span>';
  html+='</div>';
  if(!list.length)html+='<div class="empty">这个分类下还没有书，点「＋ 添加」记录吧。</div>';
  else{
    html+='<div class="list">';
    list.forEach(b=>{
      html+='<div class="paper-card"><div class="body"><div class="ptitle">'+esc(b.title||'未命名')+'</div>';
      if(b.author)html+='<div class="pjournal">✍️ '+esc(b.author)+'</div>';
      const meta=[bookBadge(b.status)];
      if(+b.rating>0)meta.push('<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">'+starStr(b.rating)+'</span>');
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(b.progress!=null&&b.progress!==''){const p=Math.max(0,Math.min(100,+b.progress));html+='<div class="bar" style="margin-top:6px;height:6px"><i style="width:'+p+'%;background:var(--life)"></i></div><div class="d" style="font-size:11px;color:var(--muted);margin-top:2px">进度 '+p+'%</div>';}
      if(b.start&&b.end){const d=daysBetween(b.start,b.end);if(d>=0)html+='<div class="d" style="font-size:11px;color:var(--muted)">📖 用时 '+d+' 天</div>';}
      if(b.note)html+='<div class="pmeta" style="margin-top:6px">📝 '+esc(b.note)+'</div>';
      html+='</div><div class="acts"><button class="icon-btn" onclick="openBookForm(\''+b.id+'\')">✏️</button><button class="icon-btn" onclick="delBook(\''+b.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function openBookForm(id){
  editingBook=id||null;
  const b=id?data.books.find(x=>x.id===id):null;
  document.getElementById('bookTitle').textContent=id?'编辑书籍':'添加 · 读书清单';
  document.getElementById('bk_title').value=b?b.title:'';
  document.getElementById('bk_author').value=b?b.author:'';
  document.getElementById('bk_status').value=b?b.status:'want';
  document.getElementById('bk_rating').value=b?b.rating:'0';
  document.getElementById('bk_progress').value=b?b.progress:'';
  document.getElementById('bk_start').value=b?b.startDate:'';
  document.getElementById('bk_end').value=b?b.endDate:'';
  document.getElementById('bk_next').value=b?b.nextAction||'':'';
  document.getElementById('bk_next_due').value=b?b.nextDue||'':'';
  document.getElementById('bk_note').value=b?b.note:'';
  document.getElementById('bookMask').classList.add('show');
  document.getElementById('bk_title').focus();
}
function closeBook(){document.getElementById('bookMask').classList.remove('show');editingBook=null;}
function submitBook(){
  const title=document.getElementById('bk_title').value.trim();
  if(!title){alert('请填写书名');return;}
  const obj={title,author:document.getElementById('bk_author').value.trim(),
    status:document.getElementById('bk_status').value,
    rating:document.getElementById('bk_rating').value,
    progress:document.getElementById('bk_progress').value!==''?+document.getElementById('bk_progress').value:undefined,
    startDate:document.getElementById('bk_start').value||undefined,
    endDate:document.getElementById('bk_end').value||undefined,
    nextAction:document.getElementById('bk_next').value.trim(),
    nextDue:document.getElementById('bk_next_due').value||undefined,
    note:document.getElementById('bk_note').value.trim()};
  if(editingBook){const it=data.books.find(x=>x.id===editingBook);Object.assign(it,obj);}
  else data.books.push(Object.assign({id:uid()},obj));
  save();closeBook();render();
}
function delBook(id){if(!confirm('确定删除这本记录？'))return;data.books=data.books.filter(x=>x.id!==id);save();render();}

/* ---------- 旅行 & 出行 ---------- */
function renderTravels(){
  const list=(data.travels||[]);
  let html='<div class="panel"><div class="sec-head"><h2>🧳 旅行 & 出行</h2><button class="btn primary" onclick="openTravelForm()">＋ 添加</button></div>';
  if(!list.length)html+='<div class="empty">还没有出行计划，点「＋ 添加」记录目的地、日期与行李清单，出行区间会自动标到日历上。</div>';
  else{
    const today=todayStr();
    const sorted=[...list].sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999'));
    html+='<div class="list">';
    sorted.forEach(t=>{
      const st=t.start||'', en=t.end||'';
      let status='';
      if(!st||!en)status='<span class="pstatus" style="background:#94a3b822;color:#94a3b8">待定</span>';
      else if(today<st)status='<span class="pstatus" style="background:#3b82f622;color:#3b82f6">未出发</span>';
      else if(today>en)status='<span class="pstatus" style="background:#94a3b822;color:#94a3b8">已结束</span>';
      else status='<span class="pstatus" style="background:#10b98122;color:#10b981">进行中</span>';
      html+='<div class="paper-card"><div class="body"><div class="ptitle">'+esc(t.title||'未命名')+'</div>';
      const meta=[status];
      if(st||en)meta.push('<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">🗓️ '+(st||'?')+' → '+(en||'?')+'</span>');
      if(t.budget)meta.push('<span class="pstatus" style="background:#ec489922;color:var(--finance)">预算 ¥'+esc(t.budget)+'</span>');
      if(t.spent){const over=(+t.spent)>(+t.budget||0);meta.push('<span class="pstatus" style="background:'+(over?'#ef444422':'#10b98122')+';color:'+(over?'#ef4444':'#10b981')+'">已花 ¥'+esc(t.spent)+(t.budget?(' · '+(over?'超支':'剩')+' ¥'+Math.abs((+t.spent)-(+t.budget)).toFixed(0)):'')+'</span>');}
      if(t.visa)meta.push('<span class="pstatus" style="background:#8b5cf622;color:#8b5cf6">'+esc(t.visa)+'</span>');
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(t.checklist&&t.checklist.length){
        html+='<div class="ptasks">'+t.checklist.map(c=>'<span class="ptask">'+esc(c)+'</span>').join('')+'</div>';
      }
      if(t.note)html+='<div class="pmeta" style="margin-top:6px">📝 '+esc(t.note)+'</div>';
      html+='</div><div class="acts"><button class="icon-btn" onclick="openTravelForm(\''+t.id+'\')">✏️</button><button class="icon-btn" onclick="delTravel(\''+t.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function openTravelForm(id){
  travelEditId=id||null;
  const t=id?data.travels.find(x=>x.id===id):null;
  document.getElementById('travelTitle').textContent=id?'编辑出行':'添加 · 旅行 & 出行';
  document.getElementById('tv_title').value=t?t.title:'';
  document.getElementById('tv_start').value=t?t.start:'';
  document.getElementById('tv_end').value=t?t.end:'';
  document.getElementById('tv_budget').value=t?t.budget:'';
  document.getElementById('tv_spent').value=t?t.spent:'';
  document.getElementById('tv_visa').value=t?t.visa:'';
  document.getElementById('tv_next').value=t?t.nextAction||'':'';
  document.getElementById('tv_note').value=t?t.note:'';
  document.getElementById('tv_checklist').value=t&&t.checklist?t.checklist.map(x=>typeof x==='string'?x:(x.text||'')).filter(Boolean).join('\n'):'';
  document.getElementById('travelMask').classList.add('show');
  document.getElementById('tv_title').focus();
}
function closeTravel(){document.getElementById('travelMask').classList.remove('show');travelEditId=null;}
function submitTravel(){
  const title=document.getElementById('tv_title').value.trim();
  if(!title){alert('请填写目的地/标题');return;}
  const old=travelEditId?(data.travels.find(x=>x.id===travelEditId)||{}).checklist||[]:[];
  const oldState={};old.forEach(x=>{const text=typeof x==='string'?x:(x.text||'');if(text)oldState[text]=typeof x==='string'?false:!!x.done;});
  const checklist=document.getElementById('tv_checklist').value.split('\n').map(s=>s.trim()).filter(Boolean).map(text=>({text,done:!!oldState[text]}));
  const obj={title,start:document.getElementById('tv_start').value,end:document.getElementById('tv_end').value,
    budget:document.getElementById('tv_budget').value.trim(),spent:document.getElementById('tv_spent').value.trim(),visa:document.getElementById('tv_visa').value.trim(),
    nextAction:document.getElementById('tv_next').value.trim(),note:document.getElementById('tv_note').value.trim(),checklist};
  if(travelEditId){const it=data.travels.find(x=>x.id===travelEditId);Object.assign(it,obj);}
  else data.travels.push(Object.assign({id:uid()},obj));
  save();closeTravel();render();
}
function delTravel(id){if(!confirm('确定删除这条出行计划？'))return;data.travels=data.travels.filter(x=>x.id!==id);save();render();}

/* ---------- 纪念日 & 生日（倒计时 + 联动日历） ---------- */
const ANNIV_TYPE={birthday:{name:'生日',emoji:'🎂',color:'#fb7185'},anniversary:{name:'纪念日',emoji:'💝',color:'#f472b6'},important:{name:'重要日期',emoji:'📌',color:'#f59e0b'}};
function nextAnniv(mmdd){ // mmdd 'MM-DD' -> {date:'YYYY-MM-DD', days}
  if(!mmdd||!/^\d{2}-\d{2}$/.test(mmdd))return null;
  const now=new Date();const y=now.getFullYear();
  let d=new Date(y+'-'+mmdd);
  if(d<now)d=new Date((y+1)+'-'+mmdd);
  const diff=Math.ceil((d-now)/86400000);
  return {date:d.toISOString().slice(0,10),days:diff};
}
function renderAnniversaries(){
  const list=(data.anniversaries||[]);
  let html='<div class="panel"><div class="sec-head"><h2>🎉 纪念日 & 生日</h2><button class="btn primary" onclick="openAnniversaryForm()">＋ 添加</button></div>';
  if(!list.length)html+='<div class="empty">还没有记录，点「＋ 添加」记录生日 / 纪念日（MM-DD），自动倒计时并联动日历。</div>';
  else{
    const sorted=[...list].sort((a,b)=>{const da=nextAnniv(a.date),db=nextAnniv(b.date);return (da?da.days:999)-(db?db.days:999);});
    html+='<div class="list">';
    sorted.forEach(a=>{
      const na=nextAnniv(a.date);
      const t=ANNIV_TYPE[a.type]||ANNIV_TYPE.birthday;
      const Y=new Date().getFullYear();
      const yrLine=a.since?(a.type==='birthday'?(Y-(+a.since)+' 岁'):('第 '+(Y-(+a.since))+' 周年')):'';
      const cd=na?(na.days===0?('🎉 今天就是'+t.name+'！'):('还有 '+na.days+' 天')):'';
      const soon=(na&&na.days>0&&na.days<=7)?'<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">📌 还有 '+na.days+' 天 · 提前准备</span>':'';
      html+='<div class="paper-card"><div class="body"><div class="ptitle">'+esc(a.name||'未命名')+'</div>';
      const meta=['<span class="pstatus" style="background:'+t.color+'22;color:'+t.color+'">'+t.emoji+' '+t.name+'</span>'];
      if(a.date)meta.push('<span class="pstatus" style="background:#f59e0b22;color:#f59e0b">📅 '+esc(a.date)+'</span>');
      if(yrLine)meta.push('<span class="pstatus" style="background:#6366f122;color:#6366f1">'+yrLine+'</span>');
      if(soon)meta.push(soon);
      html+='<div class="pmeta">'+meta.join('')+'</div>';
      if(cd)html+='<div class="pmeta" style="margin-top:6px;color:'+t.color+'">'+t.emoji+' '+cd+'</div>';
      if(a.note)html+='<div class="pmeta" style="margin-top:6px">📝 '+esc(a.note)+'</div>';
      html+='</div><div class="acts"><button class="icon-btn" onclick="openAnniversaryForm(\''+a.id+'\')">✏️</button><button class="icon-btn" onclick="delAnniversary(\''+a.id+'\')">🗑️</button></div></div>';
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function openAnniversaryForm(id){
  anniversaryEditId=id||null;
  const a=id?data.anniversaries.find(x=>x.id===id):null;
  document.getElementById('annivTitle').textContent=id?'编辑纪念日':'添加 · 纪念日 & 生日';
  document.getElementById('av_name').value=a?a.name:'';
  document.getElementById('av_type').value=a?a.type:'birthday';
  document.getElementById('av_date').value=a?a.date:'';
  document.getElementById('av_since').value=a?a.since:'';
  document.getElementById('av_remind').value=a?(a.remindDays||7):7;
  document.getElementById('av_note').value=a?a.note:'';
  document.getElementById('annivMask').classList.add('show');
  document.getElementById('av_name').focus();
}
function closeAnniversary(){document.getElementById('annivMask').classList.remove('show');anniversaryEditId=null;}
function submitAnniversary(){
  const name=document.getElementById('av_name').value.trim();
  if(!name){alert('请填写名称');return;}
  const date=document.getElementById('av_date').value.trim();
  if(date&&!/^\d{2}-\d{2}$/.test(date)){alert('日期请使用 MM-DD 格式，例如 07-15');return;}
  const obj={name,type:document.getElementById('av_type').value,date:date,since:document.getElementById('av_since').value||undefined,remindDays:+document.getElementById('av_remind').value||7,note:document.getElementById('av_note').value.trim()};
  if(anniversaryEditId){const it=data.anniversaries.find(x=>x.id===anniversaryEditId);Object.assign(it,obj);}
  else data.anniversaries.push(Object.assign({id:uid()},obj));
  save();closeAnniversary();render();
}
function delAnniversary(id){if(!confirm('确定删除这条记录？'))return;data.anniversaries=data.anniversaries.filter(x=>x.id!==id);save();render();}

/* 纪念日/生日标记：返回某天的纪念日事项（用于日历与日详情） */
function anniversaryItemsFor(ds){
  const out=[];
  (data.anniversaries||[]).forEach(a=>{
    if(a.date&&/^\d{2}-\d{2}$/.test(a.date)&&ds.slice(5)===a.date){
      const t=ANNIV_TYPE[a.type]||ANNIV_TYPE.birthday;
      out.push({cat:'life',title:t.emoji+' '+a.name+' '+t.name,isAnniv:true,color:t.color,name:a.name,type:a.type});
    }
  });
  return out;
}
/* 出行标记：返回某天在进行中的出行（用于日历与日详情） */
function travelItemsFor(ds){
  const out=[];
  (data.travels||[]).forEach(t=>{
    if(t.start&&t.end&&ds>=t.start&&ds<=t.end)out.push({cat:'life',title:'🧳 '+t.title,isTravel:true,name:t.title});
  });
  return out;
}

/* ---------- 体重记录（运动模块） ---------- */
function renderWeights(){
  const ws=(data.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const n=ws.length;
  const latest=n?+ws[n-1].weight:null;
  const summary=(global.WorkbenchHealthMetrics&&global.WorkbenchHealthMetrics.weightSummary)?global.WorkbenchHealthMetrics.weightSummary():{};
  const avg7=summary.avg7==null?null:summary.avg7;
  const change30=summary.change30==null?null:summary.change30;
  let html='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>⚖️ 体重记录</h2>';
  if(data.targetWeight)html+='<span style="font-size:12px;color:var(--muted);margin-right:8px">目标 '+data.targetWeight+'kg</span>';
  html+='<button class="btn" onclick="openHealthGoalForm()">⚙ 目标</button><button class="btn primary" onclick="openWeightForm()">＋ 记录体重</button></div>';
  html+='<div class="grid cards" style="grid-template-columns:repeat(3,1fr)">';
  html+=`<div class="card sport"><div class="t">最新体重</div><div class="n">${latest!==null?latest.toFixed(1):'—'}</div><div class="d">${n?ws[n-1].date:'暂无记录'} · kg</div></div>`;
  html+=`<div class="card sport"><div class="t">近 7 天均值</div><div class="n">${avg7!==null?avg7.toFixed(1):'—'}</div><div class="d">${avg7===null?'形成趋势后显示':'降低单日波动影响'} · kg</div></div>`;
  html+=`<div class="card sport"><div class="t">近 30 天变化</div><div class="n">${change30===null?'—':(change30>0?'+':'')+change30.toFixed(1)}</div><div class="d">${change30===null?'至少记录 2 次可查看':'只看趋势，不评判好坏'} · kg</div></div>`;
  html+='</div>';
  html+=weightChart();
  html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>📋 测量记录</h2></div>';
  if(!n)html+='<div class="empty">还没有体重记录，点「＋ 记录体重」开始追踪你的体重曲线～</div>';
  else html+='<div class="list">'+ws.slice().reverse().map(w=>`<div class="item"><div class="body"><div class="title">⚖️ ${esc(w.weight)} kg <span class="tag" style="background:#8b5cf622;color:var(--sport)">${esc(w.date)}</span></div><div class="meta">${(w.bodyFat?`<span class="tag" style="background:#8b5cf622;color:var(--sport)">体脂 ${w.bodyFat}%</span>`:'')}${(w.waist?`<span class="tag" style="background:#8b5cf622;color:var(--sport)">腰围 ${w.waist}cm</span>`:'')}</div>${w.note?`<div class="meta"><span class="tag">${esc(w.note)}</span></div>`:''}</div><div class="acts"><button class="icon-btn" onclick="openWeightForm('${w.id}')">✏️</button><button class="icon-btn" onclick="delWeight('${w.id}')">🗑️</button></div></div>`).join('')+'</div>';
  html+='</div></div>';
  return html;
}
function setTargetWeight(){const v=prompt('设置目标体重(kg)，留空清除：',data.targetWeight||'');if(v===null)return;const n=parseFloat(v);data.targetWeight=(isNaN(n)||n<=0)?null:n;save();render();}
function weightChart(){
  const ws=(data.weights||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(ws.length<2)return '<div class="empty" style="padding:20px">记录至少 2 天体重后，这里会画出体重变化曲线 📈</div>';
  const W=580,H=200,padL=42,padR=16,padT=18,padB=28;
  const vals=ws.map(w=>+w.weight);
  let min=Math.min(...vals),max=Math.max(...vals);
  if(min===max){min-=1;max+=1;}
  const span=max-min; min-=span*0.18; max+=span*0.18;
  const n=ws.length;
  const x=i=>padL+(W-padL-padR)*(n===1?0.5:i/(n-1));
  const y=v=>padT+(H-padT-padB)*(1-(v-min)/(max-min));
  let grid='';const lines=4;
  for(let g=0;g<=lines;g++){const gv=min+(max-min)*g/lines,gy=y(gv);grid+=`<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/><text x="${padL-7}" y="${gy+4}" text-anchor="end" font-size="10" fill="var(--muted)">${gv.toFixed(1)}</text>`;}
  let path='';ws.forEach((w,i)=>{path+=(i?'L':'M')+x(i).toFixed(1)+' '+y(+w.weight).toFixed(1)+' ';});
  const area=path+`L ${x(n-1).toFixed(1)} ${H-padB} L ${x(0).toFixed(1)} ${H-padB} Z`;
  let dots='';ws.forEach((w,i)=>{dots+=`<circle cx="${x(i).toFixed(1)}" cy="${y(+w.weight).toFixed(1)}" r="3.6" fill="#8b5cf6" stroke="var(--panel)" stroke-width="1.5"/>`;});
  // 体脂率副线（按自身区间归一化到绘图区，仅看趋势）
  let fatLine='';
  const fats=ws.map(w=>w.bodyFat!=null?+w.bodyFat:null);
  if(fats.some(v=>v!=null)){
    const fv=fats.filter(v=>v!=null);let fmin=Math.min(...fv),fmax=Math.max(...fv);
    if(fmin===fmax){fmin-=1;fmax+=1;}
    const fy=v=>padT+(H-padT-padB)*(1-(v-fmin)/(fmax-fmin));
    let fp='';ws.forEach((w,i)=>{if(w.bodyFat!=null)fp+=(fp?'L':'M')+x(i).toFixed(1)+' '+fy(+w.bodyFat).toFixed(1)+' ';});
    fatLine=`<path d="${fp}" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" opacity="0.85"/>`;
  }
  // 目标线
  let tLine='';
  if(data.targetWeight){const ty=y(+data.targetWeight);if(ty>padT&&ty<H-padB)tLine=`<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${W-padR}" y2="${ty.toFixed(1)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${W-padR}" y="${(ty-4).toFixed(1)}" text-anchor="end" font-size="10" fill="#f59e0b">目标 ${data.targetWeight}</text>`;}
  let xlab='';[0,Math.floor((n-1)/2),n-1].forEach(i=>{if(ws[i])xlab+=`<text x="${x(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--muted)">${ws[i].date.slice(5)}</text>`;});
  const legend=(fats.some(v=>v!=null))?'<div style="font-size:11px;color:var(--muted);margin-top:4px"><span style="color:#8b5cf6">━</span> 体重　<span style="color:#10b981">┄</span> 体脂率(归一)　<span style="color:#f59e0b">┄</span> 目标</div>':'';
  return `<div style="margin-top:14px;overflow:hidden;border-radius:12px;background:var(--panel-2);padding:10px 6px 4px"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="体重曲线"><defs><linearGradient id="wgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.28"/><stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>${grid}${tLine}<path d="${area}" fill="url(#wgGrad)"/><path d="${path}" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${fatLine}${dots}${xlab}</svg>${legend}</div>`;
}
function openWeightForm(id,ds){
  editingWeight=id||null;
  document.getElementById('weightTitle').textContent=id?'编辑体重记录':'记录体重';
  const w=id?data.weights.find(x=>x.id===id):null;
  document.getElementById('wt_date').value=w?w.date:(ds||todayStr());
  document.getElementById('wt_weight').value=w?w.weight:'';
  document.getElementById('wt_fat').value=w?w.bodyFat:'';
  document.getElementById('wt_waist').value=w?w.waist:'';
  document.getElementById('wt_note').value=w?w.note:'';
  document.getElementById('weightMask').classList.add('show');
  document.getElementById('wt_weight').focus();
}
function closeWeight(){document.getElementById('weightMask').classList.remove('show');editingWeight=null;}
function submitWeight(){
  const date=document.getElementById('wt_date').value;
  const weight=document.getElementById('wt_weight').value;
  if(!date||!weight){alert('请填写日期和体重');return;}
  const obj={date,weight:+weight,
    bodyFat:document.getElementById('wt_fat').value?+document.getElementById('wt_fat').value:undefined,
    waist:document.getElementById('wt_waist').value?+document.getElementById('wt_waist').value:undefined,
    note:document.getElementById('wt_note').value.trim()};
  if(editingWeight){const w=data.weights.find(x=>x.id===editingWeight);Object.assign(w,obj);}
  else data.weights.push(Object.assign({id:uid()},obj));
  save();closeWeight();render();
}
function delWeight(id){if(confirm('删除这条体重记录？')){data.weights=data.weights.filter(x=>x.id!==id);save();render();}}

/* ---------- 运动计划 + 完成记录 ---------- */
function ymdL(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function mondayOf(ds){const d=new Date(ds+'T00:00:00');const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);return ymdL(d);}
function slotDate(key,dayIdx){const d=new Date(key+'T00:00:00');d.setDate(d.getDate()+dayIdx);return ymdL(d);}
function weekPlanSlots(key){const a=(data.weekPlans&&data.weekPlans[key])||[];const out=[];for(let i=0;i<7;i++)out[i]=a[i]||null;return out;}
function planDone(key,dayIdx){
  const s=weekPlanSlots(key)[dayIdx];if(!s)return false;
  const ds=slotDate(key,dayIdx);
  return (data.items||[]).some(i=>i.cat==='sport'&&i.due===ds&&i.sportType===s.type&&i.status==='done');
}
function setSportTab(t){sportTab=t;render();}
function planWeekShift(dir){let d=new Date(planAnchor+'T00:00:00');d.setDate(d.getDate()+dir*7);planAnchor=ymdL(d);render();}
function planWeekReset(){planAnchor=todayStr();render();}
function copyLastWeekPlan(){
  const key=mondayOf(planAnchor);const prev=weekPlanSlots(mondayOf(slotDate(key,-7))).map(x=>x?{type:x.type,minutes:x.minutes,note:x.note}:null);
  if(!prev.some(x=>x)){alert('上周没有计划可复制');return;}
  data.weekPlans[key]=prev;save();render();
}
function openPlanSlot(key,dayIdx){
  editingPlan={key,dayIdx};
  const s=weekPlanSlots(key)[dayIdx];
  const wn=['一','二','三','四','五','六','日'][dayIdx];
  document.getElementById('planTitle').textContent=s?('编辑计划 · 周'+wn):('添加计划 · 周'+wn+' ('+slotDate(key,dayIdx)+')');
  document.getElementById('plan_type').value=s?s.type:'跑步';
  document.getElementById('plan_minutes').value=s?s.minutes:'';
  document.getElementById('plan_note').value=s?s.note:'';
  document.getElementById('planMask').classList.add('show');
  document.getElementById('plan_minutes').focus();
}
function closePlan(){document.getElementById('planMask').classList.remove('show');editingPlan=null;}
function submitPlan(){
  const type=document.getElementById('plan_type').value;
  if(!type){alert('请选择运动类型');return;}
  const minutes=document.getElementById('plan_minutes').value;
  if(!minutes||+minutes<=0){alert('请填写目标时长');return;}
  const note=document.getElementById('plan_note').value.trim();
  const key=editingPlan.key,dayIdx=editingPlan.dayIdx;
  if(!data.weekPlans)data.weekPlans={};
  if(!data.weekPlans[key])data.weekPlans[key]=[];
  data.weekPlans[key][dayIdx]={type,minutes:minutes?+minutes:0,note};
  save();closePlan();render();
}
function setPlanAtDate(ds,plan){
  const key=mondayOf(ds),dayIdx=(new Date(ds+'T00:00:00').getDay()+6)%7;
  if(!data.weekPlans)data.weekPlans={};
  if(!data.weekPlans[key])data.weekPlans[key]=[];
  data.weekPlans[key][dayIdx]=plan;
  return {key,dayIdx};
}
function clearPlanAt(key,dayIdx){
  if(!data.weekPlans||!data.weekPlans[key])return;
  data.weekPlans[key][dayIdx]=null;
  if(!data.weekPlans[key].some(x=>x))delete data.weekPlans[key];
}
function reschedulePlan(key,dayIdx,offset){
  const s=weekPlanSlots(key)[dayIdx];if(!s)return;
  const from=slotDate(key,dayIdx),to=slotDate(from,offset||1);
  const targetKey=mondayOf(to),targetIdx=(new Date(to+'T00:00:00').getDay()+6)%7;
  const occupied=weekPlanSlots(targetKey)[targetIdx];
  if(occupied&&!confirm(to+' 已有 '+occupied.type+' 计划，是否替换？'))return;
  clearPlanAt(key,dayIdx);
  setPlanAtDate(to,Object.assign({},s,{skipped:false,rescheduledFrom:from}));
  save();render();
  if(typeof toast==='function')toast('计划已改到 '+to);
}
function skipPlan(key,dayIdx){
  const s=weekPlanSlots(key)[dayIdx];if(!s)return;
  if(!data.weekPlans[key])return;
  data.weekPlans[key][dayIdx]=Object.assign({},s,{skipped:true,skippedAt:todayStr()});
  save();render();
}
function restorePlan(key,dayIdx){
  const s=weekPlanSlots(key)[dayIdx];if(!s)return;
  data.weekPlans[key][dayIdx]=Object.assign({},s,{skipped:false,skippedAt:null});
  save();render();
}
function delPlanSlot(key,dayIdx){
  if(!confirm('删除这天的运动计划？'))return;
  if(data.weekPlans&&data.weekPlans[key]){
    data.weekPlans[key][dayIdx]=null;
    if(!data.weekPlans[key].some(x=>x))delete data.weekPlans[key];
    save();render();
  }
}
function completePlan(key,dayIdx){
  const s=weekPlanSlots(key)[dayIdx];if(!s)return;
  if(s.skipped)restorePlan(key,dayIdx);
  openForm('sport',null,slotDate(key,dayIdx));
  document.getElementById('f_sportType').value=s.type;
  document.getElementById('f_minutes').value=s.minutes||'';
  document.getElementById('f_status').value='done';
  document.getElementById('f_title').value=s.type+' · '+slotDate(key,dayIdx);
  pendingPlan={key,dayIdx};
}
function renderSportPlan(){
  const key=mondayOf(planAnchor);
  const slots=weekPlanSlots(key);
  const wk=['一','二','三','四','五','六','日'];
  let addIdx=slots.findIndex((s,i)=>!s&&slotDate(key,i)>=todayStr());
  if(addIdx<0)addIdx=slots.findIndex(s=>!s);
  if(addIdx<0)addIdx=0;
  let planned=0,completed=0;
  slots.forEach((s,i)=>{if(s&&!s.skipped)planned+=(+s.minutes||0);const ds=slotDate(key,i);completed+=(data.items.filter(x=>x.cat==='sport'&&x.due===ds&&x.status==='done').reduce((a,b)=>a+(+b.minutes||0),0));});
  let html='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>📅 本周运动计划</h2>'
    +'<button class="btn" onclick="planWeekShift(-1)">‹ 上周</button>'
    +'<button class="btn" onclick="planWeekShift(1)">下周 ›</button>'
    +'<button class="btn" onclick="planWeekReset()">本周</button>'
    +'<button class="btn" onclick="copyLastWeekPlan()">复制上周</button>'
    +'<button class="btn primary" onclick="openPlanSlot(\''+key+'\','+addIdx+')">＋ 安排一项</button></div>';
  html+='<div style="font-size:13px;color:var(--muted);margin-bottom:10px">'+key+' ~ '+slotDate(key,6)+'　·　计划合计 <b>'+planned+'</b> 分　/　本周已完成 <b style="color:#10b981">'+completed+'</b> 分</div>';
  html+='<div class="weekplan">';
  slots.forEach((s,i)=>{
    const ds=slotDate(key,i);
    const done=planDone(key,i);
    const isToday=ds===todayStr();
    html+='<div class="wpcol '+(isToday?'today':'')+'">';
    html+='<div class="wphead">周'+wk[i]+' <span class="wpdate">'+ds.slice(5)+'</span></div>';
    if(s){
      html+='<div class="wpbody"><div class="wptype">'+esc(s.type)+'</div><div class="wpmin">'+ (+s.minutes||0) +' 分</div>';
      if(done)html+='<div class="wpdone">✅ 已完成</div>';
      else if(s.skipped)html+='<div class="wpdone" style="color:var(--muted)">今天休息</div>';
      if(s.note)html+='<div class="wpnote">'+esc(s.note)+'</div>';
      html+='<div class="wpacts">';
      if(!done&&!s.skipped)html+='<button class="btn small primary" onclick="completePlan(\''+key+'\','+i+')">完成并记录</button>';
      if(!done&&s.skipped)html+='<button class="btn small" onclick="restorePlan(\''+key+'\','+i+')">恢复</button>';
      if(!done)html+='<button class="btn small quiet" onclick="reschedulePlan(\''+key+'\','+i+',1)">改明天</button>';
      html+='<button class="icon-btn" onclick="openPlanSlot(\''+key+'\','+i+')">✏️</button>';
      html+='<button class="icon-btn" onclick="delPlanSlot(\''+key+'\','+i+')">🗑️</button>';
      html+='</div></div>';
    }else{
      html+='<div class="wpempty"><button class="btn small" onclick="openPlanSlot(\''+key+'\','+i+')">＋ 计划</button></div>';
    }
    html+='</div>';
  });
  html+='</div></div>';
  return html;
}
function renderSportLog(){
  const logs=data.items.filter(i=>i.cat==='sport').sort((a,b)=>(b.due||'').localeCompare(a.due||''));
  let html='<div class="panel"><div class="sec-head"><h2>🏃 完成记录</h2><button class="btn primary" onclick="openForm(\'sport\')">＋ 记录运动</button></div>';
  if(!logs.length)html+='<div class="empty">还没有运动记录。完成周计划里的项目，或手动点「＋ 记录运动」。</div>';
  else html+='<div class="list">'+logs.map(i=>{
    const type=i.sportType||'运动';
    const generated=type+' · '+(i.due||'');
    const customTitle=i.title&&i.title!==generated&&i.title!==type?(' · '+esc(i.title)):'';
    const effort=i.effort?'<span class="tag">'+({light:'轻松',moderate:'刚好',hard:'吃力',max:'接近极限'}[i.effort]||esc(i.effort))+'</span>':'';
    return `<div class="item"><div class="body"><div class="title">${i.status==='done'?'✅ ':''}${esc(type)}${customTitle} <span class="tag" style="background:#8b5cf622;color:var(--sport)">${esc(i.due||'')}</span> <span class="tag" style="background:#8b5cf622;color:var(--sport)">${i.minutes||0} 分</span> ${effort} ${i.planDay!=null?'<span class="tag" style="background:#60a5fa22;color:#2563eb">计划内</span>':''}</div>${i.note?`<div class="meta"><span class="tag">${esc(i.note)}</span></div>`:''}</div><div class="acts"><button class="icon-btn" onclick="openForm('sport','${i.id}')">✏️</button><button class="icon-btn" onclick="del('${i.id}')">🗑️</button></div></div>`;
  }).join('')+'</div>';
  html+='</div>';
  return html;
}

/* ---------- 收支记录（金融模块） ---------- */
const FIN_TYPE={income:{name:'收入',color:'#10b981'},expense:{name:'支出',color:'#ef4444'}};
function finBadge(t){const s=FIN_TYPE[t]||FIN_TYPE.expense;return `<span class="pstatus" style="background:${s.color}22;color:${s.color}">${s.name}</span>`;}
function renderFinances(){
  const all=(data.finances||[]).filter(f=>kwOf((f.category||'')+' '+(f.note||'')));
  const fs=all.slice().sort((a,b)=>a.date.localeCompare(b.date));
  let inc=0,exp=0;fs.forEach(f=>{if(f.type==='income')inc+=+f.amount||0;else exp+=+f.amount||0;});
  const bal=inc-exp;
  let html='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>💵 收支记录</h2><div class="chips"><span class="ctab '+(finView==='month'?'on':'')+'" onclick="setFinView(\'month\')">按月</span><span class="ctab '+(finView==='year'?'on':'')+'" onclick="setFinView(\'year\')">按年</span></div><button class="btn" onclick="exportCSV()">⬇ CSV</button><button class="btn" onclick="setBudget()">⚙ 预算</button><button class="btn primary" onclick="openFinanceForm()">＋ 记一笔</button></div>';
  html+='<div class="grid cards" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">';
  html+=`<div class="card finance"><div class="t">总收入</div><div class="n" style="color:#10b981">${inc.toFixed(2)}</div><div class="d">收入合计(元)</div></div>`;
  html+=`<div class="card finance"><div class="t">总支出</div><div class="n" style="color:#ef4444">${exp.toFixed(2)}</div><div class="d">支出合计(元)</div></div>`;
  html+=`<div class="card finance"><div class="t">结余</div><div class="n" style="color:${bal>=0?'#10b981':'#ef4444'}">${bal>=0?'+':'-'}${Math.abs(bal).toFixed(2)}</div><div class="d">收入 − 支出(元)</div></div>`;
  const saveRate=inc>0?(bal/inc*100):0;
  html+=`<div class="card finance"><div class="t">储蓄率</div><div class="n" style="color:${saveRate>=20?'#10b981':saveRate>=0?'#f59e0b':'#ef4444'}">${saveRate.toFixed(1)}%</div><div class="d">结余 / 收入 · 建议 ≥20%</div></div>`;
  html+='</div>';
  if((data.finances||[]).some(f=>f.gen))html+='<div class="d" style="margin-top:8px">💡 含 <b>🔁 自动</b> 生成的计划收支（由「每月/每年」重复条目滚动展开，最多 18 个月 / 5 年）。</div>';
  html+=`<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>📊 收支趋势（${finView==='month'?'按月':'按年'}）</h2></div>`;
  html+=finAggChart(finView);
  const aggRows=finAggTable(finView);
  html+=`<div class="list">${aggRows}</div></div>`;
  // 分类汇总（环形图 + 占比）
  const catMap={};fs.forEach(f=>{const c=f.category||'其他';if(!catMap[c])catMap[c]={inc:0,exp:0};if(f.type==='income')catMap[c].inc+=+f.amount||0;else catMap[c].exp+=+f.amount||0;});
  const cats=Object.keys(catMap);
  if(cats.length){
    const expTotal=cats.reduce((s,c)=>s+catMap[c].exp,0)||1;
    const palette=['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#64748b','#f97316'];
    const sortedCats=cats.slice().sort((a,b)=>catMap[b].exp-catMap[a].exp);
    let acc=0;const R=26,C=2*Math.PI*R;
    const segs=sortedCats.map((c,idx)=>{const v=catMap[c].exp;if(v<=0)return '';const len=v/expTotal*C;const seg=`<circle r="${R}" cx="40" cy="40" fill="none" stroke="${palette[idx%palette.length]}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-acc}" transform="rotate(-90 40 40)"/>`;acc+=len;return seg;}).join('');
    html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>🏷️ 分类汇总</h2></div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">';
    if(expTotal>0)html+=`<svg width="80" height="80" style="flex:none">${segs}<circle r="${R}" cx="40" cy="40" fill="var(--panel)" /><text x="40" y="44" text-anchor="middle" font-size="11" fill="var(--muted)">支出</text></svg>`;
    html+='<div class="list" style="flex:1;min-width:200px">';
    sortedCats.forEach((c,idx)=>{
      const m=catMap[c];const col=palette[idx%palette.length];
      html+=`<div class="item"><div class="body"><div class="title"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};margin-right:6px;vertical-align:middle"></span>${esc(c)}${m.exp?(' · '+(m.exp/expTotal*100).toFixed(0)+'%'):''}</div><div class="meta">`;
      if(m.inc>0)html+=`<span class="tag" style="background:#10b98122;color:#10b981">收 ${m.inc.toFixed(0)}</span>`;
      if(m.exp>0)html+=`<span class="tag" style="background:#ef444422;color:#ef4444">支 ${m.exp.toFixed(0)}</span>`;
      html+='</div></div></div>';
    });
    html+='</div></div></div>';
  }
  // 月度预算
  if(data.monthlyBudget){
    const mNow=new Date().toISOString().slice(0,7);
    let mExp=0;fs.forEach(f=>{if(f.type==='expense'&&f.date&&f.date.slice(0,7)===mNow)mExp+=+f.amount||0;});
    const bud=+data.monthlyBudget;const pct=Math.min(100,Math.round(mExp/bud*100));const left=bud-mExp;
    html+=`<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>🎯 本月预算</h2></div>
      <div class="d">本月支出 ${mExp.toFixed(2)} / 预算 ${bud.toFixed(2)} 元 · 剩余 <b style="color:${left>=0?'#10b981':'#ef4444'}">${left.toFixed(2)}</b></div>
      <div class="bar"><i style="width:${pct}%;background:${left>=0?'var(--finance)':'#ef4444'}"></i></div></div>`;
  }
  html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>📋 收支明细</h2></div>';
  if(!fs.length)html+='<div class="empty">还没有收支记录，点「＋ 记一笔」记录工资、理财收益、开销等。</div>';
  else html+='<div class="list">'+fs.slice().reverse().map(f=>`<div class="item"><div class="body"><div class="title">${finBadge(f.type)} ${esc(f.category||'')} <span class="tag" style="background:#ec489922;color:var(--finance)">${f.date}</span> ${f.gen?'<span class="tag" style="background:#8b5cf622;color:#8b5cf6">🔁 自动</span>':''}<span class="tag" style="background:${f.type==='income'?'#10b981':'#ef4444'}22;color:${f.type==='income'?'#10b981':'#ef4444'}">${f.type==='income'?'+':'-'}${(+f.amount||0).toFixed(2)}</span></div>${f.note?`<div class="meta"><span class="tag">${esc(f.note)}</span></div>`:''}</div><div class="acts"><button class="icon-btn" onclick="openFinanceForm('${f.id}')">✏️</button><button class="icon-btn" onclick="delFinance('${f.id}')">🗑️</button></div></div>`).join('')+'</div>';
  html+='</div></div>';
  return html;
}
function setBudget(){const v=prompt('设置月度支出预算（元），留空可清除：',data.monthlyBudget||'');if(v===null)return;const n=parseFloat(v);data.monthlyBudget=(isNaN(n)||n<=0)?null:n;save();render();}
function setFinView(v){finView=v;render();}
/* 把「每月 / 每年」重复的收支模板展开为具体日期的记录（向上滚动生成未来发生，最多 18 个月 / 5 年） */
function expandFinanceRecur(){
  const planStates={};
  (data.finances||[]).forEach(f=>{if(f.gen&&f.tplId)planStates[f.tplId+'|'+f.date]=f.planState||'pending';});
  data.finances=(data.finances||[]).filter(f=>!f.gen);
  const now=new Date();const hor=new Date(now);hor.setFullYear(hor.getFullYear()+5);
  const horizonMonth=new Date(now);horizonMonth.setMonth(horizonMonth.getMonth()+18);
  (data.finances||[]).forEach(t=>{
    if(!t.recur||(t.recur!=='month'&&t.recur!=='year')||t.gen)return;
    const step=t.recur==='month'?1:12;
    const cap=t.recur==='month'?horizonMonth:hor;
    const bd=new Date(t.date+'T00:00:00');
    const y0=bd.getFullYear(), m0=bd.getMonth(), d0=bd.getDate();
    let n=1;
    while(true){
      const totM=m0+step*n;
      const yy=y0+Math.floor(totM/12), mm=totM%12;
      const dim=new Date(yy,mm+1,0).getDate();
      const dd=Math.min(d0,dim);
      const nd=new Date(yy,mm,dd);
      if(nd>cap)break;
      const ds=yy+'-'+String(mm+1).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
      data.finances.push({id:uid(),date:ds,type:t.type,category:t.category,amount:t.amount,note:(t.note||'')+' ·🔁',recur:t.recur,gen:true,tplId:t.id,rprojectId:t.rprojectId||'',travelId:t.travelId||'',planState:planStates[t.id+'|'+ds]||'pending'});
      n++;
    }
  });
}
function finAggChart(view){
  const fs=data.finances||[];
  if(!fs.length)return '';
  const map={};
  fs.forEach(f=>{const k=view==='year'?f.date.slice(0,4):f.date.slice(0,7);if(!map[k])map[k]={inc:0,exp:0};if(f.type==='income')map[k].inc+=+f.amount||0;else map[k].exp+=+f.amount||0;});
  let keys=Object.keys(map).sort();
  if(view==='month')keys=keys.slice(-12);
  if(!keys.length)return '';
  const W=580,H=170,padL=34,padR=12,padT=28,padB=26;
  const maxAll=Math.max(...keys.map(k=>Math.max(map[k].inc,map[k].exp)),1);
  const bw=(W-padL-padR)/keys.length;
  const y=v=>padT+(H-padT-padB)*(1-v/maxAll);
  let grid='';const lines=3;
  for(let g=0;g<=lines;g++){const gv=maxAll*g/lines,gy=y(gv);grid+=`<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/><text x="${padL-6}" y="${gy+4}" text-anchor="end" font-size="9" fill="var(--muted)">${gv.toFixed(0)}</text>`;}
  let bars='';
  keys.forEach((k,i)=>{
    const x0=padL+bw*i+bw*0.16, bw2=bw*0.62;
    const hi=Math.max(0,H-padB-y(map[k].inc)), he=Math.max(0,H-padB-y(map[k].exp));
    bars+=`<rect x="${x0.toFixed(1)}" y="${y(map[k].inc).toFixed(1)}" width="${bw2.toFixed(1)}" height="${hi.toFixed(1)}" rx="3" fill="#10b981" opacity="0.85"/>`;
    bars+=`<rect x="${(x0+bw2+3).toFixed(1)}" y="${y(map[k].exp).toFixed(1)}" width="${bw2.toFixed(1)}" height="${he.toFixed(1)}" rx="3" fill="#ef4444" opacity="0.85"/>`;
    const lbl=view==='year'?k:k.slice(2);
    bars+=`<text x="${(padL+bw*i+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="var(--muted)">${lbl}</text>`;
  });
  return `<div style="margin-top:14px;overflow:hidden;border-radius:12px;background:var(--panel-2);padding:10px 6px 4px"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="收支趋势"><rect x="14" y="8" width="10" height="10" rx="2" fill="#10b981"/><text x="28" y="17" font-size="10" fill="var(--muted)">收入</text><rect x="74" y="8" width="10" height="10" rx="2" fill="#ef4444"/><text x="88" y="17" font-size="10" fill="var(--muted)">支出</text>${grid}${bars}</svg></div>`;
}
function finAggTable(view){
  const fs=data.finances||[];
  const map={};
  fs.forEach(f=>{const k=view==='year'?f.date.slice(0,4):f.date.slice(0,7);if(!map[k])map[k]={inc:0,exp:0};if(f.type==='income')map[k].inc+=+f.amount||0;else map[k].exp+=+f.amount||0;});
  let keys=Object.keys(map).sort();
  if(view==='month')keys=keys.slice(-12);
  if(!keys.length)return '';
  return keys.slice().reverse().map(k=>{const m=map[k];const bal=m.inc-m.exp;return `<div class="item"><div class="body"><div class="title">${k}</div><div class="meta"><span class="tag" style="background:#10b98122;color:#10b981">收 ${m.inc.toFixed(0)}</span><span class="tag" style="background:#ef444422;color:#ef4444">支 ${m.exp.toFixed(0)}</span><span class="tag" style="background:${bal>=0?'#10b98122':'#ef444422'};color:${bal>=0?'#10b981':'#ef4444'}">结余 ${bal>=0?'+':''}${bal.toFixed(0)}</span></div></div></div>`;}).join('');
}
function openFinanceForm(id,ds,presetType){
  editingFinance=id||null;
  document.getElementById('finTitle').textContent=id?'编辑收支记录':'记一笔收支';
  const f=id?data.finances.find(x=>x.id===id):null;
  document.getElementById('fn_date').value=f?f.date:(ds||todayStr());
  document.getElementById('fn_type').value=f?f.type:(presetType||'expense');
  document.getElementById('fn_category').value=f?f.category:'';
  document.getElementById('fn_amount').value=f?f.amount:'';
  document.getElementById('fn_note').value=f?f.note:'';
  document.getElementById('fn_recur').value=f?(f.recur||'none'):'none';
  populateProjectSelect('fn_rproject', f ? f.rprojectId : '');
  populateTravelSelect('fn_travel', f ? f.travelId : '');
  document.getElementById('financeMask').classList.add('show');
  document.getElementById('fn_amount').focus();
}
function closeFinance(){document.getElementById('financeMask').classList.remove('show');editingFinance=null;}
function submitFinance(){
  const date=document.getElementById('fn_date').value;
  const type=document.getElementById('fn_type').value;
  const amount=document.getElementById('fn_amount').value;
  if(!date||!amount){alert('请填写日期和金额');return;}
  const recur=document.getElementById('fn_recur').value;
  const obj={date,type,category:document.getElementById('fn_category').value.trim(),amount:+amount,note:document.getElementById('fn_note').value.trim(),recur:recur==='none'?'':recur,rprojectId:(document.getElementById('fn_rproject')||{}).value || '',travelId:(document.getElementById('fn_travel')||{}).value || ''};
  if(editingFinance){const f=data.finances.find(x=>x.id===editingFinance);Object.assign(f,obj);}
  else data.finances.push(Object.assign({id:uid()},obj));
  expandFinanceRecur();save();closeFinance();render();
}
function delFinance(id){
  if(!confirm('删除这条收支记录？'))return;
  const t=data.finances.find(x=>x.id===id);
  if(t&&t.recur&&t.recur!=='none'&&!t.gen)data.finances=data.finances.filter(x=>x.id!==id&&x.tplId!==id);
  else data.finances=data.finances.filter(x=>x.id!==id);
  save();render();
}

function renderCalendar(scope){
  const cm=getCalMonth(scope);
  const y=+cm.slice(0,4),m=+cm.slice(5,7)-1;
  const first=new Date(y,m,1);const startDow=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=days;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);
  let html='<div class="cal-head"><button class="btn" onclick="calShift(\''+scope+'\',-1)">‹</button><b>'+y+'年 '+(m+1)+'月</b><button class="btn" onclick="calShift(\''+scope+'\',1)">›</button><button class="btn" onclick="calReset(\''+scope+'\')">今天</button>';
  if(currentCat==='calendar'){
    html+='<span class="spacer"></span><div class="chips">';
    html+='<span class="ctab '+(calScope==='all'?'on':'')+'" onclick="setCalScope(\'all\')">全部</span>';
    for(const c in CATS)html+='<span class="ctab '+(calScope===c?'on':'')+'" onclick="setCalScope(\''+c+'\')">'+CATS[c].name+'</span>';
    html+='</div>';
  }
  html+='</div><div class="cal">';
  ['一','二','三','四','五','六','日'].forEach(d=>html+='<div class="dow">'+d+'</div>');
  const today=todayStr();
  cells.forEach(d=>{
    if(d===null){html+='<div class="cell muted"></div>';return;}
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let its=data.items.filter(i=>i.due===ds&&(scope==='all'||i.cat===scope));
    if(scope==='finance'){
      const fr=[];(data.funds||[]).forEach(f=>(f.records||[]).forEach(r=>{if(r.date===ds)fr.push({cat:'finance',title:f.name+' 净值 '+r.nav});}));
      (data.finances||[]).forEach(f=>{if(f.date===ds)fr.push({cat:'finance',title:(f.type==='income'?'💚 ':'💸 ')+(f.category||'收支')+' '+(f.type==='income'?'+':'-')+(+f.amount||0)});});
      its=its.concat(fr);
    }
    if(scope==='sport'){
      (data.weights||[]).forEach(w=>{if(w.date===ds)its.push({cat:'sport',title:'⚖️ '+w.weight+'kg'});});
      const pkey=mondayOf(ds); const pdi=(new Date(ds+'T00:00:00').getDay()+6)%7; const ps=weekPlanSlots(pkey)[pdi];
      if(ps)its.push({cat:'sport',plan:true,title:'📋 '+ps.type+' '+(ps.minutes||0)+'分'});
    }
    if(scope==='all'||scope==='life')its=its.concat(anniversaryItemsFor(ds)).concat(travelItemsFor(ds));
    if(scope==='research'||scope==='all'){
      (data.papers||[]).forEach(function(p){
        if(p.rebuttalDue && p.rebuttalDue===ds) its.push({cat:'research', title:'📬 Rebuttal: '+p.title, isDeadline:true});
      });
      (data.patents||[]).forEach(function(p){
        if(p.feeDue && p.feeDue===ds) its.push({cat:'research', title:'💳 年费: '+p.title, isDeadline:true});
      });
    }
    const isToday=ds===today;
    const hl=holidayOf(+y,+m+1,d);
    let chips='';its.slice(0,4).forEach(i=>{const col=i.plan?'#60a5fa':(i.isAnniv?i.color:(i.isTravel?'#f59e0b':(CATS[i.cat]?CATS[i.cat].color:'var(--finance)')));chips+='<div class="chip" style="background:'+col+'" title="'+esc(i.title)+'"></div>';});
    if(its.length>4)chips+='<div class="more">+'+(its.length-4)+'</div>';
    html+='<div class="cell '+(isToday?'today':'')+'" onclick="openDay(\''+ds+'\',\''+scope+'\')"><div class="dn">'+d+(its.length?' · '+its.length:'')+(hl?' <span class="holi">'+hl+'</span>':'')+'</div>'+chips+'</div>';
  });
  html+='</div>';
  return html;
}
function setCalView(v){calView=v;if(v!=='month')calAnchor=todayStr();render();}
function calNav(dir){let d=new Date(calAnchor);if(calView==='week')d.setDate(d.getDate()+dir*7);else d.setMonth(d.getMonth()+dir);calAnchor=d.toISOString().slice(0,10);render();}
function calReset2(){calAnchor=todayStr();render();}
function dayCompact(ds,sc){
  let h='';
  (data.items||[]).filter(i=>i.due===ds&&(sc==='all'||i.cat===sc)).forEach(i=>{h+='<div class="witem" style="border-left-color:'+CATS[i.cat].color+'"><span class="wt">'+esc(i.title)+'</span></div>';});
  if(sc==='finance'||sc==='all')(data.finances||[]).filter(f=>f.date===ds).forEach(f=>{h+='<div class="witem" style="border-left-color:#ec4899">'+finBadge(f.type)+' '+esc(f.category||'')+' '+(f.type==='income'?'+':'-')+(+f.amount||0)+'</div>';});
  if(sc==='sport'||sc==='all'){
    const pkey=mondayOf(ds); const pdi=(new Date(ds+'T00:00:00').getDay()+6)%7; const ps=weekPlanSlots(pkey)[pdi];
    if(ps)h+='<div class="witem" style="border-left-color:#60a5fa">📋 计划 '+esc(ps.type)+' '+(ps.minutes||0)+'分</div>';
    (data.weights||[]).filter(w=>w.date===ds).forEach(w=>{h+='<div class="witem" style="border-left-color:#8b5cf6">⚖️ '+w.weight+'kg</div>';});
  }
  if(sc==='all')(data.anniversaries||[]).forEach(a=>{if(a.date&&ds.slice(5)===a.date){const t=ANNIV_TYPE[a.type]||ANNIV_TYPE.birthday;h+='<div class="witem" style="border-left-color:'+t.color+'">'+t.emoji+' '+esc(a.name)+'</div>';}});
  if(sc==='all'||sc==='life')(data.travels||[]).forEach(t=>{if(t.start&&t.end&&ds>=t.start&&ds<=t.end)h+='<div class="witem" style="border-left-color:#f59e0b">🧳 '+esc(t.title)+'</div>';});
  if(sc==='research'||sc==='all'){
    (data.papers||[]).filter(function(p){return p.rebuttalDue===ds;}).forEach(function(p){
      h+='<div class="witem" style="border-left-color:#ef4444">📬 Rebuttal: '+esc(p.title)+'</div>';
    });
    (data.patents||[]).filter(function(p){return p.feeDue===ds;}).forEach(function(p){
      h+='<div class="witem" style="border-left-color:#f59e0b">💳 年费: '+esc(p.title)+'</div>';
    });
  }
  return h;
}
function renderWeek(sc){
  let d=new Date(calAnchor);const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);
  const days=[];for(let i=0;i<7;i++){const x=new Date(d);x.setDate(d.getDate()+i);days.push(x.toISOString().slice(0,10));}
  const wk=['一','二','三','四','五','六','日'];
  let html='<div class="cal-head"><button class="btn" onclick="calNav(-1)">‹</button><b>'+days[0].slice(5)+' ~ '+days[6].slice(5)+'</b><button class="btn" onclick="calNav(1)">›</button><button class="btn" onclick="calReset2()">今天</button></div><div class="week">';
  days.forEach((ds,i)=>{const its=dayCompact(ds,sc);const todayc=ds===todayStr();html+='<div class="wcol"><div class="whead '+(todayc?'today':'')+'">周'+wk[i]+' '+ds.slice(5)+'</div>'+(its||'<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">—</div>')+'</div>';});
  html+='</div>';
  return html;
}
function renderAgenda(sc){
  let html='<div class="cal-head"><button class="btn" onclick="calNav(-1)">‹</button><b>'+calAnchor.slice(0,7)+' 起 · 日程</b><button class="btn" onclick="calNav(1)">›</button><button class="btn" onclick="calReset2()">今天</button></div><div class="agenda">';
  let d=new Date(calAnchor);let count=0;
  for(let k=0;k<62&&count<25;k++){const ds=d.toISOString().slice(0,10);const its=dayCompact(ds,sc);if(its){const todayc=ds===todayStr();html+='<div class="aday"><div class="adate '+(todayc?'today':'')+'">'+ds+(todayc?' · 今天':'')+'</div>'+its+'</div>';count++;}d.setDate(d.getDate()+1);}
  if(count===0)html+='<div class="empty">这段时间没有安排</div>';
  html+='</div>';
  return html;
}
function openDay(ds,scope){
  daySel=ds;
  if(scope==='finance'){
    const recs=[];(data.funds||[]).forEach(f=>(f.records||[]).forEach(r=>{if(r.date===ds)recs.push({f,r});}));
    let html='<h3>'+ds+' 净值记录（'+recs.length+'）</h3><div class="list">';
    if(!recs.length)html+='<div class="empty">这天还没记净值</div>';
    else recs.forEach(o=>html+=`<div class="item"><div class="body"><div class="title">${esc(o.f.name)} <span class="tag" style="background:#ec489922;color:var(--finance)">${esc(o.f.code||'—')}</span></div><div class="meta"><span class="tag" style="background:#ec489922;color:var(--finance)">净值 ${o.r.nav}</span></div></div></div>`);
    html+='</div>';
    const fins=(data.finances||[]).filter(f=>f.date===ds);
    if(fins.length){
      html+='<h3 style="margin-top:12px;color:#ec4899">💵 收支（'+fins.length+'）</h3><div class="list">';
      fins.forEach(f=>{const col=f.type==='income'?'#10b981':'#ef4444';html+='<div class="item"><div class="body"><div class="title">'+finBadge(f.type)+' '+esc(f.category||'')+' <span class="tag" style="background:'+col+'22;color:'+col+'">'+(f.type==='income'?'+':'-')+(+f.amount||0)+'</span></div></div></div>';});
      html+='</div>';
    }
    if((data.funds||[]).length){
      html+='<div style="margin-top:12px"><b style="font-size:13px;color:var(--muted)">快速记净值：</b><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
      (data.funds||[]).forEach(f=>{html+='<button class="btn" onclick="closeDay();openNavForm(\''+f.id+'\',\''+ds+'\')">'+esc(f.name)+'</button>';});
      html+='</div></div>';
    }
    html+='<div class="modal-acts"><button class="btn" onclick="closeDay()">关闭</button><button class="btn" onclick="closeDay();openFinanceForm(null,\''+ds+'\')">＋ 记一笔</button></div>';
    document.getElementById('dayBody').innerHTML=html;
    document.getElementById('dayMask').classList.add('show');
    return;
  }
  if(scope==='research'||scope==='all'){
    var rebPapers=(data.papers||[]).filter(function(p){return p.rebuttalDue===ds;});
    var feePats=(data.patents||[]).filter(function(p){return p.feeDue===ds;});
    if(rebPapers.length||feePats.length){
      html+='<div style="margin-bottom:14px"><h3 style="color:#ef4444">⏰ 科研截止日</h3><div class="list">';
      rebPapers.forEach(function(p){
        html+='<div class="item"><div class="body"><div class="title">📬 '+esc(p.title)+' <span class="tag" style="background:#ef444422;color:#ef4444">Rebuttal 截止</span></div><div class="meta">'+esc(p.journal||'')+'</div></div></div>';
      });
      feePats.forEach(function(p){
        html+='<div class="item"><div class="body"><div class="title">💳 '+esc(p.title)+' <span class="tag" style="background:#f59e0b22;color:#f59e0b">年费截止</span></div><div class="meta">专利号: '+(p.number||'—')+'</div></div></div>';
      });
      html+='</div></div>';
    }
  }
  const its=data.items.filter(i=>i.due===ds&&(scope==='all'||i.cat===scope))
    .sort((a,b)=>{const o={todo:0,doing:1,done:2};return o[a.status]-o[b.status];});
  const anns=(scope==='all'||scope==='life')?anniversaryItemsFor(ds):[];
  const trvs=(scope==='all'||scope==='life')?travelItemsFor(ds):[];
  let html='';
  if(anns.length||trvs.length){
    html+='<div style="margin-bottom:14px">';
    if(anns.length){
      html+='<h3 style="color:#fb7185">🎉 纪念日 / 生日</h3><div class="list">';
      anns.forEach(a=>{const t=ANNIV_TYPE[a.type]||ANNIV_TYPE.birthday;html+='<div class="item"><div class="body"><div class="title">'+esc(a.name)+' <span class="tag" style="background:'+t.color+'22;color:'+t.color+'">'+t.emoji+t.name+'</span></div></div></div>';});
      html+='</div>';
    }
    if(trvs.length){
      html+='<h3 style="margin-top:10px;color:#f59e0b">🧳 进行中的出行</h3><div class="list">';
      trvs.forEach(t=>{html+='<div class="item"><div class="body"><div class="title">'+esc(t.name)+' <span class="tag" style="background:#f59e0b22;color:#f59e0b">出行</span></div></div></div>';});
      html+='</div>';
    }
    html+='</div>';
  }
  if(scope==='sport'){
    const pkey=mondayOf(ds); const pdi=(new Date(ds+'T00:00:00').getDay()+6)%7; const ps=weekPlanSlots(pkey)[pdi];
    if(ps){
      const done=planDone(pkey,pdi);
      html+='<h3 style="margin-top:12px;color:#2563eb">📋 今日计划：'+esc(ps.type)+' '+(ps.minutes||0)+' 分 '+(done?'<span class="tag" style="background:#10b98122;color:#10b981">✅ 已完成</span>':'<button class="btn small primary" onclick="closeDay();completePlan(\''+pkey+'\','+pdi+')">✅ 完成</button>')+'</h3>';
    }
    const ws=(data.weights||[]).filter(w=>w.date===ds);
    if(ws.length){
      html+='<h3 style="margin-top:12px;color:#8b5cf6">⚖️ 体重（'+ws.length+'）</h3><div class="list">';
      ws.forEach(w=>{html+='<div class="item"><div class="body"><div class="title">'+esc(w.weight)+' kg <span class="tag" style="background:#8b5cf622;color:var(--sport)">'+esc(w.date)+'</span></div></div></div>';});
      html+='</div>';
    }
  }
  html+='<h3>'+ds+' 的日程（'+its.length+'）</h3><div class="list">';
  if(!its.length&&!anns.length&&!trvs.length&&!(scope==='sport'&&(data.weights||[]).some(w=>w.date===ds)))html+='<div class="empty">这天还没有安排</div>';
  else its.forEach(i=>html+=itemHTML(i));
  let acts='<button class="btn" onclick="closeDay()">关闭</button>';
  if(scope==='sport')acts+='<button class="btn" onclick="closeDay();openWeightForm(null,\''+ds+'\')">⚖️ 记体重</button>';
  acts+='<button class="btn primary" onclick="closeDay();openForm(\''+(scope==='all'?'work':scope)+'\',null,\''+ds+'\')">＋ 新建</button>';
  html+='</div><div class="modal-acts">'+acts+'</div>';
  document.getElementById('dayBody').innerHTML=html;
  document.getElementById('dayMask').classList.add('show');
}
function closeDay(){document.getElementById('dayMask').classList.remove('show');daySel=null;}

/* ---------- item form ---------- */
function newItem(){
  if(currentCat==='finance'){openFundForm();return;}
  if(currentCat==='habit'){openHabitForm();return;}
  const generic=['overview','review','news','more'];
  const c=currentCat==='calendar' ? (calScope==='all'?'work':calScope) : (generic.includes(currentCat)?'work':currentCat);
  openForm(c);
}
function openForm(cat,id,due,projectId){
  cat=(cat&&CATS[cat])?cat:'work';
  const isSport=cat==='sport';
  editingId=id||null;
  editingCat=cat;
  pendingPlan=null;
  document.getElementById('formTitle').textContent=isSport?(id?'编辑运动记录':'记录一次运动'):(id?'编辑事项':'新建 · '+CATS[cat].name);
  document.getElementById('f_sport_box').style.display=isSport?'block':'none';
  document.getElementById('f_title_label').textContent=isSport?'记录名称（可选）':'标题 *';
  document.getElementById('f_title').placeholder=isSport?'留空则自动使用运动类型':'例如：精读 CVPR2026 某论文 / 提交季度研发报告';
  document.getElementById('f_status_box').style.display=isSport?'none':'flex';
  document.getElementById('f_recur_box').style.display=isSport?'none':'block';
  document.getElementById('f_tags_box').style.display=isSport?'none':'block';
  const isWork=cat==='work';
  document.getElementById('f_proj_box').style.display=isWork?'block':'none';
  document.getElementById('f_mile_box').style.display=isWork?'block':'none';
  document.getElementById('f_hw_box').style.display=isWork?'block':'none';
  const i=id?data.items.find(x=>x.id===id):null;
  document.getElementById('f_title').value=i?i.title:'';
  document.getElementById('f_note').value=i?i.note:'';
  document.getElementById('f_status').value=isSport?'done':(i?i.status:'todo');
  document.getElementById('f_prio').value=i?i.prio:'mid';
  document.getElementById('f_due').value=due||(i?i.due:(isSport?todayStr():''));
  document.getElementById('f_sportType').value=i?i.sportType:'跑步';
  document.getElementById('f_minutes').value=i?i.minutes:'';
  document.getElementById('f_effort').value=i?(i.effort||''):'';
  const sel=document.getElementById('f_project');
  sel.innerHTML='<option value="">（无项目）</option>'+data.projects.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  sel.value=i?i.projectId:(projectId||'');
  document.getElementById('f_milestone').checked=i?!!i.isMilestone:false;
  document.getElementById('f_est').value=i?i.estH:'';
  document.getElementById('f_actual').value=i?i.actH:'';
  document.getElementById('f_recur').value=i?i.recur:'none';
  document.getElementById('f_tags').value=i?(i.tags||[]).join(', '):'';
  document.getElementById('mask').classList.add('show');
  (isSport?document.getElementById('f_minutes'):document.getElementById('f_title')).focus();
}
function closeForm(){document.getElementById('mask').classList.remove('show');editingId=null;editingCat=null;}
function submitForm(){
  const cat=(editingCat&&CATS[editingCat])?editingCat:'work';
  let title=document.getElementById('f_title').value.trim();
  if(cat==='sport'&&!title){
    const sportType=document.getElementById('f_sportType').value||'运动';
    title=sportType+' · '+(document.getElementById('f_due').value||todayStr());
  }
  if(!title){alert('请填写标题');return;}
  if(cat==='sport'&&(!document.getElementById('f_due').value||+document.getElementById('f_minutes').value<=0)){
    alert('请填写运动日期和时长');return;
  }
  const tagsRaw=document.getElementById('f_tags').value.trim();
  const obj={title,note:document.getElementById('f_note').value.trim(),
    status:document.getElementById('f_status').value,prio:document.getElementById('f_prio').value,
    due:document.getElementById('f_due').value,
    tags:tagsRaw?tagsRaw.split(/[,，\s]+/).filter(Boolean):[]};
  if(obj.status==='done'){const ex=editingId?(data.items.find(x=>x.id===editingId)||{}).completedAt:null;obj.completedAt=ex||todayStr();}else obj.completedAt=null;
  if(cat==='sport'){
    obj.sportType=document.getElementById('f_sportType').value;
    obj.minutes=+document.getElementById('f_minutes').value;
    obj.effort=document.getElementById('f_effort').value||undefined;
    obj.status='done';
    if(pendingPlan){obj.planKey=pendingPlan.key;obj.planDay=pendingPlan.dayIdx;obj.status='done';}
  }
  if(cat==='work'){
    const pv=document.getElementById('f_project').value;
    obj.projectId=pv||undefined;
    obj.isMilestone=document.getElementById('f_milestone').checked;
    obj.estH=document.getElementById('f_est').value?+document.getElementById('f_est').value:undefined;
    obj.actH=document.getElementById('f_actual').value?+document.getElementById('f_actual').value:undefined;
  }
  obj.recur=document.getElementById('f_recur').value||'none';
  if(editingId){const it=data.items.find(x=>x.id===editingId);Object.assign(it,obj);}
  else data.items.push(Object.assign({id:uid(),cat:cat,created:todayStr()},obj));
  pendingPlan=null;
  save();closeForm();render();
}

/* ---------- project form ---------- */
function openProjectForm(id){
  editingProj=id||null;
  document.getElementById('projTitle').textContent=id?'编辑项目':'新项目';
  const p=id?data.projects.find(x=>x.id===id):null;
  document.getElementById('p_name').value=p?p.name:'';
  document.getElementById('p_desc').value=p?p.desc:'';
  document.getElementById('p_status').value=p?p.status:'active';
  document.getElementById('projMask').classList.add('show');
  document.getElementById('p_name').focus();
}
function closeProject(){document.getElementById('projMask').classList.remove('show');editingProj=null;}
function submitProject(){
  const name=document.getElementById('p_name').value.trim();
  if(!name){alert('请填写项目名称');return;}
  const obj={name,desc:document.getElementById('p_desc').value.trim(),status:document.getElementById('p_status').value};
  if(editingProj){const p=data.projects.find(x=>x.id===editingProj);Object.assign(p,obj);}
  else data.projects.push(Object.assign({id:uid(),created:todayStr()},obj));
  save();closeProject();render();
}
function delProject(id){
  if(confirm('删除项目？其下任务和里程碑会保留，但不再关联项目。')){
    data.projects=data.projects.filter(x=>x.id!==id);
    data.items.forEach(i=>{if(i.projectId===id)delete i.projectId;});
    save();render();
  }
}

/* ---------- ops ---------- */
function toggle(id){const i=data.items.find(x=>x.id===id);if(i){const was=i.status;i.status=i.status==='done'?'todo':'done';if(i.status==='done'){i.completedAt=todayStr();if(was!=='done')genRecur(i);}else{i.completedAt=null;}save();render();}}
function genRecur(i){
  if(!i||!i.recur||i.recur==='none')return;
  const step=i.recur==='daily'?1:i.recur==='weekly'?7:30;
  const base=i.due||todayStr();let nd=new Date(base);nd.setDate(nd.getDate()+step);
  const ndue=nd.toISOString().slice(0,10);
  data.items.push(Object.assign({},i,{id:uid(),due:ndue,status:'todo',created:todayStr(),recur:i.recur}));
}
function del(id){if(confirm('确定删除这条记录？')){data.items=data.items.filter(x=>x.id!==id);save();render();}}
/* ================= 新闻看板（纯前端 · 反信息茧房） ================= */
const NEWS_CATS=['all','微博','知乎','抖音','百度','B站','豆瓣','GitHub','HackerNews','Dev.to','36氪','IT之家','掘金','少数派','微信读书'];
const NEWS_CAT_COLOR={'微博':'#e6162d','知乎':'#0084ff','抖音':'#fe2c55','百度':'#2932e1','B站':'#fb7299','豆瓣':'#007722','GitHub':'#24292f','HackerNews':'#ff6600','Dev.to':'#5ec27e','36氪':'#ff7a00','IT之家':'#e60012','掘金':'#1e80ff','少数派':'#1a1a1a','微信读书':'#2db7a0'};
const NEWS_CAT_ICON={'微博':'🔥','知乎':'💡','抖音':'🎵','百度':'🔍','B站':'📺','豆瓣':'🌱','GitHub':'🐙','HackerNews':'🟠','Dev.to':'❤️','36氪':'🚀','IT之家':'💻','掘金':'⛏️','少数派':'✏️','微信读书':'📚'};
// 公共 DailyHot 镜像候选（多数自带 CORS 头，浏览器按可达性自动选用其一）
const HOT_MIRRORS=[
  'https://api-hot.efefee.cn',
  'https://hot.efefee.cn',
  'https://hotapi.ff.ci',
  'https://api.iamlv.com',
  'https://dailyhot.duanjiaoyu.com'
];
// 公共 DailyHot 镜像候选（多数自带 CORS 头，浏览器按可达性自动选用其一）；微博/知乎/抖音优先 60s 稳源
const NEWS_KEY='workbench_news_feeds_v1';
const NEWS_CACHE_KEY='workbench_news_cache_v1';
const NEWS_STATE_KEY='workbench_news_state_v1';
const DEFAULT_FEEDS=[
  // —— 国内热搜（60s 稳源优先，镜像兜底）——
  {id:'hot_weibo',name:'微博热搜',urls:['https://60s.viki.moe/v2/weibo'].concat(HOT_MIRRORS.map(m=>m+'/weibo')),cat:'微博',type:'hot'},
  {id:'hot_zhihu',name:'知乎热榜',urls:['https://60s.viki.moe/v2/zhihu'].concat(HOT_MIRRORS.map(m=>m+'/zhihu')),cat:'知乎',type:'hot'},
  {id:'hot_douyin',name:'抖音热点',urls:['https://60s.viki.moe/v2/douyin'].concat(HOT_MIRRORS.map(m=>m+'/douyin')),cat:'抖音',type:'hot'},
  {id:'hot_baidu',name:'百度热搜',urls:HOT_MIRRORS.map(m=>m+'/baidu'),cat:'百度',type:'hot'},
  {id:'hot_bili',name:'哔哩哔哩',urls:HOT_MIRRORS.map(m=>m+'/bilibili'),cat:'B站',type:'hot'},
  {id:'hot_douban',name:'豆瓣热榜',urls:HOT_MIRRORS.map(m=>m+'/douban'),cat:'豆瓣',type:'hot'},
  // —— 科技/国际热点（官方自带 CORS，纯前端直连，无需镜像）——
  {id:'hot_github',name:'GitHub 趋势',urls:['https://api.github.com/search/repositories?q=stars:%3E50000&sort=stars&order=desc&per_page=25'],cat:'GitHub',type:'hot',fmt:'github'},
  {id:'hot_hn',name:'Hacker News',urls:['https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25'],cat:'HackerNews',type:'hot',fmt:'hn'},
  {id:'hot_devto',name:'Dev.to',urls:['https://dev.to/api/articles?top=1&per_page=25'],cat:'Dev.to',type:'hot',fmt:'devto'},
  // —— 科技阅读（镜像兜底，可能随镜像可用性波动）——
  {id:'hot_36kr',name:'36氪',urls:HOT_MIRRORS.map(m=>m+'/36kr'),cat:'36氪',type:'hot'},
  {id:'hot_ithome',name:'IT之家',urls:HOT_MIRRORS.map(m=>m+'/ithome'),cat:'IT之家',type:'hot'},
  {id:'hot_juejin',name:'掘金',urls:HOT_MIRRORS.map(m=>m+'/juejin'),cat:'掘金',type:'hot'},
  {id:'hot_sspai',name:'少数派',urls:HOT_MIRRORS.map(m=>m+'/sspai'),cat:'少数派',type:'hot'},
  {id:'hot_weread',name:'微信读书',urls:HOT_MIRRORS.map(m=>m+'/weread'),cat:'微信读书',type:'hot'}
];
const NEWS_PROXY_DEFAULTS=[
  u=>'https://corsproxy.io/?url='+encodeURIComponent(u),
  u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
  u=>'https://api.codetabs.com/v1/proxy/?quest='+encodeURIComponent(u),
  u=>'https://thingproxy.freeboard.io/fetch/'+u
];

/* ============ 热榜 MOCK 演示模式 ============
   截图/演示用开关：true=使用演示数据（不联网、无真实新闻），false=拉取真实接口。
   改完截图后把这里改回 false 即可恢复真实热榜。 */
const NEWS_MOCK = false;
// 演示模式下的「中性分类」——避免截图露出真实平台名（微博/知乎/抖音等）触发审核
const NEWS_MOCK_CATS=['all','技术动态','学术资讯','效率工具','设计灵感','生活方式'];
const NEWS_MOCK_CAT_COLOR={'技术动态':'#6366f1','学术资讯':'#0ea5e9','效率工具':'#10b981','设计灵感':'#ec4899','生活方式':'#f59e0b'};
const NEWS_MOCK_CAT_ICON={'技术动态':'💻','学术资讯':'📚','效率工具':'⚡','设计灵感':'🎨','生活方式':'🌿'};
function newsCats(){return NEWS_MOCK?NEWS_MOCK_CATS:NEWS_CATS;}
function newsCol(c){return (NEWS_MOCK?NEWS_MOCK_CAT_COLOR:NEWS_CAT_COLOR)[c]||'#6366f1';}
function newsIc(c){return (NEWS_MOCK?NEWS_MOCK_CAT_ICON:NEWS_CAT_ICON)[c]||'🔥';}
function newsGroupCats(){return NEWS_MOCK?NEWS_MOCK_CATS.slice(1):[...new Set(newsFeeds.filter(f=>f.enabled!==false).map(f=>f.cat))];}
if(NEWS_MOCK){const _t=document.querySelector('#nav .tab[data-cat="news"]');if(_t){const _n=_t.childNodes[_t.childNodes.length-1];if(_n&&_n.nodeType===3)_n.nodeValue='信息面板';}}
function buildMockNews(){
  // 演示标题均为安全的技术/学习/效率类内容，不掺杂任何真实新闻与社会事件
  const MOCK_TITLES = {
    '技术动态':['纯前端实现信息面板的小思路','用本地存储做数据持久化','前端工程化实践小结','一个轻量任务管理库推荐','如何用快捷键提升操作效率'],
    '学术资讯':['如何高效做文献管理','论文阅读笔记的三种方法','顶会投稿时间节点整理','用卡片法沉淀研究想法','学术写作的提纲技巧'],
    '效率工具':['把信息源收拢到一个页面','我的数字生活工作流','用快捷指令偷懒的小技巧','本地优先的笔记工具推荐','每日复盘的模板分享'],
    '设计灵感':['极简界面的配色思路','信息密度与留白的平衡','卡片式布局的设计要点','如何用图标提升可读性','暗色模式配色实践'],
    '生活方式':['城市漫步路线分享','碎片时间读完一本书','睡前放松的 5 个习惯','极简生活，从整理开始','通勤路上能做的 10 件小事']
  };
  const items=[];let i=0;
  Object.keys(MOCK_TITLES).forEach(cat=>{
    (MOCK_TITLES[cat]||[]).forEach((t,idx)=>{
      items.push({title:t,link:'#',date:Date.now()-(i++)*1000,desc:'#'+(idx+1)+(idx%3===0?' · 🔥'+((idx+1)*1280):''),cat:cat});
    });
  });
  return items;
}

const NEWS_PROXY_KEY='workbench_news_proxy_v1';
function getNewsProxy(){try{return (localStorage.getItem(NEWS_PROXY_KEY)||'').trim();}catch(e){return '';}}
function newsProxyList(){
  const user=getNewsProxy();
  const list=NEWS_PROXY_DEFAULTS.slice();
  if(user){
    const p=user.replace(/\s+$/,'');
    list.unshift(p.endsWith('/')?t=>p+t:p+encodeURIComponent(t));
  }
  return list;
}
function loadNewsCfg(){try{const s=localStorage.getItem(NEWS_KEY);if(s){const a=JSON.parse(s);if(Array.isArray(a)&&a.length)newsFeeds=a;else newsFeeds=DEFAULT_FEEDS.slice();}else newsFeeds=DEFAULT_FEEDS.slice();}catch(e){newsFeeds=DEFAULT_FEEDS.slice();}
  // 一次性迁移：只保留各平台热榜聚合，移除所有旧的 RSS 新闻源；仅执行一次，之后用户可自由增删
  try{
    if(!localStorage.getItem('workbench_news_platonly_v1')){
      // 保留用户自定义的热榜源(type==='hot')，其余 RSS 源全部移除，并确保默认 4 平台在列
      const kept=newsFeeds.filter(f=>f.type==='hot');
      const ids=new Set(kept.map(f=>f.id));
      const merged=DEFAULT_FEEDS.filter(f=>!ids.has(f.id)).concat(kept);
      newsFeeds=merged.length?merged:DEFAULT_FEEDS.slice();
      saveNewsCfg();
      localStorage.setItem('workbench_news_platonly_v1','1');
    }
  }catch(e){newsFeeds=DEFAULT_FEEDS.slice();}
  // 一次性迁移 v2：注入新增平台热榜（百度/B站/豆瓣/GitHub/36氪/IT之家/知乎日报/少数派），仅执行一次，不影响用户已删的原平台
  try{
    if(!localStorage.getItem('workbench_news_platonly_v2')){
      const NEWIDS=new Set(['hot_baidu','hot_bili','hot_douban','hot_github','hot_36kr','hot_ithome','hot_zhihu_daily','hot_sspai']);
      const ids=new Set(newsFeeds.map(f=>f.id));
      const add=DEFAULT_FEEDS.filter(f=>NEWIDS.has(f.id)&&!ids.has(f.id));
      if(add.length){newsFeeds=newsFeeds.concat(add);saveNewsCfg();}
      localStorage.setItem('workbench_news_platonly_v2','1');
    }
  }catch(e){}
  // 一次性迁移 v3：移除已无稳定源的旧平台（头条/知乎日报），注入官方 CORS 平台（GitHub/HackerNews/Dev.to）；仅执行一次
  try{
    if(!localStorage.getItem('workbench_news_platonly_v3')){
      newsFeeds=newsFeeds.filter(f=>!['hot_toutiao','hot_zhihu_daily'].includes(f.id));
      const NEW=DEFAULT_FEEDS.filter(f=>['hot_github','hot_hn','hot_devto'].includes(f.id));
      const ids=new Set(newsFeeds.map(f=>f.id));
      const add=NEW.filter(f=>!ids.has(f.id));
      if(add.length){newsFeeds=newsFeeds.concat(add);saveNewsCfg();}
      localStorage.setItem('workbench_news_platonly_v3','1');
    }
  }catch(e){}
  // v4.4：首次升级时收敛为 6 个代表性来源，其余只停用、不删除；已有启停选择则完全保留
  try{
    if(!localStorage.getItem('workbench_news_focus_v4')){
      if(!newsFeeds.some(f=>Object.prototype.hasOwnProperty.call(f,'enabled'))){
        const CORE=new Set(['hot_weibo','hot_zhihu','hot_bili','hot_github','hot_36kr','hot_sspai']);
        const DEFAULT_IDS=new Set(DEFAULT_FEEDS.map(f=>f.id));
        newsFeeds.forEach(f=>{f.enabled=!DEFAULT_IDS.has(f.id)||CORE.has(f.id);});
        saveNewsCfg();
      }
      localStorage.setItem('workbench_news_focus_v4','1');
    }
  }catch(e){}
}
function saveNewsCfg(){try{localStorage.setItem(NEWS_KEY,JSON.stringify(newsFeeds));}catch(e){}}
function loadNewsCache(){try{const s=localStorage.getItem(NEWS_CACHE_KEY);if(s){const o=JSON.parse(s);newsItems=o.items||[];newsStatus=o.status||{};newsErr=o.err||{};newsLastFetch=o.ts||0;}}catch(e){}}
function saveNewsCache(){try{localStorage.setItem(NEWS_CACHE_KEY,JSON.stringify({items:newsItems,status:newsStatus,err:newsErr,ts:newsLastFetch}));}catch(e){}}
function loadNewsState(){try{const raw=localStorage.getItem(NEWS_STATE_KEY),parsed=raw?JSON.parse(raw):{};newsState={saved:parsed.saved||{},read:parsed.read||{}};}catch(e){newsState={saved:{},read:{}};}}
function saveNewsState(){try{localStorage.setItem(NEWS_STATE_KEY,JSON.stringify(newsState));}catch(e){}}
function safeUrl(u){try{const x=new URL(u,location.href);if(x.protocol==='http:'||x.protocol==='https:')return x.href;}catch(e){}return '#';}
function timeAgo(ts){if(!ts)return '时间未知';const d=Date.now()-ts;const m=60000,h=3600000,day=86400000;if(d<m)return '刚刚';if(d<h)return Math.floor(d/m)+'分钟前';if(d<day)return Math.floor(d/h)+'小时前';if(d<7*day)return Math.floor(d/day)+'天前';return new Date(ts).toLocaleDateString('zh-CN');}
function parseFeed(text,feed){
  const doc=new DOMParser().parseFromString(text,'text/xml');
  if(doc.querySelector('parsererror'))return [];
  let nodes=[...doc.querySelectorAll('item')];
  if(!nodes.length)nodes=nodes.concat([...doc.querySelectorAll('entry')]);
  return nodes.slice(0,25).map(n=>{
    const title=(n.querySelector('title')?.textContent||'').trim();
    let link=n.querySelector('link')?.textContent?.trim();
    if(!link){const l=n.querySelector('link');if(l&&l.getAttribute('href'))link=l.getAttribute('href');}
    const dateTxt=n.querySelector('pubDate')?.textContent||n.querySelector('published')?.textContent||n.querySelector('updated')?.textContent||'';
    let desc=n.querySelector('description')?.textContent||n.querySelector('summary')?.textContent||n.querySelector('content')?.textContent||'';
    desc=desc.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,140);
    return {title,link:link||'',date:dateTxt?new Date(dateTxt).getTime():0,desc,src:feed.name,cat:feed.cat};
  }).filter(x=>x.title&&x.link);
}
function fmtHot(v){
  if(v==null||v==='')return '';
  const s=String(v);
  if(/^\d+$/.test(s)){const n=+s;if(n>=100000000)return (n/100000000).toFixed(1)+'亿';if(n>=10000)return (n/10000).toFixed(1)+'万';return s;}
  return s;
}
function parseHot(text,feed){
  let obj;try{obj=JSON.parse(text);}catch(e){return [];}
  let arr=null;
  if(Array.isArray(obj))arr=obj;
  else if(obj&&Array.isArray(obj.data))arr=obj.data;
  if(!arr||!arr.length)return [];
  const base=Date.now();
  return arr.slice(0,30).map((it,i)=>{
    const title=(it.title||it.name||it.content||'').trim();
    const link=(it.link||it.url||it.mobil_url||'').trim();
    const hot=fmtHot(it.hot_value_desc||it.hot_value||it.hot||it.hotValue||'');
    const desc='#'+(i+1)+(hot?(' · 🔥'+hot):'');
    return {title,link,date:base-i*1000,desc,src:feed.name,cat:feed.cat};
  }).filter(x=>x.title&&x.link);
}
// 不同平台接口返回结构不同，按 feed.fmt 分流解析
async function parseItems(text,feed){
  if(feed.fmt==='github')return parseGithub(text,feed);
  if(feed.fmt==='hn')return parseHN(text,feed);
  if(feed.fmt==='devto')return parseDevTo(text,feed);
  return parseHot(text,feed);
}
function parseGithub(text,feed){
  let obj;try{obj=JSON.parse(text);}catch(e){return [];}
  const arr=obj&&obj.items;if(!Array.isArray(arr)||!arr.length)return [];
  const base=Date.now();
  return arr.map((it,i)=>({
    title:it.full_name||it.name||'',
    link:it.html_url||'',
    date:base-i*1000,
    desc:'#'+(i+1)+' · ⭐'+fmtHot(it.stargazers_count||0),
    src:feed.name,cat:feed.cat
  })).filter(x=>x.title&&x.link);
}
function parseHN(text,feed){
  let obj;try{obj=JSON.parse(text);}catch(e){return [];}
  const arr=obj&&obj.hits;if(!Array.isArray(arr)||!arr.length)return [];
  const base=Date.now();
  return arr.map((it,i)=>({
    title:(it.title||'').trim(),
    link:it.url||('https://news.ycombinator.com/item?id='+it.objectID),
    date:base-i*1000,
    desc:'#'+(i+1)+(it.points!=null?(' · 🔥'+fmtHot(it.points)+'分'):''),
    src:feed.name,cat:feed.cat
  })).filter(x=>x.title&&x.link);
}
function parseDevTo(text,feed){
  let obj;try{obj=JSON.parse(text);}catch(e){return [];}
  if(!Array.isArray(obj)||!obj.length)return [];
  const base=Date.now();
  return obj.map((it,i)=>({
    title:(it.title||'').trim(),
    link:it.url||'',
    date:base-i*1000,
    desc:'#'+(i+1)+(it.positive_reactions_count!=null?(' · ❤️'+fmtHot(it.positive_reactions_count)):''),
    src:feed.name,cat:feed.cat
  })).filter(x=>x.title&&x.link);
}
async function fetchOneFeed(f){
  const urls=(f.urls&&f.urls.length)?f.urls:(f.url?[f.url]:[]);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  const isHot=f.type==='hot';
  const get=async(url,via)=>{
    try{
      const r=await fetch(url,{cache:'no-store',signal:ctrl.signal});
      if(!r.ok)return {ok:false,err:(via||'直连')+' 返回 HTTP '+r.status,net:false};
      const t=await r.text();
      const items=isHot?await parseItems(t,f):parseFeed(t,f);
      if(items.length)return {ok:true,items};
      return {ok:false,err:isHot?'接口可访问，但返回数据为空或结构已变化':'源可访问，但内容不是标准 RSS（为空或格式不符）',net:false};
    }catch(e){return {ok:false,err:(via||'直连')+'：'+(e.name==='AbortError'?'超时':(e.message||'网络错误')),net:true};}
  };
  let lastErr='所有候选接口均不可用';
  for(const base of urls){
    let res=await get(base);
    if(res.ok){clearTimeout(timer);return {feed:f,ok:true,items:res.items};}
    lastErr=res.err;
    if(res.net){
      for(const px of newsProxyList()){res=await get(px(base),'代理');if(res.ok){clearTimeout(timer);return {feed:f,ok:true,items:res.items};}lastErr=res.err;}
    }
  }
  clearTimeout(timer);
  return {feed:f,ok:false,items:[],err:lastErr};
}
async function loadNews(){
  const activeFeeds=newsFeeds.filter(f=>f.enabled!==false);
  if(NEWS_MOCK){
    newsItems=buildMockNews();
    newsStatus={};activeFeeds.forEach(f=>newsStatus[f.id]=true);
    newsLastFetch=Date.now();newsLoading=false;
    if(currentCat==='news')renderNews();
    return;
  }
  if(newsLoading)return;newsLoading=true;
  if(currentCat==='news')renderNews();
  const results=await Promise.all(activeFeeds.map(f=>fetchOneFeed(f)));
  let all=[];newsStatus={};newsErr={};
  results.forEach(r=>{newsStatus[r.feed.id]=r.ok;if(!r.ok)newsErr[r.feed.id]=r.err;if(r.ok)all=all.concat(r.items);});
  all.sort((a,b)=>b.date-a.date);
  if(all.length||!activeFeeds.length)newsItems=all.slice(0,400);
  newsLastFetch=Date.now();newsLoading=false;saveNewsCache();
  if(currentCat==='news')renderNews();
}
function setNewsCat(c){newsCat=c;renderNews();}
function hotOf(n){if(!n.desc)return '';const i=n.desc.indexOf(' · ');return i>=0?n.desc.slice(i+3):'';}
function setNewsView(v){newsView=v;renderNews();}
function newsSummary(){return window.WorkbenchNewsSummary;}
function newsVisibleItems(){
  const active=new Set(newsFeeds.filter(f=>f.enabled!==false).map(f=>f.name));
  return NEWS_MOCK?newsItems:newsItems.filter(n=>active.has(n.src));
}
function newsItemKey(n){return n.key||newsSummary().itemKey(n);}
function markNewsRead(key,el){newsState.read[key]=Date.now();saveNewsState();const row=el&&el.closest&&el.closest('.brief-row');if(row)row.classList.add('read');}
function clearNewsRead(){newsState.read={};saveNewsState();renderNews();}
function toggleNewsSaved(key){
  if(newsState.saved[key])delete newsState.saved[key];
  else{
    const item=newsSummary().dedupe(newsVisibleItems()).find(n=>newsItemKey(n)===key);
    if(item)newsState.saved[key]=Object.assign({},item,{savedAt:Date.now()});
  }
  saveNewsState();renderNews();
}
function newsRow(n,rank,col){
  const key=newsItemKey(n),hot=hotOf(n),sources=(n.sources||[n.src]).filter(Boolean),read=!!newsState.read[key],saved=!!newsState.saved[key];
  return `<div class="brief-row ${read?'read':''}"><span class="brief-rank" style="color:${col}">${rank}</span><a class="brief-main" href="${safeUrl(n.link)}" target="_blank" rel="noopener" onclick="markNewsRead('${key}',this)"><b>${esc(n.title)}</b><span>${esc(n.cat||'资讯')}${sources.length>1?' · '+sources.length+' 个来源':''}${hot?' · '+esc(hot):''}</span></a><button class="brief-save ${saved?'on':''}" title="${saved?'取消收藏':'稍后阅读'}" onclick="toggleNewsSaved('${key}')">${saved?'★':'☆'}</button></div>`;
}
function renderNewsFocus(items){
  const list=newsSummary().focus(items,newsGroupCats(),newsState,12);
  if(!list.length)return '<div class="brief-empty"><span>📰</span><b>还没有可读内容</b><p>刷新一次，或在信息源管理中启用可靠来源。</p></div>';
  return `<div class="brief-panel"><div class="brief-panel-head"><div><span>今日精选</span><h2>先看这 ${list.length} 条</h2></div><small>跨类别轮换 · 自动合并重复标题</small></div><div class="brief-focus-list">${list.map((n,i)=>newsRow(n,i+1,newsCol(n.cat))).join('')}</div><div class="brief-limit-note">每天先读少量真正关心的内容，剩余信息仍可在「按来源看」中查看。</div></div>`;
}
function renderNewsSources(items){
  let chips='<div class="chips brief-source-tabs">';
  ['all'].concat(newsGroupCats()).forEach(c=>{chips+=`<span class="ctab ${newsCat===c?'on':''}" onclick="setNewsCat('${c}')">${c==='all'?'全部':newsIc(c)+' '+esc(c)}</span>`;});
  chips+='</div>';
  const cats=newsCat==='all'?newsGroupCats():[newsCat];
  const cards=cats.map(cat=>{
    const its=newsSummary().dedupe(items.filter(x=>x.cat===cat));if(!its.length)return '';
    const col=newsCol(cat);
    return `<div class="brief-source-card"><div class="brief-source-head"><b style="color:${col}">${newsIc(cat)} ${esc(cat)}</b><span>${its.length} 条</span></div>${its.slice(0,8).map((n,i)=>newsRow(n,i+1,col)).join('')}</div>`;
  }).join('');
  return chips+(cards?`<div class="brief-source-grid">${cards}</div>`:'<div class="brief-empty"><span>🔎</span><b>没有匹配内容</b><p>换个关键词，或刷新信息源后再试。</p></div>');
}
function renderNewsSaved(){
  const list=newsSummary().savedItems(newsState);
  if(!list.length)return '<div class="brief-empty"><span>☆</span><b>还没有稍后阅读</b><p>看到想留到晚点读的内容，点右侧星标即可收藏。</p></div>';
  return `<div class="brief-panel"><div class="brief-panel-head"><div><span>稍后阅读</span><h2>${list.length} 条已收藏</h2></div><button class="btn small" onclick="clearNewsRead()">清除已读标记</button></div><div class="brief-focus-list">${list.map((n,i)=>newsRow(n,i+1,newsCol(n.cat))).join('')}</div></div>`;
}
function renderNews(){
  const app=document.getElementById('app');if(!newsItems.length&&!newsLoading)loadNews();
  const summary=newsSummary(),visible=newsVisibleItems(),items=summary.search(visible,searchKw),stats=summary.sourceStats(newsFeeds,newsStatus);
  let body=newsView==='sources'?renderNewsSources(items):(newsView==='saved'?renderNewsSaved():renderNewsFocus(items));
  const status=newsLoading?'正在更新信息源…':`${stats.active} 个来源 · ${stats.ok} 个可用${stats.failed?' · '+stats.failed+' 个暂不可用':''}${newsLastFetch?' · '+timeAgo(newsLastFetch)+'更新':''}${!stats.ok&&visible.length?' · 正在显示上次缓存':''}`;
  app.innerHTML=`<div class="brief-hero"><div><span>V4.4 · 轻量信息简报</span><h1>先看少量值得关注的内容</h1><p>不追求刷完热榜。跨来源去重、按类别轮换，把真正值得打开的内容放在前面。</p></div><div><button class="btn" onclick="loadNews()">${newsLoading?'更新中…':'↻ 刷新'}</button><button class="btn" onclick="openNewsMgr()">⚙ 信息源</button></div></div><div class="brief-status"><span class="${newsLoading?'busy':''}"></span>${status}${visible.length?' · '+summary.dedupe(visible).length+' 条去重后内容':''}</div><div class="brief-tabs"><button class="${newsView==='focus'?'on':''}" onclick="setNewsView('focus')">今日精选</button><button class="${newsView==='sources'?'on':''}" onclick="setNewsView('sources')">按来源看</button><button class="${newsView==='saved'?'on':''}" onclick="setNewsView('saved')">稍后阅读 ${Object.keys(newsState.saved).length||''}</button></div>${body}<div class="hint brief-hint">🧭 <b>使用建议：</b>保留 5–8 个真正需要的信息源。未读不等于待办，重要内容收藏即可。</div>`;
}
function openNewsMgr(){const p=getNewsProxy();const el=document.getElementById('nf_proxy');if(el)el.value=p;renderNewsMgr();document.getElementById('newsMask').classList.add('show');}
function closeNewsMgr(){document.getElementById('newsMask').classList.remove('show');}
function renderNewsMgr(){
  const sel=document.getElementById('nf_cat');if(sel&&!sel.options.length)NEWS_CATS.filter(c=>c!=='all').forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
  const box=document.getElementById('newsFeedList');if(!box)return;
  if(!newsFeeds.length){box.innerHTML='<div class="empty">还没有信源，在下方添加第一个。</div>';return;}
  box.innerHTML=newsFeeds.map(f=>{
    const enabled=f.enabled!==false,st=newsStatus[f.id];
    const dot=!enabled?'#cbd5e1':(st===undefined?'#cbd5e1':(st?'#10b981':'#f59e0b'));
    const label=!enabled?'已停用':(st===undefined?'未检测':(st?'可用':'不可用'));
    const err=newsErr[f.id];
    const retry=enabled&&st===false?`<button class="icon-btn" title="重试该源" onclick="retryNewsFeed('${f.id}')">🔄</button>`:'';
    return `<div class="feed-row ${enabled?'':'disabled'}"><span class="news-status-dot" style="background:${dot}" title="${label}"></span><div class="fmeta"><div class="fname">${esc(f.name)} <span class="tag" style="background:${NEWS_CAT_COLOR[f.cat]||'#6366f1'}22;color:${NEWS_CAT_COLOR[f.cat]||'#6366f1'}">${esc(f.cat)}</span></div><div class="furl">${esc(f.url||(f.urls&&f.urls[0])||'')}</div>${enabled&&err?`<div class="ferr">⚠ ${esc(err)}</div>`:''}</div><div class="acts">${retry}<button class="btn small" onclick="toggleNewsFeed('${f.id}')">${enabled?'停用':'启用'}</button><button class="icon-btn" title="删除" onclick="delNewsFeed('${f.id}')">🗑️</button></div></div>`;
  }).join('');
}
function toggleNewsFeed(id){
  const f=newsFeeds.find(x=>x.id===id);if(!f)return;
  f.enabled=f.enabled===false;saveNewsCfg();
  if(!f.enabled){delete newsStatus[id];delete newsErr[id];}
  renderNewsMgr();loadNews();
}
function saveNewsFeed(){
  const name=document.getElementById('nf_name').value.trim();
  const url=document.getElementById('nf_url').value.trim();
  const cat=document.getElementById('nf_cat').value;
  if(!name||!url){alert('请填写平台名称和接口地址');return;}
  if(!/^https?:\/\//i.test(url)){alert('接口地址需以 http(s):// 开头');return;}
  newsFeeds.push({id:'nf_'+Date.now().toString(36),name,url,cat:cat||name,type:'hot'});
  saveNewsCfg();renderNewsMgr();
  document.getElementById('nf_name').value='';document.getElementById('nf_url').value='';
  loadNews();
}
function saveNewsProxy(){const p=document.getElementById('nf_proxy').value.trim();try{localStorage.setItem(NEWS_PROXY_KEY,p);}catch(e){}loadNews();renderNewsMgr();}
async function retryNewsFeed(id){
  const f=newsFeeds.find(x=>x.id===id);if(!f||f.enabled===false)return;
  const r=await fetchOneFeed(f);
  newsStatus[f.id]=r.ok;if(!r.ok)newsErr[f.id]=r.err;else delete newsErr[f.id];
  if(r.ok)newsItems=newsItems.concat(r.items).sort((a,b)=>b.date-a.date).slice(0,400);
  saveNewsCache();renderNewsMgr();if(currentCat==='news')renderNews();
}
function delNewsFeed(id){newsFeeds=newsFeeds.filter(f=>f.id!==id);saveNewsCfg();renderNewsMgr();if(currentCat==='news')loadNews();}

function exportData(){const blob=new Blob([JSON.stringify(stripSync(data),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='工作台备份_'+todayStr()+'.json';a.click();}
function exportCSV(){
  let rows=[['类型','日期','分类/来源','金额','备注']];
  (data.finances||[]).forEach(f=>rows.push([f.type==='income'?'收入':'支出',f.date,f.category||'',f.amount,f.note||'']));
  let csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  csv+='\n\n基金持仓（份额×最新净值）\n基金,代码,份额,最新净值,市值\n';
  (data.funds||[]).forEach(f=>{csv+=['"'+f.name+'"','"'+f.code+'"',f.shares||0,fundLatest(f)||'',fundValue(f).toFixed(2)].join(',')+'\n';});
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='收支与持仓_'+todayStr()+'.csv';a.click();
}
function importData(){document.getElementById('fileInput').click();}
function doImport(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);if(d.items){data.items=d.items;data.projects=d.projects||[];data.funds=d.funds||[];data.theme=d.theme||'light';data.papers=d.papers||[];data.patents=d.patents||[];data.rprojects=d.rprojects||[];data.books=d.books||[];data.travels=d.travels||[];data.anniversaries=d.anniversaries||[];data.weights=d.weights||[];data.finances=d.finances||[];data.habits=d.habits||[];data.weekPlans=d.weekPlans||{};data.targetWeight=(Object.prototype.hasOwnProperty.call(d,'targetWeight')?d.targetWeight:null);data.monthlyBudget=(Object.prototype.hasOwnProperty.call(d,'monthlyBudget')?d.monthlyBudget:null);data.prefs=d.prefs||data.prefs||{};data.__v=d.__v||data.__v;expandFinanceRecur();data.__savedAt=Date.now();save();render();alert('导入成功，共 '+(d.items.length)+' 条');}}catch(err){console.error(err);alert('文件格式错误');}};
  r.readAsText(f);e.target.value='';}
/* ---------- sync: GitHub Gist ---------- */
const SYNC_KEY='workbench_sync_cfg';
let syncCfg={token:'',gistId:'',enabled:false};
let syncTimer=null;
function loadSyncCfg(){try{const s=localStorage.getItem(SYNC_KEY);if(s)Object.assign(syncCfg,JSON.parse(s));}catch(e){}}
function saveSyncCfg(){localStorage.setItem(SYNC_KEY,JSON.stringify(syncCfg));}
function stripSync(d){const c=JSON.parse(JSON.stringify(d||{}));delete c.__savedAt;return c;}
const GH_API='https://api.github.com';
function syncSetDot(state,title){const d=document.getElementById('syncDot');if(!d)return;d.className='sync-dot '+state;d.title=title||'';}
async function gistGet(){
  if(!syncCfg.gistId)return null;
  const r=await fetch(GH_API+'/gists/'+syncCfg.gistId,{headers:{Authorization:'Bearer '+syncCfg.token,Accept:'application/vnd.github+json'}});
  if(!r.ok)throw new Error('拉取失败('+r.status+')');
  const j=await r.json();const f=j.files&&j.files['workbench_data.json'];
  return f?JSON.parse(f.content):null;
}
async function gistPut(payload){
  const body=JSON.stringify({files:{'workbench_data.json':{content:JSON.stringify(payload)}}});
  if(!syncCfg.gistId){
    const r=await fetch(GH_API+'/gists',{method:'POST',headers:{Authorization:'Bearer '+syncCfg.token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({public:false,files:{'workbench_data.json':{content:JSON.stringify(payload)}}})});
    if(!r.ok)throw new Error('创建失败('+r.status+')');
    const j=await r.json();syncCfg.gistId=j.id;saveSyncCfg();return;
  }
  const r=await fetch(GH_API+'/gists/'+syncCfg.gistId,{method:'PATCH',headers:{Authorization:'Bearer '+syncCfg.token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body});
  if(!r.ok)throw new Error('上传失败('+r.status+')');
}
function syncWrap(){return {v:2,savedAt:data.__savedAt||Date.now(),data:stripSync(data)};}
function syncPush(){
  if(!syncCfg.enabled||!syncCfg.token){syncSetDot('off','未启用同步');return;}
  syncSetDot('busy','同步中…');
  gistPut(syncWrap()).then(()=>{syncSetDot('ok','已同步 '+new Date().toLocaleTimeString());})
    .catch(e=>{syncSetDot('err','同步失败：'+e.message);});
}
function schedulePush(){if(!syncCfg.enabled)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncPush,800);}
async function syncPull(){
  if(!syncCfg.enabled||!syncCfg.token){syncSetDot('off','未启用同步');return;}
  syncSetDot('busy','拉取中…');
  try{
    const remote=await gistGet();
    if(remote&&remote.data){
      const rs=remote.savedAt||0, ls=data.__savedAt||0;
      if(rs>ls){
        data=remote.data;
        if(!data.items)data.items=[];if(!data.projects)data.projects=[];if(!data.funds)data.funds=[];if(!data.papers)data.papers=[];if(!data.patents)data.patents=[];if(!data.rprojects)data.rprojects=[];if(!data.books)data.books=[];if(!data.travels)data.travels=[];if(!data.anniversaries)data.anniversaries=[];        if(!data.weights)data.weights=[];if(!data.finances)data.finances=[];if(!data.habits)data.habits=[];if(!data.weekPlans)data.weekPlans={};if(!data.theme)data.theme='light';
        expandFinanceRecur();
        data.__savedAt=rs;localStorage.setItem(STORE,JSON.stringify(data));render();
        syncSetDot('ok','已同步 '+new Date().toLocaleTimeString());
      }else if(ls>rs){
        /* 本地更新：回写云端，修复/收敛 Gist（自愈残留的默认数据） */
        syncPush();
      }else{
        syncSetDot('ok','已是最新 '+new Date().toLocaleTimeString());
      }
    }else{
      syncSetDot('ok','远端暂无数据，将以本地为准');
      syncPush();
    }
  }catch(e){syncSetDot('err','拉取失败：'+e.message);}
}
function openSync(){
  document.getElementById('s_token').value=syncCfg.token||'';
  document.getElementById('s_gist').value=syncCfg.gistId||'';
  document.getElementById('s_enabled').checked=!!syncCfg.enabled;
  document.getElementById('syncMask').classList.add('show');
}
function closeSync(){document.getElementById('syncMask').classList.remove('show');}
function toggleToken(btn){
  const el=document.getElementById('s_token');
  if(el.type==='password'){el.type='text';btn.textContent='🙈 隐藏';}
  else{el.type='password';btn.textContent='👁 显示';}
}
function copyToken(){
  const v=document.getElementById('s_token').value;
  if(!v){alert('当前没有可复制的 Token。\n请先打开「同步设置」（本页面会自动载入已保存在本机的 Token），再点复制。');return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(()=>alert('✅ Token 已复制到剪贴板')).catch(()=>{window.prompt('复制失败（浏览器限制），请手动复制下面的 Token：',v);});}
  else{window.prompt('请手动复制下面的 Token：',v);}
}
function saveSync(){
  syncCfg.token=document.getElementById('s_token').value.trim();
  syncCfg.gistId=document.getElementById('s_gist').value.trim();
  syncCfg.enabled=document.getElementById('s_enabled').checked;
  saveSyncCfg();closeSync();
  if(syncCfg.enabled){syncPull();startSyncPoll();}else{syncSetDot('off','未启用同步');stopSyncPoll();}
}
function doSyncNow(){
  syncCfg.token=document.getElementById('s_token').value.trim();
  syncCfg.gistId=document.getElementById('s_gist').value.trim();
  syncCfg.enabled=true;document.getElementById('s_enabled').checked=true;
  saveSyncCfg();closeSync();syncPush();startSyncPoll();
}
function openGist(){
  const id=document.getElementById('s_gist').value.trim()||syncCfg.gistId;
  if(!id){alert('还没有 Gist ID，请先保存并同步一次（首次会自动创建）');return;}
  window.open('https://gist.github.com/'+id,'_blank');
}
/* ---- 动态同步：自动轮询进站 + 跨标签页进站 ---- */
const SYNC_POLL_MS=60000;
let syncPollTimer=null;
function startSyncPoll(){
  stopSyncPoll();
  if(syncCfg.enabled&&syncCfg.gistId&&syncCfg.token)
    syncPollTimer=setInterval(()=>{if(syncCfg.enabled)syncPull();},SYNC_POLL_MS);
}
function stopSyncPoll(){if(syncPollTimer){clearInterval(syncPollTimer);syncPollTimer=null;}}

function toggleTheme(){data.theme=data.theme==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',data.theme);document.getElementById('themeBtn').textContent=data.theme==='dark'?'☀️':'🌙';save();}

/* ---------- seed（已移至下方 loadSyncCfg 之后，避免默认数据被推上云端覆盖真实数据） ---------- */

load();loadSyncCfg();
/* 种子仅在「本地为空 且 同步未就绪」时生成；同步已配置则直接信任云端，避免默认数据推上云覆盖真实数据 */
if(data.items.length===0&&data.projects.length===0&&!(syncCfg.enabled&&syncCfg.gistId&&syncCfg.token)){
  const dstr=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
  data.projects=[{id:'p1',name:'XX 企业研发课题',desc:'博士后期间核心研发项目',status:'active',created:todayStr()}];
  data.funds=[
    {id:'f1',name:'易方达蓝筹精选',code:'005827',type:'混合型',shares:1000,costNav:2.5000,
      records:[{date:dstr(-6),nav:2.6200},{date:dstr(-4),nav:2.6500},{date:dstr(-2),nav:2.6100},{date:todayStr(),nav:2.6800}]},
    {id:'f2',name:'华夏沪深300ETF联接',code:'000051',type:'指数型',shares:0,costNav:0,
      records:[{date:dstr(-5),nav:1.5200},{date:todayStr(),nav:1.5500}]}
  ];
  const wk0=mondayOf(todayStr());
  const tIdx=(new Date(todayStr()+'T00:00:00').getDay()+6)%7;
  data.items=[
    {id:uid(),cat:'work',title:'完成课题中期评审材料',note:'里程碑',status:'doing',prio:'high',due:todayStr(),projectId:'p1',isMilestone:true,created:todayStr(),estH:40,actH:30,recur:''},
    {id:uid(),cat:'work',title:'对接企业导师确认需求',note:'',status:'todo',prio:'mid',due:todayStr(),projectId:'p1',isMilestone:false,created:todayStr(),estH:8,actH:0,recur:'week'},
    {id:uid(),cat:'research',title:'精读 2 篇 VLM 道路裂缝检测论文',note:'',status:'doing',prio:'high',due:todayStr(),created:todayStr(),estH:6,actH:2,recur:''},
    {id:uid(),cat:'life',title:'预约体检',note:'',status:'todo',prio:'mid',due:todayStr(),created:todayStr(),estH:0,actH:0,recur:''},
    {id:uid(),cat:'sport',title:'晨跑',note:'今日计划示例',status:'done',prio:'mid',due:todayStr(),sportType:'跑步',minutes:35,created:todayStr(),estH:0,actH:0,recur:'',planKey:wk0,planDay:tIdx}
  ];
  data.papers=[
    {id:'pp1',title:'基于视觉大模型的道路裂缝检测',journal:'自动化学报',zone:'z1',ccf:'a',kind:'sub',
      note:'已根据一审意见修改并转投国内顶刊',
      rebuttalDue:dstr(14),round:2,
      steps:[
        {status:'submitted',journal:'IEEE T-ITS',date:dstr(-60),note:'初次投稿'},
        {status:'rejected',journal:'IEEE T-ITS',date:dstr(-30),note:'审稿人认为创新性不足，拒稿'},
        {status:'submitted',journal:'自动化学报',date:dstr(-20),note:'转投国内顶刊'},
        {status:'review',journal:'自动化学报',date:dstr(-12),note:'外审中'}
      ]},
    {id:'pp2',title:'多模态缺陷检测综述',journal:'',zone:'z2',ccf:'b',kind:'plan',
      note:'提纲已完成，待补充实验后投稿',
      steps:[{status:'draft',journal:'',date:'',note:'撰写中'}]},
    {id:'pp3',title:'面向基础设施的视觉检测协同框架（与 A 校联合）',journal:'IEEE T-II',zone:'z1',ccf:'a',kind:'collab',
      note:'与 A 校团队合作，我方负责算法模块',
      steps:[
        {status:'submitted',journal:'IEEE T-II',date:dstr(-25),note:'联合投稿'},
        {status:'review',journal:'IEEE T-II',date:dstr(-10),note:'外审中'}
      ]}
  ];
  data.patents=[
    {id:'pt1',title:'一种基于视觉大模型的道路裂缝检测方法及系统',type:'invention',number:'202410123456.7',filedDate:dstr(-90),feeDue:dstr(20),
      note:'与企业联合申请，核心算法专利',
      steps:[
        {status:'filed',date:dstr(-90),note:'递交国家知识产权局'},
        {status:'accepted',date:dstr(-70),note:'下发受理通知书'},
        {status:'examined',date:dstr(-30),note:'进入实质审查'}
      ]},
    {id:'pt2',title:'道路缺陷检测数据标注与管理软件',type:'soft',number:'2024SR123456',
      note:'软件著作权已登记',
      steps:[{status:'granted',date:dstr(-50),note:'获授权/登记'}]}
  ];
  data.rprojects=[
    {id:'rp1',title:'面向基础设施的智能视觉检测关键技术研究',source:'nsfc',role:'member',status:'active',
      fund:60,start:dstr(-200),end:dstr(160),note:'国家自然科学基金面上项目，负责视觉算法部分'},
    {id:'rp2',title:'城市道路健康监测平台研发',source:'horizontal',role:'host',status:'approved',
      fund:120,start:dstr(-20),end:dstr(320),note:'横向课题，主持，已签合同'}
  ];
  data.books=[
    {id:'bk1',title:'深度学习',author:'Ian Goodfellow',status:'reading',rating:0,progress:45,startDate:dstr(-40),endDate:'',note:'补基础，重点看卷积与注意力章节'},
    {id:'bk2',title:'深入理解计算机系统',author:'Randal E. Bryant',status:'want',rating:0,progress:0,startDate:'',endDate:'',note:''},
    {id:'bk3',title:'如何阅读一本书',author:'莫提默·艾德勒',status:'done',rating:4,progress:100,startDate:dstr(-120),endDate:dstr(-30),note:'方法论很受用，尤其是分析阅读'}
  ];
  data.travels=[
    {id:'tv1',title:'成都 · 学术会议 + 旅行',start:dstr(30),end:dstr(35),budget:'5000',spent:0,visa:'',note:'参加 CV 会议，顺道玩都江堰；已订机票',checklist:['身份证','充电宝','会议邀请函','相机']},
    {id:'tv2',title:'日本樱花季',start:dstr(250),end:dstr(260),budget:'20000',spent:3200,visa:'需办签证',note:'东京-大阪，提前 2 个月订',checklist:['护照','签证','日元现金','转换插头']}
  ];
  data.anniversaries=[
    {id:'an1',name:'张教授生日',type:'birthday',date:'07-15',since:1972,note:'博导，记得问候'},
    {id:'an2',name:'结婚纪念日',type:'anniversary',date:'10-01',since:2020,note:''},
    {id:'an3',name:'李同学生日',type:'birthday',date:'12-03',since:1995,note:'A 校联合项目对接人'}
  ];
  data.weights=[
    {id:'wt1',date:dstr(-20),weight:70.5,bodyFat:22.1,waist:84,note:'开始记录'},
    {id:'wt2',date:dstr(-13),weight:69.8,bodyFat:21.6,waist:83,note:''},
    {id:'wt3',date:dstr(-6),weight:69.1,bodyFat:21.0,waist:82,note:''},
    {id:'wt4',date:todayStr(),weight:68.6,bodyFat:20.4,waist:81,note:'体感更轻了'}
  ];
  data.finances=[
    {id:'fn1',date:dstr(-25),type:'income',category:'工资',amount:12000,note:'上月工资'},
    {id:'fn2',date:dstr(-20),type:'expense',category:'房租',amount:3500,note:''},
    {id:'fn3',date:dstr(-12),type:'income',category:'理财收益',amount:420,note:'基金分红'},
    {id:'fn4',date:dstr(-5),type:'expense',category:'餐饮',amount:860,note:'朋友聚餐 + 日常'},
    {id:'fn5',date:todayStr(),type:'expense',category:'购物',amount:1290,note:'运动装备'},
    {id:'fn6',date:todayStr().slice(0,7)+'-05',type:'income',category:'工资',amount:12000,recur:'month',note:'月度工资（示例·每月5号自动记）'}
  ];
  data.targetWeight=67;data.monthlyBudget=6000;
  const wp=[null,null,null,null,null,null,null];
  wp[0]={type:'跑步',minutes:30,note:'晨跑 5 公里'};
  wp[1]={type:'健身',minutes:45,note:'胸 + 三头'};
  wp[3]={type:'跑步',minutes:30,note:''};
  wp[4]={type:'游泳',minutes:40,note:''};
  wp[5]={type:'骑行',minutes:60,note:'周末长途'};
  wp[tIdx]={type:'跑步',minutes:35,note:'今日示例'};
  data.weekPlans={};data.weekPlans[wk0]=wp;
  expandFinanceRecur();
  persist();
}
render();
if(syncCfg.enabled)syncPull();
startSyncPoll();
/* 同浏览器多标签页：其他标签页改写 localStorage 时本页即时同步 */
window.addEventListener('storage',e=>{
  if(e.key===STORE&&e.newValue){
    try{const d=JSON.parse(e.newValue);if(d&&d.items&&(d.__savedAt||0)>(data.__savedAt||0)){data=d;if(!data.papers)data.papers=[];if(!data.patents)data.patents=[];if(!data.rprojects)data.rprojects=[];if(!data.books)data.books=[];if(!data.travels)data.travels=[];if(!data.anniversaries)data.anniversaries=[];if(!data.weights)data.weights=[];if(!data.finances)data.finances=[];if(!data.habits)data.habits=[];render();}}catch(_){}
  }
});
document.querySelector('#nav .tab[data-cat="work"]').classList.add('active');



(function(){
  if(window.__v31Init)return; window.__v31Init=true;
  function show(){
    var el=document.getElementById('v31_whatsnew');
    if(!el)return;
    el.style.display='flex';
  }
  window.v31ShowWhatIsNew=function(){
    try{
      if(typeof data==='undefined')return show();
      data.prefs=data.prefs||{};
      if(data.prefs.onceV31Shown)return;
      show();
    }catch(e){ show(); }
  };
  window.v31DismissWhatIsNew=function(persist){
    try{
      if(persist && typeof data!=='undefined'){
        data.prefs=data.prefs||{};
        data.prefs.onceV31Shown=1;
        if(typeof save==='function')save();
      }
    }catch(e){}
    var el=document.getElementById('v31_whatsnew');
    if(el)el.style.display='none';
  };
  // DOM 已 ready → 直接尝试
  if(document.readyState!=='loading')window.v31ShowWhatIsNew();
  else document.addEventListener('DOMContentLoaded', window.v31ShowWhatIsNew);
})();

/* ===== FILE: data/state.js ===== */
(function(global){
  function ensureData(){
    if(!global.data || typeof global.data !== 'object') global.data = {};
    return global.data;
  }
  function ensurePrefs(){
    const data = ensureData();
    if(!data.prefs || typeof data.prefs !== 'object') data.prefs = {};
    if(!data.prefs.overviewCollapse) data.prefs.overviewCollapse = {};
    if(!Array.isArray(data.prefs.recentlyQuickAdd)) data.prefs.recentlyQuickAdd = [];
    if(typeof data.prefs.hideDoneInOverview !== 'boolean') data.prefs.hideDoneInOverview = true;
    if(!data.prefs.healthGoals || typeof data.prefs.healthGoals !== 'object'){
      data.prefs.healthGoals = { weeklyMinutes:150, weeklySessions:3 };
    }
    if(!data.prefs.financeConfig || typeof data.prefs.financeConfig !== 'object'){
      data.prefs.financeConfig = { categoryBudgets:{} };
    }
    if(!data.prefs.financeConfig.categoryBudgets || typeof data.prefs.financeConfig.categoryBudgets !== 'object'){
      data.prefs.financeConfig.categoryBudgets = {};
    }
    return data.prefs;
  }
  function ensureCollections(){
    const data = ensureData();
    const defaults = {
      items: [], projects: [], funds: [], papers: [], patents: [], rprojects: [], books: [],
      travels: [], anniversaries: [], weights: [], finances: [], habits: [], weekPlans: {}
    };
    Object.keys(defaults).forEach(function(key){
      if(data[key] == null) data[key] = Array.isArray(defaults[key]) ? [] : {};
    });
    if(!Object.prototype.hasOwnProperty.call(data, 'targetWeight')) data.targetWeight = null;
    if(!Object.prototype.hasOwnProperty.call(data, 'monthlyBudget')) data.monthlyBudget = null;
    if(!data.theme) data.theme = 'light';
    ensurePrefs();
    return data;
  }
  global.WorkbenchData = {
    getData: ensureCollections,
    setData: function(next){ global.data = next || {}; return ensureCollections(); },
    patchData: function(patch){ Object.assign(ensureCollections(), patch || {}); return ensureCollections(); },
    ensurePrefs: ensurePrefs,
    ensureCollections: ensureCollections,
    snapshot: function(){ return JSON.parse(JSON.stringify(ensureCollections())); }
  };
})(window);

/* ===== FILE: data/repository.js ===== */
(function(global){
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function ensure(){
    return global.WorkbenchData && global.WorkbenchData.getData ? global.WorkbenchData.getData() : (global.data || {});
  }
  var repo = {
    getState: function(){ return ensure(); },
    getSnapshot: function(){ return clone(ensure()); },
    replaceState: function(next, opts){
      var data = global.WorkbenchData && global.WorkbenchData.setData ? global.WorkbenchData.setData(next || {}) : (global.data = next || {});
      if(opts && opts.persist && typeof global.save === 'function') global.save();
      return data;
    },
    patchState: function(patch, opts){
      var data = global.WorkbenchData && global.WorkbenchData.patchData ? global.WorkbenchData.patchData(patch || {}) : Object.assign(global.data || {}, patch || {});
      if(opts && opts.persist && typeof global.save === 'function') global.save();
      return data;
    },
    list: function(key){
      var data = ensure();
      return Array.isArray(data[key]) ? data[key] : [];
    },
    setCollection: function(key, list, opts){
      var patch = {}; patch[key] = Array.isArray(list) ? list : [];
      return repo.patchState(patch, opts);
    },
    upsertById: function(key, entity, opts){
      var arr = repo.list(key).slice();
      var idx = arr.findIndex(function(x){ return x && entity && x.id === entity.id; });
      if(idx >= 0) arr[idx] = Object.assign({}, arr[idx], entity);
      else arr.push(entity);
      return repo.setCollection(key, arr, opts);
    },
    removeById: function(key, id, opts){
      return repo.setCollection(key, repo.list(key).filter(function(x){ return x && x.id !== id; }), opts);
    },
    persistNow: function(){ if(typeof global.save === 'function') global.save(); },
    renderNow: function(){ if(typeof global.render === 'function') global.render(); }
  };
  global.WorkbenchRepository = repo;
})(window);

/* ===== FILE: data/import-export.js ===== */
(function(global){
  function safeOwn(obj, key){ return Object.prototype.hasOwnProperty.call(obj || {}, key); }
  function normalizeImportedData(payload){
    var d = payload || {};
    var current = (global.WorkbenchData && global.WorkbenchData.getData()) || (global.data || {});
    return {
      items: d.items || [],
      projects: d.projects || [],
      funds: d.funds || [],
      papers: d.papers || [],
      patents: d.patents || [],
      rprojects: d.rprojects || [],
      books: d.books || [],
      travels: d.travels || [],
      anniversaries: d.anniversaries || [],
      weights: d.weights || [],
      finances: d.finances || [],
      habits: d.habits || [],
      weekPlans: d.weekPlans || {},
      targetWeight: safeOwn(d, 'targetWeight') ? d.targetWeight : null,
      monthlyBudget: safeOwn(d, 'monthlyBudget') ? d.monthlyBudget : null,
      prefs: d.prefs || current.prefs || {},
      theme: d.theme || current.theme || 'light',
      __v: d.__v || current.__v,
      __savedAt: Date.now()
    };
  }
  function applyImportedData(payload){
    var next = normalizeImportedData(payload);
    global.data = Object.assign((global.WorkbenchData && global.WorkbenchData.getData()) || {}, next);
    if(typeof global.expandFinanceRecur === 'function') global.expandFinanceRecur();
    if(typeof global.save === 'function') global.save();
    if(typeof global.render === 'function') global.render();
    return global.data;
  }
  global.WorkbenchImportExport = {
    normalizeImportedData: normalizeImportedData,
    applyImportedData: applyImportedData
  };
  global.doImport = function(e){
    var f = e && e.target && e.target.files ? e.target.files[0] : null;
    if(!f) return;
    var r = new FileReader();
    r.onload = function(){
      try{
        var parsed = JSON.parse(r.result);
        if(parsed && parsed.items){
          applyImportedData(parsed);
          alert('导入成功，共 ' + (parsed.items.length || 0) + ' 条');
        }else{
          alert('文件格式错误');
        }
      }catch(err){
        console.error(err);
        alert('文件格式错误');
      }
    };
    r.readAsText(f);
    e.target.value='';
  };
})(window);

/* ===== FILE: data/backup/backup-repo.js ===== */
(function(global){
  var KEY = typeof global.BAK_KEY !== 'undefined' ? global.BAK_KEY : 'workbench_backups_v1';
  var MAX = typeof global.BAK_MAX !== 'undefined' ? global.BAK_MAX : 30;
  function read(){
    try{
      var s = localStorage.getItem(KEY);
      var arr = s ? JSON.parse(s) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
  }
  function write(arr){
    localStorage.setItem(KEY, JSON.stringify(arr));
    return arr;
  }
  function snapshot(){
    var data = global.WorkbenchRepository && global.WorkbenchRepository.getSnapshot ? global.WorkbenchRepository.getSnapshot() : JSON.parse(JSON.stringify(global.data || {}));
    if(data && data.__savedAt) delete data.__savedAt;
    return data;
  }
  var api = {
    list: read,
    create: function(force){
      try{
        var now = Date.now();
        if(typeof global.lastBak !== 'undefined' && typeof global.BAK_MIN_GAP !== 'undefined' && !force && now - global.lastBak < global.BAK_MIN_GAP) return read();
        if(typeof global.lastBak !== 'undefined') global.lastBak = now;
        var arr = read();
        arr.push({ ts: now, data: snapshot() });
        while(arr.length > MAX) arr.shift();
        return write(arr);
      }catch(e){ return read(); }
    },
    restore: function(ts){
      var item = read().find(function(x){ return x.ts === ts; });
      if(!item) return null;
      var defaults = {items:[],projects:[],funds:[],papers:[],patents:[],rprojects:[],books:[],travels:[],anniversaries:[],weights:[],finances:[],habits:[],theme:'light',weekPlans:{}};
      var next = Object.assign(defaults, item.data || {});
      if(global.WorkbenchRepository && global.WorkbenchRepository.replaceState) global.WorkbenchRepository.replaceState(next);
      else global.data = next;
      if(typeof global.save === 'function') global.save();
      if(typeof global.render === 'function') global.render();
      return next;
    },
    remove: function(ts){
      return write(read().filter(function(x){ return x.ts !== ts; }));
    }
  };
  global.WorkbenchBackupRepo = api;
  global.loadBak = api.list;
  global.pushBackup = function(force){ return api.create(force); };
  global.restoreBak = function(ts){
    if(!confirm('恢复到该备份？当前未备份的内容会被覆盖（恢复前会自动再存一份当前快照）')) return;
    api.create(true);
    var restored = api.restore(ts);
    if(typeof global.renderBak === 'function') global.renderBak();
    if(restored && typeof global.fmtBak === 'function') alert('已恢复到 ' + global.fmtBak(ts));
  };
  global.delBak = function(ts){ api.remove(ts); if(typeof global.renderBak === 'function') global.renderBak(); };
  global.bakNow = function(){ api.create(true); if(typeof global.renderBak === 'function') global.renderBak(); };
})(window);

/* ===== FILE: data/sync/sync-adapter.js ===== */
(function(global){
  function status(state, title){ if(typeof global.syncSetDot === 'function') global.syncSetDot(state, title); }
  var api = {
    isEnabled: function(){ return !!(global.syncCfg && global.syncCfg.enabled && global.syncCfg.token); },
    getConfig: function(){ return Object.assign({}, global.syncCfg || {}); },
    saveConfigFromDom: function(){
      if(!global.syncCfg) global.syncCfg = { token:'', gistId:'', enabled:false };
      global.syncCfg.token = (document.getElementById('s_token') || {}).value ? document.getElementById('s_token').value.trim() : global.syncCfg.token;
      global.syncCfg.gistId = (document.getElementById('s_gist') || {}).value ? document.getElementById('s_gist').value.trim() : global.syncCfg.gistId;
      global.syncCfg.enabled = !!((document.getElementById('s_enabled') || {}).checked);
      if(typeof global.saveSyncCfg === 'function') global.saveSyncCfg();
      return api.getConfig();
    },
    push: function(){ if(typeof global.syncPush === 'function') return global.syncPush(); status('off', '未启用同步'); },
    pull: function(){ if(typeof global.syncPull === 'function') return global.syncPull(); status('off', '未启用同步'); },
    wrapPayload: function(){ return typeof global.syncWrap === 'function' ? global.syncWrap() : null; }
  };
  global.WorkbenchSyncAdapter = api;
})(window);

/* ===== FILE: domain/tasks/recurrence.js ===== */
(function(global){
  function pad(n){ return String(n).padStart(2, '0'); }
  function parseYMD(ymd){
    var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return { y:+m[1], m:+m[2], d:+m[3] };
  }
  function formatYMD(y,m,d){ return y + '-' + pad(m) + '-' + pad(d); }
  function dim(y,m){ return new Date(y, m, 0).getDate(); }
  function addDaysYMD(ymd, days){
    var dt = new Date((ymd || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10))) + 'T00:00:00');
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0,10);
  }
  function addMonthsKeepDay(ymd, months){
    var p = parseYMD(ymd || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10)));
    if(!p) return addDaysYMD(global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10), 30 * months);
    var monthIndex = (p.m - 1) + months;
    var year = p.y + Math.floor(monthIndex / 12);
    var month = ((monthIndex % 12) + 12) % 12 + 1;
    if(monthIndex < 0 && ((monthIndex % 12) !== 0)) year -= 1;
    var day = Math.min(p.d, dim(year, month));
    return formatYMD(year, month, day);
  }
  function nextDueForTask(task){
    var recur = task && task.recur;
    var base = (task && task.due) || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10));
    if(!recur || recur === 'none') return null;
    if(recur === 'daily') return addDaysYMD(base, 1);
    if(recur === 'weekly') return addDaysYMD(base, 7);
    if(recur === 'monthly') return addMonthsKeepDay(base, 1);
    return addDaysYMD(base, 1);
  }
  function buildNextTask(task){
    var nextDue = nextDueForTask(task);
    if(!nextDue) return null;
    if(!task.seriesId) task.seriesId = task.id || (global.uid ? global.uid() : String(Date.now()));
    var next = Object.assign({}, task, {
      id: global.uid ? global.uid() : (String(Date.now()) + Math.random().toString(36).slice(2,5)),
      due: nextDue,
      status: 'todo',
      completedAt: null,
      created: global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10),
      seriesId: task.seriesId,
      sourceTaskId: task.id || task.sourceTaskId || null
    });
    return next;
  }
  function hasDuplicateFutureTask(task, nextDue){
    var items = (global.data && global.data.items) || [];
    var sid = task.seriesId || task.id;
    return items.some(function(x){
      return x && x.id !== task.id && (x.seriesId || x.id) === sid && x.due === nextDue && x.status !== 'done';
    });
  }
  global.WorkbenchRecurrence = {
    nextDueForTask: nextDueForTask,
    buildNextTask: buildNextTask
  };
  global.genRecur = function(task){
    if(!task || !task.recur || task.recur === 'none') return;
    var nextDue = nextDueForTask(task);
    if(!nextDue) return;
    if(hasDuplicateFutureTask(task, nextDue)) return;
    var next = buildNextTask(task);
    if(next && global.data && Array.isArray(global.data.items)) global.data.items.push(next);
  };
})(window);

/* ===== FILE: domain/projects/health.js ===== */
(function(global){
  function summarizeProject(project){
    var data = (global.WorkbenchData && global.WorkbenchData.getData()) || global.data || { items: [] };
    var today = global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var items = (data.items || []).filter(function(i){ return i.cat === 'work' && i.projectId === project.id; });
    var milestones = items.filter(function(i){ return !!i.isMilestone; });
    var msDone = milestones.filter(function(i){ return i.status === 'done'; }).length;
    var done = items.filter(function(i){ return i.status === 'done'; }).length;
    var total = items.length || 1;
    var pct = Math.round(done / total * 100);
    var tasks = items.filter(function(i){ return !i.isMilestone; }).length;
    var overdue = items.filter(function(i){ return i.status !== 'done' && i.due && i.due < today; }).length;
    var riskMs = items.filter(function(i){ return i.isMilestone && i.status !== 'done' && i.due && global.daysBetween && global.daysBetween(today, i.due) <= 7 && global.daysBetween(today, i.due) >= 0; }).length;
    var estSum = items.reduce(function(s, i){ return s + (+i.estH || 0); }, 0);
    var actSum = items.reduce(function(s, i){ return s + (+i.actH || 0); }, 0);
    var acc = (estSum && actSum) ? (actSum / estSum * 100) : null;
    var health = (project.status === 'done') ? 'green' : (overdue >= 3 || riskMs > 0 ? 'red' : overdue > 0 ? 'amber' : 'green');
    var healthMap = { green:['#10b981','健康'], amber:['#f59e0b','注意'], red:['#ef4444','风险'] };
    return {
      project: project,
      items: items,
      milestones: milestones,
      milestoneDone: msDone,
      done: done,
      total: total,
      pct: pct,
      tasks: tasks,
      overdue: overdue,
      riskMs: riskMs,
      actHours: actSum,
      estHours: estSum,
      accuracy: acc,
      health: health,
      healthMeta: healthMap[health],
      sortedItems: items.slice().sort(function(a,b){ return (a.status==='done') - (b.status==='done'); })
    };
  }
  global.WorkbenchProjectHealth = { summarizeProject: summarizeProject };
})(window);

/* ===== FILE: domain/overview/summary.js ===== */
(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function catProgress(cat){
    var data=getData();
    var items=(data.items||[]).filter(function(i){ return i.cat===cat; });
    var todo=items.filter(function(i){ return i.status==='todo'; }).length;
    var doing=items.filter(function(i){ return i.status==='doing'; }).length;
    var done=items.filter(function(i){ return i.status==='done'; }).length;
    var total=items.length||1;
    return {items:items,count:items.length,todo:todo,doing:doing,done:done,pct:Math.round(done/total*100)};
  }
  function financeSummary(){
    var data=getData();
    var ta=typeof global.totalAssets==='function' ? global.totalAssets() : 0;
    var fv=(data.funds||[]).reduce(function(s,f){ return s + (typeof global.fundValue==='function' ? global.fundValue(f) : 0); },0);
    var cash=ta-fv;
    return {totalAssets:ta,fundValue:fv,cash:cash};
  }
  function focusItems(){
    var data=getData();
    var today=global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var focus=(data.items||[]).filter(function(i){
      var visible=!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat);
      return visible && i.status!=='done' && i.due && (i.due===today || (global.daysBetween && global.daysBetween(today,i.due)<0));
    }).sort(function(a,b){ return a.due.localeCompare(b.due); });
    return {today:today,items:focus,lateN:focus.filter(function(i){ return i.due<today; }).length};
  }
  function activeProjects(){
    var data=getData();
    var today=global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    return (data.projects||[]).filter(function(p){ return p.status!=='done'; }).map(function(p){
      var items=(data.items||[]).filter(function(i){ return i.cat==='work' && i.projectId===p.id; });
      var ms=items.filter(function(i){ return i.isMilestone; });
      var msDone=ms.filter(function(i){ return i.status==='done'; }).length;
      var done=items.filter(function(i){ return i.status==='done'; }).length;
      var tot=items.length||1;
      var tasks=items.filter(function(i){ return !i.isMilestone; }).length;
      var overdue=items.filter(function(i){ return i.status!=='done' && i.due && i.due<today; }).length;
      return {project:p,items:items,milestones:ms,msDone:msDone,done:done,pct:Math.round(done/tot*100),tasks:tasks,overdue:overdue};
    });
  }
  function upcomingItems(){
    var data=getData();
    return (data.items||[]).filter(function(i){
      return (!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat)) && i.status!=='done' && i.due;
    }).sort(function(a,b){ return a.due.localeCompare(b.due); }).slice(0,6);
  }
  global.WorkbenchOverviewSummary = {
    catProgress: catProgress,
    financeSummary: financeSummary,
    focusItems: focusItems,
    activeProjects: activeProjects,
    upcomingItems: upcomingItems
  };
})(window);

/* ===== FILE: domain/review/overview.js ===== */
(function(global){
  function buildOverviewEnhancements(){
    var today = global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var data = (global.WorkbenchData && global.WorkbenchData.getData()) || global.data || { items: [], finances: [], prefs: {} };
    var visibleItems = (data.items || []).filter(function(i){ return !global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat); });
    var td = visibleItems.filter(function(i){ return i.status !== 'done' && i.due === today; }).length;
    var od = visibleItems.filter(function(i){ return i.status !== 'done' && i.due && i.due < today; }).length;
    var health = global.WorkbenchHealthMetrics && global.WorkbenchHealthMetrics.sportSummary ? global.WorkbenchHealthMetrics.sportSummary() : null;
    var goalMinutes = health ? health.goals.weeklyMinutes : 150;
    var wkMins = health ? health.weekDoneMinutes : 0;
    var mNow = new Date().toISOString().slice(0,7);
    var inc = 0, exp = 0;
    (data.finances || []).forEach(function(f){
      if(!f.gen && f.status !== 'planned' && f.status !== 'skipped' && f.date && f.date <= today && f.date.slice(0,7) === mNow){
        if(f.type === 'income') inc += +f.amount || 0;
        else exp += +f.amount || 0;
      }
    });
    var bal = inc - exp;
    var sizeWarn = '';
    try{
      var sz = JSON.stringify(data).length;
      if(sz > 1.5 * 1024 * 1024){
        sizeWarn = '<div class="bulk-bar" style="border-color:#f59e0b;color:#92400e">⚠️ 本地数据 ' + (sz/1024/1024).toFixed(1) + ' MB，已接近浏览器上限，建议备份后导出归档。</div>';
      }
    }catch(e){}
    var top3 = typeof global.v5Top3Today === 'function' ? global.v5Top3Today() : '';
    var secondary =
      '<div class="today-mc"><div class="t">🚨 已逾期</div><div class="n" style="color:' + (od>0?'#ef4444':'var(--text)') + '">' + od + '</div><div class="d">条需要处理</div></div>' +
      '<div class="today-mc"><div class="t">⏰ 今日截止</div><div class="n">' + td + '</div><div class="d">条事项</div></div>';
    if(!global.WorkbenchModules || global.WorkbenchModules.isEnabled('sport')) secondary +=
      '<div class="today-mc"><div class="t">🏃 本周运动</div><div class="n">' + wkMins + '</div><div class="d">分钟 · 我的目标 ' + goalMinutes + '</div></div>';
    if(!global.WorkbenchModules || global.WorkbenchModules.isEnabled('finance')) secondary +=
      '<div class="today-mc"><div class="t">💰 本月结余</div><div class="n" style="color:' + (bal>=0?'#10b981':'#ef4444') + '">' + (bal>=0?'+':'-') + Math.abs(bal).toFixed(2) + '</div><div class="d">元</div></div>';
    var kpi =
      '<div class="today-mustdo" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' + top3 + '</div>' +
      '<div class="today-mustdo" style="background:transparent;border:0;box-shadow:none;padding:0;margin-top:6px">' +
      secondary + '</div>';
    var healthNudge='';
    if((!global.WorkbenchModules || global.WorkbenchModules.isEnabled('sport')) && health && health.todayPlan && !health.todayDone && !health.todayPlan.plan.skipped){
      var hp=health.todayPlan;
      var safeType=global.esc?global.esc(hp.plan.type):String(hp.plan.type||'运动');
      var safeNote=global.esc?global.esc(hp.plan.note||'按今天的状态完成即可，实际时长可以调整。'):String(hp.plan.note||'');
      healthNudge='<div class="today-health-nudge"><div><span>今天的运动</span><b>'+safeType+' · '+(+hp.plan.minutes||0)+' 分钟</b><small>'+safeNote+'</small></div>'
        +'<div><button class="btn primary" onclick="completePlan(\''+hp.key+'\','+hp.dayIdx+')">完成并记录</button><button class="btn" onclick="setView(\'sport\')">打开健康首页</button></div></div>';
    }
    return {
      banner: typeof global.v5DailyBanner === 'function' ? global.v5DailyBanner() : '',
      recent: typeof global.v5RecentQuickAdds === 'function' ? global.v5RecentQuickAdds() : '',
      kpi: kpi,
      health: healthNudge,
      sizeWarn: sizeWarn
    };
  }
  global.WorkbenchOverviewDomain = { buildOverviewEnhancements: buildOverviewEnhancements };
})(window);

/* ===== FILE: domain/finance/metrics.js ===== */
(function(global){
  function data(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function today(){ return typeof global.todayStr==='function' ? global.todayStr() : new Date().toISOString().slice(0,10); }
  function addDays(ds, amount){
    var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+amount);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function monthKey(ds){ return String(ds||today()).slice(0,7); }
  function shiftMonth(key, amount){
    var parts=key.split('-'), d=new Date(+parts[0],+parts[1]-1+amount,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function matchesSearch(f){
    return typeof global.kwOf==='function' ? global.kwOf((f.category||'')+' '+(f.note||'')) : true;
  }
  function isActual(f){
    return !!f && !f.gen && f.status!=='planned' && f.status!=='skipped' && !!f.date && f.date<=today();
  }
  function isPending(f){
    if(!f||!f.date) return false;
    if(f.gen) return (f.planState||'pending')==='pending';
    return f.date>today() && f.status!=='skipped';
  }
  function actualRecords(opts){
    opts=opts||{};
    return (data().finances||[]).filter(function(f){ return isActual(f)&&(!opts.search||matchesSearch(f)); })
      .slice().sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
  }
  function plannedRecords(days){
    var end=addDays(today(),days==null?30:days);
    return (data().finances||[]).filter(function(f){ return isPending(f)&&f.date<=end; })
      .slice().sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
  }
  function totals(records){
    var inc=0,exp=0;
    (records||[]).forEach(function(f){ if(f.type==='income')inc+=+f.amount||0;else exp+=+f.amount||0; });
    var balance=inc-exp;
    return {records:records||[],income:inc,expense:exp,balance:balance,saveRate:inc>0?balance/inc*100:0};
  }
  function financeTotals(){ return totals(actualRecords({search:true})); }
  function monthSummary(key){
    key=key||monthKey();
    var summary=totals(actualRecords().filter(function(f){ return monthKey(f.date)===key; }));
    summary.month=key;
    return summary;
  }
  function periodRecords(period,type){
    var current=monthKey(), key=period==='last'?shiftMonth(current,-1):current;
    return actualRecords({search:true}).filter(function(f){
      var inPeriod=period==='all'||monthKey(f.date)===key;
      return inPeriod&&(type==='all'||!type||f.type===type);
    });
  }
  function aggregate(view){
    var map={};
    actualRecords().forEach(function(f){
      var k=view==='year'?f.date.slice(0,4):f.date.slice(0,7);
      if(!map[k])map[k]={inc:0,exp:0};
      if(f.type==='income')map[k].inc+=+f.amount||0;else map[k].exp+=+f.amount||0;
    });
    var keys=Object.keys(map).sort();
    if(view==='month')keys=keys.slice(-12);
    return {map:map,keys:keys};
  }
  function categorySummary(key){
    var map={};
    monthSummary(key).records.forEach(function(f){
      var c=f.category||'其他';if(!map[c])map[c]={income:0,expense:0};
      if(f.type==='income')map[c].income+=+f.amount||0;else map[c].expense+=+f.amount||0;
    });
    return Object.keys(map).map(function(name){ return {name:name,income:map[name].income,expense:map[name].expense}; })
      .sort(function(a,b){ return b.expense-a.expense; });
  }
  function budgetConfig(){
    var d=data();if(!d.prefs||typeof d.prefs!=='object')d.prefs={};
    if(!d.prefs.financeConfig||typeof d.prefs.financeConfig!=='object')d.prefs.financeConfig={categoryBudgets:{}};
    if(!d.prefs.financeConfig.categoryBudgets||typeof d.prefs.financeConfig.categoryBudgets!=='object')d.prefs.financeConfig.categoryBudgets={};
    return {total:+d.monthlyBudget||0,categories:d.prefs.financeConfig.categoryBudgets};
  }
  function budgetSummary(key){
    var cfg=budgetConfig(), month=monthSummary(key), categoryActual={};
    categorySummary(key).forEach(function(c){categoryActual[c.name]=c.expense;});
    var categories=Object.keys(cfg.categories).filter(function(k){return +cfg.categories[k]>0;}).map(function(name){
      var budget=+cfg.categories[name]||0,spent=+categoryActual[name]||0;
      return {name:name,budget:budget,spent:spent,left:budget-spent,pct:budget?Math.round(spent/budget*100):0};
    }).sort(function(a,b){return b.pct-a.pct;});
    return {total:cfg.total,spent:month.expense,left:cfg.total-month.expense,pct:cfg.total?Math.round(month.expense/cfg.total*100):0,categories:categories};
  }
  function recurringTemplates(){
    return (data().finances||[]).filter(function(f){return !f.gen&&(f.recur==='month'||f.recur==='year');})
      .slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
  }
  function fundSummary(){
    var fs=(data().funds||[]).filter(function(f){ return typeof global.kwOf==='function' ? global.kwOf((f.name||'')+' '+(f.code||'')+' '+(f.type||'')) : true; });
    var up=0,down=0,holdTot=0;
    fs.forEach(function(f){
      var c=typeof global.dailyChg==='function'?global.dailyChg(f):0;if(c>0)up++;else if(c<0)down++;
      var p=typeof global.holdProfit==='function'?global.holdProfit(f):null;if(p!=null)holdTot+=p;
    });
    var marketValue=fs.reduce(function(s,f){return s+(typeof global.fundValue==='function'?global.fundValue(f):0);},0);
    return {funds:fs,up:up,down:down,holdTot:holdTot,marketValue:marketValue,holding:fs.filter(function(f){return +f.shares>0;}),watch:fs.filter(function(f){return !(+f.shares>0);})};
  }
  global.WorkbenchFinanceMetrics={
    today:today,monthKey:monthKey,shiftMonth:shiftMonth,isActual:isActual,isPending:isPending,
    actualRecords:actualRecords,plannedRecords:plannedRecords,financeTotals:financeTotals,monthSummary:monthSummary,
    periodRecords:periodRecords,aggregate:aggregate,categorySummary:categorySummary,budgetConfig:budgetConfig,
    budgetSummary:budgetSummary,recurringTemplates:recurringTemplates,fundSummary:fundSummary
  };
})(window);

/* ===== FILE: domain/research/summary.js ===== */
(function(global){
  var WRITING=['idea','draft','writing','internal','preparing'];
  var SUBMITTED=['submitted','review','rereview','transferred'];
  var REVISION=['major','minor','revision'];
  var DONE=['accepted','published'];
  var ARCHIVED=['rejected','archived','withdrawn'];
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function today(){ return typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10); }
  function daysTo(due){ return typeof global.daysBetween === 'function' ? global.daysBetween(today(),due) : 9999; }
  function statusOfPaper(p){
    if(typeof global.curStep === 'function'){
      var step=global.curStep(p);
      if(step&&step.status)return step.status;
    }
    return p&&p.status?p.status:'idea';
  }
  function kindOfPaper(p){ return (p&&p.kind&&global.PAPER_KIND&&global.PAPER_KIND[p.kind])?p.kind:'sub'; }
  function isActivePaper(p){ return DONE.concat(ARCHIVED).indexOf(statusOfPaper(p))<0; }
  function paperCounts(){
    var papers=(getData().papers||[]);
    var out={total:papers.length,plan:0,sub:0,collab:0,active:0,writing:0,submitted:0,revision:0,done:0,archived:0,waiting:0,missingNext:0,accepted:0,rejected:0,revise:0};
    papers.forEach(function(p){
      var kind=kindOfPaper(p);out[kind]=(out[kind]||0)+1;
      var st=statusOfPaper(p);
      if(WRITING.indexOf(st)>=0)out.writing+=1;
      else if(SUBMITTED.indexOf(st)>=0)out.submitted+=1;
      else if(REVISION.indexOf(st)>=0){out.revision+=1;out.revise+=1;}
      else if(DONE.indexOf(st)>=0){out.done+=1;out.accepted+=1;}
      else {out.archived+=1;if(ARCHIVED.indexOf(st)>=0)out.rejected+=1;}
      if(isActivePaper(p)){
        out.active+=1;
        if(p.waitingFor)out.waiting+=1;
        if(!p.nextAction&&!p.waitingFor)out.missingNext+=1;
      }
    });
    return out;
  }
  function paperAlerts(){
    return (getData().papers||[]).filter(isActivePaper).map(function(p){
      var candidates=[];
      if(p.nextDue)candidates.push({due:p.nextDue,label:p.nextAction||'下一步行动'});
      if(p.rebuttalDue)candidates.push({due:p.rebuttalDue,label:'审稿回复'});
      if(p.followUpAt)candidates.push({due:p.followUpAt,label:'跟进 '+(p.waitingFor||'等待事项')});
      candidates.sort(function(a,b){return String(a.due).localeCompare(String(b.due));});
      if(!candidates.length)return null;
      var first=candidates[0];var days=daysTo(first.due);
      return {paper:p,due:first.due,label:first.label,days:days,overdue:days<0,urgent:days>=0&&days<=7};
    }).filter(Boolean).sort(function(a,b){return String(a.due).localeCompare(String(b.due));});
  }
  function nextActions(){
    return (getData().papers||[]).filter(isActivePaper).filter(function(p){return p.nextAction||p.waitingFor;}).map(function(p){
      var waiting=!!p.waitingFor;
      return {paper:p,waiting:waiting,text:waiting?('跟进：'+p.waitingFor):p.nextAction,due:waiting?p.followUpAt:p.nextDue,days:(waiting?p.followUpAt:p.nextDue)?daysTo(waiting?p.followUpAt:p.nextDue):null};
    }).sort(function(a,b){
      if(a.days===null&&b.days===null)return 0;if(a.days===null)return 1;if(b.days===null)return -1;return a.days-b.days;
    });
  }
  function deadlineItems(){
    var data=getData();var out=[];
    paperAlerts().forEach(function(x){out.push({type:'paper',id:x.paper.id,title:x.paper.title,label:x.label,due:x.due,days:x.days});});
    (data.patents||[]).forEach(function(p){if(p.feeDue){out.push({type:'patent',id:p.id,title:p.title,label:'专利缴费 / 答复',due:p.feeDue,days:daysTo(p.feeDue)});}});
    (data.rprojects||[]).forEach(function(p){if(p.end&&(p.status||'active')!=='closed'){out.push({type:'project',id:p.id,title:p.title,label:'项目结束 / 结题',due:p.end,days:daysTo(p.end)});}});
    (data.items||[]).filter(function(i){return i.cat==='research'&&i.status!=='done'&&i.due&&i.sourceType!=='paper-action';}).forEach(function(i){out.push({type:'task',id:i.id,title:i.title,label:'科研事项',due:i.due,days:daysTo(i.due)});});
    return out.sort(function(a,b){return a.days-b.days;});
  }
  function patentCounts(){
    var patents=(getData().patents||[]);var out={total:patents.length,active:0,granted:0,dueSoon:0};
    patents.forEach(function(p){
      var st=(typeof global.curPatStep==='function'&&global.curPatStep(p)&&global.curPatStep(p).status)||p.status||'draft';
      if(st==='granted')out.granted+=1;else out.active+=1;
      if(p.feeDue){var d=daysTo(p.feeDue);if(d>=0&&d<=30)out.dueSoon+=1;}
    });
    return out;
  }
  function projectCounts(){
    var list=(getData().rprojects||[]);var out={total:list.length,active:0,endingSoon:0,funded:0};
    list.forEach(function(p){
      if((p.status||'active')!=='done'&&(p.status||'active')!=='closed')out.active+=1;
      if(+p.fund>0)out.funded+=1;
      if(p.end){var d=daysTo(p.end);if(d>=0&&d<=45)out.endingSoon+=1;}
    });
    return out;
  }
  global.WorkbenchResearchSummary={
    paperCounts:paperCounts,paperAlerts:paperAlerts,nextActions:nextActions,deadlineItems:deadlineItems,
    patentCounts:patentCounts,projectCounts:projectCounts,statusOfPaper:statusOfPaper,kindOfPaper:kindOfPaper,isActivePaper:isActivePaper
  };
})(window);

/* ===== FILE: domain/life/summary.js ===== */
(function(global){
  function getData(){ return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{}); }
  function today(){ return typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10); }
  function addDays(ds,offset){
    var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+offset);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function dayDiff(a,b){
    if(typeof global.daysBetween==='function')return global.daysBetween(a,b);
    return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
  }
  function lifeTasks(){return (getData().items||[]).filter(function(i){return i.cat==='life';});}
  function taskGroups(){
    var td=today(),weekEnd=addDays(td,7),open=lifeTasks().filter(function(i){return i.status!=='done';});
    function sortDue(a,b){return String(a.due||'9999-99-99').localeCompare(String(b.due||'9999-99-99'));}
    return {
      today:open.filter(function(i){return i.due&&i.due<=td;}).sort(sortDue),
      upcoming:open.filter(function(i){return i.due>td&&i.due<=weekEnd;}).sort(sortDue),
      unscheduled:open.filter(function(i){return !i.due;}).sort(function(a,b){return String(a.title).localeCompare(String(b.title));}),
      later:open.filter(function(i){return i.due>weekEnd;}).sort(sortDue),
      completed:lifeTasks().filter(function(i){return i.status==='done';}).sort(sortDue).reverse(),
      open:open.length
    };
  }
  function lifeTaskSummary(){
    var groups=taskGroups();
    return {total:lifeTasks().length,open:groups.open,due:groups.today.length+groups.upcoming.length,today:groups.today.length,upcoming7:groups.upcoming.length,unscheduled:groups.unscheduled.length};
  }
  function normalizeBookStatus(st){
    if(['reading','in_progress','current'].indexOf(st)>=0)return 'reading';
    if(['done','finished','read'].indexOf(st)>=0)return 'done';
    return 'want';
  }
  function bookSummary(){
    var books=getData().books||[],out={total:books.length,reading:0,done:0,wishlist:0,current:[],next:null};
    books.forEach(function(b){var st=normalizeBookStatus(b.status);if(st==='reading'){out.reading++;out.current.push(b);}else if(st==='done')out.done++;else out.wishlist++;});
    out.current.sort(function(a,b){return String(a.nextDue||a.startDate||'9999').localeCompare(String(b.nextDue||b.startDate||'9999'));});
    out.next=out.current[0]||null;return out;
  }
  function travelStatus(t){
    var td=today();if(!t||!t.start||!t.end)return 'planning';if(td<t.start)return 'upcoming';if(td>t.end)return 'past';return 'ongoing';
  }
  function checklistItems(t){
    return (t&&Array.isArray(t.checklist)?t.checklist:[]).map(function(item){return typeof item==='string'?{text:item,done:false}:{text:item.text||'',done:!!item.done};}).filter(function(item){return item.text;});
  }
  function travelChecklistProgress(t){
    var items=checklistItems(t),done=items.filter(function(i){return i.done;}).length;
    return {items:items,done:done,total:items.length,pct:items.length?Math.round(done/items.length*100):0};
  }
  function isActualFinance(f){return f&&!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date&&f.date<=today();}
  function travelSpent(t){
    var linked=(getData().finances||[]).filter(function(f){return f.travelId===t.id&&f.type==='expense'&&isActualFinance(f);});
    if(linked.length)return linked.reduce(function(s,f){return s+(+f.amount||0);},0);
    return +t.spent||0;
  }
  function travelSummary(){
    var list=getData().travels||[],out={total:list.length,upcoming:0,ongoing:0,planning:0,past:0,budgetTotal:0,spentTotal:0,next:null};
    list.forEach(function(t){var st=travelStatus(t);out[st]=(out[st]||0)+1;out.budgetTotal+=+t.budget||0;out.spentTotal+=travelSpent(t);});
    var active=list.filter(function(t){var st=travelStatus(t);return st!=='past';}).slice().sort(function(a,b){return String(a.start||'9999-99-99').localeCompare(String(b.start||'9999-99-99'));});
    out.next=active[0]||null;return out;
  }
  function nextImportantDate(a){
    if(!a||!/^\d{2}-\d{2}$/.test(a.date||''))return null;
    var td=today(),year=+td.slice(0,4),candidate=year+'-'+a.date;
    if(candidate<td)candidate=(year+1)+'-'+a.date;
    return {date:candidate,days:dayDiff(td,candidate)};
  }
  function importantDates(){
    return (getData().anniversaries||[]).map(function(a){return {item:a,next:nextImportantDate(a)};}).filter(function(x){return !!x.next;}).sort(function(a,b){return a.next.days-b.next.days;});
  }
  function anniversarySummary(){
    var list=importantDates(),out={total:(getData().anniversaries||[]).length,upcoming7:0,upcoming30:0,next:list[0]||null,items:list};
    list.forEach(function(x){if(x.next.days<=7)out.upcoming7++;if(x.next.days<=30)out.upcoming30++;});return out;
  }
  function homeModel(){
    var tasks=taskGroups(),books=bookSummary(),travels=travelSummary(),dates=anniversarySummary();
    return {tasks:tasks,books:books,travels:travels,dates:dates,focusCount:tasks.today.length+tasks.upcoming.length+(travels.next?1:0)+(dates.next&&dates.next.next.days<=30?1:0)};
  }
  global.WorkbenchLifeSummary={
    today:today,addDays:addDays,dayDiff:dayDiff,lifeTasks:lifeTasks,taskGroups:taskGroups,lifeTaskSummary:lifeTaskSummary,
    normalizeBookStatus:normalizeBookStatus,bookSummary:bookSummary,travelStatus:travelStatus,checklistItems:checklistItems,
    travelChecklistProgress:travelChecklistProgress,travelSpent:travelSpent,travelSummary:travelSummary,
    nextImportantDate:nextImportantDate,importantDates:importantDates,anniversarySummary:anniversarySummary,homeModel:homeModel
  };
})(window);

/* ===== FILE: domain/health/metrics.js ===== */
(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function dateAdd(ds, amount){
    if(typeof global.slotDate === 'function') return global.slotDate(ds, amount);
    var d=new Date(ds+'T00:00:00');
    d.setDate(d.getDate()+amount);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function weekRange(){
    var today=typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10);
    var mon=typeof global.mondayOf === 'function' ? global.mondayOf(today) : today;
    var sun=dateAdd(mon,6);
    return { today:today, mon:mon, sun:sun };
  }
  function healthGoals(){
    var data=getData();
    if(!data.prefs || typeof data.prefs!=='object') data.prefs={};
    var raw=data.prefs.healthGoals||{};
    var minutes=Math.max(0,Math.round(+raw.weeklyMinutes||150));
    var sessions=Math.max(0,Math.round(+raw.weeklySessions||3));
    return { weeklyMinutes:minutes, weeklySessions:sessions };
  }
  function planForDate(ds){
    if(!ds) return null;
    var key=typeof global.mondayOf==='function' ? global.mondayOf(ds) : ds;
    var dayIdx=(new Date(ds+'T00:00:00').getDay()+6)%7;
    var slots=typeof global.weekPlanSlots==='function' ? global.weekPlanSlots(key) : (((getData().weekPlans||{})[key])||[]);
    var plan=(slots||[])[dayIdx]||null;
    return plan ? { key:key, dayIdx:dayIdx, date:ds, plan:plan } : null;
  }
  function completedForDate(ds, plan){
    return (getData().items||[]).filter(function(i){
      if(i.cat!=='sport'||i.status!=='done'||i.due!==ds) return false;
      return !plan || !plan.type || i.sportType===plan.type || (i.planKey&&i.planDay!=null);
    });
  }
  function sportSummary(){
    var data=getData(), range=weekRange(), goals=healthGoals();
    var logs=(data.items||[]).filter(function(i){ return i.cat==='sport'; });
    var doneLogs=logs.filter(function(i){ return i.status==='done'; });
    var weekLogs=doneLogs.filter(function(i){ return i.due && i.due>=range.mon && i.due<=range.today; });
    var completed=weekLogs.reduce(function(s,i){ return s + (+i.minutes||0); },0);
    var totalLogged=doneLogs.reduce(function(s,i){ return s + (+i.minutes||0); },0);
    var planned=0, plannedSessions=0;
    var weekSlots=typeof global.weekPlanSlots === 'function' ? global.weekPlanSlots(range.mon) : (((data.weekPlans||{})[range.mon])||[]);
    (weekSlots||[]).forEach(function(s){
      if(s&&!s.skipped){ planned += (+s.minutes||0); plannedSessions += 1; }
    });
    var todayPlan=planForDate(range.today);
    var todayDone=todayPlan ? completedForDate(range.today,todayPlan.plan).length>0 : completedForDate(range.today).length>0;
    var recent=doneLogs.slice().sort(function(a,b){ return String(b.due||b.created||'').localeCompare(String(a.due||a.created||'')); })[0]||null;
    var minutePct=goals.weeklyMinutes>0?Math.min(100,Math.round(completed/goals.weeklyMinutes*100)):0;
    var sessionPct=goals.weeklySessions>0?Math.min(100,Math.round(weekLogs.length/goals.weeklySessions*100)):0;
    return {
      totalLogs:doneLogs.length,
      weekDoneMinutes:completed,
      weekDoneSessions:weekLogs.length,
      weekPlannedMinutes:planned,
      weekPlannedSessions:plannedSessions,
      totalLoggedMinutes:totalLogged,
      minuteProgress:minutePct,
      sessionProgress:sessionPct,
      remainingMinutes:Math.max(0,goals.weeklyMinutes-completed),
      remainingSessions:Math.max(0,goals.weeklySessions-weekLogs.length),
      todayPlan:todayPlan,
      todayDone:todayDone,
      recentLog:recent,
      goals:goals,
      range:range
    };
  }
  function weightSummary(){
    var ws=(getData().weights||[]).slice().sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); });
    var latest=ws.length ? ws[ws.length-1] : null;
    var first=ws.length ? ws[0] : null;
    var latestWeight=latest && latest.weight!=null ? +latest.weight : null;
    var firstWeight=first && first.weight!=null ? +first.weight : null;
    var today=typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10);
    var from7=dateAdd(today,-6), from30=dateAdd(today,-29);
    var recent7=ws.filter(function(w){ return w.date>=from7&&w.date<=today&&w.weight!=null; });
    var recent30=ws.filter(function(w){ return w.date>=from30&&w.date<=today&&w.weight!=null; });
    var avg7=recent7.length?recent7.reduce(function(sum,w){ return sum+(+w.weight||0); },0)/recent7.length:null;
    var change30=recent30.length>=2?+(+recent30[recent30.length-1].weight-(+recent30[0].weight)).toFixed(1):null;
    return {
      count: ws.length,
      latest: latest,
      latestWeight: latestWeight,
      diff: latestWeight!=null && firstWeight!=null ? +(latestWeight-firstWeight).toFixed(1) : null,
      avg7: avg7==null?null:+avg7.toFixed(1),
      change30: change30,
      latestBodyFat:latest&&latest.bodyFat!=null?+latest.bodyFat:null,
      latestWaist:latest&&latest.waist!=null?+latest.waist:null,
      target: getData().targetWeight || null
    };
  }
  function habitSummary(){
    if(global.WorkbenchHabitMetrics&&typeof global.WorkbenchHabitMetrics.summary==='function'){
      var modern=global.WorkbenchHabitMetrics.summary(),totalWeek=modern.active.reduce(function(sum,m){return sum+m.weekDone;},0);
      return {total:modern.active.length,doneToday:modern.doneToday,totalWeek:totalWeek};
    }
    var data=getData(), today=typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10);
    var habits=(data.habits||[]);
    var doneToday=0, totalWeek=0;
    var mon=typeof global.mondayOf === 'function' ? global.mondayOf(today) : today;
    habits.forEach(function(h){
      var logs=h.logs||{};
      if(logs[today]) doneToday += 1;
      Object.keys(logs).forEach(function(k){ if(k>=mon && k<=today) totalWeek += 1; });
    });
    return { total:habits.length, doneToday:doneToday, totalWeek:totalWeek };
  }
  global.WorkbenchHealthMetrics = {
    weekRange: weekRange,
    healthGoals: healthGoals,
    planForDate: planForDate,
    completedForDate: completedForDate,
    sportSummary: sportSummary,
    weightSummary: weightSummary,
    habitSummary: habitSummary
  };
})(window);

/* ===== FILE: domain/habit/metrics.js ===== */
(function(global){
  function getData(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function today(){return typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10);}
  function addDays(ds,n){var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function weekday(ds){var d=new Date(ds+'T00:00:00');return (d.getDay()+6)%7;}
  function monday(ds){return addDays(ds,-weekday(ds));}
  function weekDates(ds){var mon=monday(ds);return Array.from({length:7},function(_,i){return addDays(mon,i);});}
  function isActive(h){return h&&h.status!=='paused'&&h.status!=='archived';}
  function daysFor(h){
    if(Array.isArray(h.days)&&h.days.length)return h.days.map(Number).filter(function(x){return x>=0&&x<=6;});
    return h.freq==='weekly'?[0,1,2,3,4,5,6]:[0,1,2,3,4,5,6];
  }
  function doneOn(h,ds){return !!(h&&h.logs&&h.logs[ds]);}
  function restOn(h,ds){return !!(h&&h.skips&&h.skips[ds]);}
  function weekDone(h,ds){return weekDates(ds).filter(function(d){return d<=today()&&doneOn(h,d);}).length;}
  function weekTarget(h){return h.freq==='weekly'?Math.max(1,+h.target||1):daysFor(h).length;}
  function dueOn(h,ds){
    if(!isActive(h))return false;
    if(h.freq==='weekly')return weekDone(h,ds)<weekTarget(h);
    return daysFor(h).indexOf(weekday(ds))>=0;
  }
  function scheduleLabel(h){
    if(h.freq==='weekly')return '每周 '+weekTarget(h)+' 次';
    var days=daysFor(h);if(days.length===7)return '每天';
    var names=['周一','周二','周三','周四','周五','周六','周日'];return days.map(function(i){return names[i];}).join('、');
  }
  function dailyStreak(h){
    var ds=today(),count=0,started=false;
    for(var i=0;i<180;i++,ds=addDays(ds,-1)){
      if(!dueOn(h,ds))continue;
      if(!started&&ds===today()&&!doneOn(h,ds)&&!restOn(h,ds))continue;
      started=true;if(restOn(h,ds))continue;if(doneOn(h,ds))count++;else break;
    }
    return count;
  }
  function weeklyStreak(h){
    var mon=monday(today()),count=0;
    for(var w=0;w<26;w++){
      var start=addDays(mon,-7*w),dates=weekDates(start),done=dates.filter(function(d){return d<=today()&&doneOn(h,d);}).length;
      if(w===0&&done<weekTarget(h))continue;if(done>=weekTarget(h))count++;else break;
    }
    return count;
  }
  function consistency(h,days){
    days=days||28;var td=today();
    if(h.freq==='weekly'){
      var weeks=Math.max(1,Math.ceil(days/7)),score=0;
      for(var w=0;w<weeks;w++){var dates=weekDates(addDays(monday(td),-7*w)),done=dates.filter(function(d){return d<=td&&doneOn(h,d);}).length;score+=Math.min(1,done/weekTarget(h));}
      return Math.round(score/weeks*100);
    }
    var expected=0,done=0;
    for(var i=0;i<days;i++){var ds=addDays(td,-i);if(!dueOn(h,ds)||restOn(h,ds))continue;expected++;if(doneOn(h,ds))done++;}
    return expected?Math.round(done/expected*100):0;
  }
  function model(h){
    var td=today(),wd=weekDone(h,td),target=weekTarget(h),done=doneOn(h,td),rest=restOn(h,td),due=dueOn(h,td);
    return {habit:h,active:isActive(h),doneToday:done,restToday:rest,dueToday:due,resolvedToday:done||rest||!due,
      weekDone:wd,weekTarget:target,weekPct:Math.min(100,Math.round(wd/target*100)),schedule:scheduleLabel(h),
      streak:h.freq==='weekly'?weeklyStreak(h):dailyStreak(h),streakUnit:h.freq==='weekly'?'周':'次',consistency:consistency(h,28),
      cells:weekDates(td).map(function(ds){return {date:ds,done:doneOn(h,ds),rest:restOn(h,ds),due:h.freq==='weekly'?true:dueOn(h,ds),today:ds===td,future:ds>td};})};
  }
  function summary(){
    var all=(getData().habits||[]).map(model),active=all.filter(function(m){return m.active;}),todayList=active.filter(function(m){return m.dueToday&&!m.restToday;});
    return {all:all,active:active,paused:all.filter(function(m){return !m.active;}),today:todayList,dueToday:todayList.length,
      doneToday:todayList.filter(function(m){return m.doneToday;}).length,remaining:todayList.filter(function(m){return !m.doneToday;}).length,
      restToday:active.filter(function(m){return m.restToday;}).length};
  }
  function reviewWeeks(count){
    count=count||4;var out=[],td=today(),start=monday(td),active=(getData().habits||[]).filter(isActive);
    for(var w=count-1;w>=0;w--){var mon=addDays(start,-7*w),dates=weekDates(mon),done=0,target=0;active.forEach(function(h){done+=dates.filter(function(d){return d<=td&&doneOn(h,d);}).length;target+=h.freq==='weekly'?weekTarget(h):dates.filter(function(d){return d<=td&&dueOn(h,d)&&!restOn(h,d);}).length;});out.push({start:mon,done:done,target:target,pct:target?Math.min(100,Math.round(done/target*100)):0});}
    return out;
  }
  global.WorkbenchHabitMetrics={today:today,addDays:addDays,weekday:weekday,monday:monday,weekDates:weekDates,isActive:isActive,daysFor:daysFor,
    doneOn:doneOn,restOn:restOn,weekDone:weekDone,weekTarget:weekTarget,dueOn:dueOn,scheduleLabel:scheduleLabel,consistency:consistency,model:model,summary:summary,reviewWeeks:reviewWeeks};
})(window);

/* ===== FILE: domain/news/summary.js ===== */
(function(global){
  function normalizeTitle(title){return String(title||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'').slice(0,80);}
  function itemKey(item){
    var text=String((item&&item.link)||'')+'|'+normalizeTitle(item&&item.title),hash=2166136261;
    for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return 'n'+(hash>>>0).toString(36);
  }
  function dedupe(items){
    var map={},out=[];
    (items||[]).forEach(function(item){
      var normalized=normalizeTitle(item.title),key=normalized||itemKey(item),found=map[key];
      if(found){if(found.sources.indexOf(item.src||item.cat)<0)found.sources.push(item.src||item.cat);return;}
      var copy=Object.assign({},item,{key:itemKey(item),sources:[item.src||item.cat].filter(Boolean)});map[key]=copy;out.push(copy);
    });
    return out;
  }
  function search(items,keyword){
    var kw=String(keyword||'').trim().toLowerCase();if(!kw)return items||[];
    return (items||[]).filter(function(item){return String(item.title||'').toLowerCase().indexOf(kw)>=0||String(item.cat||'').toLowerCase().indexOf(kw)>=0;});
  }
  function focus(items,categories,state,limit){
    state=state||{read:{}};limit=limit||12;var unique=dedupe(items),groups={},seenOrder=[];
    unique.forEach(function(item){var cat=item.cat||'其他';if(!groups[cat]){groups[cat]=[];seenOrder.push(cat);}groups[cat].push(item);});
    var order=(categories||[]).filter(function(cat){return !!groups[cat];});
    seenOrder.forEach(function(cat){if(order.indexOf(cat)<0)order.push(cat);});
    Object.keys(groups).forEach(function(cat){groups[cat].sort(function(a,b){var ar=state.read&&state.read[a.key]?1:0,br=state.read&&state.read[b.key]?1:0;return ar-br||(b.date||0)-(a.date||0);});});
    var out=[],round=0,added=true;
    while(out.length<limit&&added){added=false;for(var i=0;i<order.length&&out.length<limit;i++){var item=groups[order[i]][round];if(item){out.push(item);added=true;}}round++;}
    return out;
  }
  function savedItems(state){
    return Object.keys((state&&state.saved)||{}).map(function(key){var item=state.saved[key];return Object.assign({},item,{key:key});}).sort(function(a,b){return (b.savedAt||0)-(a.savedAt||0);});
  }
  function sourceStats(feeds,status){
    var active=(feeds||[]).filter(function(f){return f.enabled!==false;}),ok=active.filter(function(f){return status&&status[f.id]===true;}).length,failed=active.filter(function(f){return status&&status[f.id]===false;}).length;
    return {active:active.length,ok:ok,failed:failed,pending:Math.max(0,active.length-ok-failed)};
  }
  global.WorkbenchNewsSummary={normalizeTitle:normalizeTitle,itemKey:itemKey,dedupe:dedupe,search:search,focus:focus,savedItems:savedItems,sourceStats:sourceStats};
})(window);

/* ===== FILE: app/module-registry.js ===== */
(function(global){
  var fallback = typeof global.renderModule === 'function' ? global.renderModule : function(){ return ''; };
  var modules = {};
  function register(name, fn){ if(name && typeof fn === 'function') modules[name] = fn; return fn; }
  function has(name){ return typeof modules[name] === 'function'; }
  function get(name){ return modules[name] || null; }
  function unregister(name){ delete modules[name]; }
  function render(name){
    var fn = get(name);
    if(fn) {
      try {
        return fn.apply(global, Array.prototype.slice.call(arguments, 1));
      } catch(e) {
        console.error('[Workbench] ModuleRegistry render error for: ' + name, e);
      }
    }
    try {
      return fallback.apply(global, Array.prototype.slice.call(arguments));
    } catch(e) {
      console.error('[Workbench] ModuleRegistry fallback render error for: ' + name, e);
      return '';
    }
  }
  global.WorkbenchModuleRegistry = {
    register: register,
    has: has,
    get: get,
    unregister: unregister,
    render: render,
    fallback: function(){ return fallback; }
  };
  global.renderModule = function(name){
    return render.apply(null, arguments);
  };
})(window);

/* ===== FILE: app/page-registry.js ===== */
(function(global){
  var fallback = function(name){
    if(typeof global.renderModule === 'function') return global.renderModule(name);
    return '';
  };
  var pages = {};
  function register(name, fn){ if(name && typeof fn === 'function') pages[name] = fn; return fn; }
  function has(name){ return typeof pages[name] === 'function'; }
  function get(name){ return pages[name] || null; }
  function unregister(name){ delete pages[name]; }
  function list(){ return Object.keys(pages); }
  function render(name){
    var fn = get(name);
    if(fn) {
      try {
        return fn.apply(global, Array.prototype.slice.call(arguments, 1));
      } catch(e) {
        console.error('[Workbench] PageRegistry render error for: ' + name, e);
      }
    }
    try {
      return fallback.apply(global, arguments);
    } catch(e) {
      console.error('[Workbench] PageRegistry fallback render error for: ' + name, e);
      return null;
    }
  }
  global.WorkbenchPageRegistry = {
    register: register,
    has: has,
    get: get,
    unregister: unregister,
    list: list,
    render: render,
    fallback: function(){ return fallback; }
  };
})(window);

/* ===== FILE: ui/helpers/panel-kit.js ===== */
(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function badge(text, bg, fg){ return '<span class="tag" style="background:'+bg+';color:'+fg+'">'+esc(text)+'</span>'; }
  function summaryCard(cls, title, value, desc, accent){
    return '<div class="card '+cls+'">'
      + '<div class="t">'+title+'</div>'
      + '<div class="n"'+(accent?' style="color:'+accent+'"':'')+'>'+value+'</div>'
      + '<div class="d">'+desc+'</div></div>';
  }
  function summaryGrid(cards, extraStyle){
    return '<div class="grid cards"'+(extraStyle?' style="'+extraStyle+'"':'')+'>'+cards.join('')+'</div>';
  }
  function infoPanel(title, body, opts){
    opts = opts || {};
    return '<div class="panel"'+(opts.style?' style="'+opts.style+'"':'')+'><div class="sec-head"><h2>'+title+'</h2>'+(opts.actions||'')+'</div>'+(body||'')+'</div>';
  }
  function empty(text, style){
    return '<div class="empty"'+(style?' style="'+style+'"':'')+'>'+esc(text)+'</div>';
  }
  function listOrEmpty(itemsHtml, emptyText){
    return itemsHtml && String(itemsHtml).trim() ? itemsHtml : empty(emptyText || '暂无内容');
  }
  function chips(items, opts){
    opts = opts || {};
    return '<div class="chips"'+(opts.style?' style="'+opts.style+'"':'')+'>'+(items||[]).map(function(it){
      return '<span class="ctab '+(it.active?'on':'')+'"'+(it.onClick?' onclick="'+it.onClick+'"':'')+'>'+(it.label||'')+'</span>';
    }).join('')+'</div>';
  }
  function toolbar(items, opts){
    opts = opts || {};
    return '<div class="chips"'+(opts.style?' style="'+opts.style+'"':'')+'>'+(items||[]).map(function(it){
      var cls = it.primary ? 'btn primary' : 'btn';
      return '<button class="'+cls+'"'+(it.onClick?' onclick="'+it.onClick+'"':'')+'>'+(it.label||'')+'</button>';
    }).join('')+'</div>';
  }
  function metaRow(parts, style){
    return '<div class="meta"'+(style?' style="'+style+'"':'')+'>'+(parts||[]).join('')+'</div>';
  }
  function list(itemsHtml, opts){
    opts = opts || {};
    return '<div class="list"'+(opts.style?' style="'+opts.style+'"':'')+'>'+itemsHtml+'</div>';
  }
  function collapsible(key, title, body, opts){
    opts = opts || {};
    var collapsed = opts.collapsed ? ' collapsed' : '';
    var style = opts.style ? ' style="'+opts.style+'"' : '';
    var h = '<div class="panel collapsible'+collapsed+'"'+style+' data-collapse="'+key+'">';
    h += '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>';
    h += '<div class="panel-b">'+(body||'')+'</div></div>';
    return h;
  }
  global.WorkbenchPanelKit = {
    esc: esc,
    badge: badge,
    summaryCard: summaryCard,
    summaryGrid: summaryGrid,
    infoPanel: infoPanel,
    empty: empty,
    listOrEmpty: listOrEmpty,
    chips: chips,
    toolbar: toolbar,
    metaRow: metaRow,
    list: list,
    collapsible: collapsible
  };
})(window);

/* ===== FILE: ui/components/research-panels.js ===== */
(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function badge(text, bg, fg){ return global.WorkbenchPanelKit ? global.WorkbenchPanelKit.badge(text, bg, fg) : ('<span class="tag" style="background:'+bg+';color:'+fg+'">'+text+'</span>'); }
  var legacyPapers = typeof global.renderPapers==='function' ? global.renderPapers : null;
  var legacyPatents = typeof global.renderPatents==='function' ? global.renderPatents : null;
  var legacyRProjects = typeof global.renderRProjects==='function' ? global.renderRProjects : null;
  global.renderPapersPanel = function(filter){
    if(!legacyPapers) return '';
    return legacyPapers(filter);
  };
  global.renderPatentsPanel = function(){
    if(!legacyPatents) return '';
    var pt=global.WorkbenchResearchSummary.patentCounts();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>📜 专利状态总览</h2></div><div class="meta">'
      + badge('总数 '+pt.total,'#ec489922','var(--research)')
      + badge('进行中 '+pt.active,'#10b98122','#10b981')
      + badge('已授权 '+pt.granted,'#6366f122','#6366f1')
      + badge('30天内缴费 '+pt.dueSoon,'#ef444422','#ef4444')
      + '</div></div>';
    return head + legacyPatents();
  };
  global.renderRProjectsPanel = function(){
    if(!legacyRProjects) return '';
    var rp=global.WorkbenchResearchSummary.projectCounts();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🏛️ 科研项目总览</h2></div><div class="meta">'
      + badge('总项目 '+rp.total,'#ec489922','var(--research)')
      + badge('活跃 '+rp.active,'#10b98122','#10b981')
      + badge('临近结束 '+rp.endingSoon,'#f59e0b22','#b45309')
      + badge('有经费 '+rp.funded,'#6366f122','#6366f1')
      + '</div></div>';
    return head + legacyRProjects();
  };
})(window);

/* ===== FILE: ui/components/life-panels.js ===== */
(function(global){
  function badge(text, bg, fg){ return global.WorkbenchPanelKit ? global.WorkbenchPanelKit.badge(text, bg, fg) : ('<span class="tag" style="background:'+bg+';color:'+fg+'">'+text+'</span>'); }
  var legacyBooks = typeof global.renderBooks==='function' ? global.renderBooks : null;
  var legacyTravels = typeof global.renderTravels==='function' ? global.renderTravels : null;
  var legacyAnniversaries = typeof global.renderAnniversaries==='function' ? global.renderAnniversaries : null;
  global.renderBooksPanel = function(){
    if(!legacyBooks) return '';
    var bk=global.WorkbenchLifeSummary.bookSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>📚 阅读状态总览</h2></div><div class="meta">'
      + badge('总数 '+bk.total,'#f59e0b22','var(--life)')
      + badge('在读 '+bk.reading,'#10b98122','#10b981')
      + badge('已读 '+bk.done,'#6366f122','#6366f1')
      + badge('待读 '+bk.wishlist,'#94a3b822','#475569')
      + '</div></div>';
    return head + legacyBooks();
  };
  global.renderTravelsPanel = function(){
    if(!legacyTravels) return '';
    var tv=global.WorkbenchLifeSummary.travelSummary();
    var bal=tv.budgetTotal-tv.spentTotal;
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🧳 出行概览</h2></div><div class="meta">'
      + badge('总行程 '+tv.total,'#f59e0b22','var(--life)')
      + badge('未出发 '+tv.upcoming,'#6366f122','#6366f1')
      + badge('进行中 '+tv.ongoing,'#10b98122','#10b981')
      + badge('预算结余 '+bal.toFixed(0),(bal>=0?'#10b98122':'#ef444422'),(bal>=0?'#10b981':'#ef4444'))
      + '</div></div>';
    return head + legacyTravels();
  };
  global.renderAnniversariesPanel = function(){
    if(!legacyAnniversaries) return '';
    var an=global.WorkbenchLifeSummary.anniversarySummary();
    var near=an.next&&an.next.item ? '最近 '+(global.esc?global.esc(an.next.item.name):an.next.item.name)+' · '+an.next.days+' 天后' : '最近一项待补充';
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🎉 纪念日概览</h2></div><div class="meta">'
      + badge('总数 '+an.total,'#f59e0b22','var(--life)')
      + badge('7天内 '+an.upcoming7,'#ef444422','#ef4444')
      + badge('30天内 '+an.upcoming30,'#6366f122','#6366f1')
      + '<span class="tag">'+near+'</span>'
      + '</div></div>';
    return head + legacyAnniversaries();
  };
})(window);

/* ===== FILE: ui/components/health-panels.js ===== */
(function(global){
  function badge(text, bg, fg){ return global.WorkbenchPanelKit ? global.WorkbenchPanelKit.badge(text, bg, fg) : ('<span class="tag" style="background:'+bg+';color:'+fg+'">'+text+'</span>'); }
  var legacyWeights = typeof global.renderWeights==='function' ? global.renderWeights : null;
  var legacySportLog = typeof global.renderSportLog==='function' ? global.renderSportLog : null;
  var legacySportPlan = typeof global.renderSportPlan==='function' ? global.renderSportPlan : null;
  global.renderWeightsPanel = function(){
    if(!legacyWeights) return '';
    return legacyWeights();
  };
  global.renderSportPlanPanel = function(){
    if(!legacySportPlan) return '';
    var sp=global.WorkbenchHealthMetrics.sportSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🎯 我的每周目标</h2><button class="btn small" onclick="openHealthGoalForm()">调整目标</button></div><div class="meta">'
      + badge('目标 '+sp.goals.weeklyMinutes+' 分钟','#8b5cf622','#8b5cf6')
      + badge('目标 '+sp.goals.weeklySessions+' 次','#6366f122','#6366f1')
      + badge('已完成 '+sp.weekDoneMinutes+' 分钟 / '+sp.weekDoneSessions+' 次','#10b98122','#10b981')
      + '</div></div>';
    return head + legacySportPlan();
  };
  global.renderSportLogPanel = function(){
    if(!legacySportLog) return '';
    var sp=global.WorkbenchHealthMetrics.sportSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🏃 运动记录摘要</h2></div><div class="meta">'
      + badge('总记录 '+sp.totalLogs,'#8b5cf622','#8b5cf6')
      + badge('累计 '+sp.totalLoggedMinutes+' 分','#10b98122','#10b981')
      + badge('本周 '+sp.weekDoneMinutes+' 分 · '+sp.weekDoneSessions+' 次','#6366f122','#6366f1')
      + '</div></div>';
    return head + legacySportLog();
  };
})(window);

/* ===== FILE: ui/pages/overview-page.js ===== */
(function(global){
  global.decorOverview = function(html){
    try {
      if(global.WorkbenchOverviewDomain && typeof global.WorkbenchOverviewDomain.buildOverviewEnhancements === 'function'){
        var extras = global.WorkbenchOverviewDomain.buildOverviewEnhancements();
        return (extras.banner || '') + (extras.recent || '') + (extras.sizeWarn || '') + (extras.kpi || '') + (extras.health || '') + html;
      }
    } catch(e) {
      console.error('[Workbench] decorOverview enhancement failed, using base overview', e);
    }
    // Fallback: basic banner from legacy helper functions
    var banner = typeof global.v5DailyBanner === 'function' ? global.v5DailyBanner() : '';
    var recent = typeof global.v5RecentQuickAdds === 'function' ? global.v5RecentQuickAdds() : '';
    return banner + recent + html;
  };
})(window);

/* ===== FILE: ui/pages/overview-page-main.js ===== */
(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  global.renderOverview = function(){
    var html='<div class="grid cards">';
    for(var c in global.CATS){
      if(global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(c)) continue;
      if(c==='finance'){
        var fin=global.WorkbenchOverviewSummary.financeSummary();
        html += '<div class="card finance"><div class="t">💰 总资产</div><div class="n">'+ fin.totalAssets.toFixed(0) +'</div><div class="d">'+ (fin.totalAssets?('基金 '+(fin.fundValue/fin.totalAssets*100).toFixed(0)+'% · 现金 '+(fin.cash/fin.totalAssets*100).toFixed(0)+'%'):'基金市值 + 现金结余(元)') +'</div></div>';
        continue;
      }
      var pg=global.WorkbenchOverviewSummary.catProgress(c);
      html += '<div class="card '+c+'"><div class="t">'+global.CATS[c].icon+' '+global.CATS[c].name+'</div>'
        + '<div class="n">'+pg.count+'</div>'
        + '<div class="bar"><i style="width:'+pg.pct+'%;background:'+global.CATS[c].color+'"></i></div></div>';
    }
    html+='</div>';
    var focus=global.WorkbenchOverviewSummary.focusItems();
    html+='<div class="panel" style="margin-top:14px"><h2>📌 今日聚焦（'+focus.today+'）</h2>';
    if(!focus.items.length) html+='<div class="empty">今天没有待办 / 逾期，状态很好 ✨</div>';
    else {
      html+='<div class="list">'+focus.items.slice(0,8).map(global.itemHTML).join('')+'</div>';
      if(focus.lateN) html+='<div class="d" style="color:#ef4444;margin-top:6px">⚠️ 其中有 '+focus.lateN+' 项已逾期</div>';
    }
    html+='</div>';
    var projs=global.WorkbenchOverviewSummary.activeProjects();
    if(projs.length){
      html+='<div class="panel" style="margin-top:14px"><h2>📁 进行中项目</h2><div class="list">';
      projs.forEach(function(x){
        html+='<div class="item"><div class="body"><div class="title">'+esc(x.project.name)+'</div>'
          + '<div class="meta"><span class="tag" style="background:#10b98122;color:var(--work)">里程碑 '+x.msDone+'/'+x.milestones.length+'</span><span class="tag" style="background:#10b98122;color:var(--work)">任务 '+x.tasks+'</span>' + (x.overdue?'<span class="tag" style="background:#ef444422;color:#ef4444">逾期 '+x.overdue+'</span>':'') + '</div>'
          + '<div class="bar"><i style="width:'+x.pct+'%;background:var(--work)"></i></div></div>'
          + '<div class="acts"><button class="icon-btn" onclick="setView(\'work\')">↗</button></div></div>';
      });
      html+='</div></div>';
    }
    var soon=global.WorkbenchOverviewSummary.upcomingItems();
    html+='<div class="panel" style="margin-top:14px"><h2>⏰ 近期待办 / 截止</h2>';
    html += !soon.length ? '<div class="empty">暂无带日期的待办，轻松～</div>' : '<div class="list">'+soon.map(global.itemHTML).join('')+'</div>';
    html+='</div>';
    return html;
  };
})(window);
(function(global){
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('overview', function(){ return (typeof global.decorOverview==='function' && typeof global.renderOverview==='function') ? global.decorOverview(global.renderOverview()) : ''; });
  }
})(window);

/* ===== FILE: ui/pages/work-page.js ===== */
(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function kit(){ return global.WorkbenchPanelKit || {}; }
  function selectors(){ return global.WorkbenchSelectors || {}; }
  function model(){ return selectors().workModuleModel ? selectors().workModuleModel() : { state:{}, projects:[], tmpItems:[], agendaItems:[], filteredItems:[], workView:global.workView||'list', collapseState:global.collapseState||{} }; }
  function renderTaskSnippet(item){
    return '<div class="ptask"><input type="checkbox" class="chk" ' + (item.status==='done'?'checked':'') + ' onchange="toggle(\'' + item.id + '\')">'
      + '<span class="ptitle ' + (item.status==='done'?'done':'') + '" onclick="openForm(\'work\',\'' + item.id + '\')">' + esc(item.title) + '</span>'
      + (item.isMilestone?'<span class="star" title="里程碑">★</span>':'')
      + '</div>';
  }
  function renderProjectMeta(summary){
    var p=[];
    var badge = global.WorkbenchPanelKit && global.WorkbenchPanelKit.badge;
    if(badge){
      p.push(badge('里程碑 '+summary.milestoneDone+'/'+summary.milestones.length,'#10b98122','var(--work)'));
      p.push(badge('任务 '+summary.tasks,'#10b98122','var(--work)'));
      if(summary.overdue) p.push(badge('逾期 '+summary.overdue,'#ef444422','#ef4444'));
      if(summary.riskMs) p.push(badge('风险里程碑 '+summary.riskMs,'#f59e0b22','#b45309'));
      if(summary.accuracy !== null) p.push(badge('估算准确率 '+summary.accuracy.toFixed(0)+'%','#6366f122','#6366f1'));
      return p.join('');
    }
    return '里程碑 '+summary.milestoneDone+'/'+summary.milestones.length+' · 任务 '+summary.tasks
      + (summary.overdue ? ' · 逾期 ' + summary.overdue : '')
      + (summary.riskMs ? ' · ⚠风险里程碑 ' + summary.riskMs : '')
      + (summary.accuracy !== null ? (' · 估算准确率 ' + summary.accuracy.toFixed(0) + '%') : '');
  }
  function renderProjectCard(summary){
    var p = summary.project;
    var k = kit();
    var healthBadge = p.status==='done'
      ? '✅'
      : (k.badge ? k.badge(summary.healthMeta[1], summary.healthMeta[0]+'22', summary.healthMeta[0]) : '<span class="tag" style="background:' + summary.healthMeta[0] + '22;color:' + summary.healthMeta[0] + ';margin-left:4px;font-size:11px">' + summary.healthMeta[1] + '</span>');
    var taskList = summary.items.length ? summary.sortedItems.map(renderTaskSnippet).join('') : (k.empty ? k.empty('暂无任务，点「＋任务」添加') : '<div class="empty">暂无任务，点「＋任务」添加</div>');
    return '<div class="card work">'
      + '<div class="t">' + esc(p.name) + ' ' + healthBadge + '</div>'
      + '<div class="n">' + summary.pct + '%</div>'
      + '<div class="d">' + renderProjectMeta(summary) + '</div>'
      + '<div class="bar"><i style="width:' + summary.pct + '%;background:var(--work)"></i></div>'
      + '<div class="ptasks"><div class="ph"><span>任务清单</span><span>' + summary.done + '/' + summary.items.length + '</span></div>' + taskList + '</div>'
      + '<div class="acts" style="margin-top:10px">'
      + '<button class="btn" onclick="openForm(\'work\',null,null,\'' + p.id + '\')">＋任务</button>'
      + '<button class="icon-btn" onclick="openProjectForm(\'' + p.id + '\')">✏️</button>'
      + '<button class="icon-btn" onclick="delProject(\'' + p.id + '\')">🗑️</button>'
      + '</div></div>';
  }
  function renderProjectSummaryCards(vm){
    var totals = { projects: vm.projects.length, active:0, overdue:0, risk:0 };
    vm.projects.forEach(function(p){
      var s=global.WorkbenchProjectHealth.summarizeProject(p);
      if((p.status||'active')!=='done') totals.active += 1;
      totals.overdue += s.overdue || 0;
      totals.risk += s.riskMs || 0;
    });
    var k=kit();
    if(k.summaryGrid){
      return k.summaryGrid([
        k.summaryCard('work','📁 项目总数',totals.projects,'活跃 '+totals.active+' 个'),
        k.summaryCard('work','📝 临时任务',vm.tmpItems.length,'未挂项目的工作事项'),
        k.summaryCard('work','🗓️ 已排期事项',vm.agendaItems.length,'带日期的工作任务'),
        k.summaryCard('work','⚠ 风险信号',totals.overdue + totals.risk,'逾期 '+totals.overdue+' · 风险里程碑 '+totals.risk, (totals.overdue+totals.risk)?'#ef4444':'var(--work)')
      ], 'margin-bottom:14px');
    }
    return '';
  }
  global.renderWorkProjects = function(){
    var vm = model();
    var k = kit();
    var body='';
    if(!vm.projects.length){
      body += k.empty ? k.empty('还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。') : '<div class="empty">还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。</div>';
    }else{
      body += '<div class="grid cards">';
      vm.projects.forEach(function(p){
        try {
          body += renderProjectCard(global.WorkbenchProjectHealth.summarizeProject(p));
        } catch(e) {
          console.error('[Workbench] Error rendering project card:', p && p.id, e);
          body += '<div class="card work"><div class="t">⚠️ 项目渲染错误</div><div class="d">该项目数据可能存在问题</div></div>';
        }
      });
      body += '</div>';
    }
    var actions = k.toolbar ? k.toolbar([{ label:'＋ 新项目', primary:true, onClick:'openProjectForm()' }]) : '<button class="btn primary" onclick="openProjectForm()">＋ 新项目</button>';
    var panel = k.infoPanel ? k.infoPanel('📁 项目管理', body, { actions: actions }) : '<div class="panel"><div class="sec-head"><h2>📁 项目管理</h2>'+actions+'</div>'+body+'</div>';
    return renderProjectSummaryCards(vm) + panel;
  };
  function renderWorkTabs(vm){
    var k=kit();
    if(k.chips){
      return k.chips([
        { label:'☰ 列表', active:vm.workView==='list', onClick:"setWorkView('list')" },
        { label:'🗂️ 看板', active:vm.workView==='board', onClick:"setWorkView('board')" }
      ], { style:'margin-top:14px' });
    }
    return '<div class="chips" style="margin-top:14px"><span class="ctab ' + (vm.workView==='list'?'on':'') + '" onclick="setWorkView(\'list\')">☰ 列表</span><span class="ctab ' + (vm.workView==='board'?'on':'') + '" onclick="setWorkView(\'board\')">🗂️ 看板</span></div>';
  }
  function renderItemList(items, emptyText){
    var k=kit();
    if(items && items.length){
      var html=items.map(global.itemHTML).join('');
      return k.list ? k.list(html) : '<div class="list">'+html+'</div>';
    }
    return k.empty ? k.empty(emptyText) : '<div class="empty">'+emptyText+'</div>';
  }
  function renderSection(key, title, body, opts){
    var k=kit();
    var collapsed = !!((model().collapseState||{})[key]);
    opts = Object.assign({ collapsed: collapsed }, opts || {});
    if(k.collapsible) return k.collapsible(key, title, body, opts);
    return '<div class="panel collapsible ' + (collapsed?'collapsed':'') + '"'+(opts.style?' style="'+opts.style+'"':'')+' data-collapse="'+key+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>'
      + '<div class="panel-b">'+body+'</div></div>';
  }
  function renderWorkModule(){
    var vm = model();
    var html = '';
    html += global.renderWorkProjects();
    html += renderSectionWithModel(vm, 'tmp_work', '📝 临时任务（' + vm.tmpItems.length + '）', renderItemList(vm.tmpItems, '暂无临时任务，点「＋ 新建」记录零散工作。'), {
      style:'margin-top:14px',
      headerActions:'<button class="btn primary" onclick="event.stopPropagation();openForm(\'work\')">＋ 新建</button>'
    });
    html += renderWorkTabs(vm);
    html += renderSectionWithModel(vm, 'cal_work', '📅 工作日历', global.renderCalendar('work'));
    html += renderSectionWithModel(vm, 'ag_work', '🗓️ 日程（按日期）', renderItemList(vm.agendaItems, '暂无工作日程。'), { style:'margin-top:14px' });
    var allBody = vm.workView==='board' ? global.renderKanban('work') : renderItemList(vm.filteredItems, '暂无工作事项。');
    html += renderSectionWithModel(vm, 'all_work', '📋 全部工作事项', allBody, { style:'margin-top:14px' });
    return html;
  }
  function renderSectionWithModel(vm, key, title, body, opts){
    var k=kit();
    var collapsed = !!((vm.collapseState||{})[key]);
    opts = Object.assign({ collapsed: collapsed }, opts || {});
    if(k.collapsible) return k.collapsible(key, title, body, opts);
    return '<div class="panel collapsible ' + (collapsed?'collapsed':'') + '"'+(opts.style?' style="'+opts.style+'"':'')+' data-collapse="'+key+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>'
      + '<div class="panel-b">'+body+'</div></div>';
  }
  global.renderWorkModule = renderWorkModule;
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('work', renderWorkModule);
  }
})(window);

/* ===== FILE: ui/pages/finance-page.js ===== */
(function(global){
  function data(){ return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{}); }
  function metrics(){ return global.WorkbenchFinanceMetrics; }
  function esc(s){ return global.esc?global.esc(s):String(s==null?'':s); }
  function money(v){ return (+v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function signMoney(v){ return (v>=0?'+':'-')+money(Math.abs(v)); }
  function chgColor(x){ return x>=0?'var(--up)':'var(--down)'; }
  function effortText(current,last){
    if(!last) return '上月暂无可比较数据';
    var diff=current-last,pct=Math.abs(diff/last*100);
    return (diff>=0?'较上月增加 ':'较上月减少 ')+pct.toFixed(0)+'%';
  }
  function renderTabs(){
    var items=[
      {id:'overview',label:'☀️ 财务首页'},
      {id:'records',label:'📒 收支明细'},
      {id:'budget',label:'🎯 预算与账单'},
      {id:'funds',label:'📈 基金'}
    ];
    var html='<div class="chips finance-tabs">';
    items.forEach(function(it){html+='<span class="ctab '+(global.financeTab===it.id?'on':'')+'" onclick="setFinanceTab(\''+it.id+'\')">'+it.label+'</span>';});
    return html+'</div>';
  }
  function progress(label,spent,budget){
    var pct=budget?Math.round(spent/budget*100):0,left=budget-spent;
    return '<div class="finance-budget-row"><div><b>'+esc(label)+'</b><span>'+money(spent)+' / '+money(budget)+'</span></div>'
      +'<div class="finance-progress"><i class="'+(pct>100?'over':'')+'" style="width:'+Math.min(100,Math.max(0,pct))+'%"></i></div>'
      +'<small>'+(left>=0?'剩余 '+money(left):'超出 '+money(Math.abs(left)))+' 元</small></div>';
  }
  function renderBudgetPanel(compact){
    var b=metrics().budgetSummary();
    if(!b.total){
      return '<section class="panel finance-budget-empty"><div><span>本月预算</span><h2>还没有设置预算</h2><p>设置一个适合自己的额度，用来了解节奏，不做强制考核。</p></div><button class="btn primary" onclick="openFinanceBudgetForm()">设置预算</button></section>';
    }
    var html='<section class="panel"><div class="finance-panel-head"><div><span>本月预算</span><h2>剩余 '+money(b.left)+' 元</h2></div><button class="btn small" onclick="openFinanceBudgetForm()">调整</button></div>'
      +progress('总预算',b.spent,b.total);
    if(!compact&&b.categories.length){
      html+='<div class="finance-category-budgets">';
      b.categories.forEach(function(c){html+=progress(c.name,c.spent,c.budget);});
      html+='</div>';
    }
    return html+'</section>';
  }
  function recordRow(f){
    var project=(data().rprojects||[]).find(function(p){return p.id===f.rprojectId;});
    var travel=(data().travels||[]).find(function(t){return t.id===f.travelId;});
    return '<div class="item finance-record"><div class="finance-record-icon '+f.type+'">'+(f.type==='income'?'收':'支')+'</div><div class="body">'
      +'<div class="title">'+esc(f.category||'未分类')+' <b class="finance-amount '+f.type+'">'+(f.type==='income'?'+':'-')+money(f.amount)+'</b></div>'
      +'<div class="meta"><span>'+esc(f.date)+'</span>'+(project?'<span>关联 '+esc(project.title)+'</span>':'')+(travel?'<span>出行 '+esc(travel.title)+'</span>':'')+(f.note?'<span>'+esc(f.note)+'</span>':'')+'</div></div>'
      +'<div class="acts"><button class="icon-btn" onclick="openFinanceForm(\''+f.id+'\')" title="编辑">✏️</button><button class="icon-btn" onclick="delFinance(\''+f.id+'\')" title="删除">🗑️</button></div></div>';
  }
  function billState(date){
    var t=metrics().today();if(date<t)return {label:'待确认',cls:'overdue'};if(date===t)return {label:'今天',cls:'today'};
    var days=typeof global.daysBetween==='function'?global.daysBetween(t,date):0;
    return {label:days+' 天后',cls:days<=7?'soon':''};
  }
  function renderUpcoming(limit){
    var list=metrics().plannedRecords(30);if(limit)list=list.slice(0,limit);
    if(!list.length)return '<div class="empty">未来 30 天没有待确认的固定收支。</div>';
    return '<div class="finance-bills">'+list.map(function(f){
      var state=billState(f.date);
      return '<div class="finance-bill '+state.cls+'"><div class="finance-bill-date"><b>'+esc(f.date.slice(5))+'</b><small>'+state.label+'</small></div>'
        +'<div class="finance-bill-body"><b>'+esc(f.category||'固定收支')+'</b><small>'+(f.type==='income'?'预计收入':'预计支出')+' · '+money(f.amount)+' 元</small></div>'
        +'<div class="finance-bill-actions"><button class="btn small primary" onclick="confirmFinancePlan(\''+f.id+'\')">确认入账</button>'
        +'<button class="btn small" onclick="openFinancePlanSource(\''+f.id+'\')">调整</button><button class="btn small quiet" onclick="skipFinancePlan(\''+f.id+'\')">本次忽略</button></div></div>';
    }).join('')+'</div>';
  }
  function renderCategorySummary(){
    var cats=metrics().categorySummary().filter(function(c){return c.expense>0;}).slice(0,5);
    if(!cats.length)return '<div class="empty">本月还没有支出分类。</div>';
    var total=cats.reduce(function(s,c){return s+c.expense;},0)||1;
    return '<div class="finance-category-list">'+cats.map(function(c,i){
      return '<div class="finance-category-row"><span class="finance-cat-dot c'+i+'"></span><b>'+esc(c.name)+'</b><div class="finance-mini-track"><i style="width:'+Math.round(c.expense/total*100)+'%"></i></div><span>'+money(c.expense)+'</span></div>';
    }).join('')+'</div>';
  }
  global.finAggChart=function(view){
    var agg=metrics().aggregate(view),map=agg.map,keys=agg.keys;if(!keys.length)return '<div class="empty">积累两个月记录后，这里会显示趋势。</div>';
    var W=580,H=170,padL=34,padR=12,padT=28,padB=26,maxAll=Math.max.apply(null,keys.map(function(k){return Math.max(map[k].inc,map[k].exp);}).concat([1]));
    var bw=(W-padL-padR)/keys.length,y=function(v){return padT+(H-padT-padB)*(1-v/maxAll);},grid='',bars='',lines=3;
    for(var g=0;g<=lines;g++){var gv=maxAll*g/lines,gy=y(gv);grid+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/><text x="'+(padL-6)+'" y="'+(gy+4)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+gv.toFixed(0)+'</text>';}
    keys.forEach(function(k,i){var x0=padL+bw*i+bw*.16,w=bw*.3,hi=Math.max(0,H-padB-y(map[k].inc)),he=Math.max(0,H-padB-y(map[k].exp));bars+='<rect x="'+x0.toFixed(1)+'" y="'+y(map[k].inc).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+hi.toFixed(1)+'" rx="3" fill="#10b981"/><rect x="'+(x0+w+3).toFixed(1)+'" y="'+y(map[k].exp).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+he.toFixed(1)+'" rx="3" fill="#ef4444"/><text x="'+(padL+bw*i+bw/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+(view==='year'?k:k.slice(2))+'</text>';});
    return '<div class="finance-chart"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="实际收支趋势"><rect x="14" y="8" width="9" height="9" rx="2" fill="#10b981"/><text x="27" y="16" font-size="10" fill="var(--muted)">收入</text><rect x="72" y="8" width="9" height="9" rx="2" fill="#ef4444"/><text x="85" y="16" font-size="10" fill="var(--muted)">支出</text>'+grid+bars+'</svg></div>';
  };
  global.finAggTable=function(view){
    var agg=metrics().aggregate(view);return agg.keys.slice().reverse().map(function(k){var m=agg.map[k],bal=m.inc-m.exp;return '<div class="item"><div class="body"><div class="title">'+k+'</div><div class="meta"><span>收 '+money(m.inc)+'</span><span>支 '+money(m.exp)+'</span><span>结余 '+signMoney(bal)+'</span></div></div></div>';}).join('');
  };
  function renderOverview(){
    var current=metrics().monthSummary(),last=metrics().monthSummary(metrics().shiftMonth(current.month,-1));
    var recent=current.records.slice().reverse().slice(0,5);
    return '<section class="finance-hero"><div><span>本月财务助手</span><h1>先看本月，再安排接下来的钱</h1><p>实际收支与未来计划分开统计，避免固定账单提前影响结余。</p></div><div><button class="btn" onclick="openFinanceForm(null,null,\'income\')">＋ 记收入</button><button class="btn primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 记支出</button></div></section>'
      +'<div class="finance-summary-grid"><div class="finance-summary-card"><span>本月收入</span><b class="income">'+money(current.income)+'</b><small>'+effortText(current.income,last.income)+'</small></div>'
      +'<div class="finance-summary-card"><span>本月支出</span><b class="expense">'+money(current.expense)+'</b><small>'+effortText(current.expense,last.expense)+'</small></div>'
      +'<div class="finance-summary-card"><span>本月结余</span><b>'+signMoney(current.balance)+'</b><small>只统计已发生记录</small></div>'
      +'<div class="finance-summary-card"><span>待确认账单</span><b>'+metrics().plannedRecords(30).length+'</b><small>未来 30 天与已到期计划</small></div></div>'
      +'<div class="finance-home-grid"><div class="finance-home-main">'+renderBudgetPanel(true)
      +'<section class="panel"><div class="finance-panel-head"><div><span>实际收支</span><h2>近 12 个月趋势</h2></div><button class="text-action" onclick="setFinanceTab(\'records\')">查看明细 →</button></div>'+global.finAggChart('month')+'</section></div>'
      +'<div class="finance-home-side"><section class="panel"><div class="finance-panel-head"><div><span>本月支出</span><h2>主要分类</h2></div></div>'+renderCategorySummary()+'</section>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>未来 30 天</span><h2>固定账单</h2></div><button class="text-action" onclick="setFinanceTab(\'budget\')">全部 →</button></div>'+renderUpcoming(4)+'</section></div></div>'
      +'<section class="panel finance-recent"><div class="finance-panel-head"><div><span>最近</span><h2>本月实际记录</h2></div><button class="btn small" onclick="setFinanceTab(\'records\')">全部明细</button></div>'+(recent.length?'<div class="list">'+recent.map(recordRow).join('')+'</div>':'<div class="empty">本月还没有实际收支记录。</div>')+'</section>';
  }
  function renderRecords(){
    var fs=metrics().periodRecords(global.financePeriod,global.financeType).slice().reverse();
    var summary={income:0,expense:0};fs.forEach(function(f){if(f.type==='income')summary.income+=+f.amount||0;else summary.expense+=+f.amount||0;});
    return '<section class="panel"><div class="finance-panel-head finance-record-head"><div><span>只展示已发生记录</span><h2>收支明细</h2></div><div><button class="btn" onclick="exportCSV()">导出 CSV</button><button class="btn primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 记一笔</button></div></div>'
      +'<div class="finance-filter-row"><div class="chips"><span class="ctab '+(global.financePeriod==='month'?'on':'')+'" onclick="setFinancePeriod(\'month\')">本月</span><span class="ctab '+(global.financePeriod==='last'?'on':'')+'" onclick="setFinancePeriod(\'last\')">上月</span><span class="ctab '+(global.financePeriod==='all'?'on':'')+'" onclick="setFinancePeriod(\'all\')">全部</span></div>'
      +'<div class="chips"><span class="ctab '+(global.financeType==='all'?'on':'')+'" onclick="setFinanceType(\'all\')">全部</span><span class="ctab '+(global.financeType==='expense'?'on':'')+'" onclick="setFinanceType(\'expense\')">支出</span><span class="ctab '+(global.financeType==='income'?'on':'')+'" onclick="setFinanceType(\'income\')">收入</span></div></div>'
      +'<div class="finance-filter-summary"><span>收入 '+money(summary.income)+'</span><span>支出 '+money(summary.expense)+'</span><b>结余 '+signMoney(summary.income-summary.expense)+'</b></div>'
      +(fs.length?'<div class="list">'+fs.map(recordRow).join('')+'</div>':'<div class="empty">当前筛选条件下没有记录。</div>')+'</section>';
  }
  function renderBudgetPage(){
    var templates=metrics().recurringTemplates(),b=metrics().budgetSummary();
    var catHtml=b.categories.length?'<div class="finance-category-budgets">'+b.categories.map(function(c){return progress(c.name,c.spent,c.budget);}).join('')+'</div>':'<div class="empty">还没有分类预算。可以在“调整预算”中按“分类:金额”添加。</div>';
    var templateHtml=templates.length?'<div class="list">'+templates.map(function(f){return '<div class="item"><div class="body"><div class="title">'+esc(f.category||'固定收支')+' <span class="tag">'+(f.recur==='month'?'每月':'每年')+'</span></div><div class="meta"><span>'+esc(f.date)+'</span><span>'+(f.type==='income'?'收入 ':'支出 ')+money(f.amount)+'</span></div></div><div class="acts"><button class="icon-btn" onclick="openFinanceForm(\''+f.id+'\')">✏️</button><button class="icon-btn" onclick="delFinance(\''+f.id+'\')">🗑️</button></div></div>';}).join('')+'</div>':'<div class="empty">还没有固定收支。记账时选择“每月”或“每年”即可创建。</div>';
    return '<div class="finance-budget-grid"><div>'+renderBudgetPanel(false)
      +'<section class="panel"><div class="finance-panel-head"><div><span>按分类控制节奏</span><h2>分类预算</h2></div><button class="btn small" onclick="openFinanceBudgetForm()">调整预算</button></div>'+catHtml+'</section></div>'
      +'<div><section class="panel"><div class="finance-panel-head"><div><span>已到期与未来 30 天</span><h2>待确认账单</h2></div></div>'+renderUpcoming()+'</section>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>自动生成待确认账单</span><h2>固定收支规则</h2></div><button class="btn small primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 新建规则</button></div>'+templateHtml+'</section></div></div>';
  }
  function fundFreshness(f){
    var rs=(f.records||[]).slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
    if(!rs.length)return '尚未记录净值';
    var last=rs[rs.length-1].date,days=typeof global.daysBetween==='function'?global.daysBetween(last,metrics().today()):0;
    return '更新于 '+last+(days>30?' · 建议更新':'');
  }
  function renderFundsPage(){
    var s=metrics().fundSummary(),fs=global.financeFundKind==='holding'?s.holding:(global.financeFundKind==='watch'?s.watch:s.funds);
    var list=fs.length?fs.map(function(f){
      var dc=global.dailyChg(f),hp=global.holdProfit(f),hr=global.holdRet(f),latest=global.fundLatest(f),mv=global.fundValue(f),rs=global.fundRecs(f).slice().reverse();
      return '<div class="finance-fund"><div class="finance-fund-main"><div><h3>'+esc(f.name)+' <span class="tag">'+esc(f.code||'—')+'</span></h3><small>'+esc(f.type||'')+' · '+fundFreshness(f)+'</small></div>'
        +'<div class="finance-fund-values"><span>最新净值 <b>'+(latest?latest.toFixed(4):'—')+'</b></span><span style="color:'+chgColor(dc)+'">当日 '+global.fmtPct(dc)+'</span>'+(+f.shares>0?'<span>市值 '+money(mv)+'</span>':'')+(hp!=null?'<span style="color:'+chgColor(hp)+'">持仓 '+signMoney(hp)+' ('+global.fmtPct(hr)+')</span>':'')+'</div></div>'
        +(typeof global.sparkline==='function'?global.sparkline(f.records):'')
        +'<div class="finance-fund-actions"><button class="btn small primary" onclick="openNavForm(\''+f.id+'\')">记录净值</button><button class="btn small" onclick="openFundForm(\''+f.id+'\')">编辑</button><button class="btn small quiet" onclick="delFund(\''+f.id+'\')">删除</button></div>'
        +(rs.length?'<details class="finance-fund-history"><summary>查看最近净值记录（'+rs.length+'）</summary><div>'+rs.slice(0,8).map(function(r){return '<span>'+esc(r.date)+' · '+(+r.nav).toFixed(4)+'</span>';}).join('')+'</div></details>':'')+'</div>';
    }).join(''):'<div class="empty">这里还没有基金。</div>';
    return '<div class="finance-summary-grid fund-summary"><div class="finance-summary-card"><span>持仓基金</span><b>'+s.holding.length+'</b><small>有份额记录</small></div><div class="finance-summary-card"><span>自选基金</span><b>'+s.watch.length+'</b><small>仅关注</small></div><div class="finance-summary-card"><span>持仓市值</span><b>'+money(s.marketValue)+'</b><small>手动净值计算</small></div><div class="finance-summary-card"><span>持仓收益</span><b style="color:'+chgColor(s.holdTot)+'">'+signMoney(s.holdTot)+'</b><small>不构成投资建议</small></div></div>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>数据保存在本机</span><h2>基金持仓与自选</h2></div><button class="btn primary" onclick="openFundForm()">＋ 添加基金</button></div>'
      +'<div class="chips finance-fund-filter"><span class="ctab '+(global.financeFundKind==='all'?'on':'')+'" onclick="setFinanceFundKind(\'all\')">全部</span><span class="ctab '+(global.financeFundKind==='holding'?'on':'')+'" onclick="setFinanceFundKind(\'holding\')">我的持仓</span><span class="ctab '+(global.financeFundKind==='watch'?'on':'')+'" onclick="setFinanceFundKind(\'watch\')">仅关注</span></div>'
      +'<div class="finance-fund-list">'+list+'</div></section>';
  }
  global.setFinanceTab=function(tab){global.financeTab=tab;global.render();};
  global.setFinancePeriod=function(period){global.financePeriod=period;global.render();};
  global.setFinanceType=function(type){global.financeType=type;global.render();};
  global.setFinanceFundKind=function(kind){global.financeFundKind=kind;global.render();};
  global.openFinanceBudgetForm=function(){
    var cfg=metrics().budgetConfig(),lines=Object.keys(cfg.categories).map(function(k){return k+':'+cfg.categories[k];});
    document.getElementById('fb_total').value=cfg.total||'';
    document.getElementById('fb_categories').value=lines.join('\n');
    document.getElementById('financeBudgetMask').classList.add('show');
    document.getElementById('fb_total').focus();
  };
  global.closeFinanceBudget=function(){document.getElementById('financeBudgetMask').classList.remove('show');};
  global.submitFinanceBudget=function(){
    var d=data(),total=parseFloat(document.getElementById('fb_total').value),categories={},lines=document.getElementById('fb_categories').value.split(/\n+/);
    lines.forEach(function(line){var p=line.split(/[:：]/),name=(p[0]||'').trim(),amount=parseFloat(p.slice(1).join(':'));if(name&&!isNaN(amount)&&amount>0)categories[name]=amount;});
    d.monthlyBudget=isNaN(total)||total<=0?null:total;if(!d.prefs)d.prefs={};if(!d.prefs.financeConfig)d.prefs.financeConfig={};d.prefs.financeConfig.categoryBudgets=categories;
    global.save();global.closeFinanceBudget();global.render();
  };
  global.confirmFinancePlan=function(id){
    var d=data(),f=(d.finances||[]).find(function(x){return x.id===id;});if(!f)return;
    if(f.gen){f.planState='confirmed';d.finances.push({id:global.uid(),date:metrics().today(),scheduledDate:f.date,type:f.type,category:f.category,amount:f.amount,note:f.note||'',recur:'',rprojectId:f.rprojectId||'',travelId:f.travelId||'',generatedFrom:f.tplId||f.id,status:'actual'});}
    else{f.scheduledDate=f.date;f.date=metrics().today();f.status='actual';}
    global.save();global.render();
  };
  global.skipFinancePlan=function(id){var f=(data().finances||[]).find(function(x){return x.id===id;});if(!f)return;if(f.gen)f.planState='skipped';else f.status='skipped';global.save();global.render();};
  global.openFinancePlanSource=function(id){var f=(data().finances||[]).find(function(x){return x.id===id;});global.openFinanceForm(f&&f.gen?(f.tplId||id):id);};
  global.renderFinanceModule=function(){
    if(!global.financeTab)global.financeTab='overview';if(!global.financePeriod)global.financePeriod='month';if(!global.financeType)global.financeType='all';if(!global.financeFundKind)global.financeFundKind='all';
    var body=global.financeTab==='records'?renderRecords():(global.financeTab==='budget'?renderBudgetPage():(global.financeTab==='funds'?renderFundsPage():renderOverview()));
    return renderTabs()+body;
  };
  global.renderFinances=renderRecords;
  global.renderFunds=global.renderFinanceModule;
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('finance',global.renderFinanceModule);
})(window);

/* ===== FILE: ui/pages/research-page.js ===== */
(function(global){
  function esc(s){return global.esc?global.esc(s):String(s==null?'':s);}
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function dueText(days){if(days<0)return '已逾期 '+(-days)+' 天';if(days===0)return '今天截止';if(days<=7)return '还剩 '+days+' 天';return days+' 天后';}
  function riskClass(days){return days<0?'overdue':days<=7?'urgent':days<=30?'soon':'';}
  function openAction(x){
    if(x.type==='paper')return "openPaperForm('"+x.id+"')";
    if(x.type==='patent')return "openPatentForm('"+x.id+"')";
    if(x.type==='project')return "openRProjectForm('"+x.id+"')";
    return "openForm('research','"+x.id+"')";
  }
  function renderSummary(){
    var s=global.WorkbenchResearchSummary;var pc=s.paperCounts();var rp=s.projectCounts();var deadlines=s.deadlineItems();
    var risk=deadlines.filter(function(x){return x.days<=7;}).length;var kit=global.WorkbenchPanelKit;
    if(!kit)return '';
    return kit.summaryGrid([
      kit.summaryCard('research','📄 进行中论文',pc.active,'撰写 '+pc.writing+' · 审稿 '+pc.submitted+' · 修改 '+pc.revision),
      kit.summaryCard('research','⚠️ 近期风险',risk,'逾期或 7 天内需要处理',risk?'#ef4444':'var(--research)'),
      kit.summaryCard('research','🧭 缺少下一步',pc.missingNext,'进行中但未设置下一步的论文',pc.missingNext?'#f59e0b':'var(--research)'),
      kit.summaryCard('research','🏛️ 在研项目',rp.active,'总项目 '+rp.total+' · 45 天内结束 '+rp.endingSoon)
    ],'margin-bottom:14px');
  }
  function renderTabs(){
    var items=[
      {label:'🧭 科研首页',active:global.researchTab==='overview',onClick:"setResearchTab('overview')"},
      {label:'📄 论文',active:global.researchTab==='paper',onClick:"setResearchTab('paper')"},
      {label:'🏛️ 科研项目',active:global.researchTab==='project',onClick:"setResearchTab('project')"},
      {label:'📜 专利/软著',active:global.researchTab==='patent',onClick:"setResearchTab('patent')"}
    ];
    return global.WorkbenchPanelKit.chips(items,{style:'margin-bottom:16px'});
  }
  function renderPaperFilters(){
    var pc=global.WorkbenchResearchSummary.paperCounts();
    return global.WorkbenchPanelKit.chips([
      {label:'进行中 '+pc.active,active:global.paperKind==='active',onClick:"setPaperKind('active')"},
      {label:'撰写 '+pc.writing,active:global.paperKind==='writing',onClick:"setPaperKind('writing')"},
      {label:'投稿/审稿 '+pc.submitted,active:global.paperKind==='submitted',onClick:"setPaperKind('submitted')"},
      {label:'修改 '+pc.revision,active:global.paperKind==='revision',onClick:"setPaperKind('revision')"},
      {label:'已录用 '+pc.done,active:global.paperKind==='done',onClick:"setPaperKind('done')"},
      {label:'已归档 '+pc.archived,active:global.paperKind==='archived',onClick:"setPaperKind('archived')"}
    ],{style:'margin-bottom:16px'});
  }
  function renderDeadlines(){
    var list=global.WorkbenchResearchSummary.deadlineItems().slice(0,8);
    var body=list.map(function(x){
      return '<button class="research-deadline '+riskClass(x.days)+'" onclick="'+openAction(x)+'"><span class="deadline-date">'+esc(x.due)+'</span><span class="deadline-body"><b>'+esc(x.title)+'</b><small>'+esc(x.label)+'</small></span><span class="deadline-left">'+dueText(x.days)+'</span></button>';
    }).join('');
    if(!body)body='<div class="empty">暂无科研截止日。为论文设置“下一步截止日”后，会在这里统一提醒。</div>';
    return '<section class="panel"><div class="sec-head"><h2>⏰ 最近需要处理</h2><button class="btn" onclick="setView(\'calendar\')">查看日历</button></div><div class="research-deadlines">'+body+'</div></section>';
  }
  function renderNextActions(){
    var actions=global.WorkbenchResearchSummary.nextActions().slice(0,6);
    var body=actions.map(function(x){
      var due=x.due?'<span class="pstatus '+riskClass(x.days)+'">'+dueText(x.days)+'</span>':'';
      return '<div class="research-action"><span class="action-dot '+(x.waiting?'waiting':'')+'"></span><div><b>'+esc(x.text)+'</b><small>'+esc(x.paper.title)+'</small></div>'+due+'<button class="icon-btn" onclick="openPaperForm(\''+x.paper.id+'\')" title="编辑论文">✏️</button></div>';
    }).join('');
    if(!body)body='<div class="empty">还没有论文下一步。为正在推进的论文设置一个可执行的动作吧。</div>';
    return '<section class="panel"><div class="sec-head"><h2>🧭 论文下一步</h2><button class="btn primary" onclick="openPaperForm(null,\'writing\')">＋ 新建论文</button></div><div class="research-actions">'+body+'</div></section>';
  }
  function renderPipeline(){
    var pc=global.WorkbenchResearchSummary.paperCounts();
    return '<section class="research-pipeline"><button onclick="setResearchTab(\'paper\');setPaperKind(\'writing\')"><span>✍️</span><b>'+pc.writing+'</b><small>撰写中</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'submitted\')"><span>📨</span><b>'+pc.submitted+'</b><small>投稿/审稿</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'revision\')"><span>🛠️</span><b>'+pc.revision+'</b><small>修改中</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'done\')"><span>✅</span><b>'+pc.done+'</b><small>已录用</small></button></section>';
  }
  function renderResearchTasks(){
    var items=(data().items||[]).filter(function(i){return i.cat==='research'&&i.status!=='done'&&i.sourceType!=='paper-action';}).sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'));}).slice(0,8);
    var body=items.length?'<div class="list">'+items.map(global.itemHTML).join('')+'</div>':'<div class="empty">暂无独立科研事项。</div>';
    return '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>📋 科研事项</h2><button class="btn" onclick="openForm(\'research\')">＋ 新建事项</button></div>'+body+'</section>';
  }
  function renderHome(){
    return '<div class="research-hero"><div><span>科研进展助手</span><h1>先处理截止风险，再推进下一步</h1><p>论文、项目和专利共用一套日期与任务系统，不需要分别检查。</p></div><div><button class="btn primary" onclick="openPaperForm(null,\'writing\')">＋ 新建论文</button><button class="btn" onclick="openRProjectForm()">＋ 科研项目</button></div></div>'
      +renderSummary()+renderPipeline()+'<div class="research-home-grid">'+renderDeadlines()+renderNextActions()+'</div>'+renderResearchTasks();
  }
  global.renderResearchModule=function(){
    var html=renderTabs();
    if(global.researchTab==='overview')html+=renderHome();
    else if(global.researchTab==='paper')html+=renderPaperFilters()+(global.renderPapersPanel?global.renderPapersPanel(global.paperKind):global.renderPapers(global.paperKind));
    else if(global.researchTab==='project')html+=(global.renderRProjectsPanel?global.renderRProjectsPanel():global.renderRProjects());
    else html+=(global.renderPatentsPanel?global.renderPatentsPanel():global.renderPatents());
    return html;
  };
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('research',global.renderResearchModule);
})(window);

/* ===== FILE: ui/pages/life-page.js ===== */
(function(global){
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function metrics(){return global.WorkbenchLifeSummary;}
  function esc(v){return global.esc?global.esc(v):String(v==null?'':v);}
  function money(v){return (+v||0).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});}
  function renderTabs(){
    var tabs=[['overview','☀️ 生活首页'],['tasks','📋 生活事项'],['travel','🧳 出行'],['books','📚 阅读'],['dates','🎉 重要日子']];
    return '<div class="chips life-tabs">'+tabs.map(function(t){return '<span class="ctab '+(global.lifeTab===t[0]?'on':'')+'" onclick="setLifeTab(\''+t[0]+'\')">'+t[1]+'</span>';}).join('')+'</div>';
  }
  function summaryCard(label,value,note,cls){return '<div class="life-summary-card '+(cls||'')+'"><span>'+label+'</span><b>'+value+'</b><small>'+note+'</small></div>';}
  function taskList(items,limit){var list=limit?items.slice(0,limit):items;return list.length?'<div class="list">'+list.map(global.itemHTML).join('')+'</div>':'<div class="empty">目前没有需要处理的事项。</div>';}
  function renderNextTravel(t){
    if(!t)return '<div class="life-empty-action"><span>🧳</span><b>还没有下一段出行</b><p>有安排时再添加，不需要提前维护空计划。</p><button class="btn small" onclick="openTravelForm()">添加出行</button></div>';
    var st=metrics().travelStatus(t),cp=metrics().travelChecklistProgress(t),days=t.start?metrics().dayDiff(metrics().today(),t.start):null;
    return '<div class="life-focus-card"><div class="life-focus-head"><div><span>'+(st==='ongoing'?'正在出行':(days!=null?'距离出发 '+days+' 天':'日期待定'))+'</span><h3>'+esc(t.title||'未命名出行')+'</h3></div><button class="btn small" onclick="setLifeTab(\'travel\')">查看准备</button></div>'
      +(t.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(t.nextAction)+'</b></div>':'')
      +'<div class="life-progress-head"><span>准备清单</span><b>'+cp.done+' / '+cp.total+'</b></div><div class="life-progress"><i style="width:'+cp.pct+'%"></i></div></div>';
  }
  function renderCurrentBook(b){
    if(!b)return '<div class="life-empty-action"><span>📚</span><b>当前没有在读书籍</b><p>只保留真正想读的书，不必追求书单数量。</p><button class="btn small" onclick="openBookForm()">添加书籍</button></div>';
    var p=Math.max(0,Math.min(100,+b.progress||0));
    return '<div class="life-focus-card"><div class="life-focus-head"><div><span>当前在读</span><h3>'+esc(b.title)+'</h3><small>'+esc(b.author||'作者未填写')+'</small></div><button class="btn small" onclick="setLifeTab(\'books\')">继续阅读</button></div>'
      +(b.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(b.nextAction)+'</b>'+(b.nextDue?'<small>'+esc(b.nextDue)+'</small>':'')+'</div>':'')
      +'<div class="life-progress-head"><span>阅读进度</span><b>'+p+'%</b></div><div class="life-progress book"><i style="width:'+p+'%"></i></div></div>';
  }
  function renderImportantDates(limit){
    var list=metrics().importantDates().slice(0,limit||99);
    if(!list.length)return '<div class="life-empty-action compact"><span>🎉</span><b>还没有重要日子</b><button class="btn small" onclick="openAnniversaryForm()">添加</button></div>';
    return '<div class="life-date-list">'+list.map(function(x){var a=x.item,d=x.next.days;return '<div class="life-date-row"><div class="life-date-count '+(d<=7?'soon':'')+'"><b>'+d+'</b><small>天</small></div><div><b>'+esc(a.name)+'</b><small>'+esc(x.next.date)+(a.note?' · '+esc(a.note):'')+'</small></div><button class="btn small" onclick="createAnniversaryPrep(\''+a.id+'\')">准备</button></div>';}).join('')+'</div>';
  }
  function renderOverview(){
    var m=metrics().homeModel(),nextTrip=m.travels.next,nextDate=m.dates.next&&m.dates.next.item,nextBook=m.books.next;
    return '<section class="life-hero"><div><span>生活行动助手</span><h1>把接下来的生活安排好</h1><p>只关注近期需要处理的事项，历史记录和长期清单留在需要时再看。</p></div><div><button class="btn" onclick="openForm(\'life\')">＋ 生活事项</button><button class="btn primary" onclick="openTravelForm()">＋ 出行计划</button></div></section>'
      +'<div class="life-summary-grid">'+summaryCard('今天需要处理',m.tasks.today.length,'含已到期生活事项',m.tasks.today.length?'urgent':'')
      +summaryCard('未来 7 天',m.tasks.upcoming.length,'即将到来的生活安排')
      +summaryCard('下一段出行',nextTrip?esc(nextTrip.title):'暂无',nextTrip&&nextTrip.start?nextTrip.start:'按需要添加')
      +summaryCard('最近重要日子',nextDate?esc(nextDate.name):'暂无',m.dates.next?m.dates.next.next.days+' 天后':'按需要添加')+'</div>'
      +'<div class="life-home-grid"><div class="life-home-main"><section class="panel"><div class="life-panel-head"><div><span>今天与已到期</span><h2>先处理这些生活事项</h2></div><button class="text-action life-link" onclick="setLifeTab(\'tasks\')">全部事项 →</button></div>'+taskList(m.tasks.today,5)+'</section>'
      +'<section class="panel"><div class="life-panel-head"><div><span>下一段安排</span><h2>出行准备</h2></div></div>'+renderNextTravel(nextTrip)+'</section></div>'
      +'<div class="life-home-side"><section class="panel"><div class="life-panel-head"><div><span>提前准备</span><h2>近期重要日子</h2></div><button class="text-action life-link" onclick="setLifeTab(\'dates\')">全部 →</button></div>'+renderImportantDates(3)+'</section>'
      +'<section class="panel"><div class="life-panel-head"><div><span>保持一个阅读焦点</span><h2>当前阅读</h2></div></div>'+renderCurrentBook(nextBook)+'</section></div></div>';
  }
  function group(title,note,items,open){
    return '<section class="panel life-task-group '+(!open?'collapsed':'')+'"><div class="life-panel-head"><div><span>'+note+'</span><h2>'+title+' <small>'+items.length+'</small></h2></div></div>'+(items.length?taskList(items):'<div class="empty">这里暂时没有事项。</div>')+'</section>';
  }
  function renderTasks(){
    var g=metrics().taskGroups();
    return '<section class="life-section-head"><div><span>生活事项</span><h1>只看真正需要处理的事情</h1><p>日期浏览统一放在全局日历，这里按照行动时间分组。</p></div><button class="btn primary" onclick="openForm(\'life\')">＋ 添加事项</button></section>'
      +'<div class="life-task-layout"><div>'+group('今天与已到期','优先处理',g.today,true)+group('接下来 7 天','近期安排',g.upcoming,true)+'</div><div>'+group('暂无日期','以后再安排',g.unscheduled,true)+group('更晚事项','7 天以后',g.later,true)+'<details class="panel life-completed"><summary>已完成（'+g.completed.length+'）</summary>'+(g.completed.length?taskList(g.completed.slice(0,30)):'<div class="empty">还没有完成记录。</div>')+'</details></div></div>';
  }
  function travelCard(t){
    var st=metrics().travelStatus(t),labels={planning:'计划中',upcoming:'未出发',ongoing:'进行中',past:'已结束'},cp=metrics().travelChecklistProgress(t),spent=metrics().travelSpent(t),budget=+t.budget||0;
    var checks=cp.items.length?'<div class="life-checklist">'+cp.items.map(function(c,i){return '<button class="life-check '+(c.done?'done':'')+'" onclick="toggleTravelCheck(\''+t.id+'\','+i+')"><i>'+(c.done?'✓':'')+'</i><span>'+esc(c.text)+'</span></button>';}).join('')+'</div>':'<div class="life-muted">还没有准备清单。</div>';
    return '<article class="life-travel-card '+st+'"><div class="life-travel-top"><div><span class="life-status '+st+'">'+labels[st]+'</span><h2>'+esc(t.title||'未命名出行')+'</h2><small>'+(t.start||'日期待定')+(t.end?' → '+t.end:'')+'</small></div><div class="acts"><button class="icon-btn" onclick="openTravelForm(\''+t.id+'\')">✏️</button><button class="icon-btn" onclick="delTravel(\''+t.id+'\')">🗑️</button></div></div>'
      +(t.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(t.nextAction)+'</b></div>':'')
      +'<div class="life-travel-stats"><span>准备 <b>'+cp.pct+'%</b></span><span>预算 <b>¥'+money(budget)+'</b></span><span>已记录支出 <b>¥'+money(spent)+'</b></span></div><div class="life-progress"><i style="width:'+cp.pct+'%"></i></div>'+checks
      +'<div class="life-travel-actions"><button class="btn small primary" onclick="openTravelExpense(\''+t.id+'\')">＋ 记录出行支出</button>'+(t.note?'<span>'+esc(t.note)+'</span>':'')+'</div></article>';
  }
  function renderTravel(){
    var list=(data().travels||[]).slice().sort(function(a,b){var sa=metrics().travelStatus(a)==='past'?1:0,sb=metrics().travelStatus(b)==='past'?1:0;return sa-sb||String(a.start||'9999').localeCompare(String(b.start||'9999'));});
    var active=list.filter(function(t){return metrics().travelStatus(t)!=='past';}),past=list.filter(function(t){return metrics().travelStatus(t)==='past';});
    return '<section class="life-section-head"><div><span>出行准备助手</span><h1>从计划到出发，一项项准备</h1><p>清单可以直接勾选，关联的财务支出会自动汇总。</p></div><button class="btn primary" onclick="openTravelForm()">＋ 添加出行</button></section>'
      +(active.length?'<div class="life-travel-list">'+active.map(travelCard).join('')+'</div>':'<div class="panel empty">还没有待准备的出行。</div>')
      +(past.length?'<details class="panel life-archive"><summary>已结束的出行（'+past.length+'）</summary><div class="life-travel-list">'+past.map(travelCard).join('')+'</div></details>':'');
  }
  function bookCard(b){
    var st=metrics().normalizeBookStatus(b.status),p=Math.max(0,Math.min(100,+b.progress||0));
    return '<article class="life-book-card"><div class="life-book-main"><div><span class="life-status '+st+'">'+(st==='reading'?'在读':st==='done'?'已读':'想读')+'</span><h2>'+esc(b.title||'未命名')+'</h2><small>'+esc(b.author||'作者未填写')+'</small></div><div class="acts"><button class="icon-btn" onclick="openBookForm(\''+b.id+'\')">✏️</button><button class="icon-btn" onclick="delBook(\''+b.id+'\')">🗑️</button></div></div>'
      +(b.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(b.nextAction)+'</b>'+(b.nextDue?'<small>'+esc(b.nextDue)+'</small>':'')+'</div>':'')
      +'<div class="life-progress-head"><span>进度</span><b>'+p+'%</b></div><div class="life-progress book"><i style="width:'+p+'%"></i></div>'
      +(b.note?'<p class="life-book-note">“'+esc(b.note)+'”</p>':'')+'<div class="life-book-actions">'+(st==='want'?'<button class="btn small primary" onclick="startBook(\''+b.id+'\')">开始阅读</button>':st==='reading'?'<button class="btn small primary" onclick="advanceBook(\''+b.id+'\',10)">进度 ＋10%</button><button class="btn small" onclick="finishBook(\''+b.id+'\')">标记读完</button>':'<span>完成于 '+esc(b.endDate||'未记录')+'</span>')+'</div></article>';
  }
  function renderBooks(){
    var all=data().books||[],status=global.bookStatus||'reading',list=status==='all'?all:all.filter(function(b){return metrics().normalizeBookStatus(b.status)===status;});
    return '<section class="life-section-head"><div><span>阅读行动</span><h1>保持一个清晰的阅读焦点</h1><p>进度不必精确，记住下一步和一句话收获更重要。</p></div><button class="btn primary" onclick="openBookForm()">＋ 添加书籍</button></section>'
      +'<div class="chips life-subtabs"><span class="ctab '+(status==='reading'?'on':'')+'" onclick="setBookStatus(\'reading\')">在读</span><span class="ctab '+(status==='want'?'on':'')+'" onclick="setBookStatus(\'want\')">想读</span><span class="ctab '+(status==='done'?'on':'')+'" onclick="setBookStatus(\'done\')">已读</span><span class="ctab '+(status==='all'?'on':'')+'" onclick="setBookStatus(\'all\')">全部</span></div>'
      +(list.length?'<div class="life-book-grid">'+list.map(bookCard).join('')+'</div>':'<div class="panel empty">这个分类下还没有书籍。</div>');
  }
  function renderDates(){
    var list=metrics().importantDates();
    return '<section class="life-section-head"><div><span>重要日子</span><h1>提前记得，也提前准备</h1><p>生日、纪念日和重要日期都可以设置准备时间，并生成生活事项。</p></div><button class="btn primary" onclick="openAnniversaryForm()">＋ 添加重要日子</button></section>'
      +(list.length?'<div class="life-important-grid">'+list.map(function(x){var a=x.item,d=x.next.days,remind=+a.remindDays||7;return '<article class="life-important-card '+(d<=remind?'soon':'')+'"><div class="life-important-date"><b>'+d+'</b><small>天后</small></div><div class="life-important-body"><span>'+(a.type==='birthday'?'🎂 生日':a.type==='anniversary'?'💝 纪念日':'📌 重要日期')+'</span><h2>'+esc(a.name)+'</h2><p>'+esc(x.next.date)+' · 提前 '+remind+' 天准备</p>'+(a.note?'<small>'+esc(a.note)+'</small>':'')+'</div><div class="life-important-actions"><button class="btn small primary" onclick="createAnniversaryPrep(\''+a.id+'\')">创建准备事项</button><button class="icon-btn" onclick="openAnniversaryForm(\''+a.id+'\')">✏️</button><button class="icon-btn" onclick="delAnniversary(\''+a.id+'\')">🗑️</button></div></article>';}).join('')+'</div>':'<div class="panel empty">还没有重要日子。</div>');
  }
  global.toggleTravelCheck=function(id,index){var t=(data().travels||[]).find(function(x){return x.id===id;});if(!t)return;t.checklist=metrics().checklistItems(t);if(!t.checklist[index])return;t.checklist[index].done=!t.checklist[index].done;global.save();global.render();};
  global.openTravelExpense=function(id){global.openFinanceForm(null,null,'expense');var el=document.getElementById('fn_travel');if(el)el.value=id;};
  global.startBook=function(id){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='reading';if(!b.startDate)b.startDate=metrics().today();global.save();global.render();};
  global.advanceBook=function(id,amount){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='reading';if(!b.startDate)b.startDate=metrics().today();b.progress=Math.min(100,(+b.progress||0)+amount);if(b.progress>=100){b.status='done';b.endDate=metrics().today();}global.save();global.render();};
  global.finishBook=function(id){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='done';b.progress=100;b.endDate=b.endDate||metrics().today();global.save();global.render();};
  global.createAnniversaryPrep=function(id){
    var d=data(),a=(d.anniversaries||[]).find(function(x){return x.id===id;});if(!a)return;var next=metrics().nextImportantDate(a);if(!next)return alert('请先填写有效日期');
    var existing=(d.items||[]).find(function(i){return i.id===a.prepTaskId&&i.status!=='done';});if(existing){global.setLifeTab('tasks');return;}
    var remind=+a.remindDays||7,due=metrics().addDays(next.date,-remind);if(due<metrics().today())due=metrics().today();var task={id:global.uid(),cat:'life',title:'为「'+a.name+'」做准备',status:'todo',due:due,note:a.note||'',sourceAnniversaryId:a.id};
    d.items.push(task);a.prepTaskId=task.id;global.save();global.setLifeTab('tasks');
  };
  global.renderLifeModule=function(){
    if(global.lifeTab==='anniversary')global.lifeTab='dates';
    if(['overview','tasks','travel','books','dates'].indexOf(global.lifeTab)<0)global.lifeTab='overview';
    var body=global.lifeTab==='tasks'?renderTasks():(global.lifeTab==='travel'?renderTravel():(global.lifeTab==='books'?renderBooks():(global.lifeTab==='dates'?renderDates():renderOverview())));
    return renderTabs()+body;
  };
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('life',global.renderLifeModule);
})(window);

/* ===== FILE: ui/pages/sport-page.js ===== */
(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g,function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
  function metrics(){ return global.WorkbenchHealthMetrics; }
  function progressRow(label, value, goal, pct, helper){
    return '<div class="health-progress-row">'
      +'<div class="health-progress-head"><b>'+label+'</b><span>'+value+' / '+goal+'</span></div>'
      +'<div class="health-progress-track"><i style="width:'+Math.max(0,Math.min(100,pct))+'%"></i></div>'
      +'<small>'+helper+'</small></div>';
  }
  function renderTodayPlan(sp){
    var info=sp.todayPlan;
    if(!info){
      return '<div class="panel health-today"><div class="health-panel-title"><div><span>今天</span><h2>还没有运动安排</h2></div><span class="health-state gentle">轻量开始</span></div>'
        +'<p>可以安排一次短运动，也可以在完成后直接记录。没有计划不等于落后。</p>'
        +'<div class="health-actions"><button class="btn primary" onclick="openPlanSlot(\''+sp.range.mon+'\','+((new Date(sp.range.today+'T00:00:00').getDay()+6)%7)+')">＋ 安排今天</button>'
        +'<button class="btn" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">记录已完成运动</button></div></div>';
    }
    var p=info.plan;
    if(p.skipped){
      return '<div class="panel health-today skipped"><div class="health-panel-title"><div><span>今天</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state gentle">已调整为休息</span></div>'
        +'<p>'+esc(p.note||'休息也是计划的一部分，按身体状态灵活调整即可。')+'</p>'
        +'<div class="health-actions"><button class="btn" onclick="restorePlan(\''+info.key+'\','+info.dayIdx+')">恢复计划</button><button class="btn quiet" onclick="reschedulePlan(\''+info.key+'\','+info.dayIdx+',1)">改到明天</button></div></div>';
    }
    if(sp.todayDone){
      return '<div class="panel health-today done"><div class="health-panel-title"><div><span>今天</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state success">✓ 已完成</span></div>'
        +'<p>'+esc(p.note||'今天已经动过了，剩下的时间安心恢复。')+'</p>'
        +'<div class="health-actions"><button class="btn" onclick="setSportTab(\'log\')">查看运动记录</button><button class="btn quiet" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">再记一项</button></div></div>';
    }
    return '<div class="panel health-today active"><div class="health-panel-title"><div><span>今天的计划</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state">待完成</span></div>'
      +'<p>'+esc(p.note||'按今天的状态完成即可，实际时长可以在记录时调整。')+'</p>'
      +'<div class="health-actions"><button class="btn primary" onclick="completePlan(\''+info.key+'\','+info.dayIdx+')">✓ 完成并记录</button>'
      +'<button class="btn" onclick="reschedulePlan(\''+info.key+'\','+info.dayIdx+',1)">改到明天</button>'
      +'<button class="btn quiet" onclick="skipPlan(\''+info.key+'\','+info.dayIdx+')">今天休息</button></div></div>';
  }
  function renderWeeklyProgress(sp){
    var minuteHelp=sp.remainingMinutes>0?'还差 '+sp.remainingMinutes+' 分钟，按状态分配到本周即可':'本周时长目标已经完成';
    var sessionHelp=sp.remainingSessions>0?'再完成 '+sp.remainingSessions+' 次即可达到自己设定的频次':'本周次数目标已经完成';
    return '<div class="panel"><div class="health-panel-title"><div><span>'+sp.range.mon+' ~ '+sp.range.sun+'</span><h2>本周进度</h2></div><button class="btn small" onclick="openHealthGoalForm()">调整目标</button></div>'
      +'<div class="health-progress-list">'
      +progressRow('运动时长',sp.weekDoneMinutes+' 分钟',sp.goals.weeklyMinutes+' 分钟',sp.minuteProgress,minuteHelp)
      +progressRow('运动次数',sp.weekDoneSessions+' 次',sp.goals.weeklySessions+' 次',sp.sessionProgress,sessionHelp)
      +'</div><div class="health-plan-note">已安排 '+sp.weekPlannedSessions+' 次 · 共 '+sp.weekPlannedMinutes+' 分钟</div></div>';
  }
  function renderRecentActivity(sp){
    var r=sp.recentLog;
    var body=r
      ? '<div class="health-recent-main"><span class="health-activity-icon">🏃</span><div><b>'+esc(r.sportType||'运动')+' · '+(+r.minutes||0)+' 分钟</b><small>'+esc(r.due||r.created||'')+(r.effort?' · '+effortLabel(r.effort):'')+'</small></div></div>'
      : '<div class="empty health-empty">完成一次运动后，这里会显示最近记录。</div>';
    return '<div class="panel"><div class="health-panel-title"><div><span>最近一次</span><h2>运动记录</h2></div><button class="btn small" onclick="setSportTab(\'log\')">全部记录</button></div>'+body+'</div>';
  }
  function effortLabel(v){ return ({light:'轻松',moderate:'刚好',hard:'吃力',max:'接近极限'})[v]||v; }
  function renderBodyTrend(wt){
    var main=wt.latestWeight!=null?wt.latestWeight.toFixed(1)+' kg':'尚未记录';
    var avg=wt.avg7!=null?'近 7 天均值 '+wt.avg7.toFixed(1)+' kg':'连续记录后可查看 7 天均值';
    var change=wt.change30==null?'近 30 天趋势待形成':('近 30 天 '+(wt.change30>0?'+':'')+wt.change30.toFixed(1)+' kg');
    return '<div class="panel"><div class="health-panel-title"><div><span>身体趋势</span><h2>'+main+'</h2></div><button class="btn small" onclick="openWeightForm()">记录体重</button></div>'
      +'<div class="health-trend-meta"><span>'+avg+'</span><span>'+change+'</span>'+(wt.target!=null?'<span>目标 '+esc(wt.target)+' kg</span>':'')+'</div>'
      +'<p class="health-muted">关注一段时间的变化，不必被单日波动影响。</p><button class="text-action" onclick="setSportTab(\'weight\')">查看身体趋势 →</button></div>';
  }
  function renderHealthHome(){
    var sp=metrics().sportSummary(), wt=metrics().weightSummary();
    var title=sp.todayPlan&&!sp.todayPlan.plan.skipped&&!sp.todayDone?'今天按计划动一动':'让运动适应生活，而不是增加负担';
    return '<section class="health-hero"><div><span>健康与运动</span><h1>'+title+'</h1><p>先看今天，再看本周；轻松记录真实完成情况，长期趋势自然会形成。</p></div>'
      +'<div><button class="btn" onclick="openWeightForm()">⚖️ 记录体重</button><button class="btn primary" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">＋ 记录运动</button></div></section>'
      +'<div class="health-home-grid"><div class="health-home-main">'+renderTodayPlan(sp)+renderWeeklyProgress(sp)+'</div>'
      +'<div class="health-home-side">'+renderRecentActivity(sp)+renderBodyTrend(wt)+'</div></div>';
  }
  function renderTabs(){
    var count=((getData().items||[]).filter(function(i){ return i.cat==='sport'&&i.status==='done'; }).length);
    var items=[
      { label:'☀️ 健康首页', active:global.sportTab==='overview', onClick:"setSportTab('overview')" },
      { label:'🏃 运动记录（'+count+'）', active:global.sportTab==='log', onClick:"setSportTab('log')" },
      { label:'⚖️ 身体趋势', active:global.sportTab==='weight', onClick:"setSportTab('weight')" },
      { label:'📅 目标与计划', active:global.sportTab==='plan', onClick:"setSportTab('plan')" }
    ];
    if(global.WorkbenchPanelKit && typeof global.WorkbenchPanelKit.chips==='function') return global.WorkbenchPanelKit.chips(items,{style:'margin:0 0 16px'});
    return '<div class="chips" style="margin:0 0 16px">'+items.map(function(i){ return '<span class="ctab '+(i.active?'on':'')+'" onclick="'+i.onClick+'">'+i.label+'</span>'; }).join('')+'</div>';
  }
  global.openHealthGoalForm=function(){
    var g=metrics().healthGoals(), data=getData();
    document.getElementById('hg_minutes').value=g.weeklyMinutes;
    document.getElementById('hg_sessions').value=g.weeklySessions;
    document.getElementById('hg_target_weight').value=data.targetWeight||'';
    document.getElementById('healthGoalMask').classList.add('show');
    document.getElementById('hg_minutes').focus();
  };
  global.closeHealthGoal=function(){ document.getElementById('healthGoalMask').classList.remove('show'); };
  global.submitHealthGoals=function(){
    var minutes=Math.round(+document.getElementById('hg_minutes').value||0);
    var sessions=Math.round(+document.getElementById('hg_sessions').value||0);
    if(minutes<1||sessions<1){ alert('每周目标需要大于 0'); return; }
    var data=getData();
    if(!data.prefs||typeof data.prefs!=='object') data.prefs={};
    data.prefs.healthGoals={weeklyMinutes:minutes,weeklySessions:sessions};
    var tw=parseFloat(document.getElementById('hg_target_weight').value);
    data.targetWeight=isNaN(tw)||tw<=0?null:tw;
    if(typeof global.save==='function') global.save();
    global.closeHealthGoal();
    if(typeof global.render==='function') global.render();
  };
  global.renderSportModule = function(){
    if(['overview','log','weight','plan'].indexOf(global.sportTab)<0) global.sportTab='overview';
    var html=renderTabs();
    if(global.sportTab==='overview') html+=renderHealthHome();
    else if(global.sportTab==='plan') html+=(global.renderSportPlanPanel?global.renderSportPlanPanel():global.renderSportPlan());
    else if(global.sportTab==='log') html+=(global.renderSportLogPanel?global.renderSportLogPanel():global.renderSportLog());
    else html+=(global.renderWeightsPanel?global.renderWeightsPanel():global.renderWeights());
    return html;
  };
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('sport', global.renderSportModule);
  }
})(window);

/* ===== FILE: ui/pages/habit-page.js ===== */
(function(global){
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function metrics(){return global.WorkbenchHabitMetrics;}
  function esc(v){return global.esc?global.esc(v):String(v==null?'':v);}
  function tabs(){var items=[['today','☀️ 今天'],['all','🌱 全部习惯'],['review','📊 温和回顾']];return '<div class="chips habit-tabs">'+items.map(function(x){return '<span class="ctab '+(global.habitTab===x[0]?'on':'')+'" onclick="setHabitTab(\''+x[0]+'\')">'+x[1]+'</span>';}).join('')+'</div>';}
  function weekCells(m){var names=['一','二','三','四','五','六','日'];return '<div class="habit-week">'+m.cells.map(function(c,i){var cls=(c.done?'done ':c.rest?'rest ':c.due?'due ':'')+(c.today?'today ':'')+(c.future?'future':'');var disabled=c.future||!c.due;return '<button class="habit-day '+cls+'" '+(disabled?'disabled':'onclick="toggleHabit(\''+m.habit.id+'\',\''+c.date+'\')"')+' title="'+c.date+'"><span>'+names[i]+'</span><i>'+(c.done?'✓':c.rest?'休':'')+'</i></button>';}).join('')+'</div>';}
  function habitCard(m,manage){
    var h=m.habit,state=m.doneToday?'done':m.restToday?'rest':'open';
    return '<article class="habit-action-card '+state+'"><div class="habit-card-top"><div><span>'+esc(m.schedule)+'</span><h2>'+esc(h.name||'未命名习惯')+'</h2>'+(h.minimum?'<p>最小行动：'+esc(h.minimum)+'</p>':'')+'</div><div class="habit-card-score"><b>'+m.consistency+'%</b><small>近 4 周</small></div></div>'
      +(h.cue?'<div class="habit-cue"><span>提醒自己</span><b>'+esc(h.cue)+'</b></div>':'')+weekCells(m)
      +'<div class="habit-card-meta"><span>本周 '+m.weekDone+' / '+m.weekTarget+'</span><span>连续 '+m.streak+' '+m.streakUnit+'</span>'+(h.why?'<span>'+esc(h.why)+'</span>':'')+'</div>'
      +'<div class="habit-card-actions">'+(m.doneToday?'<button class="btn success" onclick="checkHabitToday(\''+h.id+'\')">✓ 今天完成了</button>':m.restToday?'<button class="btn" onclick="restHabitToday(\''+h.id+'\')">今天已休息</button>':'<button class="btn primary" onclick="checkHabitToday(\''+h.id+'\')">完成最小一步</button>')
      +(m.dueToday&&!m.doneToday?'<button class="btn quiet" onclick="restHabitToday(\''+h.id+'\')">今天休息</button>':'')
      +(manage?'<button class="icon-btn" onclick="openHabitForm(\''+h.id+'\')" title="编辑">✏️</button><button class="icon-btn" onclick="pauseHabit(\''+h.id+'\')" title="暂停">⏸</button><button class="icon-btn" onclick="delHabit(\''+h.id+'\')" title="删除">🗑️</button>':'')+'</div></article>';
  }
  function emptyToday(){return '<section class="panel habit-empty"><span>🌿</span><h2>今天没有待完成的习惯</h2><p>可以安心休息，也可以添加一个真正想保持的小行动。</p><button class="btn primary" onclick="openHabitForm()">添加第一个习惯</button></section>';}
  function renderToday(){
    var s=metrics().summary(),pct=s.dueToday?Math.round(s.doneToday/s.dueToday*100):100;
    return '<section class="habit-hero"><div><span>今日习惯助手</span><h1>'+(s.remaining?'今天只做最小的一步':'今天已经安排好了')+'</h1><p>'+(s.remaining?'不追求完美，完成最容易开始的那一步就够了。':'没有未完成压力，保持自己的节奏。')+'</p></div><div class="habit-today-ring" style="--habit-pct:'+pct+'%"><b>'+s.doneToday+' / '+s.dueToday+'</b><small>今日完成</small></div></section>'
      +'<div class="habit-summary-grid"><div><span>今天待做</span><b>'+s.dueToday+'</b><small>只显示今天适合做的习惯</small></div><div><span>已经完成</span><b>'+s.doneToday+'</b><small>完成最小行动也算</small></div><div><span>今天休息</span><b>'+s.restToday+'</b><small>休息不会被当成失败</small></div><div><span>正在保持</span><b>'+s.active.length+'</b><small>暂停的习惯不参与提醒</small></div></div>'
      +(s.today.length?'<div class="habit-action-list">'+s.today.map(function(m){return habitCard(m,false);}).join('')+'</div>':emptyToday())
      +(s.today.length&&s.remaining===0?'<div class="habit-gentle-success">✨ 今天的习惯已经完成。去做别的事吧，不需要继续刷数据。</div>':'');
  }
  function renderAll(){
    var s=metrics().summary();
    return '<section class="habit-section-head"><div><span>全部习惯</span><h1>留下真正值得保持的习惯</h1><p>习惯太多会变成新的待办清单。暂停不是放弃，只是暂时不提醒。</p></div><button class="btn primary" onclick="openHabitForm()">＋ 新建习惯</button></section>'
      +(s.active.length?'<div class="habit-action-list">'+s.active.map(function(m){return habitCard(m,true);}).join('')+'</div>':'<div class="panel empty">还没有正在保持的习惯。</div>')
      +(s.paused.length?'<details class="panel habit-paused"><summary>已暂停（'+s.paused.length+'）</summary><div class="habit-paused-list">'+s.paused.map(function(m){var h=m.habit;return '<div class="habit-paused-row"><div><b>'+esc(h.name)+'</b><small>'+esc(m.schedule)+'</small></div><button class="btn small primary" onclick="resumeHabit(\''+h.id+'\')">恢复</button><button class="icon-btn" onclick="openHabitForm(\''+h.id+'\')">✏️</button><button class="icon-btn" onclick="delHabit(\''+h.id+'\')">🗑️</button></div>';}).join('')+'</div></details>':'');
  }
  function renderReview(){
    var s=metrics().summary(),weeks=metrics().reviewWeeks(4),best=s.active.slice().sort(function(a,b){return b.consistency-a.consistency;})[0];
    return '<section class="habit-section-head"><div><span>温和回顾</span><h1>看趋势，不责怪某一天</h1><p>回顾用来调整目标是否合适，而不是追求永远不断的连续天数。</p></div></section>'
      +'<div class="habit-review-grid"><section class="panel"><div class="habit-panel-head"><div><span>最近四周</span><h2>完成节奏</h2></div></div><div class="habit-week-bars">'+weeks.map(function(w){return '<div><span>'+w.start.slice(5)+'</span><div><i style="width:'+w.pct+'%"></i></div><b>'+w.done+' / '+w.target+'</b></div>';}).join('')+'</div></section>'
      +'<section class="panel"><div class="habit-panel-head"><div><span>一个观察</span><h2>'+(best?'最稳定的是「'+esc(best.habit.name)+'」':'先从一个小习惯开始')+'</h2></div></div><p class="habit-review-note">'+(best?'近四周完成度 '+best.consistency+'%。如果某个习惯长期很难开始，可以把“最小行动”再缩小一点。':'不需要一次建立很多习惯。选择一个每天容易开始的动作即可。')+'</p></section></div>'
      +(s.active.length?'<section class="panel habit-review-list"><div class="habit-panel-head"><div><span>逐项查看</span><h2>习惯状态</h2></div></div>'+s.active.map(function(m){return '<div class="habit-review-row"><div><b>'+esc(m.habit.name)+'</b><small>'+esc(m.schedule)+' · 本周 '+m.weekDone+'/'+m.weekTarget+'</small></div><div class="habit-review-track"><i style="width:'+m.consistency+'%"></i></div><b>'+m.consistency+'%</b><button class="btn small" onclick="openHabitForm(\''+m.habit.id+'\')">调整</button></div>';}).join('')+'</section>':'');
  }
  global.setHabitTab=function(tab){global.habitTab=tab;global.render();};
  global.checkHabitToday=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;if(!h.logs)h.logs={};if(!h.skips)h.skips={};var td=metrics().today();delete h.skips[td];if(h.logs[td])delete h.logs[td];else h.logs[td]=true;global.save();global.render();};
  global.restHabitToday=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;if(!h.logs)h.logs={};if(!h.skips)h.skips={};var td=metrics().today();delete h.logs[td];if(h.skips[td])delete h.skips[td];else h.skips[td]=true;global.save();global.render();};
  global.pauseHabit=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;h.status='paused';global.save();global.render();};
  global.resumeHabit=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;h.status='active';global.save();global.render();};
  global.renderHabits=function(){if(!global.habitTab)global.habitTab='today';var body=global.habitTab==='all'?renderAll():(global.habitTab==='review'?renderReview():renderToday());return tabs()+body;};
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('habit',global.renderHabits);
})(window);

/* ===== FILE: ui/pages/review-page.js ===== */
(function(global){
  if(typeof global.renderReview !== 'function') return;
  function renderReviewModule(){
    return global.renderReview();
  }
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('review', renderReviewModule);
  }
})(window);

/* ===== FILE: app/bootstrap.js ===== */
(function(global){
  function markPhase(){
    try{
      document.documentElement.setAttribute('data-wb-phase', '2');
      document.documentElement.setAttribute('data-wb-build', 'portable-refactor');
    }catch(e){}
  }
  function announce(){
    try{ console.info('[Workbench] Phase 2 incremental modules loaded'); }catch(e){}
  }
  global.WorkbenchBootstrap = {
    run: function(){ markPhase(); announce(); }
  };
})(window);

/* ===== FILE: app/store.js ===== */
(function(global){
  var state = {
    currentCat: global.currentCat,
    workView: global.workView,
    researchTab: global.researchTab,
    paperKind: global.paperKind,
    lifeTab: global.lifeTab,
    bookStatus: global.bookStatus,
    finView: global.finView,
    sportTab: global.sportTab,
    calScope: global.calScope,
    calView: global.calView,
    searchKw: global.searchKw,
    lastAction: null,
    lastActionPayload: null
  };
  var listeners = [];
  function emit(){ listeners.forEach(function(fn){ try{ fn(Object.assign({}, state)); }catch(e){} }); }
  function set(patch){ Object.assign(state, patch || {}); emit(); }
  global.WorkbenchStore = {
    getState: function(){ return Object.assign({}, state); },
    setState: set,
    subscribe: function(fn){ listeners.push(fn); return function(){ listeners = listeners.filter(function(x){ return x !== fn; }); }; }
  };
  function wrap(name, map){
    var orig = global[name];
    if(typeof orig !== 'function' || orig.__wbStoreWrapped) return;
    global[name] = function(){
      var args = Array.prototype.slice.call(arguments);
      var result;
      try {
        result = orig.apply(this, args);
      } catch(e) {
        console.error('[Workbench] Store wrap error in ' + name, e);
        throw e;
      }
      try {
        set(map.apply(null, args));
      } catch(e) {
        console.error('[Workbench] Store setState error in ' + name, e);
      }
      return result;
    };
    global[name].__wbStoreWrapped = true;
  }
  wrap('setView', function(c){ return { currentCat: c, searchKw: '' }; });
  wrap('onSearch', function(v){ return { searchKw: String(v || '').trim().toLowerCase() }; });
  wrap('setResearchTab', function(v){ return { researchTab: v }; });
  wrap('setPaperKind', function(v){ return { paperKind: v }; });
  wrap('setLifeTab', function(v){ return { lifeTab: v }; });
  wrap('setBookStatus', function(v){ return { bookStatus: v }; });
  wrap('setWorkView', function(v){ return { workView: v }; });
  wrap('setCalScope', function(v){ return { calScope: v }; });
  wrap('setCalView', function(v){ return { calView: v }; });
  wrap('setSportTab', function(v){ return { sportTab: v }; });
  wrap('setFinView', function(v){ return { finView: v }; });
})(window);

/* ===== FILE: app/selectors.js ===== */
(function(global){
  function data(){
    try {
      if(global.WorkbenchData && typeof global.WorkbenchData.getData === 'function') return global.WorkbenchData.getData();
    } catch(e) {
      console.error('[Workbench] Selectors data() error', e);
    }
    return global.data || {};
  }
  function uiState(){
    if(global.WorkbenchStore && typeof global.WorkbenchStore.getState === 'function') return global.WorkbenchStore.getState();
    return {
      currentCat: global.currentCat,
      workView: global.workView,
      researchTab: global.researchTab,
      paperKind: global.paperKind,
      lifeTab: global.lifeTab,
      bookStatus: global.bookStatus,
      finView: global.finView,
      sportTab: global.sportTab,
      calScope: global.calScope,
      calView: global.calView,
      searchKw: global.searchKw,
      lastAction: null,
      lastActionPayload: null
    };
  }
  function parseSearch(kw){
    kw = String(kw || '').trim().toLowerCase();
    var tags = [];
    kw = kw.replace(/tag[:：]([^\s,，]+)/g, function(_, t){ tags.push(String(t || '').toLowerCase()); return ''; }).trim();
    return { kw: kw, tags: tags };
  }
  function matchesSearch(item, parsed, fullData){
    if(!parsed || (!parsed.kw && !(parsed.tags||[]).length)) return true;
    var p = ((fullData.projects||[]).find(function(x){ return x.id===item.projectId; }) || {});
    var hay = [item.title, item.note, item.sportType, p.name, ((item.tags||[]).join(' '))].join(' ').toLowerCase();
    if(parsed.kw && !hay.includes(parsed.kw)) return false;
    if(parsed.tags && parsed.tags.length){
      var itemTags=(item.tags||[]).map(function(x){ return String(x || '').toLowerCase(); });
      if(!parsed.tags.every(function(t){ return itemTags.includes(t); })) return false;
    }
    return true;
  }
  function sortItems(items){
    var o={todo:0,doing:1,done:2};
    var p={high:0,mid:1,low:2};
    return (items||[]).slice().sort(function(a,b){
      var sa=o[a.status], sb=o[b.status];
      if(sa!==sb) return sa-sb;
      return (p[a.prio]||9)-(p[b.prio]||9);
    });
  }
  function filteredItems(cat){
    var fullData = data();
    var state = uiState();
    var items=(fullData.items||[]).slice();
    var target = cat || state.currentCat;
    if(target && ['overview','calendar','review','habit','news'].indexOf(target)<0) items=items.filter(function(i){ return i.cat===target; });
    var parsed = parseSearch(state.searchKw);
    items = items.filter(function(i){ return matchesSearch(i, parsed, fullData); });
    return sortItems(items);
  }
  function workModuleModel(){
    var fullData=data();
    var state=uiState();
    var items=(fullData.items||[]);
    var filtered=filteredItems('work');
    return {
      state: state,
      projects: (fullData.projects||[]),
      tmpItems: items.filter(function(i){ return i.cat==='work' && !i.projectId; }),
      agendaItems: items.filter(function(i){ return i.cat==='work' && i.due; }).slice().sort(function(a,b){ return a.due.localeCompare(b.due); }),
      filteredItems: filtered,
      workView: state.workView || global.workView || 'list',
      collapseState: global.collapseState || {}
    };
  }
  global.WorkbenchSelectors = {
    data: data,
    uiState: uiState,
    parseSearch: parseSearch,
    filteredItems: filteredItems,
    sortItems: sortItems,
    workModuleModel: workModuleModel
  };
})(window);

/* ===== FILE: app/page-router.js ===== */
(function(global){
  function getApp(){ return document.getElementById('app'); }
  function chips(items, style){
    if(global.WorkbenchPanelKit && typeof global.WorkbenchPanelKit.chips === 'function') return global.WorkbenchPanelKit.chips(items, { style: style || '' });
    return '<div class="chips"'+(style?' style="'+style+'"':'')+'>'+items.map(function(it){ return '<span class="ctab '+(it.active?'on':'')+'" onclick="'+it.onClick+'">'+it.label+'</span>'; }).join('')+'</div>';
  }
  function renderCalendarPage(){
    try {
      var sc=global.calScope;
      if(sc!=='all' && global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(sc)){
        sc='all';
        global.calScope='all';
      }
      var left = chips([
        { label:'📅 月', active:global.calView==='month', onClick:"setCalView('month')" },
        { label:'🗓️ 周', active:global.calView==='week', onClick:"setCalView('week')" },
        { label:'📋 日程', active:global.calView==='agenda', onClick:"setCalView('agenda')" }
      ]);
      var rightItems=[{ label:'全部', active:sc==='all', onClick:"setCalScope('all')" }];
      for(var c in global.CATS){
        if(global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(c)) continue;
        rightItems.push({ label:global.CATS[c].name, active:sc===c, onClick:"setCalScope('"+c+"')" });
      }
      var right = chips(rightItems);
      var head='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+left+'<span class="spacer" style="flex:1"></span>'+right+'</div>';
      var body;
      if(global.calView==='week') body=global.renderWeek(sc);
      else if(global.calView==='agenda') body=global.renderAgenda(sc);
      else body=global.renderCalendar(sc);
      return head+body;
    } catch(e) {
      console.error('[Workbench] Error rendering calendar page', e);
      return '<div class="panel" style="margin:20px"><h2>⚠️ 日历渲染出错</h2><p>请刷新页面或检查控制台</p></div>';
    }
  }
  function modulePage(cat, opts){
    try {
      var html = global.renderModule(cat);
      return html;
    } catch(e) {
      console.error('[Workbench] Error rendering module page for: ' + cat, e);
      return '<div class="panel" style="margin:20px;border:1px solid #ef4444;border-radius:12px;padding:20px;background:#fef2f2"><h2 style="color:#ef4444">⚠️ 页面渲染出错</h2><p style="color:#991b1b;margin:8px 0">模块 <b>' + esc(cat) + '</b> 渲染时发生错误。</p><p style="color:#7f1d1d;font-size:13px">请尝试刷新页面或检查浏览器控制台。</p><button class="btn" style="margin-top:12px" onclick="location.reload()">🔄 刷新页面</button></div>';
    }
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return '&#' + c.charCodeAt(0) + ';'; }); }
  function registerDefaults(){
    var reg=global.WorkbenchPageRegistry;
    if(!reg || reg.__defaultsRegistered) return;
    try {
      reg.register('overview', function(){ return global.decorOverview(global.renderOverview()); });
      reg.register('review', function(){ return global.renderReview(); });
      reg.register('habit', function(){ return global.renderHabits(); });
      reg.register('news', function(){ global.renderNews(); return null; });
      reg.register('calendar', renderCalendarPage);
      reg.register('finance', function(){ return global.renderFunds(); });
      ['work','research','life','sport'].forEach(function(cat){ reg.register(cat, function(){ return modulePage(cat); }); });
    } catch(e) {
      console.error('[Workbench] Error registering default pages', e);
      // Attempt binary fallback: re-register using legacy renderModule only
      try {
        ['work','research','life','sport'].forEach(function(cat){
          reg.register(cat, function(){ return modulePage(cat); });
        });
      } catch(e2){}
    }
    reg.__defaultsRegistered = true;
  }
  function fallbackRender(){
    if(typeof global.__legacyRenderApp === 'function') {
      try { return global.__legacyRenderApp(); } catch(e) {}
    }
    var cat = global.currentCat;
    try {
      return global.renderModule(cat);
    } catch(e) {}
    return '';
  }
  function renderCurrent(){
    try {
      registerDefaults();
      var app=getApp();
      if(!app) return;
      var cat=global.currentCat;
      var html = global.WorkbenchPageRegistry ? global.WorkbenchPageRegistry.render(cat) : modulePage(cat);
      if(html!=null && String(html).trim().length > 10) app.innerHTML=html;
      else if(html!=null && String(html).trim().length <= 10) {
        // HTML output is too short/empty, attempt modulePage directly as fallback
        try {
          var fb = modulePage(cat);
          if(fb && String(fb).trim().length > 10) app.innerHTML = fb;
        } catch(e) {
          app.innerHTML = '<div class="panel" style="margin:20px;padding:20px;text-align:center"><h2>📭 暂无内容</h2><p style="color:var(--muted)">当前页面没有可显示的内容</p></div>';
        }
      }
      if(typeof global.v5RefreshBadges==='function') global.v5RefreshBadges();
      if(global.WorkbenchModules && typeof global.WorkbenchModules.renderChrome==='function') global.WorkbenchModules.renderChrome();
    } catch(e) {
      console.error('[Workbench] renderCurrent failed for cat: ' + global.currentCat, e);
      var app = getApp();
      if(app) {
        try {
          var fb = fallbackRender();
          if(fb) app.innerHTML = fb;
          else app.innerHTML = '<div class="panel" style="margin:20px;border:1px solid #ef4444;border-radius:12px;padding:20px;background:#fef2f2"><h2 style="color:#ef4444">⚠️ 页面渲染出错</h2><p style="color:#991b1b;margin:8px 0">页面渲染时发生错误，请查看浏览器控制台获取详情。</p><button class="btn" style="margin-top:12px" onclick="location.reload()">🔄 刷新页面</button></div>';
        } catch(e2) {
          app.innerHTML = '<div style="padding:40px;text-align:center"><h2>⚠️ 渲染失败</h2><p>请刷新页面重试</p></div>';
        }
      }
      if(typeof global.v5RefreshBadges === 'function') {
        try { global.v5RefreshBadges(); } catch(e3) {}
      }
    }
  }
  global.WorkbenchPageRouter={
    renderCalendarPage:renderCalendarPage,
    renderCurrent:renderCurrent,
    register:function(name, fn){ registerDefaults(); return global.WorkbenchPageRegistry.register(name, fn); },
    unregister:function(name){ return global.WorkbenchPageRegistry.unregister(name); },
    get:function(name){ registerDefaults(); return global.WorkbenchPageRegistry.get(name); },
    list:function(){ registerDefaults(); return global.WorkbenchPageRegistry.list(); },
    registerModulePage:function(name, opts){ registerDefaults(); return global.WorkbenchPageRegistry.register(name, function(){ return modulePage(name, opts||{}); }); }
  };
  if(typeof global.render==='function' && !global.__legacyRenderApp){ global.__legacyRenderApp=global.render; }
  global.render=function(){ return renderCurrent(); };
})(window);

/* ===== FILE: app/actions.js ===== */
(function(global){
  var listeners = [];
  function emit(type, payload){
    var evt = { type:type, payload:payload||{}, at:Date.now() };
    listeners.slice().forEach(function(fn){ try{ fn(evt); }catch(e){} });
    try{ document.dispatchEvent(new CustomEvent('workbench:action', { detail: evt })); }catch(e){}
    return evt;
  }
  function subscribe(fn){ listeners.push(fn); return function(){ listeners = listeners.filter(function(x){ return x !== fn; }); }; }
  var __rendering = 0;
  function wrap(name, type, payloadBuilder){
    var orig = global[name];
    if(typeof orig !== 'function' || orig.__wbActionWrapped) return;
    var wrapped = function(){
      if(name === 'render') {
        if(__rendering > 0) return;
        __rendering++;
      }
      var args = Array.prototype.slice.call(arguments);
      var payload = typeof payloadBuilder === 'function' ? payloadBuilder.apply(null, args) : { args: args };
      try { emit(type + ':before', payload); } catch(e) {}
      try {
        var result = orig.apply(this, args);
      } catch(e) {
        console.error('[Workbench] Action error in ' + name, e);
        result = undefined;
      }
      try { emit(type + ':after', payload); } catch(e) {}
      if(name === 'render') __rendering--;
      return result;
    };
    wrapped.__wbActionWrapped = true;
    global[name] = wrapped;
  }
  global.WorkbenchActions = { emit: emit, subscribe: subscribe, wrap: wrap };
  wrap('setView', 'nav:setView', function(view){ return { view:view }; });
  wrap('onSearch', 'query:search', function(value){ return { value:value }; });
  wrap('setResearchTab', 'tab:research', function(tab){ return { tab:tab }; });
  wrap('setPaperKind', 'tab:paperKind', function(kind){ return { kind:kind }; });
  wrap('setLifeTab', 'tab:life', function(tab){ return { tab:tab }; });
  wrap('setBookStatus', 'tab:bookStatus', function(status){ return { status:status }; });
  wrap('setWorkView', 'tab:workView', function(view){ return { view:view }; });
  wrap('setCalScope', 'tab:calScope', function(scope){ return { scope:scope }; });
  wrap('setCalView', 'tab:calendarView', function(view){ return { view:view }; });
  wrap('setSportTab', 'tab:sport', function(tab){ return { tab:tab }; });
  wrap('setFinView', 'tab:finance', function(view){ return { view:view }; });
  wrap('openForm', 'form:item', function(cat, id){ return { cat:cat, id:id||null }; });
  wrap('openProjectForm', 'form:project', function(id){ return { id:id||null }; });
  wrap('openPaperForm', 'form:paper', function(id){ return { id:id||null }; });
  wrap('openPatent', 'form:patent', function(id){ return { id:id||null }; });
  wrap('openFundForm', 'form:fund', function(id){ return { id:id||null }; });
  wrap('openNavForm', 'form:nav', function(id){ return { id:id||null }; });
  wrap('save', 'data:save');
  wrap('render', 'ui:render');
})(window);

/* ===== FILE: app/store-action-bridge.js ===== */
(function(global){
  function attach(){
    if(global.__wbStoreActionBridgeAttached) return;
    if(!global.WorkbenchActions || !global.WorkbenchStore) return;
    global.__wbStoreActionBridgeAttached = true;
    global.WorkbenchActions.subscribe(function(evt){
      try {
        if(!evt || !/:after$/.test(evt.type)) return;
        var patch = { lastAction: evt.type, lastActionPayload: evt.payload || null };
        if(evt.type==='nav:setView:after') patch.currentCat = evt.payload && evt.payload.view;
        if(evt.type==='query:search:after') patch.searchKw = String((evt.payload && evt.payload.value) || '').trim().toLowerCase();
        if(evt.type==='tab:calendarView:after') patch.calView = evt.payload && evt.payload.view;
        global.WorkbenchStore.setState(patch);
      } catch(e) {
        console.error('[Workbench] StoreActionBridge error handling action:', evt && evt.type, e);
      }
    });
  }
  global.WorkbenchStoreActionBridge = { attach: attach };
  attach();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach, { once:true });
})(window);

/* ===== FILE: app/module-preferences.js ===== */
(function(global){
  var MAX_PINNED = 3;
  var CORE = ['overview','work','calendar','review','more'];
  var MODULES = [
    { id:'research', name:'科研', icon:'🔬', group:'专业场景', description:'管理论文、专利、科研项目和审稿截止日期。' },
    { id:'life', name:'生活', icon:'🌿', group:'生活管理', description:'统一收纳生活事项、读书、旅行和纪念日。' },
    { id:'sport', name:'健康与运动', shortName:'健康', icon:'🏃', group:'生活管理', description:'从今天出发安排运动，轻松记录完成情况和身体趋势。' },
    { id:'habit', name:'习惯', icon:'🔥', group:'效率管理', description:'记录每日打卡和连续坚持情况。' },
    { id:'finance', name:'财务', icon:'💰', group:'专业场景', description:'记录收支、预算、基金持仓与净值。' },
    { id:'news', name:'信息热榜', shortName:'热榜', icon:'📰', group:'信息工具', description:'聚合多个信息源；默认关闭，避免打断专注。' }
  ];
  var moduleMap = {};
  MODULES.forEach(function(item){ moduleMap[item.id] = item; });

  function getData(){ return global.data || {}; }
  function ensureConfig(){
    var data = getData();
    if(!data.prefs || typeof data.prefs !== 'object') data.prefs = {};
    if(!data.prefs.moduleConfig || typeof data.prefs.moduleConfig !== 'object'){
      data.prefs.moduleConfig = { enabled:{}, pinned:[] };
    }
    var cfg = data.prefs.moduleConfig;
    if(!cfg.enabled || typeof cfg.enabled !== 'object') cfg.enabled = {};
    if(!Array.isArray(cfg.pinned)) cfg.pinned = [];
    cfg.pinned = cfg.pinned.filter(function(id, index, arr){
      return !!moduleMap[id] && !!cfg.enabled[id] && arr.indexOf(id) === index;
    }).slice(0, MAX_PINNED);
    return cfg;
  }
  function isCore(id){ return CORE.indexOf(id) >= 0; }
  function isEnabled(id){ return isCore(id) || !!ensureConfig().enabled[id]; }
  function isCategoryVisible(cat){ return cat === 'work' || isEnabled(cat); }
  function isPinned(id){ return ensureConfig().pinned.indexOf(id) >= 0; }
  function moduleById(id){ return moduleMap[id] || null; }
  function countFor(id){
    var data=getData();
    var items=(data.items||[]).filter(function(item){ return item.cat===id; }).length;
    if(id==='research') return items+(data.papers||[]).length+(data.patents||[]).length+(data.rprojects||[]).length;
    if(id==='life') return items+(data.books||[]).length+(data.travels||[]).length+(data.anniversaries||[]).length;
    if(id==='sport') return items+(data.weights||[]).length;
    if(id==='habit') return (data.habits||[]).length;
    if(id==='finance') return (data.finances||[]).length+(data.funds||[]).length;
    if(id==='news') return 0;
    return items;
  }
  function persist(){
    if(typeof global.save === 'function') global.save();
    renderChrome();
    if(typeof global.render === 'function') global.render();
  }
  function setEnabled(id, enabled){
    if(!moduleMap[id]) return;
    var cfg=ensureConfig();
    cfg.enabled[id]=!!enabled;
    if(!enabled) cfg.pinned=cfg.pinned.filter(function(x){ return x!==id; });
    if(!enabled && global.currentCat===id){
      global.currentCat='more';
      if(global.WorkbenchStore && global.WorkbenchStore.setState) global.WorkbenchStore.setState({currentCat:'more'});
    }
    persist();
    if(typeof global.toast==='function') global.toast(enabled ? '已启用「'+moduleMap[id].name+'」' : '已隐藏「'+moduleMap[id].name+'」，原有数据仍保留');
  }
  function toggleEnabled(id){ setEnabled(id, !isEnabled(id)); }
  function togglePinned(id){
    var meta=moduleMap[id];
    if(!meta) return;
    var cfg=ensureConfig();
    if(!cfg.enabled[id]) cfg.enabled[id]=true;
    var index=cfg.pinned.indexOf(id);
    if(index>=0) cfg.pinned.splice(index,1);
    else {
      if(cfg.pinned.length>=MAX_PINNED){
        if(typeof global.toast==='function') global.toast('顶部最多固定 '+MAX_PINNED+' 个可选模块');
        return;
      }
      cfg.pinned.push(id);
    }
    persist();
  }
  function movePinned(id, direction){
    var cfg=ensureConfig();
    var from=cfg.pinned.indexOf(id);
    var to=from+direction;
    if(from<0 || to<0 || to>=cfg.pinned.length) return;
    var tmp=cfg.pinned[from];cfg.pinned[from]=cfg.pinned[to];cfg.pinned[to]=tmp;
    persist();
  }
  function openModule(id){
    if(!isEnabled(id)){
      setEnabled(id,true);
    }
    if(typeof global.setView==='function') global.setView(id);
  }
  function navButton(meta){
    var label=meta.shortName||meta.name;
    var badgeId='bd-'+meta.id;
    var badge = meta.id==='news' ? '' : '<span class="badge" id="'+badgeId+'"></span>';
    return '<button class="tab" data-cat="'+meta.id+'" onclick="setView(\''+meta.id+'\')" type="button"><span class="ico">'+meta.icon+'</span>'+label+badge+'</button>';
  }
  function renderNavigation(){
    var slot=document.getElementById('moduleNav');
    if(!slot) return;
    var cfg=ensureConfig();
    slot.innerHTML=cfg.pinned.map(function(id){ return navButton(moduleMap[id]); }).join('');
    var active=global.currentCat;
    document.querySelectorAll('#nav .tab').forEach(function(tab){
      var on=tab.dataset.cat===active;
      tab.classList.toggle('active',on);
      if(on) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
    });
    if(typeof global.v5RefreshBadges==='function') global.v5RefreshBadges();
  }
  function renderSaveStatus(){
    var el=document.getElementById('saveState');
    if(!el) return;
    var ts=getData().__savedAt;
    if(!ts){el.textContent='已保存在本机';return;}
    try{
      el.textContent='已保存 '+new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    }catch(e){ el.textContent='已保存在本机'; }
  }
  function renderChrome(){ renderNavigation();renderSaveStatus(); }

  var originalSetView=global.setView;
  if(typeof originalSetView==='function'){
    global.setView=function(id){
      if(moduleMap[id] && !isEnabled(id)){
        originalSetView.call(global,'more');
        if(typeof global.toast==='function') global.toast('请先在「更多」中启用「'+moduleMap[id].name+'」');
        return;
      }
      var result=originalSetView.apply(this,arguments);
      renderNavigation();
      return result;
    };
  }

  global.WorkbenchModules = {
    list:function(){ return MODULES.slice(); },
    get:moduleById,
    config:ensureConfig,
    isCore:isCore,
    isEnabled:isEnabled,
    isCategoryVisible:isCategoryVisible,
    isPinned:isPinned,
    countFor:countFor,
    setEnabled:setEnabled,
    toggleEnabled:toggleEnabled,
    togglePinned:togglePinned,
    movePinned:movePinned,
    open:openModule,
    renderChrome:renderChrome,
    maxPinned:MAX_PINNED
  };
  global.toggleWorkbenchModule=toggleEnabled;
  global.toggleWorkbenchModulePin=togglePinned;
  global.moveWorkbenchModule=movePinned;
  global.openWorkbenchModule=openModule;
  renderChrome();
})(window);

/* ===== FILE: ui/pages/more-page.js ===== */
(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function moduleCard(meta){
    var api=global.WorkbenchModules;
    var enabled=api.isEnabled(meta.id);
    var pinned=api.isPinned(meta.id);
    var count=api.countFor(meta.id);
    var cfg=api.config();
    var pinIndex=cfg.pinned.indexOf(meta.id);
    var move='';
    if(pinned){
      move='<button class="btn small" '+(pinIndex<=0?'disabled':'')+' onclick="moveWorkbenchModule(\''+meta.id+'\',-1)" title="向前移动">←</button>'
        +'<button class="btn small" '+(pinIndex>=cfg.pinned.length-1?'disabled':'')+' onclick="moveWorkbenchModule(\''+meta.id+'\',1)" title="向后移动">→</button>';
    }
    var actions = enabled
      ? '<button class="btn primary" onclick="openWorkbenchModule(\''+meta.id+'\')">打开</button>'
        +'<button class="btn" onclick="toggleWorkbenchModulePin(\''+meta.id+'\')">'+(pinned?'★ 取消置顶':'☆ 固定到顶部')+'</button>'+move
        +'<button class="btn quiet" onclick="toggleWorkbenchModule(\''+meta.id+'\')">关闭</button>'
      : '<button class="btn primary" onclick="toggleWorkbenchModule(\''+meta.id+'\')">＋ 启用模块</button>';
    return '<article class="module-card '+(enabled?'enabled':'disabled')+'">'
      +'<div class="module-card-head"><span class="module-icon">'+meta.icon+'</span><div class="module-title"><h3>'+esc(meta.name)+'</h3><span class="module-status '+(enabled?'on':'')+'">'+(pinned?'已置顶':enabled?'已启用':'未启用')+'</span></div></div>'
      +'<p>'+esc(meta.description)+'</p>'
      +'<div class="module-meta">'+(count?'已有 '+count+' 条相关数据':'暂无相关数据')+(enabled&&!pinned?' · 可从更多中进入':'')+'</div>'
      +'<div class="module-actions">'+actions+'</div></article>';
  }
  function renderGroup(name, list){
    if(!list.length) return '';
    return '<section class="module-section"><h2>'+esc(name)+'</h2><div class="module-grid">'+list.map(moduleCard).join('')+'</div></section>';
  }
  function renderTools(){
    var saved=(global.data&&global.data.__savedAt) ? new Date(global.data.__savedAt).toLocaleString() : '尚未记录';
    return '<section class="panel more-tools"><div class="sec-head"><div><h2>🛡️ 数据与工具</h2><p>数据默认保存在当前电脑；浏览器数据被清理时，本地快照也可能一同丢失。</p></div><span class="module-status on">最近保存 '+esc(saved)+'</span></div>'
      +'<div class="tool-grid">'
      +'<button class="tool-card" onclick="exportData()"><span>⬇️</span><b>导出备份</b><small>保存一份 JSON 到电脑</small></button>'
      +'<button class="tool-card" onclick="importData()"><span>⬆️</span><b>导入数据</b><small>从已导出文件恢复</small></button>'
      +'<button class="tool-card" onclick="openBak()"><span>🕑</span><b>本地快照</b><small>查看和回滚最近改动</small></button>'
      +'<button class="tool-card" onclick="openSync()"><span>☁️</span><b>云端同步</b><small>配置私密 GitHub Gist</small></button>'
      +'<button class="tool-card" onclick="openCmdK()"><span>⌨️</span><b>快速命令</b><small>搜索动作或快速新建</small></button>'
      +'<button class="tool-card" onclick="openCheatsheet()"><span>📘</span><b>操作手册</b><small>查看快捷键与高频操作</small></button>'
      +'</div></section>';
  }
  function renderMore(){
    var api=global.WorkbenchModules;
    if(!api) return '<div class="empty">模块配置尚未就绪。</div>';
    var modules=api.list();
    var groups=[];
    modules.forEach(function(meta){ if(groups.indexOf(meta.group)<0) groups.push(meta.group); });
    var html='<div class="more-hero"><div><span class="eyebrow">个人化工作台</span><h1>按需开启，保持简洁</h1><p>启用你需要的模块，再把最常用的固定到顶部。关闭模块只会隐藏入口，不会删除任何数据。</p></div><div class="pin-limit">顶部可固定 <b>'+api.maxPinned+'</b> 个可选模块</div></div>';
    groups.forEach(function(group){ html+=renderGroup(group,modules.filter(function(x){ return x.group===group; })); });
    html+=renderTools();
    return html;
  }
  global.renderMorePage=renderMore;
  if(global.WorkbenchPageRegistry && typeof global.WorkbenchPageRegistry.register==='function'){
    global.WorkbenchPageRegistry.register('more',renderMore);
  }
})(window);

/* ===== FILE: app/bootstrap-phase3.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '3');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase3');
      }catch(e){}
      try{ console.info('[Workbench] Phase 3 modules loaded'); }catch(e){}
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase4.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '4');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase4');
      }catch(e){}
      try{ console.info('[Workbench] Phase 4 modules loaded'); }catch(e){}
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase5.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '5');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase5');
      }catch(e){}
      try{ console.info('[Workbench] Phase 5 modules loaded'); }catch(e){}
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase6.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '6');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase6');
      }catch(e){}
      try{ console.info('[Workbench] Phase 6 router and panels loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 6: render not available'); }catch(e){ console.error('[Workbench] Phase 6 render error', e); }
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase7.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '7');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase7');
      }catch(e){}
      try{ console.info('[Workbench] Phase 7 registry and actions loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 7: render not available'); }catch(e){ console.error('[Workbench] Phase 7 render error', e); }
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase8.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '8');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase8');
      }catch(e){}
      try{ if(global.WorkbenchStoreActionBridge && typeof global.WorkbenchStoreActionBridge.attach==='function') global.WorkbenchStoreActionBridge.attach(); }catch(e){}
      try{ console.info('[Workbench] Phase 8 page registry and store bridge loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 8: render not available'); }catch(e){ console.error('[Workbench] Phase 8 render error', e); }
    };
  }
})(window);

/* ===== FILE: app/bootstrap-phase9.js ===== */
(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '9');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase9');
      }catch(e){}
      try{ console.info('[Workbench] Phase 9 selectors and section helpers loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 9: render not available'); }catch(e){ console.error('[Workbench] Phase 9 render error', e); }
    };
  }
})(window);

/* ===== FILE: main.js ===== */
(function(global){
  try {
    if(global.WorkbenchBootstrap && typeof global.WorkbenchBootstrap.run === 'function'){
      global.WorkbenchBootstrap.run();
    } else {
      console.warn('[Workbench] Bootstrap not found, app may not initialize properly');
      // Ensure initial render still happens via legacy path
      if(typeof global.render === 'function') {
        try { global.render(); } catch(e) { console.error('[Workbench] Initial render failed', e); }
      }
    }
  } catch(e) {
    console.error('[Workbench] Bootstrap failed', e);
    // Attempt fallback render
    try {
      if(typeof global.render === 'function') global.render();
    } catch(e2) {
      console.error('[Workbench] Fallback render also failed', e2);
    }
  }
})(window);
