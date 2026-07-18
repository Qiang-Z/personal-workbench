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
