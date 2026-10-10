# Controller actual execution evidence

Code HEAD: 25eb59b. Local Node24.19.0/macOS arm64, synthetic temporary fixtures only.
Commands actually exited0; final root/test/install/exactcommit benchmark remain pending broadreview gate.

## Optional real Google model

Public stdio MCP → Resource propose/select two synthetic red/blue PNG → index128 → two text searches → 9000x text overflow. Cached optional Python/runtime/model outsidepackage; offline adapter, no model/API secrets committed. Exact profile and source evidence below. Temporary resource folder removed in finally. This is a narrow wiring/retrieval smoke, not multilingual/creative semantic accuracy or workload/model-latency benchmark.

```json
{
  "stderrBytes": 0,
  "textOverflow": "EMBEDDING_TEXT_TOO_LONG",
  "synthetic": true,
  "fixtureRetained": false,
  "generationId": "sha256:16fc1db914fd9d61b338184e3728b04f9835e9ec24b222bb2a20c5549a477f60",
  "profileDigest": "sha256:ed4eed5ae111b9c9dded46eb4d0f4568fbec13f78fd705a7332a1a295e70d33d",
  "profile": {
    "dimension": 128,
    "dtype": "float32",
    "model": "google/embeddinggemma-2",
    "modelRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
    "normalization": "l2",
    "prefixes": {
      "document": "title: none | text: ",
      "media": "",
      "query": "task: search result | query: "
    },
    "processorConfig": {
      "1_Pooling/config.json": "8759bdf7c77efc7df7723f64856a593c8943b71ee38baf2a88771fbaf78438f9",
      "2_Normalize/config.json": "cdb09dfca347a56aa2d691744e38d5ad3c7cbc2834e7181272b9a15328b82524",
      "config.json": "b8f1e9931b57fbc054acdb445c41765d55b0074c58d145fa82839941ad1b5bb3",
      "config_sentence_transformers.json": "031e56a498d33c349ab489a21885bcfe25b4fcba841149dc99e1e90d4a7c28f5",
      "folioInputPolicy": {
        "maxBatchBytes": 33554432,
        "maxImagePixels": 16000000,
        "maxInputBytes": 8388608,
        "maxInputs": 100,
        "specialTokenReserve": 8,
        "textOverflow": "reject",
        "textTokenLimit": 8192
      },
      "modules.json": "3d02572a0455b832de67fb8e63a54981bc7e8b46e337c95e917bd8122a533bfd",
      "preprocessor_config.json": "ea2ae257e901064abdd98dceb19f2b0da06af600bed15e0f99f5c85c37ee9d78",
      "processor_config.json": "168f6a08522f3ce5dea596d94d003af2fd691742d4f41fe1f9d8cce76bfbf69c",
      "sentence_bert_config.json": "b1bcd9f2dce3ae863b359e87d0710b5dbc3314a59ecb4e2f97c7778fc8e4b228",
      "tokenizer.json": "4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4",
      "tokenizer_config.json": "17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874"
    },
    "processorRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
    "runtime": {
      "Pillow": "12.3.0",
      "huggingface-hub": "1.33.0",
      "numpy": "2.5.3",
      "python": "3.12.11",
      "sentence-transformers": "6.1.0",
      "torch": "2.14.1",
      "torchvision": "0.29.1",
      "transformers": "5.19.0"
    }
  },
  "checkpoint": {
    "hash": "sha256:d841324bb4040fbd13944bb0b882c1095d7900d82b214df74c9776b7b5e12415",
    "seq": 2
  },
  "queries": [
    {
      "text": "a red square",
      "freshness": "current",
      "scores": [
        {
          "resourceId": "red",
          "score": 0.8790213723593914
        },
        {
          "resourceId": "blue",
          "score": 0.8328644629140826
        }
      ],
      "evidence": [
        {
          "resourceId": "red",
          "revisionId": "sha256:bd83f970015b88c05c0c4f52351abff09379ea6cd103e83fe8d8f39bc8c01a65",
          "contentHash": "sha256:8d3be7f67f79a9cb9128d9e95b784cfcd0c3ba1e07e0a13599dd69b96164fafe",
          "selectionRevision": "sha256:d99cc36c837dda17b3b501c6c02fa90dcf8c61fbf723db45e57be89a67f204af",
          "sourceCheckpoint": {
            "hash": "sha256:d99cc36c837dda17b3b501c6c02fa90dcf8c61fbf723db45e57be89a67f204af",
            "seq": 1
          }
        },
        {
          "resourceId": "blue",
          "revisionId": "sha256:a8fa969825be8e4bbdab12fd6004b2a8ce20beb7c8f78345f9c6606b78850f06",
          "contentHash": "sha256:ee68392aa87729b1c8f1f09523e9224c1ebaf2c122e663d7c1f9352163dfb0bf",
          "selectionRevision": "sha256:d841324bb4040fbd13944bb0b882c1095d7900d82b214df74c9776b7b5e12415",
          "sourceCheckpoint": {
            "hash": "sha256:d841324bb4040fbd13944bb0b882c1095d7900d82b214df74c9776b7b5e12415",
            "seq": 2
          }
        }
      ]
    },
    {
      "text": "a blue square",
      "freshness": "current",
      "scores": [
        {
          "resourceId": "blue",
          "score": 0.8827744222155567
        },
        {
          "resourceId": "red",
          "score": 0.8418433152484753
        }
      ],
      "evidence": [
        {
          "resourceId": "blue",
          "revisionId": "sha256:a8fa969825be8e4bbdab12fd6004b2a8ce20beb7c8f78345f9c6606b78850f06",
          "contentHash": "sha256:ee68392aa87729b1c8f1f09523e9224c1ebaf2c122e663d7c1f9352163dfb0bf",
          "selectionRevision": "sha256:d841324bb4040fbd13944bb0b882c1095d7900d82b214df74c9776b7b5e12415",
          "sourceCheckpoint": {
            "hash": "sha256:d841324bb4040fbd13944bb0b882c1095d7900d82b214df74c9776b7b5e12415",
            "seq": 2
          }
        },
        {
          "resourceId": "red",
          "revisionId": "sha256:bd83f970015b88c05c0c4f52351abff09379ea6cd103e83fe8d8f39bc8c01a65",
          "contentHash": "sha256:8d3be7f67f79a9cb9128d9e95b784cfcd0c3ba1e07e0a13599dd69b96164fafe",
          "selectionRevision": "sha256:d99cc36c837dda17b3b501c6c02fa90dcf8c61fbf723db45e57be89a67f204af",
          "sourceCheckpoint": {
            "hash": "sha256:d99cc36c837dda17b3b501c6c02fa90dcf8c61fbf723db45e57be89a67f204af",
            "seq": 1
          }
        }
      ]
    }
  ]
}
```

