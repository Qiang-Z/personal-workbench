(function(global){
  var CFG_KEY='workbench_cloud_backup_cfg_v1';
  var DB_NAME='workbench_cloud_backup_v1';
  var DB_STORE='handles';
  var HANDLE_KEY='backup-directory';
  var BACKUP_DIR='个人工作台备份';
  var LATEST_FILE='个人工作台_最新.json';
  var MAX_HISTORY=30;
  var AUTO_INTERVAL=24*60*60*1000;
  var timer=null;
  var currentHandle=null;
  var busy=false;
  var suspended=false;

  function defaults(){
    return { enabled:false, auto:true, dirName:'', lastBackupAt:0, lastFileName:'', lastError:'' };
  }
  function loadConfig(){
    try{
      var saved=global.localStorage&&global.localStorage.getItem(CFG_KEY);
      return Object.assign(defaults(),saved?JSON.parse(saved):{});
    }catch(e){ return defaults(); }
  }
  var config=loadConfig();
  function saveConfig(){
    try{ if(global.localStorage) global.localStorage.setItem(CFG_KEY,JSON.stringify(config)); }catch(e){}
    return config;
  }
  function supported(){
    return typeof global.showDirectoryPicker==='function';
  }
  function pad(value){ return String(value).padStart(2,'0'); }
  function makeBackupFileName(now){
    var date=now instanceof Date?now:new Date(now||Date.now());
    return '个人工作台_'+date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())
      +'_'+pad(date.getHours())+pad(date.getMinutes())+pad(date.getSeconds())+'.json';
  }
  function isHistoryFile(name){
    return /^个人工作台_\d{4}-\d{2}-\d{2}_\d{6}\.json$/.test(String(name||''));
  }
  function snapshot(){
    var source=global.WorkbenchRepository&&global.WorkbenchRepository.getSnapshot
      ? global.WorkbenchRepository.getSnapshot()
      : JSON.parse(JSON.stringify(global.data||{}));
    var copy=JSON.parse(JSON.stringify(source||{}));
    delete copy.__savedAt;
    copy.__backup={
      format:'personal-workbench-cloud-folder-v1',
      appVersion:'4.4',
      createdAt:new Date().toISOString()
    };
    return copy;
  }
  function parseBackupPayload(payload){
    var parsed=payload&&payload.data&&Array.isArray(payload.data.items)?payload.data:payload;
    if(!parsed||!Array.isArray(parsed.items)) throw new Error('这不是有效的个人工作台备份文件');
    return parsed;
  }
  function recordCount(payload){
    var keys=['items','projects','funds','papers','patents','rprojects','books','travels','anniversaries','weights','finances','habits'];
    return keys.reduce(function(sum,key){ return sum+(Array.isArray(payload&&payload[key])?payload[key].length:0); },0);
  }
  function shouldAutoBackup(now,lastBackupAt){
    return !lastBackupAt||now-lastBackupAt>=AUTO_INTERVAL;
  }
  function idbOpen(){
    return new Promise(function(resolve,reject){
      if(!global.indexedDB) return reject(new Error('当前浏览器无法记住文件夹'));
      var req=global.indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=function(){
        var db=req.result;
        if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess=function(){ resolve(req.result); };
      req.onerror=function(){ reject(req.error||new Error('无法打开文件夹记录')); };
    });
  }
  async function storeHandle(handle){
    var db=await idbOpen();
    return new Promise(function(resolve,reject){
      var tx=db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).put(handle,HANDLE_KEY);
      tx.oncomplete=function(){ resolve(handle); };
      tx.onerror=function(){ reject(tx.error||new Error('无法记住文件夹')); };
    });
  }
  async function readHandle(){
    if(currentHandle) return currentHandle;
    try{
      var db=await idbOpen();
      currentHandle=await new Promise(function(resolve,reject){
        var tx=db.transaction(DB_STORE,'readonly');
        var req=tx.objectStore(DB_STORE).get(HANDLE_KEY);
        req.onsuccess=function(){ resolve(req.result||null); };
        req.onerror=function(){ reject(req.error||new Error('无法读取文件夹记录')); };
      });
    }catch(e){ currentHandle=null; }
    return currentHandle;
  }
  async function forgetHandle(){
    currentHandle=null;
    try{
      var db=await idbOpen();
      await new Promise(function(resolve,reject){
        var tx=db.transaction(DB_STORE,'readwrite');
        tx.objectStore(DB_STORE).delete(HANDLE_KEY);
        tx.oncomplete=resolve;
        tx.onerror=function(){ reject(tx.error); };
      });
    }catch(e){}
  }
  async function ensurePermission(handle,request){
    if(!handle) return false;
    var opts={mode:'readwrite'};
    if(typeof handle.queryPermission!=='function') return true;
    if(await handle.queryPermission(opts)==='granted') return true;
    if(request&&typeof handle.requestPermission==='function') return (await handle.requestPermission(opts))==='granted';
    return false;
  }
  async function writeFile(directory,name,text){
    var fileHandle=await directory.getFileHandle(name,{create:true});
    var writable=await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }
  async function pruneHistory(directory){
    if(typeof directory.values!=='function'||typeof directory.removeEntry!=='function') return;
    var names=[];
    for await (var entry of directory.values()){
      if(entry&&entry.kind==='file'&&isHistoryFile(entry.name)) names.push(entry.name);
    }
    names.sort();
    while(names.length>MAX_HISTORY) await directory.removeEntry(names.shift());
  }
  async function writeBackupToDirectory(root,payload,now){
    var target=await root.getDirectoryHandle(BACKUP_DIR,{create:true});
    var fileName=makeBackupFileName(now);
    var text=JSON.stringify(payload,null,2);
    await writeFile(target,fileName,text);
    await writeFile(target,LATEST_FILE,text);
    await pruneHistory(target);
    return { fileName:fileName, directory:target, bytes:text.length };
  }
  async function listFiles(root){
    var target=await root.getDirectoryHandle(BACKUP_DIR,{create:false});
    var result=[];
    if(typeof target.values!=='function') return result;
    for await (var entry of target.values()){
      if(!entry||entry.kind!=='file'||!isHistoryFile(entry.name)) continue;
      var file=await entry.getFile();
      result.push({name:entry.name,size:file.size||0,lastModified:file.lastModified||0});
    }
    return result.sort(function(a,b){ return b.name.localeCompare(a.name); }).slice(0,MAX_HISTORY);
  }
  async function backup(requestPermission){
    if(busy||suspended) return null;
    busy=true;
    renderStatus('busy','正在写入备份…');
    try{
      var handle=await readHandle();
      if(!handle) throw new Error('请先选择网盘同步文件夹');
      if(!(await ensurePermission(handle,!!requestPermission))) throw new Error('需要重新授权访问备份文件夹');
      var result=await writeBackupToDirectory(handle,snapshot(),new Date());
      config.enabled=true;
      config.dirName=handle.name||config.dirName||'已选择文件夹';
      config.lastBackupAt=Date.now();
      config.lastFileName=result.fileName;
      config.lastError='';
      saveConfig();
      renderStatus('ok','备份成功');
      return result;
    }catch(e){
      config.lastError=e&&e.message?e.message:'备份失败';
      saveConfig();
      renderStatus('err',config.lastError);
      throw e;
    }finally{
      busy=false;
      if(global.document&&global.document.getElementById('cloudBackupMask')&&global.document.getElementById('cloudBackupMask').classList.contains('show')) render();
    }
  }
  function schedule(){
    if(suspended||!config.enabled||!config.auto||!shouldAutoBackup(Date.now(),config.lastBackupAt)) return;
    clearTimeout(timer);
    timer=setTimeout(function(){ backup(false).catch(function(){}); },1500);
  }
  function formatDate(ts){
    if(!ts) return '尚未备份';
    try{ return new Date(ts).toLocaleString(); }catch(e){ return '尚未备份'; }
  }
  function formatSize(size){
    if(size<1024) return size+' B';
    if(size<1024*1024) return (size/1024).toFixed(1)+' KB';
    return (size/1024/1024).toFixed(1)+' MB';
  }
  function renderStatus(state,text){
    var node=global.document&&global.document.getElementById('cloudBackupStatus');
    if(!node) return;
    node.className='cloud-backup-status '+state;
    node.innerHTML='<span></span><div><b>'+esc(text)+'</b><small>'+esc(config.dirName?config.dirName+'/'+BACKUP_DIR:'尚未选择文件夹')+'</small></div>';
  }
  function esc(value){
    return global.esc?global.esc(value):String(value==null?'':value).replace(/[&<>"]/g,function(c){return '&#'+c.charCodeAt(0)+';';});
  }
  async function render(){
    var body=global.document&&global.document.getElementById('cloudBackupBody');
    if(!body) return;
    var selectBtn=global.document.getElementById('cloudBackupSelect');
    var nowBtn=global.document.getElementById('cloudBackupNow');
    var disconnectBtn=global.document.getElementById('cloudBackupDisconnect');
    if(!supported()){
      if(selectBtn) selectBtn.disabled=true;
      if(nowBtn) nowBtn.disabled=true;
      if(disconnectBtn) disconnectBtn.style.display='none';
      body.innerHTML='<div class="cloud-backup-unsupported"><b>当前浏览器暂不支持文件夹直写</b><p>请使用桌面版 Chrome 或 Edge；你仍可继续使用手动导出和 GitHub Gist。</p></div>';
      return;
    }
    var handle=await readHandle();
    var connected=!!(config.enabled&&handle);
    if(selectBtn) selectBtn.textContent=connected?'重新选择文件夹':'选择网盘文件夹';
    if(nowBtn) nowBtn.disabled=!connected||busy;
    if(disconnectBtn) disconnectBtn.style.display=connected?'':'none';
    if(!connected){
      body.innerHTML='<div id="cloudBackupStatus" class="cloud-backup-status off"><span></span><div><b>尚未连接</b><small>选择 OneDrive、iCloud Drive、Dropbox、百度网盘等同步目录</small></div></div>'
        +'<div class="cloud-backup-guide"><b>它是备份，不是自动合并</b><p>工作台只写入你选择的文件夹；在其他电脑上选择同一个同步目录后，再手动恢复需要的版本。</p></div>';
      return;
    }
    var granted=await ensurePermission(handle,false);
    var statusClass=config.lastError?'err':granted?'ok':'warn';
    var statusText=config.lastError?config.lastError:granted?'已连接':'需要重新授权';
    body.innerHTML='<div id="cloudBackupStatus" class="cloud-backup-status '+statusClass+'"><span></span><div><b>'+esc(statusText)+'</b><small>'+esc((handle.name||config.dirName)+'/'+BACKUP_DIR)+'</small></div></div>'
      +'<label class="cloud-backup-auto"><input type="checkbox" '+(config.auto?'checked':'')+' onchange="setCloudBackupAuto(this.checked)"><span><b>每天自动备份</b><small>每次打开和保存时检查，24 小时最多生成一份</small></span></label>'
      +'<div class="cloud-backup-meta"><span>最近备份</span><b>'+esc(formatDate(config.lastBackupAt))+'</b><small>保留最近 '+MAX_HISTORY+' 份历史，并维护一份“个人工作台_最新.json”</small></div>'
      +'<div class="cloud-backup-list-head"><b>可恢复版本</b><span id="cloudBackupCount">读取中…</span></div><div id="cloudBackupList" class="cloud-backup-list"><div class="cloud-backup-loading">正在读取备份目录…</div></div>';
    if(!granted){
      global.document.getElementById('cloudBackupList').innerHTML='<div class="cloud-backup-loading">点击“立即备份”重新授权后即可查看历史。</div>';
      return;
    }
    try{
      var files=await listFiles(handle);
      var count=global.document.getElementById('cloudBackupCount');
      var list=global.document.getElementById('cloudBackupList');
      if(count) count.textContent=files.length+' 份';
      if(list) list.innerHTML=files.length?files.map(function(file){
        return '<div class="cloud-backup-row"><div><b>'+esc(file.name.replace('个人工作台_','').replace('.json','').replace('_',' '))+'</b><small>'+esc(formatSize(file.size))+'</small></div>'
          +'<button class="btn small" onclick="restoreCloudBackupFile(\''+encodeURIComponent(file.name)+'\')">恢复</button></div>';
      }).join(''):'<div class="cloud-backup-loading">还没有历史备份，点击“立即备份”创建第一份。</div>';
    }catch(e){
      var listNode=global.document.getElementById('cloudBackupList');
      if(listNode) listNode.innerHTML='<div class="cloud-backup-loading">暂时无法读取备份目录，请重新选择文件夹。</div>';
    }
  }
  async function connect(){
    if(!supported()){
      global.alert('当前浏览器不支持选择文件夹，请使用桌面版 Chrome 或 Edge。');
      return;
    }
    try{
      var handle=await global.showDirectoryPicker({id:'personal-workbench-cloud-backup',mode:'readwrite',startIn:'documents'});
      currentHandle=handle;
      await storeHandle(handle);
      config.enabled=true;
      config.dirName=handle.name||'已选择文件夹';
      config.lastError='';
      var existing=[];
      try{ existing=await listFiles(handle); }catch(e){}
      config.auto=!existing.length;
      saveConfig();
      if(existing.length){
        if(typeof global.toast==='function') global.toast('发现已有备份，请先确认是否需要恢复');
      }else{
        await backup(false);
        if(typeof global.toast==='function') global.toast('网盘文件夹备份已开启 ✓');
      }
      await render();
      if(global.currentCat==='more'&&typeof global.render==='function') global.render();
    }catch(e){
      if(e&&e.name==='AbortError') return;
      global.alert('连接失败：'+(e&&e.message?e.message:'无法访问所选文件夹'));
      await render();
    }
  }
  async function restoreFile(encodedName){
    try{
      var handle=await readHandle();
      if(!handle||!(await ensurePermission(handle,true))) throw new Error('需要重新授权访问备份文件夹');
      var name=decodeURIComponent(encodedName);
      if(!isHistoryFile(name)&&name!==LATEST_FILE) throw new Error('备份文件名无效');
      var target=await handle.getDirectoryHandle(BACKUP_DIR,{create:false});
      var fileHandle=await target.getFileHandle(name,{create:false});
      var file=await fileHandle.getFile();
      var payload=parseBackupPayload(JSON.parse(await file.text()));
      if(!global.confirm('恢复“'+name+'”？当前未备份的内容会被覆盖，恢复前会先创建一份本地快照。')) return;
      if(global.WorkbenchBackupRepo&&global.WorkbenchBackupRepo.create) global.WorkbenchBackupRepo.create(true);
      else if(typeof global.pushBackup==='function') global.pushBackup(true);
      suspended=true;
      if(global.WorkbenchImportExport&&global.WorkbenchImportExport.applyImportedData) global.WorkbenchImportExport.applyImportedData(payload);
      else{
        global.data=payload;
        if(typeof global.save==='function') global.save();
        if(typeof global.render==='function') global.render();
      }
      suspended=false;
      global.alert('已恢复 '+recordCount(payload)+' 条记录');
      close();
    }catch(e){
      suspended=false;
      global.alert('恢复失败：'+(e&&e.message?e.message:'无法读取备份'));
    }
  }
  async function disconnect(){
    if(!global.confirm('断开网盘备份？已写入网盘文件夹的备份不会被删除。')) return;
    clearTimeout(timer);
    await forgetHandle();
    config=defaults();
    saveConfig();
    await render();
    if(global.currentCat==='more'&&typeof global.render==='function') global.render();
  }
  function open(){
    var mask=global.document&&global.document.getElementById('cloudBackupMask');
    if(mask) mask.classList.add('show');
    render();
  }
  function close(){
    var mask=global.document&&global.document.getElementById('cloudBackupMask');
    if(mask) mask.classList.remove('show');
  }
  function setAuto(enabled){
    config.auto=!!enabled;
    saveConfig();
    if(config.auto) schedule();
  }
  async function manualBackup(){
    try{
      await backup(true);
      if(typeof global.toast==='function') global.toast('已备份到网盘文件夹 ✓');
    }catch(e){
      global.alert('备份失败：'+(e&&e.message?e.message:'请重新选择文件夹'));
    }
  }
  function statusSummary(){
    if(!supported()) return '当前浏览器不支持文件夹备份';
    if(!config.enabled) return '备份到网盘同步文件夹';
    return (config.dirName?'已连接 '+config.dirName:'已连接')+(config.lastBackupAt?' · '+formatDate(config.lastBackupAt):'');
  }
  async function init(){
    if(!config.enabled||!config.auto) return;
    var handle=await readHandle();
    if(handle&&(await ensurePermission(handle,false))&&shouldAutoBackup(Date.now(),config.lastBackupAt)) schedule();
  }

  var api={
    supported:supported,
    getConfig:function(){ return Object.assign({},config); },
    makeBackupFileName:makeBackupFileName,
    isHistoryFile:isHistoryFile,
    parseBackupPayload:parseBackupPayload,
    recordCount:recordCount,
    shouldAutoBackup:shouldAutoBackup,
    writeBackupToDirectory:writeBackupToDirectory,
    listFiles:listFiles,
    connect:connect,
    backup:backup,
    schedule:schedule,
    restoreFile:restoreFile,
    disconnect:disconnect,
    render:render,
    open:open,
    close:close,
    setAuto:setAuto,
    manualBackup:manualBackup,
    statusSummary:statusSummary,
    init:init
  };
  global.WorkbenchCloudBackup=api;
  global.openCloudBackup=open;
  global.closeCloudBackup=close;
  global.connectCloudBackup=connect;
  global.cloudBackupNow=manualBackup;
  global.restoreCloudBackupFile=restoreFile;
  global.disconnectCloudBackup=disconnect;
  global.setCloudBackupAuto=setAuto;
  if(global.document) global.setTimeout(function(){ init().catch(function(){}); },0);
})(window);
