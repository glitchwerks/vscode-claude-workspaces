import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
const execute=promisify(execFile);
const script=path.resolve("test/manual/nativeAgentInput.smoke.cjs");
async function run(args:string[]){try{return {...await execute(process.execPath,[script,...args],{timeout:5000}),code:0};}catch(error){return error as {code:number;stdout:string;stderr:string};}}
describe("native agent input control opt-in",()=>{
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
