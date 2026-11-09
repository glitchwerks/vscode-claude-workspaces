import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
const execute=promisify(execFile);
const script=path.resolve("test/manual/nativeAgentInput.smoke.cjs");
async function run(args:string[]){try{return {...await execute(process.execPath,[script,...args],{timeout:5000}),code:0};}catch(error){return error as {code:number;stdout:string;stderr:string};}}
describe("native agent input control opt-in",()=>{
  it("does not advance a held agent to model entry after a sleep interval",async()=>{
    const result=await execute(process.execPath,["-e",`(async()=>{
      const {createAgentHolderSource}=require(${JSON.stringify(script)});const mod=await import('data:text/javascript;base64,'+Buffer.from(createAgentHolderSource('synthetic.json')).toString('base64'));
      let handler,resume,stop,sleeps=0,nativeCalls=0;mod.register((_event,fn)=>{handler=fn;});
      const api={fs:{write:async()=>{}},clock:{sleep:()=>new Promise((resolve,reject)=>{sleeps++;if(sleeps===1)resume=resolve;else stop=reject;})}};
      const pending=handler(api,{agentId:'synthetic'},()=>{nativeCalls++;return (async function*(){})();}).next();
      await new Promise(setImmediate);resume();await new Promise(setImmediate);if(stop)stop(new Error('test-ended'));await pending.catch(()=>{});
      console.log(JSON.stringify({sleeps,nativeCalls}));
    })().catch(()=>{process.exitCode=1;});`],{timeout:5000});assert.deepEqual(JSON.parse(result.stdout),{sleeps:2,nativeCalls:0});
  });
  it("closes its owned browser even while a renderer evaluation is unresolved",async()=>{
    const result=await execute(process.execPath,["-e",`(async()=>{
      const {closeOwnedControl}=require(${JSON.stringify(script)});let release,closed=false,disposed=false;
      const pending=new Promise(resolve=>{release=resolve;});const closing=closeOwnedControl({terminate:async()=>{},dispose:()=>{disposed=true;}},{close:async()=>{closed=true;}},pending);
      await new Promise(setImmediate);const closedWithoutDrain=closed;release();await closing;console.log(JSON.stringify({closedWithoutDrain,disposed}));
    })().catch(()=>{process.exitCode=1;});`],{timeout:5000});assert.deepEqual(JSON.parse(result.stdout),{closedWithoutDrain:true,disposed:true});
  });
  it("forwards production columns/rows resize messages and input to the owned PTY",async()=>{
    const result=await execute(process.execPath,["-e",`
      const {forwardNativeInput}=require(${JSON.stringify(script)});const calls=[];
      const pty={write:data=>calls.push(['write',data]),resize:(columns,rows)=>calls.push(['resize',columns,rows])};
      forwardNativeInput(pty,{type:'resize',columns:93,rows:31});forwardNativeInput(pty,{type:'input',data:'x'});
      forwardNativeInput(undefined,{type:'resize',columns:80,rows:24});console.log(JSON.stringify(calls));
    `],{timeout:5000});assert.deepEqual(JSON.parse(result.stdout),[['resize',93,31],['write','x']]);
  });
  it("refuses native work before opt-in and does not expose executable arguments",async()=>{
    const result=await run(["--claude-executable",path.resolve("PRIVATE-executable.exe"),"--playwright-module",path.resolve("PRIVATE-module")]);
    assert.equal(result.code,2);assert.equal(result.stdout,"");assert.doesNotMatch(result.stderr,/PRIVATE/);
  });
  it("rejects relative paths, duplicate flags and unknown options before launching anything",async()=>{
    for(const args of [["--run-live","--claude-executable","relative.exe","--playwright-module",path.resolve("private")],["--run-live","--unexpected"],["--run-live","--run-live"]]){const result=await run(args);assert.equal(result.code,2);assert.equal(result.stdout,"");}
  });
  it("imports without starting a browser, native session, or printing anything",async()=>{
    const result=await execute(process.execPath,["-e",`require(${JSON.stringify(script)});process.stdout.write('imported');`],{timeout:5000});
    assert.equal(result.stdout,"imported");assert.equal(result.stderr,"");
  });
});
