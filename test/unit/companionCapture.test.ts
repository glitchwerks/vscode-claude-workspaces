import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as codec from "../../src/companion/companionTypes";

interface WireCase {
  id: string;
  frames: string[];
  expected: { disposition: string; reasonCode?: string; observations?: unknown[] };
}
const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../test/fixtures/companion/capture-cases.json"), "utf8")) as {
  wireExamples: WireCase[];
  ownershipExamples: { id: string; markerSerialized: string; context: {directoryBasename: string} }[];
  bindingExamples: {id:string;environment:Record<string,unknown>}[];
  nativeReturnExamples: {id:string;expected:unknown}[];
  nativeDenyPipelines: WireCase[];
};
const envelope = {v:1, token:"A".repeat(43), sessionId:"managed-A",
  claudeSessionId:"11111111-1111-4111-8111-111111111111", generation:"generation-A"};
const epoch = "a".repeat(32);
const hex = "b".repeat(32);
const main = {kind:"main"};
const enter = {kind:"callEnter",scope:main,toolUseId:"call-A",bindingValid:true,command:"雪 🚀\nquoted"};
const flags = {interrupted:false,backgroundTaskId:null,backgroundedByUser:null,
  backgroundedByTurnAbort:null,backgroundedToDeliverMessage:null,backgroundEndsWithFinalResponse:null,
  backgroundWakesOwner:null,timedOutAfterMs:null,isImage:false,backgroundArtifactHint:false};
const rejection = (reason = "SCHEMA_REJECTED") => ({ok:false,reason});
const observation = (value: unknown) => codec.decodeNormalizedObservation(JSON.stringify(value));
const frame = (value: unknown) => codec.decodeCaptureData(JSON.stringify(value));

