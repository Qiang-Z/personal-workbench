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
