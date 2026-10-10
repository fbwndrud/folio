# Folio 아키텍처 독립 비판

> 착수 시점의 조사·설계 기록이다. 이후 실제 구현과 검증은 [실행 기록](execution-report.md)을 확인한다.
검증일: 2026-10-08. 기준 코드 d60466a. 독립 reviewer `general_arch_harsh`의 결과다.
현황 조사자도 별도로 조사했고, 주 담당자가 아래 다섯 재현 사례를 다시 실행했다.
H1/H2/H3/H5는 reviewer의 독립 발견, H4는 H3 실험의 별도 실패,
H6는 현황 조사자가 발견한 뒤 reviewer가 교차검증한 사항이다.
현재 결함은 High 5건·Medium 1건이며 Critical 현재 결함은 확정하지 않았다.
설계 위험의 심각도는 현행 결함과 별도로 표시한다.

## 현재 결함

### H1 High 중단 복구가 새 사용자 편집을 덮어씀

근거: `core/run/commit.js:112–114`, `core/run/steps/commit-step.js:79–82`,
`core/run/recommit-plan.js:59–64`, `core/store/tree.js:95–99`.
영수증이 먼저 기록되면 재개는 새 파일 hash를 대조하지 않고 승인 본문을 다시 쓴다.
`human_edit_recovery`에서 before=human edit after crash, status=done, after=계단참 본문이었다.
실제 runner와 중단 hook를 사용한 합성 재현이며 실제 작품은 변경하지 않았다.

영향은 새 편집의 손실이다. `test/run/commit.test.js:93`과 `test/run/resume.test.js:35`는
중단 뒤 편집 없는 멱등 재개만 검사한다. 승인 hash를 유지하는 규칙은 새 편집을 덮으라는 권한이 아니다.
권고: durable write intent에 before/after 전체 파일 hash를 결속하고 복구 시 충돌로 멈춘다.

### H2 High 기록장 검증과 append의 행 종료 계약 불일치

근거: `core/ledger/ledger.js:38`, 74행. 완전한 JSON tail에 newline이 없으면 verify는 정상이다.
다음 append는 구분자 없이 JSON을 붙이고 seq 2 성공을 반환한 뒤 verify가 파손을 보고한다.
`ledger_tail`의 출력은 before ok=true, append seq=2, after ok=false/line=1이었다.
newline 1 byte 제거로 재현했다. 실제 OS kill로 이 tail이 생기는 확률을 입증한 것은 아니다.

`test/core/ledger.test.js:49`는 잘린 JSON, 110행은 뒤처진 head를 다루지만 이 조합은 없다.
권고: 완전한 tail의 종료 보완 또는 쓰기 전 거부를 명시한다. 불완전 JSON은 보존하고
오류로 멈추며 정상 이력을 지우는 자동 truncation을 하지 않는다.

### H3 High 관리 자산과 SQL 조회 계약 불일치

근거: `core/assets/records.js:70`은 path=null, `core/index/schema.js:13`은 assets.path NOT NULL,
`core/index/rebuild.js:63–65`는 그 값을 삽입한다. `server/tools/find.js:54`가 재구성을 호출한다.
`managed_index`: 자산 전 query 성공 → folio_assets add 성공 → query가
INTERNAL_ERROR / NOT NULL constraint failed: assets.path로 실패했다.
설명서만 추가해도 발생하고, 조회 대상이 그 자산을 사용하지 않아도 전체 조회가 실패한다.

실제 Toolbox 도구 handler를 호출했으며 stdio transport까지 재현한 것은 아니다.
권고: 경로를 선택값으로 처리하고 저장 종류·판본을 보존한다. 가짜 경로를 만들지 않는다.
managed subject null path 테스트가 있다는 사실로 managed asset 조합 검증을 대체하지 않는다.

### H4 Medium 실패한 재구성이 정상 조회 DB를 먼저 제거

