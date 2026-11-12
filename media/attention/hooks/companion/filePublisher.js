class ReadUnavailable extends Error {}
class SourceCancelled extends Error {}
const encode = new TextEncoder();
const bytes = text => encode.encode(text).length;
const own = (value,key) => value !== null && typeof value === "object" && Object.hasOwn(value,key);
const scalar = text => typeof text === "string" && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
const bounded = (value,max,min=0) => scalar(value) && value.length <= max && bytes(value) <= max && bytes(value) >= min;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const hex = value => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
const integer = (value,min=0) => Number.isSafeInteger(value) && value >= min;
const nullable = (value,valid) => value === null || valid(value);
const reasons = ["SCHEMA_REJECTED","CONTENT_REJECTED","IDENTITY_CHANGED","TRANSACTION_TIMEOUT","CHANNEL_RETIRED","CONTROL_REJECTED","HANDSHAKE_TIMEOUT"];
const envelopeKeys = ["v","token","sessionId","claudeSessionId","generation"];
const closed = (value,keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => own(value,key));
function binding(environment) {
  const keys = ["DIR","TOKEN","SESSION_ID","CLAUDE_SESSION_ID","GENERATION"].map(suffix => "CLAUDE_WORKSPACES_CAPTURE_"+suffix);
  if (!keys.every(key => own(environment,key))) return null;
  const [directory,token,sessionId,claudeSessionId,generation] = keys.map(key => environment[key]);
  if (typeof directory !== "string" || !scalar(directory) || directory.includes("\0") || !(/^[A-Za-z]:[\\/]/.test(directory) || /^\\\\[^\\]+\\[^\\]+/.test(directory) || directory.startsWith("/")) ||
      typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || !bounded(sessionId,128,1) || !uuid(claudeSessionId) || !bounded(generation,128,1)) return null;
  return Object.freeze({directory,token,sessionId,claudeSessionId,generation});
}
/** Incremental compact JSON emission. Only fresh normalized snapshots enter this walker. */
function* pieces(value,metadata=false,key="") {
  if (typeof value === "string") {
    if (metadata && (key === "text" || key === "command")) {yield '""';return;}
    yield '"';
    for (let start=0;start<value.length;) {
      let end=Math.min(start+512,value.length);
      if (end<value.length && /[\uD800-\uDBFF]/.test(value[end-1])) end--;
      yield JSON.stringify(value.slice(start,end)).slice(1,-1);start=end;
    }
    yield '"';
  } else if (Array.isArray(value)) {
    yield "[";for(let i=0;i<value.length;i++){if(i)yield ",";yield* pieces(value[i],metadata);}yield "]";
  } else if(value !== null && typeof value === "object") {
    yield "{";let first=true;for(const [name,member] of Object.entries(value)){if(!first)yield ",";first=false;yield JSON.stringify(name)+":";yield* pieces(member,metadata,name);}yield "}";
  } else yield JSON.stringify(value);
}
/** Split on Unicode scalar boundaries, including when escaping changes byte counts. */
function* chunks(value) {
  let text="",size=0;
  for(const piece of pieces(value)) {
    const length=bytes(piece);
    if(size+length<=65536){text+=piece;size+=length;continue;}
    for(const scalar of piece){const count=bytes(scalar);if(size+count>65536){yield text;text="";size=0;}text+=scalar;size+=count;}
  }
  if(text)yield text;
}
function measure(value,serialize=false) {
  let metadata=0,source=0,total=0,count=0;
  for(const piece of pieces(value,true)){metadata+=bytes(piece);if(metadata>32768)throw new Error("source");}
  const walk = v => {if(!v || typeof v!=="object")return;for(const [key,member] of Object.entries(v)){if((key==="text"||key==="command")&&typeof member==="string")source+=bytes(member);else walk(member);}};
  walk(value);
  if(serialize)for(const chunk of chunks(value)){total+=bytes(chunk);count++;if(total>6324224||count>8192)throw new Error("source");}
  return {charge:source+metadata,total,count};
}
/**
 * createFilePublisher({fs:{read,write,stat,list,exists},clock:{now,after}}, fiveKeyEnvironment).
 * Construction is inert. Native callbacks are synchronous. poll owns all SDK I/O.
 * A valid host offer is the admission boundary for globally pre-reserved headroom.
 */
