# 선택 원본의 로컬 벡터 검색

사용자가 고른 root에서 이미 선택된 owned 원본의 의미 검색을 요청할 때
`folio_embeddings`를 사용한다. 등록 후보를 검색하려면 원본 선택에 대한 실제
사용자 지시가 먼저 있어야 한다. 검색이나 모델 판단은 그 지시를 대신하지 않는다.
색인과 검색은 작품 승인·자기검토·품질 보증을 만들지 않는다.

## 호출과 확인

1. `folio_resources` propose는 owned `{bytes,mediaType}` UTF8 text/JSON 또는
   `{base64,mediaType}`의 canonical base64 미디어를 받는다. 둘은 상호 배타적이다.
   각 bytes 최대8MiB. 보관 MIME은 text/plain, application/json, image/png,
   image/jpeg, image/webp, image/gif, audio/wav, audio/mpeg, video/mp4다.
   미디어 read는 `{revision,base64,encoding:'base64'}`, text/JSON read는
   `{revision,content}`다. 미관측 external read는 content=null이다.
2. 원본 선택은 실제 사용자 지시에 따라 `folio_resources` decideSource의
   revisionId, expectedSelectionRevision, action:{actor:user,type:select}로 진술한다.
3. `folio_embeddings {root,op:'index',dimension?:768,freshness?:'requireCurrent'}`.
   dimension은128/256/512/768; freshness는requireCurrent/allowStale다.
   최대100개 selected owned text/JSON 또는 PNG/JPEG/WebP/GIF를 색인한다.
   generationId, profile/profileDigest, workspaceCheckpoint, inputManifestId,
   outputHashes, coverage, freshness를 확인하고 exact generationId를 보관한다.
   승인 결과와 미선택 후보는 이 검색 scope 밖이다.
4. `folio_embeddings {root,op:'search',generationId,text,limit?:10,freshness?:'requireCurrent'}`.
   text는1~32768자이며 공백만 거부; limit은1~100.
   results의 cosine score, 실제 revisionId/contentHash/selectionRevision,
   manifest/checkpoint/currentCheckpoint, coverage/evidence를 사용자에게 설명한다.

## 최신성과 실패

coverage.scope=selected-sources다. 외부 URI bytes는 자동 fetch하지 않고
coverage.missing에 external-unobserved를 반환한다. audio/video는 opaque 보관만
가능하며 media-unsupported로 누락된다. 모델의 네 모달리티 설명을 Folio의
검증 완료 능력으로 바꾸어 말하지 않는다. Folio 실제 실행 지원은 text/image다.
requireCurrent 검색은 checkpoint 변경(stale)과 누락(partial)을 거부한다.
allowStale은 과거 판본·checkpoint·누락을 명시하며 손상은 여전히 거부한다.
PROJECTION_NOT_CURRENT는 명시적 재색인으로 해결한다. VECTOR_PROFILE_MISMATCH는
색인 당시와 동일한 모델/processor/runtime 공간을 준비하거나 재색인으로 해결한다.
EMBEDDING_CONTENT_UNAVAILABLE는 선택된 실제 지원 bytes가 없음을 뜻한다.
EMBEDDING_RUNTIME_UNAVAILABLE/FAILURE/TIMEOUT/OUTPUT_LIMIT/PROTOCOL_INVALID는
설치·캐시·자원 오류이며 원본이나 승인 상태를 바꾸지 않는다.

## 실행 준비와 결속

선택 기능에는 별도 Python3.12와 torch2.14.1, torchvision0.29.1,
transformers5.19.0, sentence-transformers6.1.0이 필요하다.
MCP 환경의 FOLIO_EMBEDDING_PYTHON은 절대 Python 실행파일 경로이며,
HF_HOME은 미리 준비한 모델 캐시다. 고정 모델은 google/embeddinggemma-2,
revision914f7f89142e33e77833254d9c9b90c3cef7303b, Apache2.0, CPU float32다.
API 키 없이 로컬 캐시에서만 실행한다. 모델 다운로드 접근 조건은 사용자가
사전에 준비한다. 요청마다 로드하며 기본300초와 stdout4MiB/stderr64KiB 한도가 있다.

profile은 model/modelRevision/processorRevision/processorConfig(구성파일 hashes),
runtime(실제 Python·라이브러리 버전), dtype=float32, dimension,
normalization=l2, prefixes(document/query/media)를 exact 결속한다.
문서는 Document, 질의는 SearchQuery, 미디어는 빈 prefix다.
차원 truncation 후 정규화하고 NaN/zero/차원/정규화 불일치를 차단한다.
`.folio/projections/vectors/<hash>.json`은 추가 전용 generation이며
실제 bytes·선택 marker·당시 checkpoint와 output hashes를 보존한다.
모델 추론 중 선택이 바뀌면 최신으로 저장할 수 없고 과거 pin을 현재로 소급하지 않는다.

선택 원본 수100개 한도는 bytes를 읽기 전에 검사한다. 텍스트는 prefix 포함 실제
tokenizer 길이+special token 여유8이 min(8192, runtime tokenizer limit)를 넘으면
EMBEDDING_TEXT_TOO_LONG으로 거부한다. 긴 문서 자동 truncation을 전체 문서
색인으로 표시하지 않는다. processorConfig.folioInputPolicy가 이 정책을 결속한다.
이미지는 header 기준1600만 pixels를 넘으면 EMBEDDING_IMAGE_TOO_LARGE로
거부한다. resize/crop은 고정 processor 구성에 따른다. 8MiB 압축 bytes 한도는
메모리 사용 보증이 아니며 CPU decoding과 모델 추론의 지연/메모리 한계가 있다.

개별 입력8MiB·최대100개 외에 합산32MiB를 적용한다. core pin은 원본 증거의
개별 bytes·hash 검증 후 verified byteLength를 합산하고, 한도를 통과한 뒤에만
일괄 input buffers를 보관한다. 이는 한도 검사 전 파일 읽기가 없다는 뜻이 아니다.
adapter 직접 호출도 실제 bytes 길이로 같은 한도를 worker 실행 전에 검사한다.
processorConfig.folioInputPolicy의 maxInputBytes/maxInputs/maxBatchBytes는
고정 정책이다. 이 정책이 없는 이전 vector profile은 VECTOR_PROFILE_INVALID로
거부하므로 새 index를 명시 실행해야 한다. 원고·Resource·영수증 변환은 없다.
