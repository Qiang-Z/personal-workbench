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