근거: `core/index/rebuild.js:29–31`, 97–99행. 기존 DB 삭제 후 새 DB를 만들므로
ROLLBACK은 기존 DB를 복원하지 않는다. H3 직후 nodes=0이었다.
현황 담당의 별도 합성 duplicate eventId fault에서도 nodes=11 → UNIQUE 오류 → nodes=0이었다.
이는 공개 commit이 중복 eventId를 허용한다는 주장이 아니다.

`test/core/index.test.js:63`, 74행은 성공 재구성을 다룬다.
권고: 새 generation을 따로 완성·검증·닫은 뒤 공개한다. 실패는 이전 generation을 유지하고
최신성 부족을 명시한다. 이전 DB가 남았다는 이유로 최신 결과라고 표시하지 않는다.

### H5 High 살아 있는 기록자의 잠금을 시간만으로 탈취

근거: `core/run/work-lock.js:25–29`, 49–53행. PID가 살아 있어도 10분이 넘으면 stale이다.
heartbeat/fencing 없이 다른 프로세스가 들어간다. `core/ledger/ledger.js:20–24`는
다중 프로세스 직접 append 직렬화를 지원하지 않는다.
`live_lock_timeout`: holder callback 안에서 자식 Date.now에 +600001ms 주입 → child exit 0·동시 진입.
실제 holder PID와 잠금 파일은 조작하지 않았다. 실제 hash chain 손상은 이 실험의 결론이 아니다.

권고: 로컬 단일 기록자는 살아 있는 PID를 TTL만으로 탈취하지 않는다.
lease 방식은 heartbeat와 모든 쓰기의 fencing 검증을 함께 설계해야 한다.
죽은 기록자의 복구와 시계 변화·PID 재사용도 별도 검사한다.

### H6 High 미발행 사건이 정상 사건 조회에 노출

근거: `core/run/commit.js:116–120`, `core/ledger/events.js:2–4`,
`core/index/rebuild.js:74–77`, `core/index/query.js:36–41`.
`prepared_event`: afterEventsWrite 중단 → receipt types=['receipt'] →
events 조회가 ev-prepared를 반환했다. final commit marker는 없다.
중단은 내부 hook, 조회는 실제 find handler다.

`test/run/committed-without-record.test.js:15`의 완료 기준과 사건 활성 기준이 다르다.
반면 `core/tracking/snapshots.js:5–10`은 commit·현재 본문 hash를 결속한다.
권고: 이벤트와 retraction의 authoritative visibility를 final marker로 결정한다.
prepared 조회는 별도 상태로 제공한다. 임의 seed/legacy 기록은 명시적인 이행 규약이 필요하다.

## 신규 설계 갭

### H7 High Projection checkpoint 계약 부재

`core/index/schema.js:2`에 generation/input checkpoint/build status가 없고,
신규 설계의 ResourceProjection rebuild/query만으로 여러 계층의 판본 일치를 판단할 수 없다.
현재 사용처/사건 조회는 동기 재구성이므로 이미 eventual consistency라는 주장도 틀리다.
실험: SQL=A, Vector=B, Graph=A를 latest/atRevision A/requireFresh로 조회한다.
불일치를 정상적인 단일 판본 결과로 합치면 실패다.
권고: publication checkpoint·입력 manifest·Projection 판본·조회 최신성 규약을 먼저 정한다.

### H8 High 자율성 모드와 위임 권한의 수명 부재

현재 `core/tracking/authority.js:5`는 특정 계획의 추가 권한이다. 범용 Policy/actor/action/scope/
expiry/revocation이 없다. 절대 root 확인은 인증 계약이 아니다(`server/toolbox.js:28`).
신뢰하는 단일 로컬 호스트의 현재 결함으로 분류하지 않는다.
실험: A의 표현 수정 위임으로 B의 원본 선택·정의 변경·발행·삭제를 요청한다.
철회 뒤 늦은 응답·중단 복구도 거부돼야 한다.
권고: 모드와 강제 잠금을 분리하고 원본 선택·결과 발행·정의 변경 권한을 구분한다.

