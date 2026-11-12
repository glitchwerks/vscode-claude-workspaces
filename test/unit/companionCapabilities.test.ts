import assert from "node:assert/strict";
import { assessCaptureCapability } from "../../src/companion/companionCapabilities";
import type { CaptureCapabilityMetadata, CaptureQualification } from "../../src/companion/companionCapabilities";

const metadata:CaptureCapabilityMetadata = {
  platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",
  cliVersion:"2.1.317",cliBuild:"synthetic-build-A",pluginAvailable:true,schemaVersion:1
};
const qualified:CaptureQualification = {
  platform:"win32",arch:"x64",cliVersion:"2.1.317",cliBuild:"synthetic-build-A",schemaVersion:1,
  adapterId:"synthetic-c4-adapter",receipt:"synthetic qualification, tests only"
};

describe("companion metadata-only capability admission", () => {
  it("leaves capture unavailable for the intended build without a qualified receipt", () => {
    assert.deepEqual(assessCaptureCapability(metadata),{available:false,reason:"UNQUALIFIED_BUILD"});
  });
  it("admits only an explicitly injected exact build/schema record", () => {
    assert.deepEqual(assessCaptureCapability(metadata,[qualified]),{available:true,adapterId:"synthetic-c4-adapter",schemaVersion:1});
    assert.equal(assessCaptureCapability({...metadata,vscodeVersion:"1.144.0"},[qualified]).available,true);
    assert.equal(assessCaptureCapability({...metadata,vscodeVersion:"1.128.1"},[qualified]).available,true);
    assert.equal(assessCaptureCapability({...metadata,vscodeVersion:"1.144.0+stable.build"},[qualified]).available,true);
  });
  it("never inherits support for greater CLI versions including the installed build", () => {
    for (const cliVersion of ["2.1.318","2.1.322","3.0.0","2.1.317-beta.1"]) {
      assert.deepEqual(assessCaptureCapability({...metadata,cliVersion},[qualified]),{available:false,reason:"UNQUALIFIED_BUILD"});
    }
    const later = {...qualified,cliVersion:"2.1.322",cliBuild:"synthetic-build-B"};
    assert.equal(assessCaptureCapability({...metadata,cliVersion:"2.1.322",cliBuild:"synthetic-build-B"},[later]).available,true);
    assert.equal(assessCaptureCapability(metadata).available,false);
  });
  it("rejects host, remote, plugin and unsupported schema while preserving metadata", () => {
    const cases = [
      {change:{platform:"linux"},reason:"UNSUPPORTED_HOST"},
      {change:{platform:"darwin"},reason:"UNSUPPORTED_HOST"},
      {change:{arch:"arm64"},reason:"UNSUPPORTED_HOST"},
      {change:{remoteName:"ssh-remote"},reason:"REMOTE_HOST"},
      {change:{remoteName:""},reason:"REMOTE_HOST"},
      {change:{pluginAvailable:false},reason:"PLUGIN_UNAVAILABLE"},
      {change:{schemaVersion:2},reason:"UNSUPPORTED_SCHEMA"},
      {change:{schemaVersion:NaN},reason:"UNSUPPORTED_SCHEMA"}
    ];
    for (const item of cases) {
      const value = Object.freeze({...metadata,...item.change});
      assert.deepEqual(assessCaptureCapability(value,[qualified]),{available:false,reason:item.reason});
      assert.deepEqual(value,{...metadata,...item.change});
    }
  });
  it("requires a stable VS Code version satisfying the manifest engine", () => {
    for (const vscodeVersion of ["1.127.99","2.0.0","1.128.0-insider","1.128","v1.128.0","1.0128.0","bad"]) {
      assert.deepEqual(assessCaptureCapability({...metadata,vscodeVersion},[qualified]),{available:false,reason:"UNSUPPORTED_VSCODE"});
    }
  });
  it("rejects absent build metadata and record mismatches without changing the CLI launch", () => {
    for (const change of [{cliVersion:null},{cliBuild:null},{cliBuild:""}]) {
      assert.deepEqual(assessCaptureCapability({...metadata,...change},[qualified]),{available:false,reason:"UNQUALIFIED_BUILD"});
    }
    for (const change of [{cliVersion:"2.1.316"},{cliBuild:"other"},{platform:"linux"},
      {arch:"arm64"},{schemaVersion:2},{receipt:""},{adapterId:""}]) {
      assert.equal(assessCaptureCapability(metadata,[{...qualified,...change}]).available,false);
    }
  });
});
