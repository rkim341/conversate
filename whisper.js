/* Conversate: main-thread wrapper for the on-device Whisper worker. window.__whisper */
(function(){
var KEY='conversate-whisper',W=null,ready=false,readyP=null,jobs={},nid=0,prog=0,listeners=[];
function on(){try{return localStorage.getItem(KEY)!=='0'}catch(e){return true}}
function supported(){return !!(window.Worker&&window.WebAssembly&&(window.AudioContext||window.webkitAudioContext)&&window.OfflineAudioContext)}
function start(){
  if(W)return;
  W=new Worker('whisper-worker.js',{type:'module'});
  W.onmessage=function(e){
    var m=e.data;
    if(m.type==='progress'){prog=m.pct;listeners.forEach(function(f){f({stage:'model',pct:m.pct})})}
    else if(m.type==='ready'){ready=true}
    else if(m.type==='step'){listeners.forEach(function(f){f({stage:'step',i:m.i,n:m.n})})}
    else if(m.type==='done'||m.type==='error'){var j=jobs[m.id];if(j){delete jobs[m.id];m.type==='done'?j.res(m.text):j.rej(new Error(m.message))}}
  };
  W.onerror=function(){var js=jobs;jobs={};W=null;ready=false;readyP=null;Object.keys(js).forEach(function(k){js[k].rej(new Error('worker'))})};
}
function warm(){
  if(!on()||!supported())return Promise.resolve(false);
  if(ready)return Promise.resolve(true);
  start();
  if(!readyP)readyP=new Promise(function(res){var t=setInterval(function(){if(ready){clearInterval(t);res(true)}if(!W){clearInterval(t);res(false)}},300);W.postMessage({type:'init'})});
  return readyP;
}
function toPCM16k(blob){
  return blob.arrayBuffer().then(function(buf){
    var AC=window.AudioContext||window.webkitAudioContext,ctx=new AC();
    return new Promise(function(res,rej){ctx.decodeAudioData(buf,res,rej)}).then(function(ab){
      try{ctx.close()}catch(e){}
      var n=Math.max(1,Math.ceil(ab.duration*16000)),oc=new OfflineAudioContext(1,n,16000),src=oc.createBufferSource();
      src.buffer=ab;src.connect(oc.destination);src.start();
      return oc.startRendering();
    }).then(function(r){return r.getChannelData(0)});
  });
}
function run(blob,onStatus){
  if(onStatus)listeners.push(onStatus);
  var id=++nid;
  return toPCM16k(blob).then(function(pcm){
    start();
    return new Promise(function(res,rej){jobs[id]={res:res,rej:rej};W.postMessage({type:'run',id:id,audio:pcm},[pcm.buffer])});
  }).then(function(t){if(onStatus)listeners.splice(listeners.indexOf(onStatus),1);return t},function(e){if(onStatus)listeners.splice(listeners.indexOf(onStatus),1);throw e});
}
window.__whisper={enabled:function(){return on()&&supported()},warm:warm,run:run,isReady:function(){return ready}};
})();