export function createFilePublisher(driver,environment) {
  const launch=binding(environment);
  const envelope=launch ? {v:1,token:launch.token,sessionId:launch.sessionId,claudeSessionId:launch.claudeSessionId,generation:launch.generation} : null;
  let phase=launch ? "idle" : "closed", nativeId=null, suspended=false, renewal=false, window=0, lifecycle=0, running=false, timer=null;
  let control=null, controlText=null, pending=null, epoch=null, grant=null, seq=1, observationId=1, ackSeq=0, grantAck=false;
  let handshakeAt=null, heartbeatAt=null, lastHostAt=null, gapReason=null, lost=false, nativeMismatch=null;
  let wakeTimer=null, timerDelay=0, timerVersion=0;
  const queue=[], staged=[], guards=new Map();
  let prepared=null, queueBytes=0, guardBytes=0, capacityAt=null, readFailureAt=null;
  const path = name => launch.directory.replace(/[\\/]$/,"")+"/"+name;
  const cancelTimer = () => {timer?.cancel();wakeTimer?.cancel();timer=null;wakeTimer=null;timerDelay=0;timerVersion++;};
  const clearSource = () => {queue.length=0;queueBytes=0;guards.clear();guardBytes=0;window++;};
  const close = () => {phase="closed";cancelTimer();clearSource();prepared=null;staged.length=0;};
  const abandon = () => {clearSource();prepared=null;staged.length=0;epoch=null;grant=null;grantAck=false;ackSeq=0;seq=1;observationId=1;lost=true;};
  const resetRetirement = (retiredEpoch,reason) => pending?.reason==="native-reset"&&pending.written&&
    pending.predecessorEpoch===retiredEpoch&&reason==="CHANNEL_RETIRED";
  const queuedBytes = () => queueBytes+guardBytes+staged.reduce((sum,item)=>sum+item.charge,0)+(prepared?.charge??0);
  const queuedSlots = () => queue.length+guards.size+staged.filter(item=>item.seq!==undefined).length+(prepared?1:0);
  const stagedBytes = () => staged.reduce((sum,item)=>sum+item.charge,0);
  const frameCharge = value => {const length=bytes(JSON.stringify(value));return length+bytes(JSON.stringify({v:1,basename:"frame."+value.captureEpoch+"."+value.seq+".upload",byteLength:length}));};
  const scheduled = version => () => {if(version!==timerVersion)return;cancelTimer();void poll();};
  const arm = delay => {
    if(phase==="closed"||phase==="idle"||suspended||timer)return;
    timerDelay=delay;timer=driver.clock.after(delay,scheduled(timerVersion));
  };
  const wake = () => {
    if(running)return;
    if(!timer){arm(50);return;}
    // SDK now() is asynchronous: race one bounded wake against the untouched
    // idle timer, rather than risk postponing an idle deadline already nearer.
    if(timerDelay>50&&!wakeTimer)wakeTimer=driver.clock.after(50,scheduled(timerVersion));
  };
  const gap = reason => {if(phase==="closed")return;clearSource();gapReason=reason;lost=true;wake();};
  const authenticated = value => envelopeKeys.every(key=>value?.[key]===envelope[key]);
  function validControl(value) {
    return closed(value,[...envelopeKeys,"kind","controlRevision","state","offerId","captureEpoch","grantId","predecessorEpoch","reasonCode","recoveriesRemaining","lastRetired"]) && value.kind==="control" &&
      integer(value.controlRevision,1)&&["offered","granted","active","retired","failed"].includes(value.state)&&nullable(value.offerId,hex)&&nullable(value.captureEpoch,hex)&&nullable(value.grantId,hex)&&nullable(value.predecessorEpoch,hex)&&nullable(value.reasonCode,v=>reasons.includes(v))&&[0,1].includes(value.recoveriesRemaining)&&
      (value.lastRetired===null||(closed(value.lastRetired,["captureEpoch","ackSeq","reasonCode"])&&hex(value.lastRetired.captureEpoch)&&integer(value.lastRetired.ackSeq)&&reasons.includes(value.lastRetired.reasonCode)));
  }
  /** All reads are preceded/followed by bounded stats; SDK has no ranged read API. */
  async function readFixed(name,current) {
    const attempt=async operation=>{try{return await operation();}catch{throw new ReadUnavailable();}};
    if(!await attempt(()=>driver.fs.exists(path(name)))){current();return null;}current();
    const before=await attempt(()=>driver.fs.stat(path(name),{resolve:true}));current();
    if(before.kind!=="file"||before.isLink||!integer(before.size,1)||before.size>4096)throw new Error("control");
    const text=await attempt(()=>driver.fs.read(path(name)));current();
    const after=await attempt(()=>driver.fs.stat(path(name),{resolve:true}));current();
    if(after.kind!=="file"||after.isLink||after.size!==before.size||after.mtimeMs!==before.mtimeMs||!bounded(text,4096,1)||bytes(text)!==after.size)throw new Error("control");
    return JSON.parse(text);
  }
  async function writePair(base,value,now,current,frameSeq) {
    const live=current,sourceLife=lifecycle;current=()=>{live();if(frameSeq!==undefined&&sourceLife!==lifecycle)throw new SourceCancelled();};
    const text=JSON.stringify(value),length=bytes(text);
    if(length>(frameSeq===undefined?4096:262144))throw new Error("frame");
    const marker=JSON.stringify({v:1,basename:base+".upload",byteLength:length}),charge=length+bytes(marker);
    const entries=await driver.fs.list(launch.directory);current();
    if(!Array.isArray(entries)||entries.length>256)throw new Error("capacity");
    const transactions=new Set();let physicalBytes=0,physicalFiles=0;
    for(const entry of entries) {
      if(["ownership.json","control.json","ack.json","control.json.tmp","ack.json.tmp"].includes(entry.name))continue;
      const match=/^((?:request|activate)\.[a-f0-9]{32}|frame\.[a-f0-9]{32}\.[1-9][0-9]*)\.(upload|ready|committed)$/.exec(entry.name);
      if(!match||entry.kind!=="file"||entry.isLink||!integer(entry.size))throw new Error("capacity");
      transactions.add(match[1]);physicalBytes+=entry.size;physicalFiles++;
    }
    if(transactions.has(base))throw new Error("collision");
    if(transactions.size>=8||physicalFiles+2>16||physicalBytes+charge>2097152||staged.length>=8||stagedBytes()+charge>2097152) {
      if(capacityAt===null)capacityAt=now;if(now-capacityAt>=2000)throw new Error("capacity");return false;
    }
    capacityAt=null;
    // Charge before starting a non-atomic write; timeout cannot cancel its side effect.
    if(frameSeq!==undefined)prepared=null;
    const item={base,charge,at:now,seq:frameSeq};staged.push(item);
    const uploadExists=await driver.fs.exists(path(base+".upload"));current();
    const readyExists=await driver.fs.exists(path(base+".ready"));current();
    if(uploadExists||readyExists)throw new Error("collision");
    await driver.fs.write(path(base+".upload"),text);current();
    if(await driver.clock.now()-now>=2000)throw new Error("deadline");current();
    await driver.fs.write(path(base+".ready"),marker);current();
    if(await driver.clock.now()-now>=2000)throw new Error("deadline");current();item.published=true;
    return true;
  }
  function consumeControl(value,now) {
    if(!authenticated(value))return;
    if(!validControl(value))throw new Error("control");
    if(control && value.controlRevision<control.controlRevision)return;
    const text=JSON.stringify(value);
    if(control && value.controlRevision===control.controlRevision){if(text!==controlText)throw new Error("contradiction");return;}
    if(pending && ["granted","active"].includes(value.state) && value.grantId!==pending.offerId)throw new Error("grant");
    if(epoch && ["granted","active"].includes(value.state) && value.captureEpoch!==epoch && !pending)throw new Error("epoch");
    control=value;controlText=text;lastHostAt=now;
    if(value.state==="failed"){close();return;}
    if(value.state==="retired"){
      // Renewal exposes predecessor retirement before its original offer's grant.
      // Keep only that written request, with its original handshake deadline.
      const resetting=resetRetirement(value.captureEpoch,value.reasonCode)&&value.recoveriesRemaining===1&&
        value.lastRetired?.captureEpoch===pending.predecessorEpoch&&value.lastRetired.reasonCode==="CHANNEL_RETIRED";
      abandon();if(!resetting){pending=null;handshakeAt=now;}phase=suspended?"suspended":resetting?"requesting":"waiting";return;
    }
    if(value.state==="offered"){if(handshakeAt===null)handshakeAt=now;phase=suspended?"suspended":"waiting";return;}
    if(value.state==="granted") {
      if(!pending||value.grantId!==pending.offerId||!hex(value.captureEpoch)||value.offerId!==null||value.predecessorEpoch!==pending.predecessorEpoch)throw new Error("grant");
      const boundary=lost||pending.reason!=="initial";abandon();lost=boundary;epoch=value.captureEpoch;grant=value.grantId;phase="granted";pending={...pending,activation:false};handshakeAt=now;return;
    }
    if(value.state==="active") {
      if(value.captureEpoch!==epoch||value.grantId!==grant||!hex(value.offerId)||(phase!=="active"&&!pending?.activation))throw new Error("active");
      if(phase!=="active") {staged.length=0;pending=null;renewal=nativeMismatch!==null;phase=suspended?"suspended":"active";handshakeAt=null;heartbeatAt=now;lastHostAt=now;if(lost)gapReason="RESET_BOUNDARY";}
    }
  }
  async function cycle(now,current) {
    const root=await driver.fs.stat(launch.directory,{resolve:true});current();
    const spelling=value=>typeof value==="string"?value.replace(/\\/g,"/").replace(/\/$/,""):null;
    if(root.kind!=="dir"||root.isLink||spelling(root.realPath)!==spelling(launch.directory))throw new Error("root");
    if(handshakeAt!==null&&now-handshakeAt>=5000)throw new Error("handshake");
    const incoming=await readFixed("control.json",current);if(incoming)consumeControl(incoming,now);current();
    const ack=await readFixed("ack.json",current);current();
    if(ack && authenticated(ack) && ack.captureEpoch===epoch) {
      if(!closed(ack,[...envelopeKeys,"kind","captureEpoch","disposition","ackSeq",...(ack.disposition==="retired"?["reasonCode"]:[])]) || ack.kind!=="ack" || !["continue","retired"].includes(ack.disposition)||!integer(ack.ackSeq)||ack.ackSeq>=seq||(ack.disposition==="retired"&&!reasons.includes(ack.reasonCode)))throw new Error("ack");
      if(ack.ackSeq>Math.max(ackSeq,...staged.filter(item=>item.published&&item.seq!==undefined).map(item=>item.seq)))throw new Error("ack");
      if(ack.disposition==="continue"&&ack.ackSeq===0&&phase==="granted")grantAck=true;
      if(ack.disposition==="retired"){
        const resetting=resetRetirement(ack.captureEpoch,ack.reasonCode);
        abandon();if(!resetting)pending=null;phase=suspended?"suspended":resetting?"requesting":"waiting";
      }
      else if(ack.ackSeq>ackSeq){ackSeq=ack.ackSeq;lastHostAt=now;for(let i=staged.length-1;i>=0;i--)if(staged[i].seq!==undefined&&staged[i].seq<=ackSeq)staged.splice(i,1);}
    }
    if(phase==="closed"||suspended)return;
    if(handshakeAt!==null && now-handshakeAt>=5000)throw new Error("handshake");
    if(staged.some(item=>now-item.at>=2000))throw new Error("staging");
    if(phase==="active"&&lastHostAt!==null&&now-lastHostAt>=5000)throw new Error("health");
    if(!control)return;
    if(!pending&&hex(control.offerId)&&(control.state==="offered"||control.state==="retired"||renewal)) {
      const reason=control.state==="offered"?"initial":control.state==="retired"?"recover":"native-reset";
      if(reason==="recover"&&control.recoveriesRemaining!==1){close();return;}
      pending={offerId:control.offerId,predecessorEpoch:reason==="initial"?null:control.captureEpoch,reason};
      clearSource();phase="requesting";renewal=false;handshakeAt=now;
    }
    if(phase==="requesting"&&!pending.written) {
      const {offerId,predecessorEpoch,reason}=pending;
      pending.written=await writePair("request."+offerId,{...envelope,kind:"epochRequest",offerId,predecessorEpoch,reason,nativeSessionId:nativeId},now,current);return;
    }
    if(phase==="granted"&&grantAck&&!pending.activation) {

      pending.activation=await writePair("activate."+epoch,{...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:grant,nativeSessionId:nativeId},now,current);return;
    }
    if(phase!=="active"||nativeMismatch!==null||staged.length>=8)return;
    if(!prepared) {
      let body;
      if(now-heartbeatAt>=1000){body={kind:"heartbeat"};heartbeatAt=now;}
      else if(gapReason){body={kind:"gap",mode:"unknown",coversThrough:seq,reason:gapReason};gapReason=null;lost=false;}
      else if(queue.length) {
        const item=queue[0];
        if(!item.iterator){if(!integer(observationId,1))throw new Error("counter");const size=measure(item.value,true);item.total=size.total;item.count=size.count;item.id=observationId++;item.iterator=chunks(item.value);item.index=0;}
        const data=item.iterator.next().value;
        body={kind:"observationChunk",observationId:item.id,chunkIndex:item.index++,chunkCount:item.count,totalByteLength:item.total,byteLength:bytes(data),data};
        if(item.index===item.count){queue.shift();queueBytes-=item.charge;}
      } else return;
      if(!integer(seq,1))throw new Error("counter");
      const value={...envelope,captureEpoch:epoch,seq:seq++,...body},charge=frameCharge(value);
      if(queuedBytes()+charge>4194304||queuedSlots()>=64) {
        gap("OVERFLOW");
        // Replace a lost data allocation exactly; keep due health/control frames
        // while the unknown boundary accounts for discarded unencoded source.
        const replacement=value.kind==="observationChunk"?{...envelope,captureEpoch:epoch,seq:value.seq,kind:"gap",mode:"known",coversThrough:value.seq,reason:"OVERFLOW"}:value;
        prepared={value:replacement,charge:frameCharge(replacement)};
      } else prepared={value,charge};
    }
    const item=prepared;
    if(await writePair("frame."+epoch+"."+item.value.seq,item.value,now,current,item.value.seq))prepared=null;
  }
  /** One in-flight operation; an inclusive timeout invalidates every later continuation. */
  async function poll() {
    if(running||phase==="closed"||phase==="idle"||suspended)return;
    cancelTimer();running=true;
    let expired=false;const watchdog=driver.clock.after(2000,()=>{expired=true;close();});
    const current=()=>{if(expired||phase==="closed")throw new Error("cancelled");};
    let now=null;
    try {now=await driver.clock.now();current();if(readFailureAt!==null&&now-readFailureAt>=2000)throw new Error("lock");await cycle(now,current);readFailureAt=null;}
    catch(error) {if(error instanceof SourceCancelled){/* Native transition keeps the process-owned publisher renewable. */}else if(error instanceof ReadUnavailable&&now!==null&&phase!=="closed"){if(readFailureAt===null)readFailureAt=now;}else close();}
    finally {watchdog.cancel();running=false;arm(queue.length||prepared||staged.length||pending||gapReason?50:250);}
  }
  function nativeStart(id,source) {
    if(phase==="closed")return;
    if(!uuid(id)){close();return;}
    // A mismatch is terminal for this launch, even if an older activation is already in flight.
    if(id!==launch.claudeSessionId&&nativeMismatch===null){nativeMismatch=id;lifecycle++;clearSource();prepared=null;lost=true;}
    nativeId=nativeMismatch??id;
    if(phase==="idle"){phase="waiting";suspended=false;arm(0);return;}
    if(pending){
      // A held activation flag means this request already admitted a grant.
      if(suspended)phase=pending.activation===undefined?"requesting":"granted";
      suspended=false;arm(0);return;
    }
    if(source==="startup"&&!suspended&&id===launch.claudeSessionId)return;
    suspended=false;renewal=control?.state==="active";lifecycle++;clearSource();lost=true;phase=renewal?"active":"waiting";arm(0);
  }
  return {
    poll,stop:close,window:()=>window,gap,
    nativeStart,
    nativeEnd(id){if(phase==="closed")return;if(id!==launch.claudeSessionId){nativeStart(id,"identity");return;}suspended=true;lifecycle++;cancelTimer();clearSource();lost=true;phase="suspended";},
    nativeIdentity(id){if(id!==launch?.claudeSessionId)nativeStart(id,"identity");},
    imageGuard(id,safe) {
      if(safe===undefined)return guards.get(id)?.safe===true;
      if(phase!=="active"||nativeMismatch!==null||renewal||suspended)return false;
      const previous=guards.get(id),charge=bytes(id)+32;
      if(!previous){while(guards.size&&(queuedSlots()>=64||queuedBytes()+charge>4194304)){const key=guards.keys().next().value;guardBytes-=guards.get(key).charge;guards.delete(key);}if(queuedSlots()>=64||queuedBytes()+charge>4194304)return false;guardBytes+=charge;}
      guards.set(id,{safe:previous?previous.safe&&safe:safe,charge});return guards.get(id).safe;
    },
    enqueue(value,expectedWindow) {
      if(phase==="closed")return false;
      if(expectedWindow!==window||phase!=="active"||nativeMismatch!==null||renewal||suspended){lost=true;return false;}
      try {
        const size=measure(value);
        if(queuedSlots()>=64||queuedBytes()+size.charge>4194304){gap("OVERFLOW");return false;}
        queue.push({value,...size});queueBytes+=size.charge;wake();return true;
      } catch {gap("SOURCE_REJECTED");return false;}
    },
    snapshot:()=>Object.freeze({phase,queuedSlots:queuedSlots(),queuedBytes:queuedBytes(),stagedTransactions:staged.length,stagedBytes:stagedBytes(),ackSeq,nextSeq:seq,captureEpoch:epoch})
  };
}
