/* Conversate: on-device Whisper (tiny.en, int8) running in a worker. Keeps ums and uhs. */
import * as ort from './ort/ort.wasm.min.mjs';
ort.env.wasm.wasmPaths=new URL('./ort/',import.meta.url).href;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
var enc=null,dec=null,MEL=null,TOK=null,loading=null;
var PROMPT=[471,3020,11,1309,502,892,588,11,289,3020,986,16805,11,994,338,644,314,1101,11,588,11,3612,13];
var SUP={};[1,2,7,8,9,10,14,25,26,27,28,29,31,58,59,60,61,62,63,90,91,92].forEach(function(i){SUP[i]=1});
function post(m){self.postMessage(m)}
async function getBuf(url,onp){
  var cache=null;try{cache=await caches.open('conversate-model-v1')}catch(e){}
  if(cache){var hit=await cache.match(url);if(hit){var b=await hit.arrayBuffer();onp(b.byteLength);return new Uint8Array(b)}}
  var r=await fetch(url);if(!r.ok)throw new Error('fetch '+url+' '+r.status);
  var len=+r.headers.get('content-length')||0,rd=r.body.getReader(),chunks=[],got=0;
  for(;;){var x=await rd.read();if(x.done)break;chunks.push(x.value);got+=x.value.length;onp(x.value.length)}
  var out=new Uint8Array(got),o=0;chunks.forEach(function(c){out.set(c,o);o+=c.length});
  if(cache){try{await cache.put(url,new Response(out,{headers:{'content-type':'application/octet-stream'}}))}catch(e){}}
  return out;
}
async function init(){
  if(enc&&dec)return;
  if(loading)return loading;
  loading=(async function(){
    var TOTAL=12937772+50022422+64320+645641,done=0;
    function onp(n){done+=n;post({type:'progress',pct:Math.min(99,Math.round(done/TOTAL*100))})}
    post({type:'progress',pct:0});
    var m=await getBuf('model/mel80.bin',onp);MEL=new Float32Array(m.buffer,m.byteOffset,80*201);
    var t=await getBuf('model/tokens.json',onp);var js=JSON.parse(new TextDecoder().decode(t));
    TOK=js.map(function(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u});
    var eb=await getBuf('model/enc.bin',onp);
    var parts=[];for(var i=1;i<=3;i++)parts.push(await getBuf('model/dec.p'+i+'.bin',onp));
    var dl=0;parts.forEach(function(p){dl+=p.length});var db=new Uint8Array(dl),o=0;parts.forEach(function(p){db.set(p,o);o+=p.length});parts=null;
    post({type:'progress',pct:99,stage:'load'});
    var opt={executionProviders:['wasm'],graphOptimizationLevel:'all'};
    enc=await ort.InferenceSession.create(eb,opt);
    dec=await ort.InferenceSession.create(db,opt);
    post({type:'progress',pct:100});
  })();
  try{await loading}finally{loading=null}
}
/* mel spectrogram, same as Whisper: 400-pt window, hop 160, 80 slaney mels, log10, clamp to max-8, (x+4)/4 */
var COS=null,SIN=null,WIN=null;
function tables(){
  if(COS)return;
  COS=new Float32Array(201*400);SIN=new Float32Array(201*400);WIN=new Float32Array(400);
  for(var n=0;n<400;n++)WIN[n]=0.5-0.5*Math.cos(2*Math.PI*n/400);
  for(var k=0;k<201;k++)for(var n2=0;n2<400;n2++){var a=2*Math.PI*k*n2/400;COS[k*400+n2]=Math.cos(a);SIN[k*400+n2]=Math.sin(a)}
}
function logMel(a){
  tables();
  var N=480000,x=new Float32Array(N);x.set(a.subarray(0,Math.min(a.length,N)));
  var P=new Float32Array(N+400);P.set(x,200);
  for(var i=0;i<200;i++){P[200-1-i]=x[i+1];P[200+N+i]=x[N-2-i]}
  var NF=3000,mel=new Float32Array(80*NF),fr=new Float32Array(400),pw=new Float32Array(201),mx=-1e9;
  for(var f=0;f<NF;f++){
    var base=f*160;for(var n=0;n<400;n++)fr[n]=P[base+n]*WIN[n];
    for(var k=0;k<201;k++){var re=0,im=0,o=k*400;for(var n3=0;n3<400;n3++){re+=fr[n3]*COS[o+n3];im+=fr[n3]*SIN[o+n3]}pw[k]=re*re+im*im}
    for(var m=0;m<80;m++){var s=0,mo=m*201;for(var k2=0;k2<201;k2++)s+=MEL[mo+k2]*pw[k2];var v=Math.log10(Math.max(s,1e-10));mel[m*NF+f]=v;if(v>mx)mx=v}
  }
  var fl=mx-8;for(var j=0;j<mel.length;j++){var q=mel[j];if(q<fl)q=fl;mel[j]=(q+4)/4}
  return mel;
}
async function decodeChunk(a){
  var mel=logMel(a);
  var eo=await enc.run({mel:new ort.Tensor('float32',mel,[1,80,3000])});
  var ck=eo.n_layer_cross_k,cv=eo.n_layer_cross_v;
  var seq=[50360].concat(PROMPT,[50257,50362]),cur=seq.slice(),off=0,out=[];
  var kc=new ort.Tensor('float32',new Float32Array(4*448*384),[4,1,448,384]),vc=new ort.Tensor('float32',new Float32Array(4*448*384),[4,1,448,384]);
  for(var step=0;step<200;step++){
    var feeds={tokens:new ort.Tensor('int64',BigInt64Array.from(cur.map(BigInt)),[1,cur.length]),in_n_layer_self_k_cache:kc,in_n_layer_self_v_cache:vc,n_layer_cross_k:ck,n_layer_cross_v:cv,offset:new ort.Tensor('int64',BigInt64Array.from([BigInt(off)]),[1])};
    var r=await dec.run(feeds);
    off+=cur.length;kc=r.out_n_layer_self_k_cache;vc=r.out_n_layer_self_v_cache;
    var lg=r.logits.data,V=51864,n=r.logits.dims[1],b=(n-1)*V,best=-1,bv=-1e30;
    for(var t=0;t<V;t++){
      if(SUP[t]||(t>=50257&&t!==50256))continue;
      if(step===0&&(t===220||t===50256))continue;
      var v=lg[b+t];if(v>bv){bv=v;best=t}
    }
    if(best===50256||best<0)break;
    out.push(best);cur=[best];
    var L=out.length;if(L>=8){var same=true;for(var z=1;z<8;z++)if(out[L-z]!==out[L-1]){same=false;break}if(same)break}
  }
  return out;
}
function toText(ids){
  var len=0;ids.forEach(function(i){len+=TOK[i].length});var b=new Uint8Array(len),o=0;ids.forEach(function(i){b.set(TOK[i],o);o+=TOK[i].length});
  return new TextDecoder().decode(b);
}
function rms(a){var s=0;for(var i=0;i<a.length;i++)s+=a[i]*a[i];return Math.sqrt(s/Math.max(1,a.length))}
self.onmessage=async function(e){
  var m=e.data;
  try{
    if(m.type==='init'){await init();post({type:'ready'});return}
    if(m.type==='run'){
      await init();
      var a=m.audio,N=480000,texts=[],nch=Math.max(1,Math.ceil(a.length/N));
      for(var c=0;c<nch;c++){
        var seg=a.subarray(c*N,Math.min(a.length,(c+1)*N));
        if(seg.length<8000||rms(seg)<0.002)continue;
        post({type:'step',i:c+1,n:nch});
        texts.push(toText(await decodeChunk(seg)).trim());
      }
      post({type:'done',id:m.id,text:texts.join(' ').replace(/\[[^\]]*\]|\([^)]*\)/g,' ').replace(/\s+/g,' ').trim()});
    }
  }catch(err){post({type:'error',id:m.id,message:String(err&&err.message||err)})}
};
