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
