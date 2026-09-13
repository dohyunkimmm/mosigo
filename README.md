# 모시고 (Mosigo)

자녀가 부모님의 병원 이용을 대신 준비하고, 병원 탐색부터 동행 매니저 매칭·동의/결제·실시간 동행·건강 리포트·재예약까지 이어지는 흐름을 검증하기 위한 인터랙티브 병원동행 서비스 프로토타입입니다.

- **Current stable version:** `v10.0.0`
- **Live Demo:** https://mosigo-nine.vercel.app/

## 프로젝트 개요

모시고는 병원동행 서비스의 핵심 사용자 여정을 한 번에 체험할 수 있도록 만든 모바일 중심 프로토타입입니다. 경쟁 앱 7종과 사용자 리뷰 118건을 분석해 지역 서비스 공백, 본인 신청 중심 구조, 매니저 정보 부족 등의 반복 불편을 정리하고 화면 흐름에 반영했습니다.

주요 흐름은 다음과 같습니다.

`가입·건강 연동 → 병원 탐색 → 매니저 매칭 → 동의·결제 → 실시간 동행 → 건강 리포트 → 재예약·혜택`

## 구현 범위

- 병원 검색 및 진료과·증상 필터
- 동행 매니저 비교·매칭
- 민감정보 동의 및 결제 흐름
- 예약 상태 및 세션 내 복원
- 동행 진행 타임라인
- 건강 리포트와 재예약 흐름
- 프로토타입용 병원 데이터 API
- 서버 검증 기반 예약 lifecycle command API
- 예약 revision 및 server-validated lifecycle history
- 동일 기기 탭 간 booking snapshot coordination
- Private Vercel Blob 기반 durable canonical booking persistence
- booking ID + recovery key 기반 durable recovery
- revision + ETag compare-and-swap 기반 stale write 충돌 방지

> 이 프로젝트는 실제 의료·예약 서비스를 제공하는 운영 서비스가 아니라 서비스 기획과 UX 흐름을 검증하기 위한 프로토타입입니다. v10은 canonical booking을 서버에 durable하게 저장하지만 계정 인증·사용자 소유권 모델·예약 목록/검색·실운영 의료 예약 인프라는 제공하지 않습니다. recovery key는 계정이 아니라 예약 리소스에 접근하기 위한 프로토타입 credential입니다.

## v10 Durable Booking Beta

v10은 v9의 same-device coordination과 v8의 validated lifecycle history를 유지하면서 canonical booking을 실제 서버 durable storage에 보존하는 **Durable Booking Beta**입니다.

- `/api/bookings`는 v10 `durable-booking-resource` 계약을 사용하고 Production에서 `persistence: server-durable`, `durableServerPersistence: true`, `recoveryScope: booking-key`를 제공합니다.
- canonical booking은 Private Vercel Blob에 저장되며 raw recovery key는 저장하지 않고 SHA-256 hash만 보존합니다.
- 신규 예약은 M10 ID를 사용하고 기존 M4/M6/M7/M8/M9/M10 예약 ID를 계속 수용합니다.
- `POST /api/bookings`는 durable booking과 recovery key를 생성하고, `GET /api/bookings?bookingId=...`는 booking ID와 recovery key를 사용해 canonical booking을 복구합니다.
- `PATCH /api/bookings`는 expected revision과 recovery key를 확인한 뒤 lifecycle command를 적용하고, Blob ETag compare-and-swap으로 concurrent stale write를 차단합니다.
- 기존 same-device snapshot recovery는 durable store를 사용할 수 없는 환경의 fallback으로 남아 있으며, Production에서는 durable path가 활성화되어 있습니다.
- `v10-booking.js`는 `MosigoV10BookingDurability` facade를 제공해 capability 확인, durable recovery, canonical read를 기존 booking runtime 위에 추가합니다.
- v9의 localStorage storage-event coordination, clear propagation, equal-revision conflict handling은 그대로 유지되어 같은 기기 여러 탭의 UI 상태도 계속 정렬됩니다.
- Production Smoke는 live API에서 durable capability, M10 create, recovery key, lifecycle transition, recovery, canonical GET을 검증합니다.

### Production verification

- v10 final app-source `main` commit: `00c2fad6d35f39eddce86ac01a28750e183eec1a`
- Vercel Production deployment: `dpl_EtV9X9buqmzMYhSwJjBtciy749pw`
- Deployment source verification: GitHub verified `main`
- Live capability: `server-durable`, `durableServerPersistence: true`, `serverConflictPolicy: revision-plus-etag-cas`
- Production Smoke #45: success against the final v10 app source
- v10 release/tag commit: `09be83e946c0aba4b1f958e24d10c7b22719030b`
- Final Quality #76: success
- Final Production Smoke #47: success
- Automatic Release #20: success
- GitHub Release `v10.0.0`: Release ID `387877616`, immutable, tag target matches the v10 release/tag commit

## 이전 버전

