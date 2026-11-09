# 모시고 (Mosigo)

**자녀가 부모님의 병원 방문을 준비하고, 동행부터 사후 관리까지 이어지는 과정을 설계한 병원동행 서비스 프로토타입입니다.**

경쟁 앱 7종과 사용자 리뷰 118건을 분석해 병원 탐색, 매니저 정보, 가족 대리 신청의 불편을 사용자 흐름에 반영했습니다.

[사용자 체험](https://mosigo-nine.vercel.app/) · [서비스기획·PRD Case Study](https://github.com/dohyunkimmm/mosigo-case-study) · [Operations 로그인](https://mosigo-nine.vercel.app/ops.html) · [읽기 전용 Operations 샘플](https://mosigo-nine.vercel.app/ops-preview.html) · [변경 이력](CHANGELOG.md)

**Current stable version:** `v14.0.0`

최근 UX 개선과 2026년 10월 운영·보안 보완은 [변경 이력](CHANGELOG.md)의 Unreleased 항목에 기록했으며, 별도 버전을 발행한 것은 아닙니다.

**사용자 여정:** 가입·건강 정보 연동(시연) → 병원 탐색 → 동행 매니저 매칭 → 동의·결제 화면 → 동행 진행 → 건강 리포트 → 재예약

> 실제 의료기관 예약, 의료 판단, 실결제 또는 병원 운영 서비스를 제공하지 않는 **서비스 기획·UX 검증용 프로토타입**입니다.

## 주요 기능

- **병원·매니저 탐색:** 진료과·증상 검색, 동행 매니저 비교 및 매칭
- **예약·동행 경험:** 동의·결제 화면, 예약 상태, 실시간 동행 타임라인, 건강 리포트와 재예약
- **예약 복원·공유:** 예약 복구 키, 기기 간 계정 소유 예약 조회, 만료·폐기 가능한 보안 공유. 공유자의 예약 변경은 기본 `edit`이며 운영 설정으로 `read-only`를 선택할 수 있습니다.
- **Operations 화면:** 본인 소유 예약의 현황·일정·검색·상세 조회와 공유 상태 관리
- **시연 편의성:** 홈의 다음 행동 강조, 예시 매니저 3명 비교, 건강 리포트 안내, 실제 처리가 없는 데모 행동의 명시적 구분
- **지도·게임 시연:** API 키 없는 OpenStreetMap 지도·출처 표시, 영상 재시도 및 앱 복귀 후 사용자 조작 재시작

## 구현 범위

| 영역 | 구현 상태 |
| --- | --- |
| 사용자 화면 | 모바일 중심 인터랙티브 프로토타입 |
| 예약 데이터 | 서버 검증 API와 Private Vercel Blob 영속 저장, revision·ETag 충돌 방지 |
| 계정·복구·공유 | 보안 쿠키 기반 계정 세션, 예약 복구 키, 서버 검증 공유 권한 |
| Operations | 기존 계정 소유 예약 API를 사용하는 별도 `/ops.html` 화면 |
| Operations 샘플 | `/ops-preview.html`에서 가상 예약 3건을 보여주는 읽기 전용 화면 |
| 미구현 | 실제 병원 예약·의료 백오피스·결제 정산·운영자 배정·조직별 권한 체계 |

**샘플 화면의 데이터 경계:** `/ops-preview.html`은 로그인이나 실제 API 호출 없이 검색·필터·상세 보기만 제공합니다. 예약 변경·공유 발급은 수행하지 않습니다.

복구 키·공유 토큰의 원문은 서버의 영속 저장 데이터에 남기지 않습니다. 공유·복구 정보는 URL 쿼리가 아닌 fragment를 사용합니다. 오래된 예약 데이터의 쓰기는 서버에서 거부합니다.

## 기술·운영

- **구성:** JavaScript, Vercel Functions, Private Vercel Blob, `src/runtime/` 역할별 모듈
- **버전:** `v14.0.0` · `main` 브랜치에서 Production 배포
- **소스 기준:** 과거 v4~v13 기능을 `src/runtime/`에 통합했으며, 기존 공개 경로의 호환성은 유지합니다.
- **검증:** Node.js 24, 자동 테스트·소스 감사·Chromium/WebKit 브라우저 경험 QA·읽기 전용 Production Smoke
- **보안 범위:** 메인 예약 화면은 CSP 관찰 모드이며 Operations·이벤트·게임 페이지에는 경로별 스크립트 CSP를 강제 적용합니다.
- **실기기 QA 결과:** 실제 iPhone/Android·200% 확대 및 LTE/5G 영상 테스트는 사용자가 전 항목 통과를 직접 확인해 [#128](https://github.com/dohyunkimmm/mosigo/issues/128)·[#99](https://github.com/dohyunkimmm/mosigo/issues/99)를 2026-11-06 `closed/completed`로 종료했습니다. 기종/OS·캡처·통신 로그는 제출되지 않아 독립 검증 결과로 표현하지 않습니다. 격리 Blob 만료·장기 RW 토큰 검증 [#88](https://github.com/dohyunkimmm/mosigo/issues/88)은 미완료입니다.
- **브랜치 보호:** `main` Ruleset은 활성화되어 PR 기반 병합, `quality-checks`·`browser-journey` 필수 통과, 강제 푸시·브랜치 삭제 차단을 적용합니다. 자동 QA는 실기기 검증을 대신하지 않습니다.
- **검증 경계:** CI 통과와 실제 Production 배포 확인은 별도로 판단합니다.

```bash
npm run quality
```

**이미지 유지보수:** 보고서·혜택 배너 원본 PNG를 교체할 때는 `ffmpeg`와 `ffprobe` 설치 후 `npm run optimize:images`를 실행합니다. 해상도, 최소 15% 용량 절감, SSIM 0.96 이상을 확인한 경우에만 WebP 참조로 변경하며 `tests/hero-image-assets.test.js`가 파일 정합성을 검사합니다.

## 저장소 구성

**2026-11-09 GitHub 최신 확인:** [`main` `b0992f5`](https://github.com/dohyunkimmm/mosigo/commit/b0992f5bdaa76c9b502c506f203f6a9bf7687cf0)에서 **168개 파일·16개 디렉터리**(루트 6개 파일·최상위 5개 폴더), 파일 해시가 같은 중복 항목 0개를 확인했습니다. 열린 PR은 **0건**, 열린 이슈는 [#88 격리 Blob 소유권·자격 폐기·만료 후 보존형 정리](https://github.com/dohyunkimmm/mosigo/issues/88) **1건**입니다. 운영 데이터·과거 격리 스토어의 실제 보관/백업·삭제 상태는 이번 GitHub 점검으로 검증하지 않았습니다. 연계 [MOSIGO Case Study](https://github.com/dohyunkimmm/mosigo-case-study)의 PDF/PPT 자동 생성 PR [#72](https://github.com/dohyunkimmm/mosigo-case-study/pull/72)·[#73](https://github.com/dohyunkimmm/mosigo-case-study/pull/73)은 필수 검사 기록이 없어 미병합 상태입니다.

**2026-11-08 `main` 클렌징 기준:** **168개 파일·16개 디렉터리**(루트 파일 6개·최상위 폴더 5개)입니다. 과거 점검 문서 2개는 `docs/history/`로 이동하고, 검증에 사용하는 격리 마커 증빙은 `docs/evidence/`에 유지했습니다. 파일 수는 이 정리 작업의 스냅샷이며 이후 커밋에서 달라질 수 있습니다. [운영·정리 기록](docs/REPO-OPERATIONS.md)에서 검증 범위와 미완료 작업을 확인할 수 있습니다.

- `src/` — 배포되는 서비스 화면·정적 자료·API·런타임
- `tests/` — 자동 테스트와 `tests/config/`의 Playwright 설정
- `scripts/` — 소스 검사·운영 점검·미디어 최적화 스크립트
- `docs/` — 현행 운영 기록·점검 절차, `docs/history/` 과거 기록, `docs/evidence/` 회귀 검증 증빙
- `.github/` — CI 및 저장소 운영 설정
- 최상위 `README.md`, `CHANGELOG.md`, `VERSION`, `package.json`, `vercel.json`, `.gitignore` — 현행 안내·변경 이력·버전·테스트·배포·추적 제외 설정

## 참고 자료

- [저장소 운영·`main` 목록·QA 상태](docs/REPO-OPERATIONS.md) — 2026-11-06 현행 점검과 과거 스냅샷 구분
- [#88 Blob 보존·만료 재검증 (2026-11-07)](docs/BLOB-RETENTION-RECONCILIATION-20261107.md) · [운영 안정화 미완료 기준](docs/PRODUCTION-HARDENING-PLAN.md) · [실기기 셀룰러 QA 실행표](docs/DEVICE-QA-RUNBOOK.md)
- [과거 브랜치 정리 기록](docs/history/BRANCH-RETIREMENT-20261031.md) · [과거 채용 검토 QA](docs/history/DEMO-RECRUITER-QA-2026-11-04.md)
- [릴리스 이력](CHANGELOG.md) · [현재 버전](VERSION)
- [런타임 코드](src/runtime/) · [Production 검증 스크립트](scripts/production-smoke.js) · [문서 링크 회귀 검사](tests/repo-doc-links.test.js)
