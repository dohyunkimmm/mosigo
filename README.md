# 모시고 (Mosigo)

자녀가 부모님의 병원 이용을 대신 준비하고, 병원 탐색부터 동행 매니저 매칭·동의/결제·실시간 동행·건강 리포트·재예약까지 이어지는 흐름을 검증하기 위한 인터랙티브 병원동행 서비스 프로토타입입니다.

- **Current stable version:** `v14.0.0`
- **Live Demo:** https://mosigo-nine.vercel.app/
- **Operations Workspace:** https://mosigo-nine.vercel.app/ops.html
- **Production:** `main` only · Quality + Production Smoke verified

## 프로젝트 개요

모시고는 병원동행 서비스의 핵심 사용자 여정을 한 번에 체험할 수 있도록 만든 모바일 중심 프로토타입입니다. 경쟁 앱 7종과 사용자 리뷰 118건을 분석해 지역 서비스 공백, 본인 신청 중심 구조, 매니저 정보 부족 등의 반복 불편을 정리하고 화면 흐름에 반영했습니다.

주요 사용자 흐름은 다음과 같습니다.

`가입·건강 연동 → 병원 탐색 → 매니저 매칭 → 동의·결제 → 실시간 동행 → 건강 리포트 → 재예약·혜택`

v14에서는 기존 사용자용 모바일 프로토타입을 대체하지 않고, v13 Account Ownership과 v12 Secure Sharing 계약을 재사용하는 별도 Operations workspace를 `/ops.html`에 추가했습니다.

> 이 프로젝트는 실제 의료·예약 서비스를 제공하는 운영 서비스가 아니라 서비스 기획과 UX 흐름을 검증하기 위한 프로토타입입니다. 조직/팀 멀티테넌시, RBAC, billing, 운영자 배정, 결제 정산, 실제 의료 백오피스는 구현 범위에 포함되지 않습니다.

## 현재 구현 범위

### 사용자 경험
- 병원 검색 및 진료과·증상 필터
- 동행 매니저 비교·매칭
- 민감정보 동의 및 결제 흐름
- 예약 상태·동행 진행 타임라인
- 건강 리포트와 재예약 흐름
- 동일 기기 예약 복원 및 탭 간 상태 coordination

### 예약·공유·계정
- 서버 검증 기반 booking lifecycle command API
- revision 및 server-validated lifecycle history
- Private Vercel Blob 기반 durable canonical booking persistence
- booking ID + recovery key 기반 durable recovery
- URL fragment 기반 portable recovery handoff
- 만료·폐기·회전 가능한 server-validated secure share capability
- HttpOnly/Secure 계정 세션 기반 booking ownership 및 cross-device 내 예약 목록
- revision + ETag compare-and-swap 기반 stale write 충돌 방지

### Operations workspace
- `/ops.html` 운영 개요 / 예약 운영 / 계정·보안 정보 구조
- 소유 예약·예정 예약·활성 공유·오늘 일정 지표
- 예약 검색·일정 필터·desktop table·mobile card·상세 drawer
- 계정 소유 예약의 secure share 발급·상태 확인·폐기
- 기존 `/api/account`, `/api/bookings`, `/api/booking-shares` 계약만 사용

## 현재 소스 구조

과거 v4~v13 기능은 삭제된 것이 아니라 **역할 기반 `src/runtime/` 구조로 통합**되었습니다. 앞으로는 새 버전마다 `v15-*.js` 같은 파일을 추가하지 않고 기능 단위 모듈을 확장하는 것을 기준으로 합니다.

```text
src/
├─ index.html
├─ index-core.js
├─ new_ext-pages.js
├─ index-post.js              # stable browser entry
├─ booking-state.js           # browser + Node 공용 booking state contract
├─ runtime/
│  ├─ boot.js                 # current runtime bootstrap + legacy request mapping
│  ├─ post-ui.js
│  ├─ hospital-search.js
│  ├─ booking-runtime.js
│  ├─ booking-sync.js
│  ├─ booking-recovery.js
│  ├─ booking-trace.js
│  ├─ booking-coordination.js
│  ├─ booking-durable.js
│  ├─ booking-handoff.js
│  ├─ booking-handoff-ui.js
│  ├─ booking-sharing.js
│  ├─ booking-sharing-ui.js
│  ├─ account-ownership.js
│  ├─ account-ui.js
│  └─ account-ui.css
├─ api/
│  ├─ account.js
│  ├─ booking-shares.js
│  ├─ bookings.js
│  ├─ health.js
│  └─ hospitals.js
├─ lib/
│  ├─ account-store.js
│  ├─ booking-service.js
│  ├─ booking-share-store.js
│  ├─ booking-store.js
│  └─ hospital-query.js
├─ ops.html
├─ v14-ops.js
├─ v14-ops.css
└─ vercel.json
```