## Built browser UI

Isolated installedChrome154, no user profile. Synthetic Resource-only workspace selected source+two approved output contexts; keyboardskipmain, directdetail, scripttext, unknownexternalnotfetched, stale/deselectionReview needed; readonlystaticzeroAPI; oldstaticunavailability; writingmode320 preserved. Screenshots list320/detail736/stale390 visually inspected bycontroller on currentrun. Values below are browserexecution, not NodeSSR-only proof.

```json
{
  "synthetic": true,
  "browserVersion": "154.0.8037.98",
  "results": [
    {
      "label": "list",
      "width": 320,
      "viewport": 320,
      "documentWidth": 320,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-list-320.png"
    },
    {
      "label": "detail",
      "width": 320,
      "viewport": 320,
      "documentWidth": 320,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-detail-320.png"
    },
    {
      "label": "text",
      "width": 320,
      "viewport": 320,
      "documentWidth": 320,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-text-320.png"
    },
    {
      "label": "list",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-list-390.png"
    },
    {
      "label": "detail",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-detail-390.png"
    },
    {
      "label": "text",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-text-390.png"
    },
    {
      "label": "list",
      "width": 736,
      "viewport": 736,
      "documentWidth": 736,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-list-736.png"
    },
    {
      "label": "detail",
      "width": 736,
      "viewport": 736,
      "documentWidth": 736,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-detail-736.png"
    },
    {
      "label": "text",
      "width": 736,
      "viewport": 736,
      "documentWidth": 736,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-text-736.png"
    },
    {
      "label": "stale",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-stale-390.png"
    },
    {
      "label": "static",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-static-390.png"
    },
    {
      "label": "old-static",
      "width": 390,
      "viewport": 390,
      "documentWidth": 390,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-old-static-390.png"
    },
    {
      "label": "writing",
      "width": 320,
      "viewport": 320,
      "documentWidth": 320,
      "xss": null,
      "screenshot": "/tmp/folio-controller-resources-writing-320.png"
    }
  ],
  "errors": [],
  "multipleEvidence": true,
  "staticApiCalls": 0,
  "fixtureRetained": false
}
```

