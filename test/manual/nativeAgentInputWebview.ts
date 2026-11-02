import {createSessionRenderer} from "../../src/panel/webview/renderer";
import {XtermTerminal} from "../../src/panel/webview/xtermTerminal";
import type {Terminal} from "@xterm/xterm";
import type {WebviewMessage} from "../../src/panel/protocol";
const messages:WebviewMessage[]=[];
let terminal:XtermTerminal|undefined;
const renderer=createSessionRenderer({document,window,documentId:"11111111-1111-4111-8111-111111111111",
  terminalFactory:{create:(...args)=>terminal=new XtermTerminal(...args)},fitTerminal:t=>t.fit?.(),
  postMessage:message=>{messages.push(message);void (window as unknown as {nativeInput:(value:WebviewMessage)=>Promise<void>}).nativeInput(message);}});
const control={renderer,messages,dimensions:()=>{
  if(terminal===undefined)throw new Error("The synthetic terminal has not mounted.");
  const inner=Reflect.get(terminal,"terminal") as Terminal;return {columns:inner.cols,rows:inner.rows};
},text:()=>{
  if(terminal===undefined)throw new Error("The synthetic terminal has not mounted.");
  // Inspect parsed xterm data, without claiming these pixels have painted.
  const buffer=(Reflect.get(terminal,"terminal") as Terminal).buffer.active;
  return Array.from({length:buffer.length},(_,i)=>buffer.getLine(i)?.translateToString(true)??"").join("\n");
}};
(window as unknown as {agentInputControl:typeof control}).agentInputControl=control;
