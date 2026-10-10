# 영어 예시 및 번역 실습 결과

영어 README를 읽는 사람이 직접 열어 볼 영어 산출물을 만들었다. 한국어 예시를 일괄 번역하지 않고 원작 네 개와 기존 한국어 단편의 번역 하나를 분리했다. 실제 작품·이미지는 Git에 포함하지 않고 별도 예시 릴리스 파일로 배포한다.

| 예시 | 구성 | 영어 분량 |
|---|---|---:|
| The Last Light at Platform Nine | 단편 3장면 | 1,009단어 |
| Pip and the Pocket of Wind | 그림책 원고 4펼침면, 새 삽화 2장 | 107단어 |
| Your First Work with Folio | 초보자 실습 안내 4절 | 902단어 |
| The Atlas of Borrowed Rooms | 4장·8장면, 열쇠 보관자 상태 4개 | 2,657단어 |
| The Mailbox After the Rain | 한국어 단편 3장면 → en 번역 판본 | 원본과 별도 보존 |

네 장짜리 이야기는 여러 계층·장면·시간에 따른 사물 상태를 검증하는 구조 예시다. 완성 중편 분량을 검증했다고 주장하지 않는다. 그림책은 읽기 원고와 삽화 연결 예시이며 전 펼침면이 조판된 출판 완성본이 아니다.

## MCP 경유 실행

folio_init → 구조·인물·자산 등록 → folio_run/resume → 검사 → 모의 decide → commit → folio_status → 영어 Web/EPUB export를 실행했다. 주요 영수증·기록장 진단은 정상, 예시들의 drift/stale/recheck/waiting은 비어 있었다. 이미지 2개는 Codex imagegen으로 생성한 1536×1024 PNG이며 Folio는 이미지 모델을 호출하지 않았다. 실제 모델 식별자는 관측되지 않아 특정 이미지 모델 버전을 주장하지 않는다.

승인은 독립 시연 사본에만 기록한 모의 승인이다. 글과 그림을 만든 호스트가 검토했으며 모델 검사 응답도 같은 호스트가 구성했다. 독립적인 문학·번역 품질 인증이 아니다.

## 번역

novel + variants, en/translation 선언, 서하/도윤/청솔마을/파란 우편함의 용어 대응표를 사용했다. 원본 본문과 기존 추출 기록을 유지하고 영어 영수증 3개에 original 바인딩을 기록했다. 문단 수 7/14/9를 유지했다. 결정적 용어·문단·블록·숫자 검사와 같은 호스트의 fidelity 검사 흐름을 통과했다. 이 작품에는 아라비아 숫자와 블록 표시가 없어 해당 보존 검사는 자극이 제한적이며, 언어 품질과 모든 번역 오류 탐지를 입증하지 않는다.

별도 오류 주입 사본에서 열린 번역의 원본을 바꾸었다. VARIANT_ORIGINAL_CHANGED로 canApprove:false, 강제 승인 시 APPROVE_BLOCKED_BY_HARD였다. 이후 변경된 원본을 새 커밋으로 확정하자 번역이 original 사유로 stale이 됐으며 영어 파일은 자동 덮어쓰기되지 않았다. 배포 예시의 원본은 변화가 없었다. 회귀 테스트의 원본 변경·바인딩·판본 혼동·재시도 공격 사례도 통과했다.

## 배포 보완

예시 builder에 language/variant 및 읽기용 제목 매핑을 추가했다. 기존 기본 main/ko는 유지한다. 영어 README·상태 안내·영어 기본 갤러리와 en Web/EPUB 언어 메타데이터를 지원한다. 제목 매핑은 파생 읽기본에만 적용하며 봉인된 원본 기록은 바꾸지 않는다.

Studio는 아직 main 원고만 보여 준다. 번역본 갤러리·README·Studio 상단에 이 제한을 표시했다. UI 언어 선택은 원고 번역과 별도다. 그림책 삽화 두 장의 브라우저 실제 로딩, 영어 단편·안내서·번역 본문, 여덟 장면 목차 및 열쇠의 Theo → Mara → Theo → surveyor 상태를 화면에서 확인했다.

ZIP 5개와 내부 EPUB의 CRC, manifest 파일 hash/크기, en metadata, 번역 원본 바인딩·문단 수를 확인했다. 패키징은 원본 hash를 복사 전후 대조하고 호스트 경로·자격 증명·캐시·잠금 파일을 제외하는 기존 경계를 그대로 사용한다.

검증: 관련 backend 회귀 테스트 33개, viewer 테스트 67개 통과. lint/typecheck/Studio build 통과. 변경 범위 밖의 전체 부하·모델 다운로드 검증은 이번에 재실행하지 않았다. 기존 GitHub hosted runner 제한은 해결됐다고 간주하지 않는다.

기존 v0.1.0 엔진 tarball·태그와 한국어 예시는 덮어쓰지 않는다. 영어 예시와 별도 영어 checksum/provenance 파일을 같은 릴리스에 추가하며 npm 또는 새 엔진 버전은 게시하지 않는다.
