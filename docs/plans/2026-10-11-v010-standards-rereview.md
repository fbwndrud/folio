# v0.1.0 Standards 재검토

대상: `e7516d1` 이후 변경과 신규 파일. 최초 검토는 읽기 전용으로 진행했고 합성 임시 fixture로 두 파일 보존 문제를 재현했다. 이후 리뷰 담당자가 라이선스 수집기를 직접 구현했다. 따라서 아래 라이선스 검증은 구현자의 자기검증이며 독립 재검토로 계산하지 않는다. 출력 경계·실패 보존 보완은 다른 담당자가 작성한 코드를 재검토했다.

## 최초 지적과 판정

| 지적 | 최초 근거·재현 | 보완·재검토 판정 |
|---|---|---|
| P1: 정적 번들의 제3자 라이선스 누락 | `NOTICE`의 “None is included yet”, `viewer/dist`와 예시 Studio에 종속 코드 LICENSE/NOTICE 없음 | 구현됨. `scripts/viewer-notices.js`가 실제 emitted chunk.modules에서 패키지를 수집한다. 이름·버전·라이선스·공개 패키지 URL·상위 원본 URL·전체 LICENSE/NOTICE를 `THIRD-PARTY-NOTICES.txt`로 만든다. 별도 독립 검토 필요. |
| P1: 빌드 실패가 외부 파일까지 재귀 삭제 | 없는 distDir로 빌드, 출력 생성 뒤 `author-note.txt` 추가 → 실패 후 파일 소실 | 해소. `scripts/example-bundle.js`의 실패 경로는 출력 전체를 보존하고 경로를 알린다. 새 테스트에서 외부 추가 파일 보존 확인. |
| P1: 출력 부모 링크로 원본 안에 쓰기 | 외부 링크가 원본을 가리키고 링크 아래 release 출력 → 성공하며 원본 안에 catalog 생성 | 해소. `scripts/example-output.js`가 원본과 출력 부모의 realpath로 경계를 검사한다. 부모 dev/ino와 실제 경로도 재확인한다. 원본 스냅샷 불변 및 release 폴더 미생성 테스트 통과. |

파일 경계는 같은 사용자 권한의 적대적 프로세스가 매 시스템 호출 사이에 경로를 교체하는 상황 전체를 막는 보안 서비스로 간주하지 않는다. 출력 실패 시 자동 정리 대신 부분 결과를 남기는 것은 파일 보존을 위한 동작이다.

## 실제 라이선스 빌드

`npm --prefix viewer run build`는 18개 포함 패키지의 고지를 35.79KB 파일로 생성했다. 미포함 의존성과 Vite 빌드 도구는 고지 대상에 섞이지 않는다. React, React DOM, scheduler, use-sync-external-store, @xyflow/react, @xyflow/system, classcat, zustand, d3 구성 요소와 elkjs를 포함한다. 전체 라이선스가 없으면 빌드가 실패한다. elkjs 버전 변경 시 원본 제공 위치를 다시 검증해야 빌드가 진행된다.

- [elkjs 0.12.0 공식 릴리스](https://github.com/kieler/elkjs/releases/tag/0.12.0)는 ELK 0.12.0 기반임을 명시한다. 태그의 원본 commit은 `ff5771d7165445c42c408bb8a090c8035272218c`다. 해당 commit의 package.json 버전·라이선스와 설치본을 확인했다.
- [elkjs 원본](https://github.com/kieler/elkjs/tree/ff5771d7165445c42c408bb8a090c8035272218c)의 LICENSE.md는 설치본과 바이트 단위로 같았다. SHA-256: `637e81f4a1b6b4079535c499fca05e238cf7605c1ff5b76d60d7da7ce96700c9`.
- [ELK v0.12.0 공식 릴리스](https://github.com/eclipse-elk/elk/releases/tag/v0.12.0)의 source commit은 `323312916048544e4e594eab3303cdb0d01e2929`다. [ELK 원본 위치](https://github.com/eclipse-elk/elk/tree/323312916048544e4e594eab3303cdb0d01e2929)를 고지에 포함했다.
- EPL-2.0 선택, ELK 원본 미수정, 번들링·축소에 따른 배포 형식 변경을 고지한다. 이 정보는 모델 실행이나 네트워크 요청 없이 빌드에 포함된다. 원본 URL 검증만 일회성 조사로 수행했다.

`server/view/static.js`와 ZIP의 `scripts/example-preview.mjs`는 txt를 text/plain으로 제공한다. 기존 경로 범위·링크·순회 차단은 유지한다. `exportViewer`가 dist의 고지를 복사하므로 정적 Studio와 예시 ZIP manifest에도 포함된다. 실제 npm 설치본의 검증은 부모의 최종 package:verify에서 확인한다.

## 실행한 검증

- `node --test test/scripts/viewer-notices.test.js test/scripts/example-bundle.test.js test/scripts/example-safety.test.js test/server/export-preview.test.js`: 17개 통과.
- 라이선스 5개 테스트: 실제 선택 모듈만 수집, 중첩 패키지·중복 모듈·전체 고지 보존, 누락 시 실패, ELK 버전 변경 시 실패, 서버 경로 보호, Studio와 배포 manifest까지 고지 전달.
- `npm run lint`, `npm run typecheck` 통과.
- `git diff --check` 통과. 신규 라이선스 구현 73줄, 신규 테스트 92줄. 실제 작품·생성 이미지는 Git에 추가하지 않았다.

Standards의 기존 파일 보존 지적 2건은 재현 경로가 차단되어 해소됐다. 라이선스 지적은 구현과 자기검증을 완료했고 별도 리뷰어의 확인 대상으로 남긴다. 전체 기능 품질·외부 CI·공개 릴리스 성공을 이 집중 재검토만으로 선언하지 않는다.
