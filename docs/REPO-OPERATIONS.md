# Mosigo — 저장소 운영·보호 상태

> 점검 기준일: **2026-10-22 (KST)**. 실시간 운영 상태를 보장하는 문서가 아니라, 관측한 GitHub PR/Actions, Vercel 배포 시점의 기록입니다. 제품 버전은 [CHANGELOG.md](../CHANGELOG.md)에서 관리합니다.

## 완료한 코드·설정 변경

| 영역 | 확인한 변경 | 근거 |
| --- | --- | --- |
| 기준 코드 | `main` SHA `bba8176397836e4a0d9ebb57f0dd47af901c7609` | [main](https://github.com/dohyunkimmm/mosigo/commits/main) |
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

## 미완료 — 플랫폼 WAF

[#80](https://github.com/dohyunkimmm/mosigo/issues/80): `POST /api/account`에 플랫폼 수준 분산 rate-limit(제안: IP별 20회/5분)을 설정하고 초기 `log`/관측 → 점진적 차단으로 전환해야 합니다. PR #79의 인스턴스 메모리 `Map` 제한은 인스턴스 간 전역 보호가 아닙니다. **Vercel Firewall 적용 및 다중 인스턴스 검증은 미완료**로 취급합니다.

## 운영 시 유의

- `production-smoke`는 배포 뒤 실행하므로 PR 필수 검사 목록에 넣지 않습니다. 실패는 별도 운영 후속 조치로 추적합니다.
- 인증 rate-limit은 공유 IP 사용자 영향과 서버리스 인스턴스 간 경계를 측정한 후 운영에 반영합니다.
- 영상을 제거하거나 경로를 변경하지 말고 실제 재생·재시도·모바일 네트워크 체감을 확인합니다.

## 관련 저장소

[footmate 운영 현황](https://github.com/dohyunkimmm/footmate/blob/main/docs/REPO-OPERATIONS.md) · [onboardos 운영 현황](https://github.com/dohyunkimmm/onboardos/blob/main/docs/REPO-OPERATIONS.md)