- `v9.0.0` — same-device multi-tab booking coordination과 deterministic conflict handling을 추가한 Coordinated Booking Beta
- `v8.0.0` — booking revision과 server-validated lifecycle history를 추가한 Traceable Booking Beta
- `v7.0.0` — same-device booking snapshot 복구와 서버 재검증을 추가한 Recoverable Booking Beta
- `v6.0.0` — 서버 booking command contract와 browser sync를 추가한 Pilot-ready Beta
- `v5.0.0` — Production hardening·접근성·성능 guard·Production Smoke를 갖춘 Product-ready Demo
- `v4.0.0` — 병원 검색 데이터/상태와 예약 lifecycle을 확장한 Functional Prototype
- `v3.0.0` — source 구조·유지보수성·공통 QA를 정리한 Maintainable Prototype
- `v2.0.0` — 복원·안정 기준선과 자동 QA 기반을 정립한 Stabilized baseline

버전별 세부 변경은 `CHANGELOG.md`에 누적합니다.

## 기술 구성

- HTML / CSS / JavaScript
- Leaflet
- Vercel
- Vercel Serverless Functions
- Vercel Blob (private durable booking storage)
- Node.js built-in test runner
- GitHub Actions

## 저장소 구조

```text
.
├── .github/workflows/
│   ├── quality.yml              # PR/main 자동 품질 게이트
│   ├── production-smoke.yml     # main QA 뒤 실제 Production smoke 검증
│   └── release.yml              # Production Smoke 성공 후 자동 Tag/Release 발행
├── scripts/
│   ├── source-audit.js
│   └── production-smoke.js
├── tests/
│   ├── booking-state.test.js
│   ├── booking-store.test.js    # durable store·ETag CAS 검증
│   ├── bookings.test.js         # v10 booking API contract 검증
│   ├── v10-static.test.js       # v10 runtime/static wiring 검증
│   ├── v9-coordination.test.js
│   └── ...
├── CHANGELOG.md
├── VERSION
└── src/
    ├── booking-state.js
    ├── v4-booking.js
    ├── v6-booking.js
    ├── v7-booking.js
    ├── v8-booking.js
    ├── v9-booking.js
    ├── v10-booking.js           # durable recovery/canonical facade
    ├── lib/
    │   ├── booking-service.js    # lifecycle/history/revision service
    │   └── booking-store.js      # private Blob durable store adapter
    ├── api/
    │   ├── health.js
    │   ├── hospitals.js
    │   └── bookings.js           # v10 durable booking resource handler
    ├── package.json              # runtime dependency boundary
    ├── vercel.json
    └── ...
```

## 배포와 품질 검증

- **Production branch:** `main`
- **Vercel Root Directory:** `src`
- **Production URL:** https://mosigo-nine.vercel.app/

GitHub `main`의 검증된 소스를 기준으로 Vercel Production이 배포됩니다. PR과 `main` 변경은 GitHub Quality로 검증하고, `main` 반영 후 Production Smoke가 실제 공개 runtime과 booking API를 확인합니다.

전체 로컬 품질 게이트는 다음 한 명령으로 실행합니다.

```bash
npm run quality
```

핵심 검증 범위는 병원 API, booking lifecycle/history/revision, durable Blob store, recovery credential, ETag conflict handling, v4~v10 runtime wiring, 보안 헤더, crawler discovery, 접근성, asset integrity, JavaScript syntax, stable-version consistency입니다.

Production Smoke는 실제 Production에서 `/api/health`, `/api/hospitals`, `/api/bookings`, v4~v10 runtime assets를 확인하고, v10에서는 durable create/transition/recovery/canonical read까지 실행합니다.

## Release

GitHub Release는 `main`의 Production Smoke가 성공한 뒤 `.github/workflows/release.yml`을 통해 자동 발행됩니다. Release workflow는 검증된 `main` commit에서 `npm run quality`를 다시 실행하고 `VERSION`을 읽어 동일 버전의 중복 발행을 방지한 뒤 Git tag와 GitHub Release를 생성합니다.

저장소 전체 Actions 기본 권한은 read-only로 유지하며 Release workflow에만 `contents: write` 권한을 제한적으로 부여합니다.

## 로컬 확인

정적 화면만 확인할 경우 `src/`를 로컬 정적 서버로 열면 됩니다.

```bash
cd src
python -m http.server 8000
```

`/api/hospitals`, `/api/health`, `/api/bookings`와 durable Blob path까지 동일하게 확인하려면 Vercel 개발 환경과 연결된 Storage 설정이 필요합니다.

## 버전 전략

Mosigo는 기존 안정 동작을 유지하면서 버전별로 점진적으로 고도화합니다. 각 메이저 버전은 `QA → main merge → Vercel Production 검증 → README/CHANGELOG/VERSION sync → 자동 Tag/Release → Notion sync` 흐름으로 마감합니다.

마지막 문서 동기화: 2026-09-13
