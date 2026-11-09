# C4 preserved native evidence — Claude Code 2.1.317

Read-only extraction on 2026-11-07. No Claude process, terminal fixture, model call or product code was run. Field shapes below are extracted from the preserved generated declarations, with comments removed; original line coordinates and full-artifact hashes identify the inspected source. The selected shapes and receipt projections needed by the contract are archived here so the design does not depend on scratch files. This archive is evidence, not an implementation or a complete third-party SDK redistribution.

Sources: [declaration inspection and core hash](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6701284701), [initial observer source and sanitized receipt](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085), [focused-control source/receipts archive](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6647462596). The [official mods reference](https://code.claude.com/docs/en/plugins/mods/reference) (fetched 2026-11-07) directs authors to their build-generated declarations when the public copy differs.

## Artifact identity

| Source artifact | Bytes | SHA-256 |
|---|---|---|
| Generated core declarations | 676417 | 346bb9c8243cec810b79884a35e05089dcfb2bbc77c325a31e0077aaf5ad5740 |
| Generated built-in tool declarations | 204865 | 40c949f0e2377cd6bc88cf53662fc09258d57a5b0837d5e3715a5446c7a7b420 |
| Decoded focused-control JSON archive | 208904 | 1d901db9c858a345766a88e9b31e13ddd69f15baf0f1a3d886de21adddcddea5 |
| Original archive gzip bytes | 34143 | ed11cdc72a2130f0f3cc57be264c1c5a06d04b057c7ba27706ceda4a7f36f4ca |

The archive hashes match its published manifest. The two independent preserved core copies also match the earlier core hash. These identify the inspected 2.1.317 inputs, not a claim about any current or future installed build.

## AgentLoop

Original core declaration lines 194–204.

```typescript
  export type AgentLoop = {
      agentId?: string;
  };
```

## BaseHookInput

Original core declaration lines 853–879.

```typescript
  type BaseHookInput = {
      session_id: string;
      transcript_path: string;
      cwd: string;
      prompt_id?: string;
      permission_mode?: string;
      agent_id?: string;
      agent_type?: string;
      effort?: {
          level: string;
      };
  };
```

## Origin

Original core declaration lines 7597–7608.

```typescript
  export type Origin = {
      readonly plugin: string;
      readonly tier: Tier;
  };
```

## SessionAppendInput

Original core declaration lines 11336–11364.

```typescript
  type SessionAppendInput = {
      message: SessionAppendMessage;
      door: SessionAppendDoor;
      origin: SessionAppendOrigin;
      uuid: string;
      agentId?: string;
  };
```

## SessionAppendMessage

Original core declaration lines 11373–11408.

```typescript
  type SessionAppendMessage = {
      type: 'user' | 'assistant' | 'attachment' | 'system';
      name?: string;
      role?: 'user' | 'assistant';
      isMeta?: true;
      content: ApiContentBlock[];
  };
```

## SessionAppendResult

Original core declaration lines 11443–11463.

```typescript
  type SessionAppendResult = {
      message: SessionAppendMessage;
      uuid: string;
      deny?: undefined;
  } | {
      deny: string;
      message?: undefined;
      uuid?: undefined;
  };
```

## SessionAppendDoor

Original core declaration lines 11326–11326.

```typescript
  type SessionAppendDoor = 'prompt' | 'command' | 'response' | 'tool-result' | 'tool-message' | 'delivery' | 'attachment' | 'hook-context' | 'note' | 'compaction' | 'notice' | 'queue';
```

## ToolCallInput

Original core declaration lines 13732–13732.

```typescript
  export type ToolCallInput = ToolCallEnvelope & AgentLoop & ToolRequestMeta;
```

## ToolCallResult

Original core declaration lines 13768–13857.

```typescript
  export type ToolCallResult<Name extends string = string> = {
      deny: string;
      result?: undefined;
      context?: undefined;
      ref?: undefined;
      text?: undefined;
      isError?: undefined;
      isReadOnly?: undefined;
  } | {
      result: ToolResultOf<Name>;
      context?: readonly string[];
      ref?: number;
      text?: string;
      isReadOnly?: true;
      isError?: undefined;
      deny?: undefined;
  } | {
      isError: true;
      result: unknown;
      text?: string;
      ref?: number;
      context?: readonly string[];
      isReadOnly?: true;
      deny?: undefined;
  };
```

## PermissionDeniedHookInput

Original core declaration lines 7766–7773.

```typescript
  type PermissionDeniedHookInput = BaseHookInput & {
      hook_event_name: 'PermissionDenied';
      tool_name: string;
      tool_input: unknown;
      tool_use_id: string;
      reason: string;
      mcp_server?: McpServerProvenance;
  };
```

## PermissionRequestHookInput

Original core declaration lines 7794–7800.

```typescript
  type PermissionRequestHookInput = BaseHookInput & {
      hook_event_name: 'PermissionRequest';
      tool_name: string;
      tool_input: unknown;
      permission_suggestions?: PermissionUpdate[];
      mcp_server?: McpServerProvenance;
  };
```

## PostToolUseHookInput

Original core declaration lines 8156–8167.

```typescript
  type PostToolUseHookInput = BaseHookInput & {
      hook_event_name: 'PostToolUse';
      tool_name: string;
      tool_input: unknown;
      tool_response: unknown;
      tool_use_id: string;
      duration_ms?: number;
      mcp_server?: McpServerProvenance;
  };
```

## PostToolUseFailureHookInput

Original core declaration lines 8142–8154.

```typescript
  type PostToolUseFailureHookInput = BaseHookInput & {
      hook_event_name: 'PostToolUseFailure';
      tool_name: string;
      tool_input: unknown;
      tool_use_id: string;
      error: string;
      is_interrupt?: boolean;
      duration_ms?: number;
      mcp_server?: McpServerProvenance;
  };
```

## SessionStartHookInput

Original core declaration lines 12473–12495.

```typescript
  type SessionStartHookInput = BaseHookInput & {
      hook_event_name: 'SessionStart';
      source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork';
      agent_type?: string;
      model?: string;
      session_title?: string;
      seconds_since_last_response?: number;
      context_tokens?: number;
      prompt_cache_likely_expired?: boolean;
      estimated_cache_write_usd?: number;
  };
```

## SessionEndInput

Original core declaration lines 11819–11837.

```typescript
  export type SessionEndInput = {
      reason: SessionEndReason;
      sessionId: string;
      resume: SessionResume;
  };
```

## BuiltinToolInputs Bash member index

Original built-in declarations lines 208–219. Every top-level Bash member is listed; nested object bodies are excluded from capture. This structural index includes no numeric exit-code member.

| Member | Optional | Declared type | Original line |
|---|---|---|---|
| command | no | string | 210 |
| timeout | yes | number | 212 |
| description | yes | string | 214 |
| run_in_background | yes | boolean | 216 |
| dangerouslyDisableSandbox | yes | boolean | 218 |

## BuiltinToolResults Bash member index

Original built-in declarations lines 4605–4702. Every top-level Bash member is listed; nested object bodies are excluded from capture. This structural index includes no numeric exit-code member.

| Member | Optional | Declared type | Original line |
|---|---|---|---|
| stdout | no | string | 4607 |
| stderr | no | string | 4609 |
| rawOutputPath | yes | string | 4611 |
| interrupted | no | boolean | 4613 |
| isImage | yes | boolean | 4615 |
| backgroundTaskId | yes | string | 4617 |
| backgroundOutputPath | yes | string | 4619 |
| backgroundedByUser | yes | boolean | 4621 |
| backgroundedByTurnAbort | yes | boolean | 4623 |
| backgroundedToDeliverMessage | yes | boolean | 4625 |
| timedOutAfterMs | yes | number | 4627 |
| subagentCapApplied | yes | true | 4629 |
| backgroundCwdHint | yes | string | 4631 |
| backgroundEndsWithFinalResponse | yes | true | 4633 |
| backgroundWakesOwner | yes | true | 4635 |
| dangerouslyDisableSandbox | yes | boolean | 4637 |
| returnCodeInterpretation | yes | string | 4639 |
| noOutputExpected | yes | boolean | 4641 |
| structuredContent | yes | unknown[] | 4643 |
| persistedOutputPath | yes | string | 4645 |
| persistedOutputSize | yes | number | 4647 |
| stdoutHoldsOutputEnd | yes | boolean | 4649 |
| tailInputPath | yes | string | 4651 |
| tailInputNote | yes | string | 4653 |
| memoryLimitNote | yes | string | 4655 |
| triggeredNote | yes | string | 4657 |
| staleReadFileStateHint | yes | string | 4659 |
| ghRateLimitHint | yes | string | 4661 |
| gitOperation | yes | object (excluded from capture) | 4663 |
| bashEditDiff | yes | object (excluded from capture) | 4683 |

## Declaration semantics used by the mapping

These are paraphrases of the inspected declaration comments, not extra runtime observations.

* Core lines 13758–13857 distinguish answered, error and deny return branches. A deny can withhold a result after execution; errors need not carry a typed Bash record. A ref is a core message reference, not a globally unique tool-call ID.
* Core lines 11329–11463 define append as a retained row and its returned stored row; a denied plugin append has no stored message. The canonical result, not input fallback, is the capture source.
* Core lines 194–204 and 853–879 separate agentId/agent_id from caller origin; absence denotes main even in an agent-configured session.
* Core lines 1280–1294 distinguish flattened classic.PreToolUse from other classic input shapes. PermissionRequest lines 7794–7800 have no tool_use_id. PermissionDenied and post-tool inputs do carry it.
* Core lines 11812–11857 define session.end fields; this build describes /clear as continuing the process with another session ID and no fresh session.start. Native reset handling still follows the approved fail-closed policy.
* The adapter passes the same input to next exactly once and relays the native return unchanged. Ordinary hook execution excludes time spent awaiting native next; session.end instead has a short wall-clock bound (core lines 6827–6871). Capture delivery must not be awaited by the observer.

## Selected exact receipt fields

Projection from the hash-verified focused-control archive. Selected values are unchanged; unspecified fields, private context and paths are omitted. All commands shown are historical receipt data and were not executed by this audit.

```json
[
  {
    "archiveRun": "a",
    "sequence": 32,
    "tool_use_id": "toolu_01DbR7ptRP5AE1cXzAcU4cL3",
    "requestCommand": "printf '%s\\n' 'SPIKE215_ALLOWED'",
    "returned": {
      "ref": 1,
      "result": {
        "stdout": "SPIKE215_ALLOWED",
        "stderr": "",
        "interrupted": false,
        "isImage": false
      }
    }
  },
  {
    "archiveRun": "a",
    "sequence": 47,
    "tool_use_id": "toolu_01PWJCqd3QiY69gPesNy1LL4",
    "requestCommand": "printf '%s\\n' 'SPIKE215_DENIED'",
    "returned": {
      "ref": 1,
      "result": "Error: The user denied this request in the companion.",
      "isError": true
    }
  },
  {
    "archiveRun": "a",
    "sequence": 90,
    "tool_use_id": "toolu_01XW5rjeTPpxPhjbcVyXxZJ3",
    "requestCommand": "printf '%s\\n' 'SPIKE215_TIMER_STARTED'; sleep 20; printf '%s\\n' 'SPIKE215_TIMER_FINISHED'",
    "returned": {
      "ref": 1,
      "result": "Error: Exit code 137\n[Request interrupted by user for tool use]\nSPIKE215_TIMER_STARTED",
      "isError": true
    }
  },
  {
    "archiveRun": "b",
    "sequence": 36,
    "tool_use_id": "toolu_012JjTrZELRq9GwEgjVU7fbL",
    "requestCommand": "printf 'SPIKE215_PARALLEL_B\\n'",
    "returned": {
      "ref": 1,
      "result": "Error: The user denied this request in the companion.",
      "isError": true
    }
  },
  {
    "archiveRun": "b",
    "sequence": 41,
    "tool_use_id": "toolu_01EBKt13toYUi26PC2TFpqJA",
    "requestCommand": "printf 'SPIKE215_PARALLEL_A\\n'",
    "returned": {
      "ref": 1,
      "result": {
        "stdout": "SPIKE215_PARALLEL_A",
        "stderr": "",
        "interrupted": false,
        "isImage": false
      }
    }
  },
  {
    "archiveRun": "c",
    "sequence": 51,
    "tool_use_id": "toolu_01JiRrwNjKNczxBnkpL8sEdR",
    "requestCommand": "printf SPIKE215_API_TIMER_STARTED; sleep 20; printf SPIKE215_API_TIMER_FINISHED",
    "returned": {
      "ref": 1,
      "result": {
        "stdout": "",
        "stderr": "",
        "interrupted": false,
        "isImage": false,
        "backgroundTaskId": "b7men0gsk",
        "backgroundedByTurnAbort": true
      }
    }
  },
  {
    "archiveRun": "d",
    "sequence": 34,
    "tool_use_id": "toolu_01RGDABQnq6Es69Dn5MGRypM",
    "requestCommand": "printf STARTED > native-started.txt; sleep 20; printf FINISHED > native-finished.txt",
    "returned": {
      "ref": 1,
      "result": "Error: Exit code 137\n[Request interrupted by user for tool use]",
      "isError": true
    }
  }
]
```

The normal result is a typed inner record, while denial/interruption examples use an isError envelope with string content. Run c sequence 51 has a background task ID and backgroundedByTurnAbort=true with interrupted=false. These support separate state predicates; they do not prove that every error is a denied or executed command. The initial observer receipt additionally reports is_interrupt=false during an actual interruption, so false cannot prove non-interruption. [Initial sanitized receipt](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6646341085).

## Evidence boundaries

Classic post/denial input fields are declared for this build; the preserved controls archive does not contain every such event because its observer did not register all of them. The initial experiment preserves its classic post/failure observer source and sanitized outcome, not an exhaustive raw event log. Agent isolation, nonzero execution finality, event rewrites, duplicate replay and reset fixtures below are synthetic design expectations. No packaged extension, new native case or current-build compatibility was tested.

The [synthetic case data](c4-adapter-cases.json) is a design input for future planned capture/copy fixtures, not a claim of passing adapter tests. No third-party raw output, snapshots, context arrays or transcript paths are required by the contract.