### H9 Medium 외부 참조의 미확인과 변경 및 소실 구분

`core/assets/files.js:85`는 URI를 reference_only로 표시한다. 솔직한 현재 동작이며 버그가 아니다.
`test/server/assets-tool.test.js:23`은 URI-only 승인을 막는다.
범용 Hybrid에서는 reported revision/실제 관측/보존 hash/관측 시각을 분리해야 한다.
실험: 합성 connector에서 A→B→404/권한 철회를 반환하고 unknown/changed/unavailable을 구분한다.
관측하지 않은 참조를 unchanged/current로 표시하면 실패다.

### H10 Medium 관측 누락과 실행 완료 구분

`core/run/steps/commit-step.js:63`, `core/run/run-store.js:27`은 부가 기록 실패를
mutable run.history에 남긴다. 기존 결정과 `test/run/extract-occurrences.test.js:132`가 허용한 동작이다.
범용 계약에서는 미관측/실패/누락/보존 실패를 durable trace와 조회에서 구분해야 한다.
실험: host 미보고·도구 오류·trace 저장 실패·이미 완료된 결과를 각각 반환한다.
권고: ExecutionPlan과 ObservedExecution을 분리하고 관측 수준·누락·보고자를 기록한다.

## 재현 방법

Node 24로 기준 checkout 루트에서 아래 코드를 임시 `.mjs` 파일에 저장하고 실행한다.
실제 원고를 입력하지 않는다. helper는 합성 fixture 사본을 임시 폴더에 만들고 종료 시 정리한다.
모든 사례 실행은 `node <임시파일> all`, 개별 사례는 마지막 인자로 코드의 case 이름을 준다.
로그는 성공 조건이 아닌 현재 실패 동작의 증거다. 원하는 수정 후 결과는 [계획](implementation-plan.md)에 있다.

