# 모시고 (Mosigo)

자녀가 부모님의 병원 이용을 대신 준비하고, 병원 탐색부터 동행 매니저 매칭·동의/결제·실시간 동행·건강 리포트·재예약까지 이어지는 흐름을 검증하기 위한 인터랙티브 병원동행 서비스 프로토타입입니다.

- **Current stable version:** `v4.0.0`
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
- 모바일 화면 중심 인터랙티브 UI
- 프로토타입용 병원 데이터 API

> 이 프로젝트는 실제 의료·예약 서비스를 제공하는 운영 서비스가 아니라 서비스 기획과 UX 흐름을 검증하기 위한 프로토타입입니다.

## v4 고도화

v4는 v3의 구조적 안정성을 유지하면서 검색과 예약을 명시적인 데이터·상태 기반으로 확장한 **Functional Prototype** 버전입니다.

- 병원 프로토타입 데이터에 평점·후기 수·전문 분야·진료 상태·당일접수·예시 대기시간·연결 가능한 매니저 정보를 추가했습니다.
- `/api/hospitals`에 `recommended`/`rating`/`wait` 정렬, `managerAvailable`/`sameDay` 필터, 적용 조건과 결과 수를 담은 query metadata, `v4` schema marker를 추가했습니다.
- 병원 검색 UI에서 로딩·빈 결과·API fallback·재시도 상태를 구분하고 API 장애 시 프로토타입 fallback 데이터로 안전하게 전환합니다.
- 공유 booking state machine으로 `요청 → 확정 → 진행 → 완료/취소` 생명주기를 모델링했습니다.
- 진행 중 예약을 `sessionStorage`에 저장해 같은 탭에서 새로고침해도 병원·매니저·일정·이동수단·예약 상태를 복원합니다.
- 병원 또는 매니저 정보가 없거나 연결 가능한 매니저가 없는 경우 잘못된 예약 진행을 차단합니다.
- API 필터/정렬/metadata와 booking lifecycle/restore를 자동 QA에 추가했습니다.

v3에서 구축한 CSS/JavaScript 외부화, 병원 data/query/API 계층 분리, 공통 `npm run quality` 게이트는 그대로 유지됩니다.

## 기술 구성

- HTML / CSS / JavaScript
- Leaflet
- Vercel
- Vercel Serverless Function
- Node.js built-in test runner
- GitHub Actions

## 저장소 구조

```text
.
├── .github/workflows/
│   ├── quality.yml              # PR/main 자동 품질 게이트
│   └── release.yml              # 최종 QA 후 수동 Tag/Release 발행
├── scripts/
│   └── source-audit.js          # index 구조·asset 크기 감사
├── tests/
│   ├── booking-state.test.js    # 예약 상태 전이·복원 검증
│   ├── hospital-query.test.js   # 병원 검색·필터·정렬 단위 검증
│   ├── hospitals.test.js        # 병원 API 계약·v4 metadata 검증
│   └── static-site.test.js      # 정적 구조·asset·JS 검증
├── CHANGELOG.md                 # 버전별 누적 변경 기록
├── VERSION                      # 현재 안정 버전
└── src/
    ├── index.html               # 메인 인터랙티브 데모 구조
    ├── index.css                # 메인 화면 스타일
    ├── index-core.js            # 메인 앱 핵심 인터랙션
    ├── new_ext-pages.js         # 확장 페이지 인터랙션
    ├── index-post.js            # 후속 접근성·데모 보강 로직
    ├── v4-functional.js         # v4 병원 검색 상태·fallback·retry 레이어
    ├── booking-state.js         # 공유 예약 상태 모델
    ├── v4-booking.js            # v4 예약 lifecycle 런타임 어댑터
    ├── data/
    │   └── hospitals.js         # 프로토타입 병원 데이터
    ├── lib/
    │   └── hospital-query.js    # 병원 검색/필터/정렬 로직
    ├── api/
    │   └── hospitals.js         # Vercel API handler
    ├── vercel.json
    └── ...                      # 이미지·영상 등 UI 자산
```

## 배포

- **Production branch:** `main`
- **Vercel Root Directory:** `src`
- **Production URL:** https://mosigo-nine.vercel.app/

GitHub `main`의 검증된 소스를 기준으로 Vercel Production이 배포됩니다. 저장소 루트의 테스트·문서·audit 파일은 Vercel Root Directory(`src`) 밖에 있어 앱 런타임에 영향을 주지 않습니다.

## 품질 검증

전체 품질 게이트는 다음 한 명령으로 실행합니다.

```bash
npm run quality
```

이 명령은 Node.js 테스트와 source audit를 연속 실행해 다음을 검증합니다.

- 병원 API 기본 응답, 진료과·이름·전문 분야 검색, 결과 수 제한, HTTP method 처리
- v4 병원 API의 매니저/당일접수 필터, 추천·평점·대기시간 정렬, query metadata와 schema marker
- 예약 상태의 정상/비정상 전이, 직렬화와 복원
- 필수 페이지/API/data/lib/Vercel 설정 및 v4 runtime 파일 존재 여부
- 메인 페이지의 언어·viewport·title·description 등 기본 metadata
- HTML/CSS가 참조하는 로컬 asset 누락 여부
- 외부화된 JavaScript 및 남은 inline JavaScript syntax validity
- `index.html`의 HTML comment balance와 CSS/JavaScript 외부화 유지 여부
- `index-core.js → new_ext-pages.js → index-post.js` 실행 순서
- `index.html` 200 KB 구조 size guard

동일한 품질 게이트는 Pull Request와 `main` push, GitHub Release 발행 직전에도 실행됩니다.

## Release

GitHub Release는 `.github/workflows/release.yml`을 통해 최종 QA 이후에만 수동 발행합니다. Release workflow는 `main`에서 `npm run quality`를 다시 실행하고 `VERSION` 값을 읽어 동일 버전 Release가 없는지 확인한 뒤 Git tag와 GitHub Release를 함께 생성합니다.

저장소 전체 Actions 기본 권한은 read-only로 유지하며, Release workflow에만 `contents: write` 권한을 제한적으로 부여합니다.

## 로컬 확인

정적 화면만 확인할 경우 `src/`를 로컬 정적 서버로 열면 됩니다.

```bash
cd src
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속하세요. `/api/hospitals`까지 포함한 Vercel 환경을 동일하게 확인하려면 Vercel 개발 환경을 사용해야 합니다.

## 버전 전략

Mosigo는 기존 안정 동작을 유지하면서 버전별로 점진적으로 고도화합니다. 각 메이저 버전은 `QA → main merge → Vercel Production 검증 → Tag/Release → README/Notion sync` 흐름으로 마감하며, 변경 내용은 `CHANGELOG.md`에 누적합니다.

## 상태

- `v2.0.0` — 복원·안정 기준선 및 자동 QA 기반 정립
- `v3.0.0` — 구조·유지보수성 고도화 완료
- `v4.0.0` — 병원 검색 데이터/상태와 예약 lifecycle을 확장한 Functional Prototype 완료
- v4 병원 API 필터·정렬·metadata 및 fallback/retry UX 적용
- 예약 상태 머신과 세션 내 복원, 진행 조건 검증 적용
- PR/main/Release 공통 품질 게이트 및 v4 자동 검증 통과
- GitHub verified `main` 기반 Vercel Production 배포와 v4 runtime smoke QA 통과

마지막 문서 동기화: 2026-09-12