describe("companion capture closed codecs", () => {
  it("decodes all native-return projections and serialized withholding pipelines without execution inference", () => {
    for (const item of fixture.nativeReturnExamples) assert.deepEqual(observation(item.expected),{ok:true,value:item.expected},item.id);
    for (const item of fixture.nativeDenyPipelines) {
      const values = item.frames.map(data => {
        const decoded = codec.decodeCaptureData(data);
        assert.equal(decoded.ok,true,item.id);
        if (!decoded.ok || decoded.value.kind !== "observationChunk") assert.fail("expected a normalized chunk");
        const result = codec.decodeNormalizedObservation(decoded.value.data);
        assert.equal(result.ok,true,item.id);
        if (!result.ok) assert.fail("expected a valid normalized observation");
        return result.value;
      });
      assert.deepEqual(values,item.expected.observations);
    }
    const multi = fixture.wireExamples.find(c=>c.id==="W18")!;
    const pieces = multi.frames.map(data => {
      const result = codec.decodeCaptureData(data);
      if (!result.ok || result.value.kind !== "observationChunk") assert.fail("expected a valid chunk");
      return result.value.data;
    });
    assert.deepEqual(codec.decodeNormalizedObservation(pieces.join("")),{ok:true,value:multi.expected.observations![0]});
  });
  it("accepts metadata at 32 KiB and rejects the next byte independently of source text", () => {
    const blocks = Array.from({length:937},(_,index)=>({kind:"unsupported",index}));
    // The compact row with rowId='r' is 32755 bytes; only the ID length changes.
    for (const length of [13,14,15]) {
      const result = observation({kind:"assistantRow",scope:main,rowId:"r".repeat(length),blocks});
      if (length <= 14) assert.equal(result.ok,true);
      else assert.deepEqual(result,rejection("CONTENT_REJECTED"));
    }
  });
  it("accounts for JSON escaping in the serialized frame cap", () => {
    const base = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1};
    const accepted = {...base,totalByteLength:40000,byteLength:40000,data:"\u0001".repeat(40000)};
    assert.equal(frame(accepted).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:65536,byteLength:65536,data:"\u0001".repeat(65536)}),rejection("CONTENT_REJECTED"));
    assert.equal(frame({...base,chunkCount:8192,totalByteLength:6324224,byteLength:1,data:"x"}).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:6324225,byteLength:1,data:"x",chunkCount:8192}),rejection("CONTENT_REJECTED"));
  });
  it("decodes the five literal launch keys without granting directory ownership", () => {
    const good = fixture.bindingExamples[0]!;
    assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,UNRELATED:"preserve"}),{ok:true,value:{
      directory:"C:/synthetic/capture/channel-A",token:"A".repeat(43),sessionId:"managed-A",
      claudeSessionId:envelope.claudeSessionId,generation:"generation-A"}});
    for (const index of [1,2]) assert.deepEqual(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[index]!.environment),rejection());
    assert.equal(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[3]!.environment).ok,true);
    for (const key of Object.keys(good.environment)) {
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,[key]:undefined}),rejection());
    }
    for (const directory of ["C:relative","../channel","C:/ok\u0000bad","C:/\ud800"])
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,CLAUDE_WORKSPACES_CAPTURE_DIR:directory}),rejection());
  });
  it("rejects missing and extra keys at every normalized union boundary", () => {
    for (const item of fixture.wireExamples.filter(c=>/^(W0[1-9]|W1[0-4]|W43|W44)$/.test(c.id))) {
      const value = item.expected.observations![0] as Record<string,unknown>;
      assert.deepEqual(observation({...value,runEligible:true}),rejection());
      for (const key of Object.keys(value)) assert.deepEqual(observation({...value,[key]:undefined}),rejection());
    }
    for (const change of [
      {blocks:[{kind:"text",index:0,text:"",hidden:true}]},
      {blocks:[{kind:"bashRequest",index:0,toolUseId:"t"}]},
      {blocks:[{kind:"unsupported",index:0,text:"private"}]},
      {blocks:[null]}, {blocks:{}}, {blocks:[{kind:"text",index:0,text:7}]}
    ]) assert.deepEqual(observation({kind:"assistantRow",scope:main,rowId:"r",...change}),rejection());
    for (const output of [[{kind:"text",text:"",raw:"private"}],[{kind:"unavailable",reason:"MEDIA",text:"private"}],
      [{kind:"unavailable",reason:"OTHER"}],[null],{}]) {
      assert.deepEqual(observation({kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:false,output}),rejection());
    }
  });
  for (const item of fixture.wireExamples.filter(c => /^(W0[1-9]|W1[0-7]|W43|W44)$/.test(c.id))) {
    it(item.id + " decodes the exact outer member and normalized content", () => {
      const decoded = codec.decodeCaptureData(item.frames[0]!);
      assert.equal(decoded.ok, true);
      if (!decoded.ok) return;
      assert.deepEqual(decoded.value, JSON.parse(item.frames[0]!));
      if (decoded.value.kind === "observationChunk") {
        assert.deepEqual(codec.decodeNormalizedObservation(decoded.value.data),
          {ok:true,value:item.expected.observations![0]});
      }
    });
  }
  for (const id of ["W19","W20","W21","W22","W23","W24","W25"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects the outer member with the selected reason", () => {
      assert.deepEqual(codec.decodeCaptureData(item.frames[0]!), rejection(item.expected.reasonCode));
    });
  }
  for (const id of ["W26","W27","W28","W29","W30","W31","W32","W33","W34","W35","W36","W45","W46"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects malformed/private normalized membership", () => {
      const value = JSON.parse(item.frames[0]!) as {data:string};
      assert.deepEqual(codec.decodeNormalizedObservation(value.data), rejection(item.expected.reasonCode));
    });
  }
  it("preserves scalar newline and non-ASCII content and freezes nested snapshots", () => {
    const result = observation(enter);
    assert.deepEqual(result, {ok:true,value:enter});
    if (!result.ok) return;
    assert.ok(Object.isFrozen(result.value));
    assert.ok(Object.isFrozen(result.value.scope));
    assert.throws(() => Object.assign(result.value.scope, {kind:"agent"}));
  });
  it("uses fatal UTF-8 decoding and rejects unpaired surrogates", () => {
    for (const data of [Buffer.from([0xff]), Buffer.from([0xed,0xa0,0x80]), "{", "null", "[]"]) {
      assert.deepEqual(codec.decodeNormalizedObservation(data), rejection());
    }
    assert.deepEqual(observation({...enter,command:"\ud800"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...enter,toolUseId:"\udfff"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.from(JSON.stringify(enter),"utf8")),{ok:true,value:enter});
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(enter))])),rejection());
  });
  it("keeps source strings inert and rejects private nested keys and omitted fields", () => {
    assert.equal(observation({...enter,command:'{"kind":"run","token":"PRIVATE"}'}).ok,true);
    for (const change of [{scope:{kind:"main",agentId:null}},{scope:{kind:"agent",agentId:"worker"}},
      {exitCode:0},{command:undefined}]) assert.deepEqual(observation({...enter,...change}), rejection());
  });
  it("requires ascending unique safe original indices", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:[{kind:"text",index:0,text:""},{kind:"unsupported",index:2}]};
    assert.equal(observation(row).ok,true);
    for (const index of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
      assert.deepEqual(observation({...row,blocks:[row.blocks[0],{kind:"unsupported",index}]}), rejection());
    }
  });
  it("enforces nullable/boolean branch combinations without truthiness", () => {
    assert.equal(observation({...enter,bindingValid:false,command:null}).ok,true);
    for (const change of [{bindingValid:"true"},{bindingValid:false},{command:null}]) {
      assert.deepEqual(observation({...enter,...change}), rejection());
    }
    for (const branch of ["deny","error","unknown"]) {
      assert.equal(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags:null}).ok,true);
      assert.deepEqual(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags}), rejection());
    }
    for (const change of [{backgroundEndsWithFinalResponse:false},{backgroundWakesOwner:false},
      {timedOutAfterMs:-1},{timedOutAfterMs:"1"},{backgroundedByUser:1},{isImage:undefined}]) {
      assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,...change}}), rejection());
    }
    assert.equal(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,timedOutAfterMs:0.5,backgroundWakesOwner:true}}).ok,true);
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"valid",flags}),rejection());
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"invalid",flags}),rejection());
  });
  it("enforces scope/reason membership and opaque native-ID byte boundaries", () => {
    assert.equal(observation({...enter,toolUseId:"雪".repeat(85)+"a"}).ok,true);
    for (const toolUseId of ["", "雪".repeat(86)]) {
      assert.deepEqual(observation({...enter,toolUseId}),rejection("CONTENT_REJECTED"));
    }
    for (const value of [
      {kind:"unsupported",scope:main,reason:"AGENT_SCOPE"},
      {kind:"unsupported",scope:{kind:"agent",agentId:"a"},reason:"PLUGIN_ORIGIN"},
      {kind:"unsupported",scope:{kind:"agent",agentId:null},reason:"AGENT_SCOPE"}
    ]) assert.deepEqual(observation(value),rejection());
  });
  it("enforces aggregate assistant source and command UTF-8 budgets", () => {
    for (const delta of [-1,0,1]) {
      const command = "é".repeat(524287)+"x".repeat(2+delta);
      assert.equal(observation({...enter,command}).ok,delta<=0);
      const value = {kind:"assistantRow",scope:main,rowId:"r",blocks:[
        {kind:"text",index:0,text:command},{kind:"bashRequest",index:1,toolUseId:"t",command:"x"}]};
      assert.equal(observation(value).ok,delta<0);
    }
    assert.deepEqual(observation({...enter,command:"x".repeat(1048577)}),rejection("CONTENT_REJECTED"));
  });
  it("enforces complete stored-output UTF-8 budget across ordered blocks", () => {
    for (const delta of [-1,0,1]) {
      const value = {kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:null,
        output:[{kind:"text",text:"é".repeat(131071)},{kind:"text",text:"x".repeat(2+delta)}]};
      assert.equal(observation(value).ok,delta<=0);
    }
  });
  it("rejects excess metadata, oversized arrays and serialized observations", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:Array.from({length:20000},(_,index)=>({kind:"unsupported",index}))};
    assert.deepEqual(observation(row),rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...row,blocks:[...row.blocks,{kind:"unsupported",index:20000}]}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(" ".repeat(6324225)),rejection("CONTENT_REJECTED"));
  });
  it("enforces frame lengths, safe integers and scalar chunk boundaries", () => {
    const value = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:8,byteLength:8,data:"雪🚀\n"};
    assert.equal(frame(value).ok,true);
    for (const change of [{seq:0},{seq:1.5},{seq:Number.MAX_SAFE_INTEGER+1},{captureEpoch:epoch.toUpperCase()},
      {chunkCount:8193},{chunkIndex:-1},{chunkCount:0},{byteLength:0}]) {
      assert.deepEqual(frame({...value,...change}),rejection());
    }
    assert.deepEqual(frame({...value,byteLength:7}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,totalByteLength:9}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,data:"\ud800",byteLength:3}),rejection("CONTENT_REJECTED"));
    for (const size of [65535,65536,65537]) {
      assert.equal(frame({...value,totalByteLength:size,byteLength:size,data:"x".repeat(size)}).ok,size<=65536);
    }
    assert.deepEqual(codec.decodeCaptureData(" ".repeat(262145)),rejection("CONTENT_REJECTED"));
  });
  it("decodes eight ownership fields and checks the computed directory suffix", () => {
    const good = fixture.ownershipExamples[0]!;
    assert.deepEqual(codec.decodeOwnershipMarker(good.markerSerialized,good.context.directoryBasename),{ok:true,value:JSON.parse(good.markerSerialized)});
    for (const id of ["O03","O04","O05","O06","O07"]) {
      const item=fixture.ownershipExamples.find(c=>c.id===id)!;
      assert.equal(codec.decodeOwnershipMarker(item.markerSerialized,item.context.directoryBasename).ok,false,id);
    }
    const marker = JSON.parse(good.markerSerialized);
    for (const change of [{hostId:"C".repeat(32)},{processId:0},{sessionId:""},{generation:"a".repeat(129)},
      {claudeSessionId:"11111111-1111-4111-8111-11111111111A"},{kind:"composer"},{v:2}]) {
      assert.equal(codec.decodeOwnershipMarker(JSON.stringify({...marker,...change}),good.context.directoryBasename).ok,false);
    }
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized,"../"+good.context.directoryBasename).ok,false);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1024),good.context.directoryBasename).ok,true);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1025),good.context.directoryBasename).ok,false);
  });
  it("decodes closed control, request, activation and acknowledgements", () => {
    const records = [
      {...envelope,kind:"control",controlRevision:1,state:"offered",offerId:hex,captureEpoch:null,grantId:null,predecessorEpoch:null,reasonCode:null,recoveriesRemaining:1,lastRetired:null},
      {...envelope,kind:"epochRequest",offerId:hex,predecessorEpoch:null,nativeSessionId:envelope.claudeSessionId,reason:"initial"},
      {...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:hex,nativeSessionId:envelope.claudeSessionId},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"continue",ackSeq:0},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"retired",ackSeq:4,reasonCode:"SCHEMA_REJECTED"}
    ];
    for (const value of records) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(value)),{ok:true,value});
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...value,private:true})),rejection());
      const missing = {...value,token:undefined};
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(missing)),rejection());
    }
    for (const reasonCode of ["SCHEMA_REJECTED","CONTENT_REJECTED","IDENTITY_CHANGED","TRANSACTION_TIMEOUT","CHANNEL_RETIRED","CONTROL_REJECTED","HANDSHAKE_TIMEOUT"]) {
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[4],reasonCode})).ok,true);
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode}})).ok,true);
    }
    for (const change of [{token:"+".repeat(43)},{sessionId:"é".repeat(65)},{generation:""},{v:"1"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[1],...change})),rejection());
    }
    for (const change of [{ackSeq:-1},{ackSeq:Number.MAX_SAFE_INTEGER+1},{reasonCode:null},{reasonCode:"OTHER"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[4],...change})),rejection());
    }
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[3],reasonCode:null})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode:null}})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:[]})),rejection());
    assert.equal(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4096)).ok,true);
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4097)),rejection());
  });
  it("validates ready marker against a host-computed upload name", () => {
    const basename = "frame."+epoch+".1.upload";
    const value = {v:1,basename,byteLength:15};
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),basename),{ok:true,value});
    for (const change of [{v:undefined},{basename:"../"+basename},{basename:basename.replace(".1.",".01.")},
      {byteLength:0},{byteLength:1.1},{byteLength:Number.MAX_SAFE_INTEGER+1},{extra:true}]) {
      assert.deepEqual(codec.decodeUploadMarker(JSON.stringify({...value,...change}),basename),rejection());
    }
    for (const kind of ["request","activate"]) {
      const name = kind+"."+hex+".upload";
      assert.equal(codec.decodeUploadMarker(JSON.stringify({v:1,basename:name,byteLength:1}),name).ok,true);
    }
    assert.equal(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4096),basename).ok,true);
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),"frame."+epoch+".9007199254740992.upload"),rejection());
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4097),basename),rejection());
  });
});
