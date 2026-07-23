const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const window={data:{items:[{id:'1'}],projects:[]}};
window.window=window;
const context=vm.createContext({window,console,Date,setTimeout(){return 0;},clearTimeout(){}});
const file=path.resolve(__dirname,'../src/data/backup/cloud-folder.js');
vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});

const api=window.WorkbenchCloudBackup;
assert.equal(api.makeBackupFileName(new Date(2026,6,23,9,8,7)),'个人工作台_2026-07-23_090807.json');
assert.equal(api.isHistoryFile('个人工作台_2026-07-23_090807.json'),true);
assert.equal(api.isHistoryFile('个人工作台_最新.json'),false);
assert.equal(api.parseBackupPayload({items:[],projects:[]}).items.length,0);
assert.equal(api.parseBackupPayload({data:{items:[{id:'x'}]}}).items[0].id,'x');
assert.throws(()=>api.parseBackupPayload({projects:[]}),/有效/);
assert.equal(api.shouldAutoBackup(1000,0),true);
assert.equal(api.shouldAutoBackup(1000,999),false);
assert.equal(api.shouldAutoBackup(24*60*60*1000+1,1),true);

class FakeFile {
  constructor(name,store){this.kind='file';this.name=name;this.store=store;}
  async createWritable(){
    const self=this;
    return {async write(text){self.store[self.name]=String(text);},async close(){}};
  }
  async getFile(){
    const text=this.store[this.name]||'';
    return {size:text.length,lastModified:1,async text(){return text;}};
  }
}
class FakeDirectory {
  constructor(name){this.kind='directory';this.name=name;this.files={};this.children={};}
  async getDirectoryHandle(name,opts){
    if(!this.children[name]&&opts&&opts.create)this.children[name]=new FakeDirectory(name);
    if(!this.children[name])throw new Error('missing directory');
    return this.children[name];
  }
  async getFileHandle(name,opts){
    if(!this.files[name]&&opts&&opts.create)this.files[name]='';
    if(!(name in this.files))throw new Error('missing file');
    return new FakeFile(name,this.files);
  }
  async *values(){
    for(const name of Object.keys(this.files))yield new FakeFile(name,this.files);
  }
  async removeEntry(name){delete this.files[name];}
}

(async()=>{
  const root=new FakeDirectory('OneDrive');
  const payload={items:[{id:'1'}],projects:[]};
  const result=await api.writeBackupToDirectory(root,payload,new Date(2026,6,23,9,8,7));
  assert.equal(result.fileName,'个人工作台_2026-07-23_090807.json');
  const target=root.children['个人工作台备份'];
  assert.ok(target.files[result.fileName]);
  assert.equal(target.files['个人工作台_最新.json'],target.files[result.fileName]);
  const listed=await api.listFiles(root);
  assert.equal(listed.length,1);
  assert.equal(listed[0].name,result.fileName);
  for(let day=1;day<=31;day++)await api.writeBackupToDirectory(root,payload,new Date(2026,7,day,9,0,0));
  const retained=await api.listFiles(root);
  assert.equal(retained.length,30,'历史备份应只保留最近 30 份');
  assert.equal(Object.keys(target.files).filter(api.isHistoryFile).length,30);
  console.log('cloud-folder-backup.test.js: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
