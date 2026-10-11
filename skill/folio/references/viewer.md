# 뷰어 (folio_view)

작가가 작품을 눈으로 보고 싶어 하면 `folio_view { root }`를 부르고, 돌려받은 `url`을 작가에게 그대로 준다. 특정 노드부터 보려면 `nodeId`를 준다.

- Resource 전용 폴더도 `folio_init` 없이 열 수 있다. **Resources**는 선택한 원본과 승인된 결과의 목록·상세·근거·자기검토·Review needed를 보여 준다. 후보는 자동 공개하지 않고, 조회가 선택·승인·metadata 갱신을 대신하지 않는다.
- 화면: 목차와 읽기(글만·그림만·섞어서, 이름을 누르면 엔티티 정의), 엔티티(정의·사용처·사건 이력·관련 그림), 영수증(노드별 단계 결과, 건너뛴 단계와 이유, 다시 확인 필요), 단계(레벨별 단계 흐름과 토글).
- M6b 화면: 관계도(엔티티와 노드, 종류별 색은 작가가 화면에서 고르고 그 브라우저에만 남는다), 떡밥 보드(약속마다 심기 → 움직임 → 해소, 오래 잠든 약속 표시), 검사 세트(읽기만 — 세트를 바꾸려면 작가가 호스트에게 말한다), 근거(자료와 걸린 주장), 블록(앵커와 참조, 깨진 참조).
- 정적 내보내기: 첫 화면의 **Export review view**가 작품 폴더의 `exports/viewer`에 화면 전체를 파일로 쓴다(읽기만 하는 화면). 정적 호스팅(웹 서버)에 올려 쇼케이스로 쓴다 — 파일을 바로 여는 `file://`로는 열리지 않는다. SVG 그림은 별도 출처의 data URL로 화면에 싣고 원본 `.svg` 파일은 내보내지 않는다. PNG 등 다른 그림은 `assets/`에 복사한다. 다시 내보내면 기존 Folio 사본을 백업한 뒤 교체하고 실패 시 복구한다. 끄려면 `features.viewerExport: false`.
- 주소는 이 컴퓨터(`127.0.0.1`)에서만 열린다. 주소에 붙은 `token`이 있어야 화면이 작품을 읽는다. 주소를 다른 곳에 올리지 않는다.
- 같은 작품을 다시 부르면 떠 있는 뷰어를 다시 쓴다(`reused: true`). 30분 동안 쓰지 않거나, 화면의 **Close viewer**, 이 MCP 서버가 끝나면 닫힌다. 닫힌 뒤에는 다시 부르면 된다.
- `built: false`면 화면 파일이 아직 빌드되지 않았다. 주소는 열리지만 안내 글만 보인다. `hint`의 명령(`npm --prefix viewer ci && npm --prefix viewer run build`)을 작가에게 알린다. 소스 setup과 tarball 설치를 구분한다. 설치본은 준비된 화면을 포함해야 하며 누락됐으면 다시 빌드한 패키지를 받는다.
- 뷰어가 work.yaml에 쓰는 것은 단계 켜고 끄기뿐이다(work.yaml `overrides.levels.<레벨>.<단계>.mode`, 끌 때 남긴 이유는 `reason`). 잠금 단계는 화면에 자물쇠만 있고, 서버도 `STEP_LOCKED`로 거부한다. 단계를 바꾸면 열린 실행은 검사부터 다시 돈다([steps.md](steps.md)).
- 작가가 뷰어를 끄고 싶으면 work.yaml `features.viewer: false`(도구가 `FEATURE_DISABLED`, 이미 떠 있는 뷰어도 다음 화면 요청에 `FEATURE_DISABLED`로 답하고 닫힌다), 읽기만 하게 하려면 `features.viewerToggles: false`. 호스트가 직접 work.yaml을 고치지 않는다.

**Export review view**의 binary Resource 원본은 포함하지 않는다. 실제 이미지의 선언된 파일 손상·누락은 내보내기 실패이며, 승인 표시와 복사 bytes는 같은 판본에 결속한다. 잠금·백업이 남거나 EXPORT_RECOVERY_REQUIRED이면 MCP 실행 파일이 속한 Folio 설치 폴더의 `docs/production.md`를 읽고 경로 확인 절차를 따른다. 복사해 설치한 이 스킬 폴더에는 그 문서가 포함되지 않는다.

## 언어와 읽는 판본

UI의 한국어·영어 선택은 버튼과 안내 문구만 바꾼다. 원고의 언어는 **읽는 판본 / Reading edition**으로 선택한다. 선언된 번역·개정·요약 판본을 고르면 구간 본문·구간 영수증·출판 미리보기와 Web/EPUB 다운로드가 같은 판본을 사용한다. 설정·추적·작품 전체 검토 정보는 원본 기준이다. 번역이 없으면 원본으로 대신 채우지 않는다. 오래된 정적 사본에는 판본 선택이 없을 수 있으므로 새 설치본에서 다시 내보낸다.

## 오류일 때

- `FEATURE_DISABLED`: 작가가 뷰어(`viewer`)를 껐다. 켤지는 작가에게 묻는다.
- `NODE_NOT_FOUND`: `nodeId`가 없다. `folio_status`나 `folio_find`로 id를 확인한다.
- `WORK_NOT_FOUND`·`WORK_INVALID`: 작품 폴더가 아니거나 열리지 않는다. 작가에게 알린다.
- 내보내기 오류: `VIEWER_NOT_BUILT`(화면을 먼저 빌드 — `hint`), `EXPORT_DIR_NOT_OURS`(`exports/viewer`에 작가 파일이 있어 덮지 않았다 — 작가가 옮기거나 지운 뒤 다시), `EXPORT_DIR_INVALID`(`exports`가 링크나 파일이다).
- 화면 안 오류(`WORK_YAML_CHANGED`: 그 사이 work.yaml이 바뀜 — 화면이 다시 읽는다, `WORK_LOCKED`: 실행이 도는 중 — 잠시 뒤 다시, `CONFIG_INVALID`: 바꾼 설정이 검증을 못 넘어 아무것도 쓰지 않음)는 작가가 화면에서 본다.
