# Controlled echo numeric data — 2026-10-29

Numeric evidence for #180. Interpretation: [baseline report](controlled-echo-2026-10-29.md).
This JSON block preserves the captured measurements and derived summary.

```json
{
  "measuredAt": "2026-10-29T12:55:11.566Z",
  "vscode": "1.136.1",
  "node": "v24.18.1",
  "electron": "42.10.0",
  "chromium": "148.0.7778.280",
  "os": {
    "platform": "win32",
    "release": "10.0.26300",
    "arch": "x64"
  },
  "runtimeSourceFiles": [
    "src/sessions/sessionManager.ts",
    "src/panel/sessionPanelProvider.ts",
    "src/panel/protocol.ts",
    "src/panel/webview/renderer.ts",
    "src/panel/webview/xtermTerminal.ts",
    "src/panel/webview/webglRenderer.ts",
    "src/diagnostics/terminalDiagnostics.ts",
    "src/diagnostics/terminalMetricWindow.ts",
    "src/diagnostics/terminalProbe.ts",
    "src/diagnostics/webviewTerminalDiagnostics.ts"
  ],
  "runtimeSourceFingerprint": "cb7a0ad5fcc23e43850424d59392b1acedacd44f7f11bd36d464aaa648efb591",
  "measurementHarnessFiles": [
    "test/manual/terminalEcho.test.ts",
    "test/manual/terminalEchoWebview.ts",
    "test/fixtures/terminal-echo.cmd",
    ".vscode-test-terminal-echo.cjs"
  ],
  "measurementHarnessFingerprint": "08aad10c6ad3f51308b8280b1b4467b4bc7a904fb8863549f9617889306f62ca",
  "packageLockFingerprint": "67c17221840e403d3ec6c19259eacd7f05e425d4c131e26e8262f186bd9e6c24",
  "dependencies": {
    "@xterm/xterm": "6.0.0",
    "@xterm/addon-webgl": "0.19.0",
    "@xterm/addon-fit": "0.11.0",
    "node-pty": "1.1.0",
    "esbuild": "0.28.2"
  },
  "parameters": {
    "trialsPerCondition": 3,
    "samplesPerTrial": 12,
    "interSampleDelayMs": 125,
    "font": {
      "family": "monospace",
      "size": 14,
      "letterSpacing": 0,
      "lineHeight": 1
    },
    "order": "off/on, on/off, off/on",
    "freshPerScenario": true,
    "reusedWithinScenario": true
  },
  "scope": "Synthetic paste in a real VS Code webview, owned Windows PTY command echo and actual production xterm parse callback. Idle/working indicators are explicitly set presentation states; other sessions wait for input. Next-frame scheduling is not proof of painted pixels. No Claude/agent workload or physical keyboard input.",
  "summary": [
    {
      "sessions": 1,
      "indicator": "idle",
      "capture": false,
      "parseMs": {
        "count": 36,
        "median": 1.349999999627471,
        "p95": 12.599999999627471,
        "maximum": 16.899999998509884
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.90000000037253,
        "p95": 26.799999998882413,
        "maximum": 29.199999999254942
      },
      "firstSampleParseMs": [
        7.100000001490116,
        1.199999999254942,
        1.299999998882413
      ],
      "trialMedianParseMs": [
        11.150000000372529,
        1.25,
        1.25
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {}
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "capture": true,
      "parseMs": {
        "count": 36,
        "median": 1.300000000745058,
        "p95": 2.5,
        "maximum": 3.099999999627471
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.899999998509884,
        "p95": 18.40000000037253,
        "maximum": 18.800000000745058
      },
      "firstSampleParseMs": [
        2.300000000745058,
        1.299999998882413,
        1.800000000745058
      ],
      "trialMedianParseMs": [
        1.349999999627471,
        1.300000000745058,
        1.200000001117587
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {
        "inputQueueMs": {
          "count": 36,
          "mean": 0.07653055555555158,
          "maximum": 0.09479999999985012
        },
        "inputActionMs": {
          "count": 36,
          "mean": 0.09967777777774245,
          "maximum": 0.22550000000046566
        },
        "ptyWriteMs": {
          "count": 36,
          "mean": 0.022244444444431286,
          "maximum": 0.030600000000049477
        },
        "outputHandlingMs": {
          "count": 114,
          "mean": 0.1045359649122977,
          "maximum": 0.2334000000009837
        },
        "inputRoundTripMs": {
          "count": 36,
          "mean": 0.7583333334057696,
          "maximum": 2.800000000745058
        },
        "outputRoundTripMs": {
          "count": 75,
          "mean": 0.6516533333334095,
          "maximum": 1.1213999999999942
        },
        "outputParseMs": {
          "count": 75,
          "mean": 0.05466666671137015,
          "maximum": 0.30000000074505806
        },
        "hostEventLoopGapMs": {
          "count": 3,
          "mean": 1.2058333333337334,
          "maximum": 2.4836000000013883
        },
        "frontendEventLoopGapMs": {
          "count": 3,
          "mean": 0.8000000001241764,
          "maximum": 1.900000000372529
        },
        "pendingWrites": {
          "count": 78,
          "mean": 0,
          "maximum": 0
        },
        "pendingMessages": {
          "count": 228,
          "mean": 0.5877192982456141,
          "maximum": 2
        }
      }
    },
    {
      "sessions": 1,
      "indicator": "working",
      "capture": false,
      "parseMs": {
        "count": 36,
        "median": 1.25,
        "p95": 12.100000001490116,
        "maximum": 12.399999998509884
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.90000000037253,
        "p95": 21.200000001117587,
        "maximum": 23.199999999254942
      },
      "firstSampleParseMs": [
        6.800000000745058,
        1.199999999254942,
        1.200000001117587
      ],
      "trialMedianParseMs": [
        11.649999999441206,
        1.1000000014901161,
        1.2000000001862645
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {}
    },
    {
      "sessions": 1,
      "indicator": "working",
      "capture": true,
      "parseMs": {
        "count": 36,
        "median": 1.299999998882413,
        "p95": 1.900000000372529,
        "maximum": 2
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.850000000558794,
        "p95": 18.5,
        "maximum": 18.5
      },
      "firstSampleParseMs": [
        1.299999998882413,
        1.099999999627471,
        1
      ],
      "trialMedianParseMs": [
        1.25,
        1.300000000745058,
        1.25
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {
        "inputQueueMs": {
          "count": 36,
          "mean": 0.079222222221991,
          "maximum": 0.1522000000004482
        },
        "inputActionMs": {
          "count": 36,
          "mean": 0.09749999999965236,
          "maximum": 0.2628000000004249
        },
        "ptyWriteMs": {
          "count": 36,
          "mean": 0.022675000000112452,
          "maximum": 0.05099999999947613
        },
        "outputHandlingMs": {
          "count": 114,
          "mean": 0.09805877192971629,
          "maximum": 0.21850000000267755
        },
        "inputRoundTripMs": {
          "count": 36,
          "mean": 0.697222222522315,
          "maximum": 1.199999999254942
        },
        "outputRoundTripMs": {
          "count": 66,
          "mean": 0.6278666666665947,
          "maximum": 1.1006000000015774
        },
        "outputParseMs": {
          "count": 66,
          "mean": 0.07121212120083245,
          "maximum": 0.2000000011175871
        },
        "hostEventLoopGapMs": {
          "count": 3,
          "mean": 2.080433333333834,
          "maximum": 2.849099999999453
        },
        "frontendEventLoopGapMs": {
          "count": 3,
          "mean": 320.53333333320916,
          "maximum": 479.59999999962747
        },
        "pendingWrites": {
          "count": 69,
          "mean": 0,
          "maximum": 0
        },
        "pendingMessages": {
          "count": 228,
          "mean": 0.5964912280701754,
          "maximum": 2
        }
      }
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "capture": false,
      "parseMs": {
        "count": 36,
        "median": 1.200000001117587,
        "p95": 11.800000000745058,
        "maximum": 15
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.950000000186265,
        "p95": 23.5,
        "maximum": 25
      },
      "firstSampleParseMs": [
        7.400000000372529,
        1,
        1.199999999254942
      ],
      "trialMedianParseMs": [
        11.650000000372529,
        1.1000000014901161,
        1.199999999254942
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {}
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "capture": true,
      "parseMs": {
        "count": 36,
        "median": 1.300000000745058,
        "p95": 2.099999999627471,
        "maximum": 2.599999999627471
      },
      "nextFrameMs": {
        "count": 36,
        "median": 18,
        "p95": 18.800000000745058,
        "maximum": 19.09999999962747
      },
      "firstSampleParseMs": [
        1.300000000745058,
        1.099999999627471,
        1.1000000014901161
      ],
      "trialMedianParseMs": [
        1.300000000745058,
        1.25,
        1.3999999994412065
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {
        "inputQueueMs": {
          "count": 36,
          "mean": 0.07903611111073082,
          "maximum": 0.16740000000208966
        },
        "inputActionMs": {
          "count": 36,
          "mean": 0.0892361111114547,
          "maximum": 0.14839999999821885
        },
        "ptyWriteMs": {
          "count": 36,
          "mean": 0.023997222222230146,
          "maximum": 0.04340000000229338
        },
        "outputHandlingMs": {
          "count": 115,
          "mean": 0.09771391304368635,
          "maximum": 0.27219999999942956
        },
        "inputRoundTripMs": {
          "count": 36,
          "mean": 0.6972222223670946,
          "maximum": 1.400000000372529
        },
        "outputRoundTripMs": {
          "count": 63,
          "mean": 0.7428206349205639,
          "maximum": 5.365200000000186
        },
        "outputParseMs": {
          "count": 63,
          "mean": 0.07301587303952566,
          "maximum": 0.40000000037252903
        },
        "hostEventLoopGapMs": {
          "count": 3,
          "mean": 3.048299999999775,
          "maximum": 3.7572000000000116
        },
        "frontendEventLoopGapMs": {
          "count": 3,
          "mean": 2.6333333340783915,
          "maximum": 3.200000001117587
        },
        "pendingWrites": {
          "count": 66,
          "mean": 0,
          "maximum": 0
        },
        "pendingMessages": {
          "count": 230,
          "mean": 0.6130434782608696,
          "maximum": 2
        }
      }
    },
    {
      "sessions": 4,
      "indicator": "working",
      "capture": false,
      "parseMs": {
        "count": 36,
        "median": 1.3499999986961484,
        "p95": 12.400000000372529,
        "maximum": 14.900000000372529
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.90000000037253,
        "p95": 20,
        "maximum": 20.299999998882413
      },
      "firstSampleParseMs": [
        4.699999999254942,
        1,
        1.099999999627471
      ],
      "trialMedianParseMs": [
        11.649999999441206,
        1.2499999990686774,
        1.1000000005587935
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {}
    },
    {
      "sessions": 4,
      "indicator": "working",
      "capture": true,
      "parseMs": {
        "count": 36,
        "median": 1.199999999254942,
        "p95": 1.700000001117587,
        "maximum": 1.800000000745058
      },
      "nextFrameMs": {
        "count": 36,
        "median": 17.799999999813735,
        "p95": 19,
        "maximum": 19
      },
      "firstSampleParseMs": [
        1.3999999985098839,
        1.099999999627471,
        1.200000001117587
      ],
      "trialMedianParseMs": [
        1.2999999998137355,
        1.199999999254942,
        1.199999999254942
      ],
      "rendererKinds": [
        "webgl"
      ],
      "boundaries": {
        "inputQueueMs": {
          "count": 36,
          "mean": 0.0776111111109559,
          "maximum": 0.09769999999844003
        },
        "inputActionMs": {
          "count": 36,
          "mean": 0.0836416666667598,
          "maximum": 0.10360000000218861
        },
        "ptyWriteMs": {
          "count": 36,
          "mean": 0.022777777778173913,
          "maximum": 0.02569999999832362
        },
        "outputHandlingMs": {
          "count": 112,
          "mean": 0.10051160714237994,
          "maximum": 0.21050000000104774
        },
        "inputRoundTripMs": {
          "count": 36,
          "mean": 0.6666666665631864,
          "maximum": 1
        },
        "outputRoundTripMs": {
          "count": 60,
          "mean": 0.7254683333336288,
          "maximum": 4.264200000005076
        },
        "outputParseMs": {
          "count": 60,
          "mean": 0.07333333330849806,
          "maximum": 0.2999999988824129
        },
        "hostEventLoopGapMs": {
          "count": 3,
          "mean": 0.9547666666670315,
          "maximum": 1.4377000000022235
        },
        "frontendEventLoopGapMs": {
          "count": 3,
          "mean": 550.6999999998758,
          "maximum": 697.8000000007451
        },
        "pendingWrites": {
          "count": 63,
          "mean": 0,
          "maximum": 0
        },
        "pendingMessages": {
          "count": 224,
          "mean": 0.5625,
          "maximum": 2
        }
      }
    }
  ],
  "trials": [
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 0,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 297,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 1,
          "parseMs": 7.100000001490116,
          "nextFrameMs": 14.900000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 2,
          "parseMs": 9.900000000372529,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 3,
          "parseMs": 10.799999998882413,
          "nextFrameMs": 18.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 4,
          "parseMs": 11.099999999627471,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 5,
          "parseMs": 11.700000001117587,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 6,
          "parseMs": 11.099999999627471,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 7,
          "parseMs": 11.200000001117587,
          "nextFrameMs": 18.100000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 8,
          "parseMs": 11.699999999254942,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 9,
          "parseMs": 11.099999999627471,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 10,
          "parseMs": 16.899999998509884,
          "nextFrameMs": 18.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 11,
          "parseMs": 11.799999998882413,
          "nextFrameMs": 26.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 12,
          "parseMs": 12.599999999627471,
          "nextFrameMs": 29.199999999254942,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 0,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 2097,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 13,
          "parseMs": 2.300000000745058,
          "nextFrameMs": 18.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 14,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 11.599999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 15,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 16,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 17,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 18,
          "parseMs": 1.599999999627471,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 19,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 7.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 20,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 21,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 22,
          "parseMs": 1.799999998882413,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 23,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 24,
          "parseMs": 1.5,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1001.0032999999999,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 8,
                  "total": 0.6349000000004708,
                  "maximum": 0.09200000000009823,
                  "buckets": [
                    8,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 8,
                  "total": 0.1944999999996071,
                  "maximum": 0.030600000000049477,
                  "buckets": [
                    8,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 8,
                  "total": 40,
                  "maximum": 5,
                  "buckets": [
                    0,
                    8,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 8,
                  "total": 0.9234999999998763,
                  "maximum": 0.21509999999989304,
                  "buckets": [
                    8,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 22,
                  "total": 160,
                  "maximum": 15,
                  "buckets": [
                    7,
                    0,
                    15,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 22,
                  "total": 2.376300000000356,
                  "maximum": 0.1507000000001426,
                  "buckets": [
                    22,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 9.522999999999683,
                  "maximum": 1.1213999999999942,
                  "buckets": [
                    12,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 43,
                  "total": 22,
                  "maximum": 1,
                  "buckets": [
                    43,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 9,
                  "total": 9,
                  "maximum": 1,
                  "buckets": [
                    9,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 0.9243999999998778,
                  "maximum": 0.9243999999998778,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1729.8428,
          "sessions": [
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 33,
                  "total": 20,
                  "maximum": 2,
                  "buckets": [
                    31,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 6,
                  "total": 6,
                  "maximum": 1,
                  "buckets": [
                    6,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 0.30000000074505806,
                  "maximum": 0.30000000074505806,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "outputCharacters",
                  "count": 16,
                  "total": 104,
                  "maximum": 15,
                  "buckets": [
                    7,
                    2,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 16,
                  "total": 1.6698999999980515,
                  "maximum": 0.15889999999990323,
                  "buckets": [
                    16,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.999999998137355,
                  "maximum": 0.900000000372529,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 23,
                  "total": 1.700000001117587,
                  "maximum": 0.30000000074505806,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 24,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    24,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 4,
                  "total": 0.30389999999988504,
                  "maximum": 0.07879999999931897,
                  "buckets": [
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 4,
                  "total": 0.09420000000091022,
                  "maximum": 0.028800000000046566,
                  "buckets": [
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 4,
                  "total": 20,
                  "maximum": 5,
                  "buckets": [
                    0,
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 4,
                  "total": 0.35869999999977153,
                  "maximum": 0.11440000000038708,
                  "buckets": [
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 10,
                  "total": 6.263700000000426,
                  "maximum": 0.8114000000005035,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 1,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 3826,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 25,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 26,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 13.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 27,
          "parseMs": 1.5,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 28,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 29,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 30,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 6.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 31,
          "parseMs": 1.700000001117587,
          "nextFrameMs": 18.100000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 32,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 33,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 34,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 4.599999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 35,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 36,
          "parseMs": 2.5,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1000.2357000000002,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5755000000008295,
                  "maximum": 0.09479999999985012,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.1496999999981199,
                  "maximum": 0.022599999999329157,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6716000000005806,
                  "maximum": 0.14050000000042928,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 23,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    9,
                    2,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 23,
                  "total": 2.479300000002695,
                  "maximum": 0.1580999999996493,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 20,
                  "total": 12.683200000001307,
                  "maximum": 0.8753999999998996,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 46,
                  "total": 29,
                  "maximum": 2,
                  "buckets": [
                    43,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 3,
                  "total": 3,
                  "maximum": 1,
                  "buckets": [
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 0.20949999999993452,
                  "maximum": 0.20949999999993452,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1717.8946999999998,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.499999998137355,
                  "maximum": 0.900000000372529,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 27,
                  "total": 1.5000000037252903,
                  "maximum": 0.2000000011175871,
                  "buckets": [
                    27,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 28,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    28,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3260000000018408,
                  "maximum": 0.08090000000083819,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.1055000000005748,
                  "maximum": 0.02289999999993597,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.46459999999842694,
                  "maximum": 0.13889999999992142,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 17,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    7,
                    2,
                    8,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 17,
                  "total": 1.6013999999995576,
                  "maximum": 0.13520000000062282,
                  "buckets": [
                    17,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 7,
                  "total": 4.722899999999754,
                  "maximum": 0.792699999999968,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 0.19999999925494194,
                  "maximum": 0.19999999925494194,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 34,
                  "total": 23,
                  "maximum": 2,
                  "buckets": [
                    31,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 1,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 5544,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 37,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 38,
          "parseMs": 1.699999999254942,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 39,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 40,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 41,
          "parseMs": 1.5,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 42,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 43,
          "parseMs": 2.299999998882413,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 44,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 45,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 13.400000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 46,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 47,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 48,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 2,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 7281,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 49,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 50,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 51,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 15.400000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 52,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 53,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 54,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.100000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 55,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 10.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 56,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 5.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 57,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 58,
          "parseMs": 1,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 59,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 60,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "idle",
      "trial": 2,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 8992,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 61,
          "parseMs": 1.800000000745058,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 62,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 63,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 64,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 65,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 66,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 67,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 12.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 68,
          "parseMs": 3.099999999627471,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 69,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 70,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 71,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 72,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1002.5145000000011,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5400999999983469,
                  "maximum": 0.08320000000094296,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.14809999999852153,
                  "maximum": 0.022199999999429565,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6342999999997119,
                  "maximum": 0.12399999999979627,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 21,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    7,
                    0,
                    14,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 21,
                  "total": 2.094100000002072,
                  "maximum": 0.15250000000014552,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 16,
                  "total": 9.866299999999683,
                  "maximum": 0.8253999999997177,
                  "buckets": [
                    16,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 42,
                  "total": 21,
                  "maximum": 1,
                  "buckets": [
                    42,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 5,
                  "total": 5,
                  "maximum": 1,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 2.4836000000013883,
                  "maximum": 2.4836000000013883,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1750.9280000000017,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 9.800000006332994,
                  "maximum": 2.800000000745058,
                  "buckets": [
                    11,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 25,
                  "total": 0.8999999985098839,
                  "maximum": 0.10000000149011612,
                  "buckets": [
                    25,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 26,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    26,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3746999999984837,
                  "maximum": 0.08489999999983411,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.1088000000017928,
                  "maximum": 0.023000000001047738,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.5357000000003609,
                  "maximum": 0.22550000000046566,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 15,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    5,
                    0,
                    10,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 15,
                  "total": 1.6960999999992055,
                  "maximum": 0.2334000000009837,
                  "buckets": [
                    15,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 9,
                  "total": 5.8149000000048545,
                  "maximum": 0.8101000000006024,
                  "buckets": [
                    9,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 1.900000000372529,
                  "maximum": 1.900000000372529,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 6,
                  "total": 6,
                  "maximum": 1,
                  "buckets": [
                    6,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 30,
                  "total": 19,
                  "maximum": 2,
                  "buckets": [
                    28,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 0,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 212,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 73,
          "parseMs": 6.800000000745058,
          "nextFrameMs": 15.900000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 74,
          "parseMs": 12.100000001490116,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 75,
          "parseMs": 11.900000000372529,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 76,
          "parseMs": 9.700000001117587,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 77,
          "parseMs": 12.399999998509884,
          "nextFrameMs": 23.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 78,
          "parseMs": 10.300000000745058,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 79,
          "parseMs": 11.699999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 80,
          "parseMs": 11.699999999254942,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 81,
          "parseMs": 10.800000000745058,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 82,
          "parseMs": 11.599999999627471,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 83,
          "parseMs": 11.700000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 84,
          "parseMs": 10.800000000745058,
          "nextFrameMs": 21.200000001117587,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 0,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 1969,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 85,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 86,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 14.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 87,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 88,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 89,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 90,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 91,
          "parseMs": 2,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 92,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.600000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 93,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 94,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 95,
          "parseMs": 1.699999999254942,
          "nextFrameMs": 9.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 96,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.40000000037253,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1000.9374000000007,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5873999999985244,
                  "maximum": 0.1522000000004482,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.14839999999639986,
                  "maximum": 0.023199999999633292,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6067999999959284,
                  "maximum": 0.11969999999928405,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 22,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    8,
                    1,
                    13,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 22,
                  "total": 2.103900000000067,
                  "maximum": 0.131600000000617,
                  "buckets": [
                    22,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 20,
                  "total": 12.475899999997637,
                  "maximum": 0.8865000000005239,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 44,
                  "total": 26,
                  "maximum": 2,
                  "buckets": [
                    42,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 2,
                  "total": 2,
                  "maximum": 1,
                  "buckets": [
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 0.9104000000006636,
                  "maximum": 0.9104000000006636,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1732.6002000000008,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.39200000000164437,
                  "maximum": 0.08700000000135333,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.11149999999906868,
                  "maximum": 0.023400000000037835,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.5192999999999302,
                  "maximum": 0.15099999999983993,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 15,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    5,
                    0,
                    10,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 15,
                  "total": 1.3708999999980733,
                  "maximum": 0.12019999999938591,
                  "buckets": [
                    15,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.5,
                  "maximum": 0.900000000372529,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 23,
                  "total": 1.7000000029802322,
                  "maximum": 0.2000000011175871,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 24,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    24,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 3,
                  "total": 1.8836000000010245,
                  "maximum": 0.6938000000009197,
                  "buckets": [
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "sampledOut",
                  "count": 12,
                  "total": 12,
                  "maximum": 1,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 30,
                  "total": 15,
                  "maximum": 1,
                  "buckets": [
                    30,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 212.59999999962747,
                  "maximum": 212.59999999962747,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 1,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 3702,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 97,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 98,
          "parseMs": 1.800000000745058,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 99,
          "parseMs": 1.5,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 100,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 101,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 102,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 103,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 104,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 105,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 106,
          "parseMs": 1.5,
          "nextFrameMs": 13.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 107,
          "parseMs": 1.5,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 108,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1002.5143000000007,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5031999999991967,
                  "maximum": 0.08059999999932188,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.17650000000139698,
                  "maximum": 0.05099999999947613,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6314999999995052,
                  "maximum": 0.1422999999995227,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 23,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    9,
                    2,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 23,
                  "total": 2.3024999999997817,
                  "maximum": 0.20789999999942665,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 8.376099999999497,
                  "maximum": 0.7865999999994528,
                  "buckets": [
                    13,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 46,
                  "total": 29,
                  "maximum": 2,
                  "buckets": [
                    43,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 2.4818000000013853,
                  "maximum": 2.4818000000013853,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1738.729299999999,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.4040000000022701,
                  "maximum": 0.08690000000206055,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.11020000000280561,
                  "maximum": 0.023199999999633292,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.4378999999953521,
                  "maximum": 0.09899999999834108,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 17,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    7,
                    2,
                    8,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 17,
                  "total": 1.646099999992657,
                  "maximum": 0.138200000001234,
                  "buckets": [
                    17,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 7,
                  "total": 4.145500000002357,
                  "maximum": 0.6926999999996042,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.200000008568168,
                  "maximum": 0.8000000007450581,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 1.3999999985098839,
                  "maximum": 0.2000000011175871,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 34,
                  "total": 23,
                  "maximum": 2,
                  "buckets": [
                    31,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 479.59999999962747,
                  "maximum": 479.59999999962747,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 1,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 5440,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 109,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 110,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 111,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 112,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 113,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 114,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 115,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 116,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 117,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 5.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 118,
          "parseMs": 1,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 119,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 120,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 2,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 7171,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 121,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 122,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 123,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 124,
          "parseMs": 1,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 125,
          "parseMs": 1.5,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 126,
          "parseMs": 1,
          "nextFrameMs": 18.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 127,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 128,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 7.099999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 129,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 130,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 131,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 132,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 1,
      "indicator": "working",
      "trial": 2,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 8912,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 133,
          "parseMs": 1,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 134,
          "parseMs": 1.599999999627471,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 135,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 13.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 136,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 137,
          "parseMs": 1.900000000372529,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 138,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 139,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 7.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 140,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 141,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 142,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 6.400000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 143,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 12.200000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 144,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.40000000037253,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1002.8729999999996,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5952999999972235,
                  "maximum": 0.09799999999813735,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.16210000000501168,
                  "maximum": 0.028300000001763692,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.839799999994284,
                  "maximum": 0.2628000000004249,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 21,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    7,
                    0,
                    14,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 21,
                  "total": 2.0930000000043947,
                  "maximum": 0.21850000000267755,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 19,
                  "total": 11.980899999995017,
                  "maximum": 1.1006000000015774,
                  "buckets": [
                    18,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 42,
                  "total": 23,
                  "maximum": 2,
                  "buckets": [
                    41,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 2,
                  "total": 2,
                  "maximum": 1,
                  "buckets": [
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 2.849099999999453,
                  "maximum": 2.849099999999453,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1718.2248,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3700999999928172,
                  "maximum": 0.08069999999861466,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.10759999999936554,
                  "maximum": 0.02230000000054133,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.47470000000248547,
                  "maximum": 0.11370000000169966,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 16,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    6,
                    1,
                    9,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 16,
                  "total": 1.6622999999926833,
                  "maximum": 0.15390000000115833,
                  "buckets": [
                    16,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 4,
                  "total": 2.5771999999997206,
                  "maximum": 0.7183999999979278,
                  "buckets": [
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.400000002235174,
                  "maximum": 1.199999999254942,
                  "buckets": [
                    11,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 23,
                  "total": 1.5999999977648258,
                  "maximum": 0.2000000011175871,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 24,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    24,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 32,
                  "total": 20,
                  "maximum": 2,
                  "buckets": [
                    30,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 12,
                  "total": 12,
                  "maximum": 1,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 269.40000000037253,
                  "maximum": 269.40000000037253,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 0,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 301,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 145,
          "parseMs": 7.400000000372529,
          "nextFrameMs": 16.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 146,
          "parseMs": 11.100000001490116,
          "nextFrameMs": 17.600000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 147,
          "parseMs": 11.699999999254942,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 148,
          "parseMs": 10.900000000372529,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 149,
          "parseMs": 11.800000000745058,
          "nextFrameMs": 25,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 150,
          "parseMs": 15,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 151,
          "parseMs": 9.800000000745058,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 152,
          "parseMs": 11,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 153,
          "parseMs": 11.799999998882413,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 154,
          "parseMs": 11.800000000745058,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 155,
          "parseMs": 11.600000001490116,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 156,
          "parseMs": 11.799999998882413,
          "nextFrameMs": 23.5,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 0,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 2057,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 157,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 158,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 12.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 159,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.100000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 160,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 161,
          "parseMs": 1.599999999627471,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 162,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 163,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 164,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 165,
          "parseMs": 2.599999999627471,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 166,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 167,
          "parseMs": 1.5,
          "nextFrameMs": 11.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 168,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.200000001117587,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1003.3767999999982,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5337999999974272,
                  "maximum": 0.10670000000027358,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.16510000000926084,
                  "maximum": 0.03320000000167056,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6496000000042841,
                  "maximum": 0.12320000000181608,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 21,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    7,
                    0,
                    14,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 21,
                  "total": 1.9664000000011583,
                  "maximum": 0.144800000001851,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 8.525099999995291,
                  "maximum": 0.8513000000020838,
                  "buckets": [
                    13,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 42,
                  "total": 21,
                  "maximum": 1,
                  "buckets": [
                    42,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 8,
                  "total": 8,
                  "maximum": 1,
                  "buckets": [
                    8,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 3.3545999999987544,
                  "maximum": 3.3545999999987544,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1738.1274999999987,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.300000002607703,
                  "maximum": 1,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 2.199999999254942,
                  "maximum": 0.40000000037252903,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3813000000009197,
                  "maximum": 0.08770000000004075,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.1304999999993015,
                  "maximum": 0.04340000000229338,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.43840000000272994,
                  "maximum": 0.12440000000060536,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 17,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    7,
                    2,
                    8,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 17,
                  "total": 1.717000000007829,
                  "maximum": 0.20160000000032596,
                  "buckets": [
                    17,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 7,
                  "total": 9.872999999999593,
                  "maximum": 5.365200000000186,
                  "buckets": [
                    6,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 2.900000000372529,
                  "maximum": 2.900000000372529,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 34,
                  "total": 23,
                  "maximum": 2,
                  "buckets": [
                    31,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 1,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 3795,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 169,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 170,
          "parseMs": 1.800000000745058,
          "nextFrameMs": 18.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 171,
          "parseMs": 1.5,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 172,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 173,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 174,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 13.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 175,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 176,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 177,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 178,
          "parseMs": 2.099999999627471,
          "nextFrameMs": 15.400000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 179,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 180,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1002.049500000001,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.4921999999896798,
                  "maximum": 0.08569999999963329,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.15719999999782885,
                  "maximum": 0.026400000002468005,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.6239000000095984,
                  "maximum": 0.11900000000241562,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 23,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    9,
                    2,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 23,
                  "total": 2.1916000000092026,
                  "maximum": 0.13099999999758438,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 7.709900000005291,
                  "maximum": 0.7056999999986147,
                  "buckets": [
                    13,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 46,
                  "total": 29,
                  "maximum": 2,
                  "buckets": [
                    43,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 2.033100000000559,
                  "maximum": 2.033100000000559,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1741.7475999999988,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.300000004470348,
                  "maximum": 1.400000000372529,
                  "buckets": [
                    11,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 23,
                  "total": 1,
                  "maximum": 0.19999999925494194,
                  "buckets": [
                    23,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 24,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    24,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.49120000000402797,
                  "maximum": 0.16740000000208966,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.13209999999889988,
                  "maximum": 0.03960000000006403,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.48409999999785214,
                  "maximum": 0.14839999999821885,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 15,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    5,
                    0,
                    10,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 15,
                  "total": 1.634200000004057,
                  "maximum": 0.27219999999942956,
                  "buckets": [
                    15,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 10,
                  "total": 8.040900000003603,
                  "maximum": 1.2795999999980268,
                  "buckets": [
                    8,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 1.800000000745058,
                  "maximum": 1.800000000745058,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 5,
                  "total": 5,
                  "maximum": 1,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 30,
                  "total": 17,
                  "maximum": 2,
                  "buckets": [
                    29,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 1,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 5537,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 181,
          "parseMs": 1,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 182,
          "parseMs": 1.599999999627471,
          "nextFrameMs": 16.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 183,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 184,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 185,
          "parseMs": 2.600000001490116,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 186,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 187,
          "parseMs": 0.900000000372529,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 188,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 189,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 19.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 190,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 191,
          "parseMs": 1,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 192,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18.100000001490116,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 2,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 7282,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 193,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 194,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 195,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 196,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 197,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 198,
          "parseMs": 1.5,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 199,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 200,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 201,
          "parseMs": 1,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 202,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 203,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 204,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "idle",
      "trial": 2,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 9036,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 205,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 18.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 206,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 207,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 15.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 208,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 209,
          "parseMs": 1.5,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 210,
          "parseMs": 1.799999998882413,
          "nextFrameMs": 17.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 211,
          "parseMs": 1.800000000745058,
          "nextFrameMs": 15.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 212,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 213,
          "parseMs": 1.900000000372529,
          "nextFrameMs": 19.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 214,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 215,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 6.899999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 216,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1003.7739000000001,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.511899999990419,
                  "maximum": 0.0852999999988242,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.1614000000008673,
                  "maximum": 0.024600000000646105,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.5622000000039407,
                  "maximum": 0.08410000000003492,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 22,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    8,
                    1,
                    13,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 22,
                  "total": 2.1564999999936845,
                  "maximum": 0.14209999999729916,
                  "buckets": [
                    22,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 7.932499999991705,
                  "maximum": 0.7510999999976775,
                  "buckets": [
                    13,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 44,
                  "total": 28,
                  "maximum": 2,
                  "buckets": [
                    41,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 9,
                  "total": 9,
                  "maximum": 1,
                  "buckets": [
                    9,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 3.7572000000000116,
                  "maximum": 3.7572000000000116,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1735.4377000000022,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.499999998137355,
                  "maximum": 0.900000000372529,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 1.4000000022351742,
                  "maximum": 0.2000000011175871,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.4349000000038359,
                  "maximum": 0.10399999999935972,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.11759999999412685,
                  "maximum": 0.029500000000552973,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.45429999999396387,
                  "maximum": 0.10599999999976717,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 17,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    7,
                    2,
                    8,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 17,
                  "total": 1.5714000000079977,
                  "maximum": 0.140400000000227,
                  "buckets": [
                    17,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 7,
                  "total": 4.716300000000047,
                  "maximum": 0.7718999999997322,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 3.200000001117587,
                  "maximum": 3.200000001117587,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingMessages",
                  "count": 34,
                  "total": 23,
                  "maximum": 2,
                  "buckets": [
                    31,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 10,
                  "total": 10,
                  "maximum": 1,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 0,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 526,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 217,
          "parseMs": 4.699999999254942,
          "nextFrameMs": 14.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 218,
          "parseMs": 12.400000000372529,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 219,
          "parseMs": 14.900000000372529,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 220,
          "parseMs": 11.699999999254942,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 221,
          "parseMs": 11.599999999627471,
          "nextFrameMs": 20.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 222,
          "parseMs": 11.099999999627471,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 223,
          "parseMs": 11.200000001117587,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 224,
          "parseMs": 11.700000001117587,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 225,
          "parseMs": 10.699999999254942,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 226,
          "parseMs": 11.800000000745058,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 227,
          "parseMs": 11.400000000372529,
          "nextFrameMs": 18.199999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 228,
          "parseMs": 11.700000001117587,
          "nextFrameMs": 20,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 0,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 2285,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 229,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 18.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 230,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 11.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 231,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 232,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 233,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 234,
          "parseMs": 1.699999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 235,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 236,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 237,
          "parseMs": 1.5,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 238,
          "parseMs": 1.700000001117587,
          "nextFrameMs": 19,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 239,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 6.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 240,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1001.2776999999987,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5288999999902444,
                  "maximum": 0.08610000000044238,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.15750000000116415,
                  "maximum": 0.024599999997008126,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.5837000000028638,
                  "maximum": 0.10360000000218861,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 22,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    8,
                    1,
                    13,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 22,
                  "total": 2.2071999999752734,
                  "maximum": 0.16389999999955762,
                  "buckets": [
                    22,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 16,
                  "total": 14.91730000001553,
                  "maximum": 4.264200000005076,
                  "buckets": [
                    13,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 44,
                  "total": 24,
                  "maximum": 2,
                  "buckets": [
                    43,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 6,
                  "total": 6,
                  "maximum": 1,
                  "buckets": [
                    6,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 1.2597999999998137,
                  "maximum": 1.2597999999998137,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1732.4251999999979,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3791999999884865,
                  "maximum": 0.08410000000003492,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.1103000000002794,
                  "maximum": 0.02569999999832362,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.4084999999977299,
                  "maximum": 0.09289999999600695,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 16,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    6,
                    1,
                    9,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 16,
                  "total": 1.4897000000055414,
                  "maximum": 0.12670000000071013,
                  "buckets": [
                    16,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 4,
                  "total": 2.400000000001455,
                  "maximum": 0.7750000000014552,
                  "buckets": [
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 7.900000000372529,
                  "maximum": 1,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 1.4999999981373549,
                  "maximum": 0.2999999988824129,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 32,
                  "total": 18,
                  "maximum": 2,
                  "buckets": [
                    31,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 12,
                  "total": 12,
                  "maximum": 1,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 429.7999999988824,
                  "maximum": 429.7999999988824,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 1,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 4017,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 241,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 242,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 243,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 244,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 245,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 246,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 2.599999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 247,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 19,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 248,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 249,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 250,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 2.099999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 251,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 252,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1000.1823000000004,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.570800000015879,
                  "maximum": 0.09769999999844003,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.15419999999721767,
                  "maximum": 0.02380000000266591,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.5979999999908614,
                  "maximum": 0.09929999999440042,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 21,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    7,
                    0,
                    14,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 21,
                  "total": 2.0394999999916763,
                  "maximum": 0.15209999999933643,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 10,
                  "total": 6.348599999997532,
                  "maximum": 0.8786000000036438,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 42,
                  "total": 21,
                  "maximum": 1,
                  "buckets": [
                    42,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 11,
                  "total": 11,
                  "maximum": 1,
                  "buckets": [
                    11,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 0.16679999999905704,
                  "maximum": 0.16679999999905704,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1717.8712000000014,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.3842999999978929,
                  "maximum": 0.08320000000094296,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.1139000000039232,
                  "maximum": 0.0239000000001397,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.41670000000158325,
                  "maximum": 0.08790000000590226,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 15,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    5,
                    0,
                    10,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 15,
                  "total": 1.4973000000027241,
                  "maximum": 0.16449999999895226,
                  "buckets": [
                    15,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 10,
                  "total": 6.174700000010489,
                  "maximum": 0.816900000005262,
                  "buckets": [
                    10,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 7.899999998509884,
                  "maximum": 0.8000000007450581,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 1.200000001117587,
                  "maximum": 0.10000000149011612,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 30,
                  "total": 15,
                  "maximum": 1,
                  "buckets": [
                    30,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 5,
                  "total": 5,
                  "maximum": 1,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 697.8000000007451,
                  "maximum": 697.8000000007451,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 1,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 5735,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 253,
          "parseMs": 1,
          "nextFrameMs": 15.599999999627471,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 254,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 255,
          "parseMs": 1.5,
          "nextFrameMs": 18,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 256,
          "parseMs": 1.400000000372529,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 257,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 258,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 259,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 260,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 261,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 10.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 262,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 17.699999999254942,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 263,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 264,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 2,
      "capture": false,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 7473,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 265,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 266,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 267,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 3.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 268,
          "parseMs": 1.5,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 269,
          "parseMs": 1.599999999627471,
          "nextFrameMs": 18.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 270,
          "parseMs": 1,
          "nextFrameMs": 18.300000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 271,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 18.299999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 272,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 16.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 273,
          "parseMs": 1.1000000014901161,
          "nextFrameMs": 17.90000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 274,
          "parseMs": 1,
          "nextFrameMs": 16.40000000037253,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 275,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 276,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 3.199999999254942,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": []
    },
    {
      "sessions": 4,
      "indicator": "working",
      "trial": 2,
      "capture": true,
      "geometry": {
        "viewportWidth": 464,
        "viewportHeight": 628,
        "terminalWidth": 266.25,
        "terminalHeight": 488,
        "devicePixelRatio": 1
      },
      "sessionAgeMsAtStart": 9190,
      "samples": [
        {
          "type": "fixtureEcho",
          "sequence": 277,
          "parseMs": 1.200000001117587,
          "nextFrameMs": 17.600000001490116,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 278,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 279,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.59999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 280,
          "parseMs": 1.3999999985098839,
          "nextFrameMs": 18.399999998509884,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 281,
          "parseMs": 1.099999999627471,
          "nextFrameMs": 14.900000000372529,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 282,
          "parseMs": 1.300000000745058,
          "nextFrameMs": 17.800000000745058,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 283,
          "parseMs": 1.299999998882413,
          "nextFrameMs": 17.799999998882413,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 284,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 17.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 285,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.09999999962747,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 286,
          "parseMs": 1.199999999254942,
          "nextFrameMs": 18.5,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 287,
          "parseMs": 1.800000000745058,
          "nextFrameMs": 12.700000001117587,
          "rendererKind": "webgl"
        },
        {
          "type": "fixtureEcho",
          "sequence": 288,
          "parseMs": 1,
          "nextFrameMs": 15.299999998882413,
          "rendererKind": "webgl"
        }
      ],
      "diagnostics": [
        {
          "capture": "window",
          "elapsedMs": 1001.4545999999973,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 7,
                  "total": 0.5395000000062282,
                  "maximum": 0.08370000000286382,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 7,
                  "total": 0.16439999999420252,
                  "maximum": 0.024599999997008126,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 7,
                  "total": 35,
                  "maximum": 5,
                  "buckets": [
                    0,
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 7,
                  "total": 0.5722999999998137,
                  "maximum": 0.09219999999913853,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 22,
                  "total": 154,
                  "maximum": 15,
                  "buckets": [
                    8,
                    1,
                    13,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 22,
                  "total": 2.239499999988766,
                  "maximum": 0.21050000000104774,
                  "buckets": [
                    22,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 13,
                  "total": 8.931600000003527,
                  "maximum": 0.9617999999973108,
                  "buckets": [
                    13,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 44,
                  "total": 26,
                  "maximum": 2,
                  "buckets": [
                    42,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 9,
                  "total": 9,
                  "maximum": 1,
                  "buckets": [
                    9,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "hostEventLoopGapMs",
                  "count": 1,
                  "total": 1.4377000000022235,
                  "maximum": 1.4377000000022235,
                  "buckets": [
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "window",
          "elapsedMs": 1732.7546000000002,
          "sessions": [
            {
              "session": "8a83d94d44b74afe",
              "metrics": [
                {
                  "metric": "inputQueueMs",
                  "count": 5,
                  "total": 0.391299999995681,
                  "maximum": 0.08750000000145519,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "ptyWriteMs",
                  "count": 5,
                  "total": 0.11970000001747394,
                  "maximum": 0.025500000003376044,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputCharacters",
                  "count": 5,
                  "total": 25,
                  "maximum": 5,
                  "buckets": [
                    0,
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputActionMs",
                  "count": 5,
                  "total": 0.43190000001050066,
                  "maximum": 0.09330000000045402,
                  "buckets": [
                    5,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputCharacters",
                  "count": 16,
                  "total": 110,
                  "maximum": 15,
                  "buckets": [
                    6,
                    1,
                    9,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputHandlingMs",
                  "count": 16,
                  "total": 1.7840999999825726,
                  "maximum": 0.16120000000228174,
                  "buckets": [
                    16,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputRoundTripMs",
                  "count": 7,
                  "total": 4.755899999989197,
                  "maximum": 0.8435000000026776,
                  "buckets": [
                    7,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "userInputCharacters",
                  "count": 12,
                  "total": 60,
                  "maximum": 5,
                  "buckets": [
                    0,
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "inputRoundTripMs",
                  "count": 12,
                  "total": 8.199999997392297,
                  "maximum": 0.8000000007450581,
                  "buckets": [
                    12,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "outputParseMs",
                  "count": 20,
                  "total": 1.699999999254942,
                  "maximum": 0.10000000149011612,
                  "buckets": [
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "pendingWrites",
                  "count": 21,
                  "total": 0,
                  "maximum": 0,
                  "buckets": [
                    21,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "rendererAvailable",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "webglActive",
                  "count": 1,
                  "total": 1,
                  "maximum": 1,
                  "buckets": [
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                }
              ]
            },
            {
              "session": null,
              "metrics": [
                {
                  "metric": "pendingMessages",
                  "count": 32,
                  "total": 22,
                  "maximum": 2,
                  "buckets": [
                    29,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "sampledOut",
                  "count": 9,
                  "total": 9,
                  "maximum": 1,
                  "buckets": [
                    9,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "metric": "frontendEventLoopGapMs",
                  "count": 1,
                  "total": 524.5,
                  "maximum": 524.5,
                  "buckets": [
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0
                  ]
                }
              ]
            }
          ],
          "omittedSamples": 0
        },
        {
          "capture": "stopped",
          "reason": "manual",
          "records": 2
        }
      ]
    }
  ]
}
```