```javascript
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const base = process.cwd();
const imp = (p) => import(`${base}/${p}`);
const { copyFixture, tempDir, useFakePack, fakePacks } = await imp('test/support/fixtures.js');
const { openLedger } = await imp('core/ledger/ledger.js');
const { openWork } = await imp('core/store/work.js');
const { updateNode } = await imp('core/store/tree.js');
const cases = {
  async managed_index() {
    const { createToolbox } = await imp('server/toolbox.js');
    const { parseYaml, stringifyYaml } = await imp('core/util/yaml.js');
    const { openIndex } = await imp('core/index/query.js');
    const root = await copyFixture('novel-3level'); await useFakePack(root);
    const c = parseYaml(await readFile(join(root,'work.yaml'),'utf8')); c.features = { ...c.features, assets: true };
    await writeFile(join(root,'work.yaml'),stringifyYaml(c));
    const t=createToolbox({packs:fakePacks()}); const call=(name,args)=>t.call(name,{root,...args});
    console.log('query before asset', (await call('folio_find',{query:'usages',id:'junho'})).ok);
    console.log('add asset', (await call('folio_assets',{op:'add',id:'toy-image',brief:{description:'합성'}})).ok);
    console.log('query after asset',await call('folio_find',{query:'usages',id:'junho'}));
    const db=openIndex(root);console.log('old index nodes after failure',db.prepare('select count(*) as n from nodes').get());db.close();
  },
  async human_edit_recovery() {
    const { createRunner } = await imp('core/run/runner.js');
    const { createFakeHost,driveToEnd } = await imp('test/support/fake-host.js');
    const root=await copyFixture('novel-3level');await useFakePack(root,{overrides:{approve:{mode:'auto'}}});
    const runner=hooks=>createRunner({root,packs:fakePacks(),hooks});const host=createFakeHost();
    const trail=await driveToEnd(()=>runner(),host,{start:{node:'stairwell'},until:o=>o.status==='needs_model'&&o.requests[0].stepId==='critic'});const o=trail.at(-1);
    try{await runner({afterBodyWrite(){throw Error('synthetic crash')}}).resume({runId:o.runId,answers:host.answer(o)});}catch(e){console.log('interruption',e.message);}
    const w=await openWork(root);await updateNode(root,w.tree.nodes.get('stairwell'),{body:'human edit after crash'});
    console.log('before recovery',(await openWork(root)).tree.nodes.get('stairwell').body);
    console.log('recovery status',(await runner().run({node:'next'})).status);
    console.log('after recovery',(await openWork(root)).tree.nodes.get('stairwell').body);
  },
  async live_lock_timeout() {
    const { withWorkLock } = await imp('core/run/work-lock.js');const root=await tempDir();
    await withWorkLock(root,async()=>{
      console.log('holder PID alive',process.pid);
      const code=`import {withWorkLock} from ${JSON.stringify(`${base}/core/run/work-lock.js`)}; const realNow=Date.now; Date.now=()=>realNow()+600001; await withWorkLock(${JSON.stringify(root)},()=>console.log('second writer entered while holder is alive'));`;
      const c=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
      console.log('child exit',c.status,'stdout',c.stdout.trim(),'stderr',c.stderr.trim());
    });
  },
  async ledger_tail() {
    const l=openLedger(await tempDir(),'events');await l.append({type:'event',eventId:'e1'});
    const text=await readFile(l.path,'utf8');await writeFile(l.path,text.slice(0,-1));
    console.log('before append verify',await l.verify());console.log('append returns seq',(await l.append({type:'event',eventId:'e2'})).seq);console.log('after append verify',await l.verify());
  },
  async prepared_event() {
    const { fakePack } = await imp('test/support/fake-pack.js');
    const { makeReceipt,recordDecisions } = await imp('test/support/receipts.js');
    const { resolvePipeline } = await imp('core/pipeline/define.js');
    const { commitNode } = await imp('core/run/commit.js');
    const { findInWork } = await imp('server/tools/find.js');
    const root=await copyFixture('novel-3level');const pipeline=resolvePipeline(fakePack.pipelines.leaf,{});
    const ledgers=Object.fromEntries(['receipts','events','decisions'].map(n=>[n,openLedger(root,n)]));
    const receipt=makeReceipt({nodeId:'stairwell',text:'synthetic prepared',pipeline,events:[{eventId:'ev-prepared',entityId:'junho',kind:'state',data:{prepared:true}}]});await recordDecisions(ledgers.decisions,receipt);
    try{await commitNode({root,work:await openWork(root),ledgers,pipeline,receipt,text:'synthetic prepared',hooks:{afterEventsWrite(){throw Error('synthetic crash')}}});}catch(e){console.log('interruption',e.message);}
    console.log('receipt ledger types',(await ledgers.receipts.readAll()).map(r=>r.type));console.log('public events query',await findInWork(root,{query:'events',id:'junho'}));
  }
};
const chosen = process.argv[2] ?? 'all';
for (const name of chosen==='all' ? Object.keys(cases) : [chosen]) { console.log(`CASE ${name}`); await cases[name](); }
```

비결정적 생성 품질·실제 장시간 처리·정전 durability·타 OS·여러 호스트는 이 재현의 범위가 아니다.

## 최종 설계 대조의 추가 지적

독립 reviewer의 두 번째 읽기에서 D1 source-selection/publication의 checkpoint 연결,
D2 고정 정책과 현재 위임 철회 구분, D3 seed 강제 이행과 무이행 호환 충돌,
D4 복구 충돌 후 skip 경로 누락을 지적했다. 모두 설계/계획 갭이며
현재 결함의 심각도나 재현 결과를 바꾸지 않는다. 반영은 [수용 판정](review-rebuttal.md)에 기록했다.