## Graph measurement

Small synthetic13-node novel only; currentlocalmachine. NoGraphJSrequestbeforelazyentry, documentwidth==viewport, noerrors.320/736 screenshots visually inspected. Not100-node/lowend/SLA proof. Warning remains unsuppressed.

```json
{
  "synthetic": true,
  "browserVersion": "154.0.8037.98",
  "scope": "cold Graph first-entry on local existing small novel fixture; no scale or low-end-device SLA",
  "results": [
    {
      "width": 320,
      "readyMs": 971.54025,
      "viewport": 320,
      "documentWidth": 320,
      "nodeCount": 13,
      "resources": [
        {
          "duration": 4.399999976158142,
          "transferSize": 1613741,
          "encodedBodySize": 1613441,
          "decodedBodySize": 1613441
        }
      ],
      "screenshot": "/tmp/folio-production-controller-graph-320.png"
    },
    {
      "width": 736,
      "readyMs": 788.7063749999998,
      "viewport": 736,
      "documentWidth": 736,
      "nodeCount": 13,
      "resources": [
        {
          "duration": 2.800000011920929,
          "transferSize": 1613741,
          "encodedBodySize": 1613441,
          "decodedBodySize": 1613441
        }
      ],
      "screenshot": "/tmp/folio-production-controller-graph-736.png"
    }
  ],
  "errors": [],
  "fixtureRetained": false
}
```

## Preservation

Original /path/to/folio still73 dirty entries; main713b9d85f30316ce04ff8c3f7f922bb165bac4c9 and prior codex/dynamic-tracking c44b13c6c9980bb95082c1a1c665bb40db88af3b unchanged. Controller/implementers write only managedworktree /path/to/folio. Vibelore read-only source never mutated. Trackedcode over300lines scan returned none. Remote list empty, so no remoteCI/push/PR/publication claim.

## Controller 최종 실행 — exact code commit

코드 commit `5fc61bc6a5ec5666253c7239bc455db8715a535b`. broad 독립 리뷰의 Important I1/I2 수정과 scoped 재리뷰 뒤
controller가 아래 명령을 새로 실행했다. 이전 작업의 성공 로그를 재사용하지 않았다.
문서/검증 기록을 남기는 후속 commit은 실행 코드를 바꾸지 않는다.

| 명령 | 실제 결과 |
|---|---|
| npm run check | lint·타입 검사, 1713/1713, fail/skip0 |
| npm --prefix viewer test | 37/37, fail/skip0 |
| viewer build | 성공, Graph 기존 크기 경고 유지 |
| examples:verify / assets:verify | 공개 stdio 합성 원고·추적·그림 검증 성공 |
| production:verify | 그림책·Resource-only·웹/EPUB·HTTP·정적 사본 성공 |
| package:verify | tarball 실제 새 설치, 개발 의존성 없음, 510개 항목, 설치 doctor·예제·production 성공 |
| benchmark:local | 원고/추적/자료 각100개, 전체 결과·근거·본문 확인, 자체 출력 삭제 |
| 실제 Google adapter | 오프라인 text/image128차원, 두 색상 검색 current·정확한 1위·근거, 긴 text 거부 |
| 실제 Chrome UI | 320/390/736px·복수 근거·stale·static·old-static·집필 화면, overflow/XSS/errors0·static API0 |

