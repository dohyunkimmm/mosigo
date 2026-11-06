# Mosigo — 저장소 운영·보호 상태

## 2026-11-06 · 실제 운영 조회와 검증 한계

- [`main` `4c6a66c`](https://github.com/dohyunkimmm/mosigo/commit/4c6a66c0e3432103fce07202c3eacfce3709b4eb)의 Quality·Browser Experience QA·Production Smoke·Release **전부 성공**. 이 자동화 검증은 실제 iPhone/Android의 LTE/5G·네이티브 200% 확대를 증명하지 않습니다([#99](https://github.com/dohyunkimmm/mosigo/issues/99), [#128](https://github.com/dohyunkimmm/mosigo/issues/128)).
- 현재 연결된 Vercel 팀의 프로젝트 목록·직접 조회에서 과거 격리 Blob 테스트용 **`mosigo-isolated-smoke-lab` 프로젝트를 찾지 못했습니다(404)**. 조회된 운영 `mosigo` 프로젝트는 정상 존재합니다. 이는 **해당 팀/현재 권한의 조회 결과**이지 다른 팀 또는 실제 Blob 스토어/마커 전체의 삭제 증빙이 아닙니다. 기존 10월 테스트 랩 검증은 당시 스냅샷으로만 보존합니다.
- 따라서 [#88](https://github.com/dohyunkimmm/mosigo/issues/88)의 독립 소유권·실제 Blob 존재/만료 여부, 별도 백업·복원, 이전 RW 토큰 폐기와 정리 잡의 완료 여부는 확인되지 않았습니다. **운영 Blob·예약·계정/공유·스토어를 삭제하거나 변경하지 않았습니다.** 메타데이터 TTL 도달은 자동 객체 삭제가 아닙니다.

## 2026-11-06 · `main` 목록·문서·검증 상태 재점검

- **GitHub 기준선:** `main` [`8cb32b2`](https://github.com/dohyunkimmm/mosigo/commit/8cb32b25ef3f4e85bce9f7529e9259dd43ccd966) 재귀 트리(잘림 없음) **166개 파일·15개 디렉터리**. 루트 파일 6개(`.gitignore`, `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `vercel.json`), 최상위 폴더 5개(`.github/`, `docs/`, `scripts/`, `src/`, `tests/`). 이번 `tests/repo-doc-links.test.js` 추가 후에는 **167개 파일**이 됩니다. 이 수치는 기준선·변경분을 구분한 것이며, 이후 커밋에서는 재계산해야 합니다.
- **링크·안전 클렌징:** 기준선 Markdown 8개에서 확인 가능한 상대 링크 8개를 `main` 파일 트리와 대조해 누락 경로 0개. 새 `tests/repo-doc-links.test.js`는 앞으로 README·CHANGELOG·문서·PR 템플릿의 로컬 링크 누락을 `npm test`에서 감지합니다. 외부 링크 접속, 동적 자원, 실제 배포·모바일 사용성은 검사 범위가 아닙니다.
- **기존 기준선 CI:** [Quality #41950668528](https://github.com/dohyunkimmm/mosigo/actions/runs/41950668528), [Browser Experience #41950668646](https://github.com/dohyunkimmm/mosigo/actions/runs/41950668646), [Production Smoke #41950697604](https://github.com/dohyunkimmm/mosigo/actions/runs/41950697604), [Release #41950724927](https://github.com/dohyunkimmm/mosigo/actions/runs/41950724927) 모두 해당 SHA에서 성공. 신규 문서·테스트 변경의 CI는 별도로 검증해야 합니다. Production Smoke 통과는 실기기 검증이나 Blob 보관 정책 완료를 뜻하지 않습니다.
- **열린 이슈:** [#128 실제 iPhone/Android·200% 확대 접근성](https://github.com/dohyunkimmm/mosigo/issues/128), [#99 셀룰러 게임 영상 재생·복구](https://github.com/dohyunkimmm/mosigo/issues/99), [#88 격리 Blob 보존·만료·복구 가능 정리](https://github.com/dohyunkimmm/mosigo/issues/88)는 모두 미완료. [실기기 실행표](DEVICE-QA-RUNBOOK.md)와 [운영 안정화 기준](PRODUCTION-HARDENING-PLAN.md)을 우선 참고합니다.
- **보존 정책:** 운영 예약/계정/공유 데이터·Blob 및 프로토타입 미디어를 일괄 삭제하거나 이름을 변경하지 않습니다. 의심되는 중복 파일을 참조 관계 확인 없이 제거하지 않았으며, 강제 푸시·브랜치 삭제·운영 WAF/CSP 정책 변경도 이번 클렌징에 포함하지 않습니다.


> 점검 기준일: **2026-10-22 (KST)**. 실시간 운영 상태를 보장하는 문서가 아니라, 관측한 GitHub PR/Actions, Vercel 배포 시점의 기록입니다. 제품 버전은 [CHANGELOG.md](../CHANGELOG.md)에서 관리합니다.

## 완료한 코드·설정 변경

| 영역 | 확인한 변경 | 근거 |
| --- | --- | --- |
| 기준 코드 | 문서 갱신 직전 `main` SHA `69f74b6be5c726dbfdef9ed32ffa276f5692deb5` | [main](https://github.com/dohyunkimmm/mosigo/commits/main) |
| 영상 초기 로딩 / 인증 | 영상 `preload="none"`, 숨김 결과 영상의 불필요한 autoplay 제거, `POST /api/account` 인증 시도에 IP별 메모리 burst 제한(20회/5분), QA 산출물 ignore | [PR #79](https://github.com/dohyunkimmm/mosigo/pull/79) |
| 의존성 | Actions setup-node 7.1.0 및 `@vercel/blob` 2.8.2 | [PR #81](https://github.com/dohyunkimmm/mosigo/pull/81) |
| 게임 영상 바이너리 | 4개 MP4 합계 **22,075,212 → 2,715,736 bytes (약 87.7% 감소)**. 공개 파일 경로 유지; 압축 스크립트와 MP4·용량 테스트 추가 | [PR #82](https://github.com/dohyunkimmm/mosigo/pull/82) |
| 기본 브랜치 보호 | [Ruleset #22982738](https://github.com/dohyunkimmm/mosigo/settings/rules/22982738) **active**. PR 필수, 삭제/강제 푸시 금지, 최신 브랜치 검사 strict | GitHub ruleset 조회 |
| 병합 필수 CI | 정확한 검사명 `quality-checks` + `browser-journey` (기준 SHA에서 성공) | [Quality·Browser CI](https://github.com/dohyunkimmm/mosigo/actions) |

## Production Smoke 재검증 — 완료 (2026-10-22)

- **과거 실패 보존:** 코드 변경 SHA `bba8176397836e4a0d9ebb57f0dd47af901c7609`에 대한 [초기 Production Smoke](https://github.com/dohyunkimmm/mosigo/actions/runs/39617978212)는 이전 SHA `30753eda`가 30회 연속 응답해 **실패**했습니다. 이후 같은 코드의 Vercel Production deployment가 [READY](https://vercel.com/dohyunkimm/mosigo/HapuH5E9XpckTsVkWwSTAbM3HxfV) 상태가 됐습니다.
- **성공한 재검증 1:** 2026-10-22 08:18 KST, [main 문서 동기화 후 자동 실행](https://github.com/dohyunkimmm/mosigo/actions/runs/39692523744)에서 `npm run smoke:production`이 **첫 번째 시도에 성공**, 서버 `/api/health`가 `bba8176397836e4a0d9ebb57f0dd47af901c7609`를 보고했습니다.
- **성공한 재검증 2:** 2026-10-22 09:19 KST, [같은 workflow run의 재실행 attempt 2](https://github.com/dohyunkimmm/mosigo/actions/runs/39692523744/attempts/2)를 요청해 **첫 번째 시도에 성공**. 서버 `/api/health`는 최신 `main` SHA `1982bb55fba8ff5f5cc792672c932a364099346a`를 보고했습니다. [Smoke 작업 로그](https://github.com/dohyunkimmm/mosigo/actions/runs/39692523744/job/119563089058).
- 해당 workflow는 문서 전용 커밋인 경우 `EXPECTED_COMMIT`을 빈 문자열로 설정하지만, 두 실행 로그에서 실제 응답 SHA를 확인했으며 최신 실행은 당시 `main`과 일치했습니다. Smoke 스크립트는 웹 루트·보안 응답 헤더·health·병원/예약/공유/계정 API 계약과 테스트 예약 생성·전환·복구를 검증합니다.
- Vercel에는 문서 동기화 커밋 `1982bb55`의 [Production READY 배포](https://vercel.com/dohyunkimm/mosigo/5fEsKvjQpfSFf3KskiZGdrD62A3v)가 확인됩니다. **이전 실패 실행의 이력을 고치지는 않으며, 별도의 재검증 실행 성공으로 해결을 인정합니다.**

## 최신 코드·운영 일치 재검증 (2026-10-22 09:22 KST)

- 운영 근거 업데이트용 [문서 PR #84](https://github.com/dohyunkimmm/mosigo/pull/84)가 병합되어 `main` SHA `69f74b6be5c726dbfdef9ed32ffa276f5692deb5`가 됐습니다.
- 최신 SHA에 대해 [Production Smoke run #39699245529](https://github.com/dohyunkimmm/mosigo/actions/runs/39699245529) **SUCCESS**. [job 로그](https://github.com/dohyunkimmm/mosigo/actions/runs/39699245529/job/119564160722): `Production smoke passed on attempt 1; commit=69f74b6be5c726dbfdef9ed32ffa276f5692deb5`. 
- 동일 SHA의 `quality-checks`, `browser-journey`, `production-smoke`, `release` **4개 모두 SUCCESS**. Vercel 배포 `dpl_EGdgXJVC8TGanWPU62yRBfUCwQBy`도 해당 SHA로 **READY**: [배포 정보](https://vercel.com/dohyunkimm/mosigo/EGdgXJVC8TGanWPU62yRBfUCwQBy).
- 해당 workflow는 문서 전용 푸시에서는 `EXPECTED_COMMIT`을 비워 서버의 SHA와 강제 일치를 검사하지 않습니다. 여기서는 **로그에 출력된 실제 운영 서버 응답 SHA**가 당시 `main`과 일치함을 별도 대조했습니다. 따라서 기존 실패 이력을 수정하지 않고 별도의 성공 검증으로 기록합니다.
- 모바일 네트워크 영상 재생·재시도 **체감 QA는 미완료**이며 Production Smoke 성공만으로 이 검증까지 완료되었다고 말하지 않습니다.

## 2026-10-23 Vercel WAF 1단계 배포·운영 종료 기록

- **배포됨(감사 이벤트 확인):** 사용자가 Vercel 대시보드에서 `mosigo-account-rate-limit`을 설정·Publish 완료. Vercel `firewall-config-promoted` 이벤트(2026-10-23 11:26 KST)에 이 프로젝트 Firewall **version #1** 게시 및 규칙 `rule_mosigo_account_rate_limit_LfbCuR`(`active=true`, `rules.insert`) 기록이 있습니다.
- **설정 의도(사용자 입력 기준):** `POST /api/account`, IP별 **5분에 20회**, 초과 시 **Log(관찰 전용)**. Vercel API `GET /v1/security/firewall/config/active` 및 `/1`은 계속 `404 Seawall Config not found`이어서 **정확한 실제 조건·후속 액션을 API로 독립 검증하지 못했습니다**. 게시 사실은 이벤트로 확인됐습니다.
- **초기 안전성:** 설정 직후 Vercel의 이 경로에 대한 최근 30분 런타임 오류 클러스터는 없었으며 사용자가 UI상 문제없음을 확인했습니다. 해당 기간에 관련 요청이 있었는지 또는 매칭·초과 이벤트가 있었는지는 별도로 확인하지 못했습니다.
- **정리 기준:** 관찰 규칙 **게시·기본 확인 작업**은 종료합니다. 사용자 설정대로 Log 단계를 유지하며, 실제 429 차단, 공유 IP 영향, 다중 인스턴스 집계 및 실사용 트래픽 경고 동작은 **검증·적용되지 않았습니다**. 기존 PR #79의 애플리케이션 로컬 `Map` 제한도 서버리스 인스턴스 간 공유되지 않습니다.
- [운영 후속 이슈 #80](https://github.com/dohyunkimmm/mosigo/issues/80)은 1단계 종료를 기록하며, 모바일 네트워크 영상 재생·재시도 현장 QA 및 실패 CI PR의 병합 차단 재현은 **미실시 후속**으로 문서에 남깁니다. Production Smoke는 이미 최신 배포에서 성공했으며 모바일 체감 테스트까지 대체하지는 않습니다.



## 운영 시 유의

- `production-smoke`는 배포 뒤 실행하므로 PR 필수 검사 목록에 넣지 않습니다. 실패는 별도 운영 후속 조치로 추적합니다.
- 인증 rate-limit은 공유 IP 사용자 영향과 서버리스 인스턴스 간 경계를 측정한 후 운영에 반영합니다.
- 영상을 제거하거나 경로를 변경하지 말고 실제 재생·재시도·모바일 네트워크 체감을 확인합니다.

## 관련 저장소

[footmate 운영 현황](https://github.com/dohyunkimmm/footmate/blob/main/docs/REPO-OPERATIONS.md) · [onboardos 운영 현황](https://github.com/dohyunkimmm/onboardos/blob/main/docs/REPO-OPERATIONS.md)
