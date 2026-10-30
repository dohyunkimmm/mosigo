# 모시고 (Mosigo)

**자녀가 부모님의 병원 방문을 준비하고, 동행부터 사후 관리까지 이어지는 과정을 설계한 병원동행 서비스 프로토타입입니다.**

경쟁 앱 7종과 사용자 리뷰 118건을 분석해 병원 탐색, 매니저 정보, 가족 대리 신청의 불편을 사용자 흐름에 반영했습니다.

[사용자 체험](https://mosigo-nine.vercel.app/) · [Operations 로그인](https://mosigo-nine.vercel.app/ops.html) · [읽기 전용 Operations 샘플](https://mosigo-nine.vercel.app/ops-preview.html) · [변경 이력](CHANGELOG.md)

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
- **검증 미완료:** 실제 iPhone/Android LTE·5G QA, 격리 Blob의 만료 후 자동 정리와 장기 RW 토큰 제거는 별도 후속 작업입니다.
- **검증 경계:** CI 통과와 실제 Production 배포 확인은 별도로 판단합니다.

```bash
npm run quality
```

**이미지 유지보수:** 보고서·혜택 배너 원본 PNG를 교체할 때는 `ffmpeg`와 `ffprobe` 설치 후 `npm run optimize:images`를 실행합니다. 해상도, 최소 15% 용량 절감, SSIM 0.96 이상을 확인한 경우에만 WebP 참조로 변경하며 `tests/hero-image-assets.test.js`가 파일 정합성을 검사합니다.

## 참고 자료

- [저장소 운영·브랜치 보호·WAF 후속/Production Smoke 재검증](docs/REPO-OPERATIONS.md) — 2026-10-22 검증 기록
- [릴리스 이력](CHANGELOG.md) · [현재 버전](VERSION)
- [런타임 코드](src/runtime/) · [Production 검증 스크립트](scripts/production-smoke.js)