`booking-state.js`는 버전별 브라우저 파일이 아니라 `src/lib/booking-service.js`에서도 직접 사용하는 공용 상태 계약이므로 `src/` 루트에 유지합니다.

### Runtime bootstrap

현재 브라우저 진입은 다음 구조를 사용합니다.

`index.html → index-core.js / new_ext-pages.js / index-post.js → runtime/boot.js → runtime/post-ui.js → 역할 기반 runtime 모듈`

`runtime/boot.js`는 기존 확장 레이어가 요청하는 과거 파일명을 현재 역할 기반 파일로 매핑합니다. Production의 기존 공개 asset URL도 `src/vercel.json` rewrite로 호환성을 유지합니다. 즉 소스 트리는 정리됐지만 기존 링크나 Production Smoke 계약은 깨지지 않습니다.

## API 계약 버전

소스 파일 구조와 API schema 버전은 별개입니다. 아래 버전 번호는 **현재도 유지되는 서버 계약 식별자**이며 오래된 파일을 뜻하지 않습니다.

| API | 현재 계약 | 역할 |
| --- | --- | --- |
| `/api/hospitals` | `v4` | 병원 검색 prototype contract |
| `/api/bookings` | `v10` | durable canonical booking resource |
| `/api/booking-shares` | `v12` | expiring/revocable secure sharing |
| `/api/account` | `v13` | account ownership + HttpOnly session |
| `/ops.html` | `v14` workspace | account-owned booking operations UI |

## 보안·데이터 원칙

- durable booking은 Private Vercel Blob에 저장합니다.
- recovery key와 share token의 raw 값은 서버 durable record에 저장하지 않습니다.
- share token은 recipient 브라우저에서 `sessionStorage` 범위로만 유지합니다.
- account session은 HttpOnly · Secure · SameSite=Lax cookie를 사용하며 브라우저 JavaScript가 세션 토큰을 읽지 않습니다.
- portable recovery/share credential은 query string이 아니라 URL fragment를 사용하고 복구 전에 `history.replaceState`로 제거합니다.
- stale durable write는 revision + ETag compare-and-swap 정책으로 거부합니다.

## QA

Repository quality gate는 Node.js 24 기준입니다.

```bash
npm test
npm run audit:source
npm run quality
```

Production 검증은 `scripts/production-smoke.js`와 `.github/workflows/production-smoke.yml`이 담당합니다. `src/`가 변경된 `main` 커밋은 Production이 해당 source commit과 일치할 때까지 확인한 뒤 live API/runtime asset을 smoke-test합니다.

현재 runtime 통합 기준:

- PR #57 Quality #118: success
- merged application-source commit: `c1e68d1f7a8e288d4fc45635c3164ec86ee157f5`
- main Quality #119: success
- Production Smoke #89: success

## 배포

- **Production branch:** `main`
- **Vercel Root Directory:** `src`
- **Production URL:** https://mosigo-nine.vercel.app/
- **Operations URL:** https://mosigo-nine.vercel.app/ops.html
- PR/feature branch의 Vercel automatic deployment는 비활성화되어 있고 `main`만 자동 배포됩니다.

## 문서 기준

문서 중복을 방지하기 위해 기준을 다음처럼 단순화했습니다.

- `README.md` — 현재 안정 버전, 현재 구조, 현재 운영/QA 기준
- `CHANGELOG.md` — v4~v14의 역사적 릴리스 이력과 당시 파일명·검증 기록
- GitHub Releases — immutable release/tag 기록

과거 README에 중복되어 있던 v10~v13 상세 릴리스 설명은 `CHANGELOG.md`로 통합했습니다. CHANGELOG의 `src/v11-booking.js` 같은 과거 경로는 당시 릴리스 이력을 보존하기 위한 기록이며, 현재 소스 경로는 이 README의 `src/runtime/` 구조를 기준으로 합니다.

## 주요 문서·링크

- Release history: [`CHANGELOG.md`](./CHANGELOG.md)
- Stable version source: [`VERSION`](./VERSION)
- Production smoke: [`scripts/production-smoke.js`](./scripts/production-smoke.js)
- Runtime source: [`src/runtime/`](./src/runtime/)

## 프로젝트 범위와 한계

모시고의 AI 추천·진료 요약·건강 지표, 결제·예약·운영 UI는 서비스 정책과 사용자 흐름을 검증하기 위한 프로토타입입니다. 실제 의료 판단, 의료기관 예약 처리, 실결제, 운영자 배정, 보험/정산, 조직별 권한 모델을 제공하지 않습니다.
