# 팩 코드 변경과 digest

팩 digest는 열린 실행에 답이 요청 당시의 팩과 맞는지 확인하는 데 쓰인다.
검사별 digest는 커밋된 원고가 지금 검사 정의로 검증됐는지 확인하는 데 쓰인다.
digest는 코드 서명이나 외부 팩의 안전성 인증이 아니다.

## 파일 팩

`loadYamlPack(dir, { checkers })`는 다음을 묶는다.

- `pack.yaml`, 참조하는 프롬프트·검사 지시 글, 등록한 검사 함수의 소스.
- 팩 폴더 안 모든 `.js`·`.mjs`·`.cjs`·`.json` 파일의 상대 경로와 바이트 hash.
- 선택적으로 선언한 `checkerInputs`.

보조 코드의 추가·삭제·변경도 반영한다. 파일 생성 순서와 팩의 절대 위치는 반영하지 않는다.
이 방식은 보수적이다. 검사 하나와 무관한 코드가 바뀌어도 같은 팩의 결정론 검사가
재검사 대상으로 표시될 수 있다. README 변경만으로는 코드 digest가 바뀌지 않는다.
팩 안의 심볼릭 링크는 거부한다.

팩 밖의 보조 코드·설정은 작성자가 각 검사 이름의 입력에 명시한다.
아래 `rulesSourceHash`는 실제로 실행하는 외부 파일의 내용 hash여야 한다.

```js
await loadYamlPack(dir, {
  checkers: { 'numbers-match': numbersMatch },
  checkerInputs: {
    'numbers-match': { rulesSourceHash, decimalPlaces: 2 },
  },
});
```

검사 이름 오타나 잘못된 입력 맵은 거부한다. 입력이 실제 동작에 맞게 선언됐는지는
JS 코드를 등록하는 작성자의 책임이다. 외부 모듈을 자동 탐색하거나 함수를 실행해
digest를 만들지 않는다. 선언 입력은 함수 소스를 대체하지 않는다.

## 프로그램 방식 JS 팩

JS는 임의 함수의 숨은 클로저 값을 노출하지 않는다. 그러므로 함수가 캡처한 값과
보조 함수는 `digestInputs`에 함께 둔다. 선언한 객체는 실행 동안 바꾸지 않는다.

```js
function makeLimitCheck(limit) {
  return {
    id: 'demo.limit', tier: 'deterministic', stage: 'facts', severity: 'advisory',
    digestInputs: { limit },
    run(ctx) {
      return ctx.value > limit ? [{ code: 'LIMIT', message: '범위 초과' }] : [];
    },
  };
}
```

검사 내부의 보조 함수는 그 함수와 함수가 사용하는 상수·외부 내용 hash도 선언한다.
팩의 `prompt`가 캡처하는 값은 **팩 객체의** `digestInputs`에 둔다.
선언하지 않은 클로저 변경은 감지할 수 없다. 팩 객체의 `digest` 값을 고정해도
나머지 내용 hash를 대신할 수 없다. 바인드·네이티브 함수는 소스를 읽을 수 없어 거부한다.

## 변경 후 동작

코드를 바꾼 뒤 호스트의 MCP 서버를 재시작한다.
열린 모델 요청은 `ANSWER_STALE`로 거부되고 `folio_run`이 새 요청을 만든다.
커밋된 원고는 `folio_status.recheck`에 나타난다.
재검사를 끝내면 새 검사 기록이 추가되며 기존 기록과 본문은 그대로 보존된다.
기존 영수증을 새 digest로 고쳐 쓰지 않는다.
