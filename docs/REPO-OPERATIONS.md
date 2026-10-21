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

## Production 검증은 아직 분리해야 함

- SHA `bba8176`의 [Production Smoke](https://github.com/dohyunkimmm/mosigo/actions/runs/39617978212)는 **실패**했습니다. 당시 30회 시도 동안 Production이 이전 SHA `30753eda`를 반환했고, 기대 SHA와 불일치했습니다.
- 이후 Vercel 배포 목록에서는 SHA `bba8176`의 Production deployment **READY**가 확인됩니다([Vercel 배포](https://vercel.com/dohyunkimm/mosigo/HapuH5E9XpckTsVkWwSTAbM3HxfV)). 이는 **해당 실패 Smoke가 사후 성공으로 바뀌었다는 뜻이 아닙니다**.
- 운영 사이트에서 현재 SHA를 확인하고 **Production Smoke를 재실행**해 통과 로그를 남기기 전에는 최종 배포 스모크 완료로 기록하지 않습니다.

## 미완료 — 플랫폼 WAF

[#80](https://github.com/dohyunkimmm/mosigo/issues/80): `POST /api/account`에 플랫폼 수준 분산 rate-limit(제안: IP별 20회/5분)을 설정하고 초기 `log`/관측 → 점진적 차단으로 전환해야 합니다. PR #79의 인스턴스 메모리 `Map` 제한은 인스턴스 간 전역 보호가 아닙니다. **Vercel Firewall 적용 및 다중 인스턴스 검증은 미완료**로 취급합니다.

## 운영 시 유의

- `production-smoke`는 배포 뒤 실행하므로 PR 필수 검사 목록에 넣지 않습니다. 실패는 별도 운영 후속 조치로 추적합니다.
- 인증 rate-limit은 공유 IP 사용자 영향과 서버리스 인스턴스 간 경계를 측정한 후 운영에 반영합니다.
- 영상을 제거하거나 경로를 변경하지 말고 실제 재생·재시도·모바일 네트워크 체감을 확인합니다.

## 관련 저장소

[footmate 운영 현황](https://github.com/dohyunkimmm/footmate/blob/main/docs/REPO-OPERATIONS.md) · [onboardos 운영 현황](https://github.com/dohyunkimmm/onboardos/blob/main/docs/REPO-OPERATIONS.md)
