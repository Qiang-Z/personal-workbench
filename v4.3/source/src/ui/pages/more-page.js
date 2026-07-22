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
