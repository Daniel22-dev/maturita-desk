import assert from 'node:assert/strict';
import { SESSION_OWNER_KEY, SESSION_OWNER_SCHEMA } from '../src/session-coordinator.js';

class StorageStub {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
class NodeStub {
  constructor() { this.innerHTML=''; this.dataset={}; this.listeners={}; this.className=''; this.classList={toggle(){},add(){},remove(){}}; this.style={setProperty(){}}; }
  addEventListener(type, cb){ (this.listeners[type] ||= []).push(cb); }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  setAttribute(){}
  appendChild(){}
  remove(){}
  focus(){}
}
class BroadcastChannelStub {
  static instances=[];
  constructor(name){ this.name=name; this.listeners={}; BroadcastChannelStub.instances.push(this); }
  addEventListener(type, cb){ (this.listeners[type] ||= []).push(cb); }
  postMessage(){}
  close(){}
  emit(data){ for (const cb of this.listeners.message || []) cb({data}); }
}

const storage = new StorageStub();
const app = new NodeStub();
const modal = new NodeStub();
const toast = new NodeStub();
const docListeners = {};
const winListeners = {};

globalThis.MATURITA_DESK_RUNTIME = {
  schema:'maturita-desk-runtime-v1', version:1, environmentId:'synthetic-test', mode:'standalone-local', serverBaseUrl:'', allowedOrigins:['self'],
  trust:{ expectedMode:'standalone-local', expectedEnvironmentId:'synthetic-test', appOrigins:['https://example.invalid'] },
  auth:{ provider:'local-device', offlineLease:{enabled:false, publicKeys:{}} },
  content:{ provider:'encrypted-local', allowManualImport:true },
  factCheck:{ provider:'isolated-http', endpoint:'', timeoutMs:18000 }
};
globalThis.localStorage = storage;
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,maxTouchPoints:5},configurable:true});
Object.defineProperty(globalThis,'BroadcastChannel',{value:BroadcastChannelStub,configurable:true});
globalThis.window = {
  innerWidth:1024, innerHeight:768, visualViewport:null,
  setInterval:()=>1, setTimeout:()=>1, clearTimeout:()=>{},
  matchMedia:()=>({matches:false}),
  addEventListener(type,cb){(winListeners[type] ||= []).push(cb);}, removeEventListener(){}
};
globalThis.document = {
  documentElement:{dataset:{},style:{setProperty(){}}}, visibilityState:'visible', body:new NodeStub(),
  querySelector(selector){ if(selector==='#app') return app; if(selector==='#modal-root') return modal; if(selector==='#toast-root') return toast; return null; },
  querySelectorAll(){return[];}, createElement:()=>new NodeStub(), addEventListener(type,cb){(docListeners[type] ||= []).push(cb);}
};

await import('../src/main.js');
assert.equal(BroadcastChannelStub.instances.length, 1, 'BroadcastChannel path must initialize without TDZ/runtime crash');

function target(dataset){ return {dataset,closest(sel){return sel==='[data-action]'?this:null;},matches(){return false;}}; }
async function click(dataset){ const cb=docListeners.click?.[0]; assert(cb); return cb({target:target(dataset)}); }

await click({action:'choose-mode',mode:'exam'});
await click({action:'select-topic',topic:'14'});
await click({action:'start-exam'});
const session = JSON.parse(storage.getItem('ghrab.maturita-desk.session.v1'));
assert.equal(session.status,'running');

storage.setItem(SESSION_OWNER_KEY, JSON.stringify({
  schema: SESSION_OWNER_SCHEMA,
  instanceId:'external-instance',
  sessionId:session.id,
  updatedAt:Date.now()
}));
BroadcastChannelStub.instances[0].emit({type:'takeover',instanceId:'external-instance',sessionId:session.id,at:Date.now()});
assert.match(app.innerHTML,/Aktivní relaci zapisuje jiný panel/);

const before = storage.getItem('ghrab.maturita-desk.session.v1');
const inputCb = docListeners.input?.[0];
inputCb?.({target:{dataset:{phase:'pictures'},value:'SHOULD_NOT_OVERWRITE',matches(sel){return sel==='[data-notes-input]';}}});
assert.equal(storage.getItem('ghrab.maturita-desk.session.v1'), before, 'conflicted tab must not overwrite persisted session');

console.log('Stage 13 main multi-tab guard smoke: PASS');