기본 흐름에서 Python/모델이 없어도 집필·화면·내보내기는 동작하고 embedding만
EMBEDDING_RUNTIME_UNAVAILABLE로 답했다. 선택 Google smoke는 별도 cached 런타임으로
실행했다. 고정 모델 revision `914f7f89142e33e77833254d9c9b90c3cef7303b`, profileDigest
`sha256:ed4eed5ae111b9c9dded46eb4d0f4568fbec13f78fd705a7332a1a295e70d33d`. 대용량/다국어 의미 정확도나 모델 품질을 이 두 색상
연결 시험으로 인증하지 않는다. 모든 작품 결정은 합성 사본의 모의 사용자 승인이다.

### 최종 commit의 규모 실측

환경: `{"node": "v24.19.0", "platform": "darwin", "osRelease": "25.2.0", "arch": "arm64", "cpu": "Apple M1", "cpuCount": 8, "totalMemoryBytes": 8589934592}`.
시간은 단일 로컬 실행이며 SLA·백분위·메모리 peak 또는 실제 모델 추론 벤치마크가 아니다.

| 작업 | milliseconds | 반환 JSON bytes |
|---|---:|---:|
| synthetic-setup | 113303.696 | 128 |
| status | 293.864 | 395 |
| tracking-query | 45.142 | 37253 |
| metadata-refresh | 67.309 | 2298 |
| resource-query | 58.635 | 107192 |
| view-outline | 352.375 | 19589 |
| view-resource-list | 60.756 | 66172 |
| view-resource-details-100 | 5906.605 | 69883 |
| viewer-export | 44279.739 | 45 |
| web-export | 71.521 | 189 |

전체 export bytes: `{"viewer": 3148564, "web": 50492}`.
세대 `sha256:07e65ccf9a8f8465bd2fea9cb22a79f74dd11d6452663acd079c7423ff1d05af`,
checkpoint `{"seq": 100, "hash": "sha256:576e7e9cdb47709bf4e1b6e04d477e2edc088a12cd5bb3507a318bf59ddf5638"}`.
목록 조회와 전체 정적 export의 대기 시간을 섞지 않는다. Graph 경고와 정적 export
대기는 독립 리뷰에서 로컬 개인용 범위의 Minor로 수용했으며 숨기지 않았다.

### 미검증과 차단

원격 OS/Node CI·실제 호스트 장기 집필·실작품 의미 품질·모든 EPUB reader·정전/remoteFS는
미검증이다. 자동 Wiki·자유 DAG/replan·audio/video embedding·클라우드 협업/과금은
이번 출시 범위 밖이다. Git remote가 없어서 push/PR 및 원격 CI는 실행하지 않았다.
모든 source/검증 기록과 준비된 tarball은 로컬로 제공한다.

원시 로컬 로그: /tmp/folio-production-final-{check,viewer-test,viewer-build,examples,assets,flow,package,benchmark,model-smoke,ui}.log.
합성 임시 작품/설치/cache는 각 helper가 종료 시 정리한다. 모델 런타임과 가중치는 패키지에
없으며 선택 runtime 자체를 삭제하지 않는다. raw log는 사용자 machine의 임시 근거이고
이 기록과 계획별 보고/리뷰는 Git에 영구 보존한다.

## 최종 code5fc61bc 실제 모델·UI 원문

최종 실행 exit0, list320/detail736 screenshot 시각 확인. 아래는 새 실행 값이며 앞선 code25eb59b 실행과 구분한다. 미디어/벡터/실제 작품은 보존하지 않는다.

```json
{
  "model": {
    "stderrBytes": 0,
    "textOverflow": "EMBEDDING_TEXT_TOO_LONG",
    "synthetic": true,
    "fixtureRetained": false,
    "generationId": "sha256:812c065d6da8cf2ae12c9ae3ebde602b8fe373be55bcf20e439a6d10555648ca",
    "profileDigest": "sha256:ed4eed5ae111b9c9dded46eb4d0f4568fbec13f78fd705a7332a1a295e70d33d",
    "profile": {
      "dimension": 128,
      "dtype": "float32",
      "model": "google/embeddinggemma-2",
      "modelRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
      "normalization": "l2",
      "prefixes": {
        "document": "title: none | text: ",
        "media": "",
        "query": "task: search result | query: "
      },
      "processorConfig": {
        "1_Pooling/config.json": "8759bdf7c77efc7df7723f64856a593c8943b71ee38baf2a88771fbaf78438f9",
        "2_Normalize/config.json": "cdb09dfca347a56aa2d691744e38d5ad3c7cbc2834e7181272b9a15328b82524",
        "config.json": "b8f1e9931b57fbc054acdb445c41765d55b0074c58d145fa82839941ad1b5bb3",
        "config_sentence_transformers.json": "031e56a498d33c349ab489a21885bcfe25b4fcba841149dc99e1e90d4a7c28f5",
        "folioInputPolicy": {
          "maxBatchBytes": 33554432,
          "maxImagePixels": 16000000,
          "maxInputBytes": 8388608,
          "maxInputs": 100,
          "specialTokenReserve": 8,
          "textOverflow": "reject",
          "textTokenLimit": 8192
        },
        "modules.json": "3d02572a0455b832de67fb8e63a54981bc7e8b46e337c95e917bd8122a533bfd",
        "preprocessor_config.json": "ea2ae257e901064abdd98dceb19f2b0da06af600bed15e0f99f5c85c37ee9d78",
        "processor_config.json": "168f6a08522f3ce5dea596d94d003af2fd691742d4f41fe1f9d8cce76bfbf69c",
        "sentence_bert_config.json": "b1bcd9f2dce3ae863b359e87d0710b5dbc3314a59ecb4e2f97c7778fc8e4b228",
        "tokenizer.json": "4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4",
        "tokenizer_config.json": "17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874"
      },
      "processorRevision": "914f7f89142e33e77833254d9c9b90c3cef7303b",
      "runtime": {
        "Pillow": "12.3.0",
        "huggingface-hub": "1.33.0",
        "numpy": "2.5.3",
        "python": "3.12.11",
        "sentence-transformers": "6.1.0",
        "torch": "2.14.1",
        "torchvision": "0.29.1",
        "transformers": "5.19.0"
      }
    },
    "checkpoint": {
      "hash": "sha256:48f0f82213cca3b9996e34e44ab3d8fb35d48f5b6f5ac82815ebd72b9ebf01ae",
      "seq": 2
    },
    "queries": [
      {
        "text": "a red square",
        "freshness": "current",
        "scores": [
          {
            "resourceId": "red",
            "score": 0.8790213723593914
          },
          {
            "resourceId": "blue",
            "score": 0.8328644629140826
          }
        ],
        "evidence": [
          {
            "resourceId": "red",
            "revisionId": "sha256:bd83f970015b88c05c0c4f52351abff09379ea6cd103e83fe8d8f39bc8c01a65",
            "contentHash": "sha256:8d3be7f67f79a9cb9128d9e95b784cfcd0c3ba1e07e0a13599dd69b96164fafe",
            "selectionRevision": "sha256:029b75facacf414ad714e9809307f78135c954a955405c2114f13e1595fccde4",
            "sourceCheckpoint": {
              "hash": "sha256:029b75facacf414ad714e9809307f78135c954a955405c2114f13e1595fccde4",
              "seq": 1
            }
          },
          {
            "resourceId": "blue",
            "revisionId": "sha256:a8fa969825be8e4bbdab12fd6004b2a8ce20beb7c8f78345f9c6606b78850f06",
            "contentHash": "sha256:ee68392aa87729b1c8f1f09523e9224c1ebaf2c122e663d7c1f9352163dfb0bf",
            "selectionRevision": "sha256:48f0f82213cca3b9996e34e44ab3d8fb35d48f5b6f5ac82815ebd72b9ebf01ae",
            "sourceCheckpoint": {
              "hash": "sha256:48f0f82213cca3b9996e34e44ab3d8fb35d48f5b6f5ac82815ebd72b9ebf01ae",
              "seq": 2
            }
          }
        ]
      },
      {
        "text": "a blue square",
        "freshness": "current",
        "scores": [
          {
            "resourceId": "blue",
            "score": 0.8827744222155567
          },
          {
            "resourceId": "red",
            "score": 0.8418433152484753
          }
        ],
        "evidence": [
          {
            "resourceId": "blue",
            "revisionId": "sha256:a8fa969825be8e4bbdab12fd6004b2a8ce20beb7c8f78345f9c6606b78850f06",
            "contentHash": "sha256:ee68392aa87729b1c8f1f09523e9224c1ebaf2c122e663d7c1f9352163dfb0bf",
            "selectionRevision": "sha256:48f0f82213cca3b9996e34e44ab3d8fb35d48f5b6f5ac82815ebd72b9ebf01ae",
            "sourceCheckpoint": {
              "hash": "sha256:48f0f82213cca3b9996e34e44ab3d8fb35d48f5b6f5ac82815ebd72b9ebf01ae",
              "seq": 2
            }
          },
          {
            "resourceId": "red",
            "revisionId": "sha256:bd83f970015b88c05c0c4f52351abff09379ea6cd103e83fe8d8f39bc8c01a65",
            "contentHash": "sha256:8d3be7f67f79a9cb9128d9e95b784cfcd0c3ba1e07e0a13599dd69b96164fafe",
            "selectionRevision": "sha256:029b75facacf414ad714e9809307f78135c954a955405c2114f13e1595fccde4",
            "sourceCheckpoint": {
              "hash": "sha256:029b75facacf414ad714e9809307f78135c954a955405c2114f13e1595fccde4",
              "seq": 1
            }
          }
        ]
      }
    ]
  },
  "ui": {
    "synthetic": true,
    "browserVersion": "154.0.8037.98",
    "results": [
      {
        "label": "list",
        "width": 320,
        "viewport": 320,
        "documentWidth": 320,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-list-320.png"
      },
      {
        "label": "detail",
        "width": 320,
        "viewport": 320,
        "documentWidth": 320,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-detail-320.png"
      },
      {
        "label": "text",
        "width": 320,
        "viewport": 320,
        "documentWidth": 320,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-text-320.png"
      },
      {
        "label": "list",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-list-390.png"
      },
      {
        "label": "detail",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-detail-390.png"
      },
      {
        "label": "text",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-text-390.png"
      },
      {
        "label": "list",
        "width": 736,
        "viewport": 736,
        "documentWidth": 736,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-list-736.png"
      },
      {
        "label": "detail",
        "width": 736,
        "viewport": 736,
        "documentWidth": 736,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-detail-736.png"
      },
      {
        "label": "text",
        "width": 736,
        "viewport": 736,
        "documentWidth": 736,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-text-736.png"
      },
      {
        "label": "stale",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-stale-390.png"
      },
      {
        "label": "static",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-static-390.png"
      },
      {
        "label": "old-static",
        "width": 390,
        "viewport": 390,
        "documentWidth": 390,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-old-static-390.png"
      },
      {
        "label": "writing",
        "width": 320,
        "viewport": 320,
        "documentWidth": 320,
        "xss": null,
        "screenshot": "/tmp/folio-controller-resources-writing-320.png"
      }
    ],
    "errors": [],
    "multipleEvidence": true,
    "staticApiCalls": 0,
    "fixtureRetained": false
  }
}
```
