# Mosigo 운영 안정화 — 미완료 항목 및 검증 기준

> 2026-10-27 · 현재 제품은 실병원 예약·실결제 없는 프로토타입. 이 문서는 실제 운영 설정의 확인되지 않은 사항을 완료로 표시하지 않습니다.
>
> 관련 이슈: [#88](https://github.com/dohyunkimmm/mosigo/issues/88), [#90](https://github.com/dohyunkimmm/mosigo/issues/90).

### 최신 추가 검증 — #88 단기 OIDC와 업로드 시각 대조 (2026-10-28)

- Vercel 테스트 전용 프로젝트 `mosigo-isolated-smoke-lab`에서만 프로젝트 OIDC 설정을 활성화했습니다. 별도 일회성 배포 `dpl_22zsUry2L4NoNJiL7RYNxzFgryGz`는 `VERCEL_OIDC_TOKEN`과 정확한 **격리 테스트 스토어 ID**를 `@vercel/blob`의 `oidcToken` / `storeId` 옵션에 명시하여 비공개 JSON 마커 **1건을 실제 원격 list/get으로 읽고** 빌드 로그 `MOSIGO_ISOLATED_OIDC_READ_VERIFIED`를 기록했습니다. RW 토큰을 Blob SDK 옵션으로 전달하지 않았고, 변경/삭제 요청도 없었습니다.
- **중요한 차이:** OIDC 인증이 실제로 작동한 것은 검증됐지만 **기존 프로젝트 연결에 암호화된 `BLOB_READ_WRITE_TOKEN`도 아직 남아 있어 장기 자격 증명 제거가 완료된 것은 아닙니다.** 기존 연결은 Vercel Storage → 해당 테스트 스토어 → Projects → `mosigo-isolated-smoke-lab` 메뉴의 **Upgrade to OIDC**를 운영자가 수행하고, 기존 RW 토큰 제거와 재검증을 확인해야 합니다. 운영 Mosigo 프로젝트는 변경하지 않습니다.
- 읽기 전용 `scripts/audit-isolated-retention.js`는 마커가 주장하는 `createdAt`을 Vercel Blob 목록이 반환하는 **별도의 서버 업로드 시각(`uploadedAt`)**과 비교하도록 강화했습니다. 누락·파싱 오류·5분 초과 불일치·미래 업로드 시간은 미분류로 처리합니다. **서버 시각 확인도 독립적인 삭제 승인이나 자동 보존 정책은 아닙니다.** `safeToDelete=false`, `candidateDeletions=0`은 그대로입니다.
- **서버 시각 실측 완료:** 추가 읽기 전용 검증 빌드 `dpl_2T8cPtmzRP7EgqJwdMabxu3PMXDH`에서 실제 OIDC `list/get`로 기존 마커 1건의 서버 `uploadedAt`과 JSON `createdAt` 오차가 5분 이내, 만료 시각이 생성 후 정확히 7일, 마커가 아직 활성 상태임을 검증했습니다. 원격 쓰기·삭제는 0건입니다.
- 검증 마커는 여전히 객체 **1건(242바이트)**이고 만료 메타데이터 7일 이후의 복구 가능한 정리/삭제는 아직 검증하지 않았습니다. 개인정보/운영 Blob 객체는 조회·변경·삭제하지 않았습니다.

### 최신 실측 결과 — #88 (2026-10-28)

- **실제 원격 검증 완료:** 격리 테스트 프로젝트 `mosigo-isolated-smoke-lab`에 연결된 비공개 `mosigo-smoke-lab-linked-20261028`만 대상으로, Vercel 별도 배포 빌드에서 토큰의 스토어 ID를 대조한 뒤 `mosigo-isolated-smoke/`에 단일 JSON 테스트 마커를 **한 번 쓰고, 동일 본문 읽기와 경로 목록 확인**을 성공했습니다. 증빙 빌드: `dpl_G54yiPzBfM4BXU55gpEUjvJfabGj`.
- **독립적 읽기 재검증 완료:** 다른 테스트 빌드 `dpl_7TWvJvQmzMTv6dYJMHsadh9cm6my`에서 별도 `get/list`로 테스트 마커 1건, 실행 ID·소유자·연결 테스트 저장소·7일 만료 시각·증빙 문자열의 일치 확인. Vercel 스토어 관리 통계도 객체 **1건, 242바이트**, 연결된 프로젝트 **1곳(테스트 랩)**으로 확인했습니다. 인증값·비공개 경로·개인정보는 기록하지 않았습니다.
- 이 별도 검증 빌드는 **테스트 프로젝트 환경의 저장소 한정 암호화 RW 토큰**을 이용했으며 토큰 값은 조회·출력하지 않았습니다. 기존 로컬 수동 도구의 **OIDC 전용 안전 제한은 유지**합니다. 새 증빙 문자열 `isolated-vercel-build-e2e`는 오프라인/수동 읽기 전용 집계기에서 인식하지만 **독립적 삭제 승인 증거로 간주하지 않습니다**.
- **남음:** 7일 후 자동 삭제·복구 가능한 정리 및 독립 소유권 확인, OIDC 전환·권한 수명 점검, 이전 비연결 빈 저장소의 사용량/과금 정리, 실제 iPhone/Android 셀룰러 QA. 기존 본문의 “원격 미실시·객체 0건” 설명은 이 날짜 이전의 이력이며 이 항목이 최신 검증 상태입니다.

## 1. Production Smoke 저장 데이터 — #88

### 이번에 적용하는 즉시 안전장치
- Production Smoke를 **항상 읽기 전용**으로 실행합니다. `src/` 변경 시에도 기존 Production API 응답·버전·영속 저장 capability·공개 자산을 확인하되 `POST`, `PUT`, `PATCH`, `DELETE`를 호출하지 않습니다.
- Smoke에 있던 쓰기형 계정 등록, 예약 생성·상태 변경, 공유 발급·회수 구간은 제거합니다.
- 예약 생성·변경·권한·공유 동작은 코드 기반 단위·통합 테스트에서 검증합니다. 별도의 격리된 원격 영속 저장소에 대한 종단 간 테스트와 **동일한 수준의 보증은 아닙니다**.
- 기존 Production Blob의 어떤 데이터도 삭제하지 않습니다.

### 남은 실제 해결 작업 (이슈는 열린 상태 유지)
1. **전용 격리 저장 영역**(별도 Blob Store 또는 별도 격리 프로젝트)을 운영 예약 저장소와 분리하고 접근 권한까지 독립적으로 확인합니다. 단순 경로 접두사만 바꾸는 것은 충분한 격리로 간주하지 않습니다.
2. 스모크에서 생성한 모든 계정·예약·공유 객체에 고유 `runId`, 명시적 테스트 소유자, 만료 시각을 일관되게 기록하고 재시도 실패도 탐지할 수 있는 인벤토리를 구축합니다.
3. 읽기 전용으로 과거 객체를 조사하되, 기존 `smoke-...` 이메일이나 ID 패턴만으로 소유권을 단정하지 않습니다. 운영 기록과 테스트 기록의 출처를 **검증할 수 없는 경우 절대로 삭제하지 않습니다**.
4. TTL을 예컨대 7일로 설계하고, 격리 저장소에 있는 **입증된 테스트 객체만** 정리할 수 있는 잡과 dry-run·감사 로그·복구 절차를 구축합니다. 실패·재시도를 포함한 회수 테스트 통과 후에만 자동 삭제를 켭니다.

## 2. 공유 권한·서버리스 공통 제한 — #90

### 현재 동작 (동의 없는 변경 금지)
- 예약 공유 토큰 소지자는 `GET /api/bookings`으로 읽고 `PATCH /api/bookings`으로 상태를 변경할 수 있습니다. **현재는 열람 전용 링크가 아닙니다.**
- 공유 발급·회전·폐기(`/api/booking-shares` POST/DELETE)는 소유 계정 세션 또는 복구 키로 권한을 확인합니다. 토큰만 있는 공유 참여자는 이를 수행할 수 없도록 회귀 테스트를 보강했습니다.
- 앱의 인증·예약 생성 제한은 서버리스 **인스턴스별 메모리 제한**입니다. 여러 인스턴스에 걸친 총량 제한으로 설명하면 안 됩니다.
- 과거 Vercel WAF `/api/account` 규칙은 *Log/관찰* 단계로 기록됐으나, 활성 config API가 404를 반환해 실제 조건은 독립 확인되지 않았습니다. 차단(429)은 적용했다고 간주하지 않습니다.

### 승인·검증이 필요한 순서
1. 공유 토큰 권한을 `read-only`로 바꿀지, 확인된 공유자에게 예약 변경을 계속 허용할지 **제품 결정을 먼저 기록**합니다. 읽기 전용 전환 시에는 기존 공유 UX 안내, 호환 경로, 권한 실패 처리, 자동 테스트를 함께 배포해야 합니다.
2. WAF에서 `POST /api/account`의 현재 실제 조건·로그 매칭·오탐 및 NAT/공유 IP의 영향을 검증합니다.
3. `POST /api/bookings`, **존재하지 않는 ID의 첫 `PUT`**은 생성 경로입니다. 외부 Edge/WAF는 PUT 전체를 일괄 차단하면 기존 예약 복원이 깨질 수 있으므로 메서드·작업별 정책을 설계합니다. 첫 PUT을 외부 규칙만으로 구분하기 어려울 수 있어 서버 측 공유 집계/키 기반 정책 검토가 필요합니다.
4. 관찰 자료로 한도, 키(IP·세션·계정), 기간, 예외, 운영 대응·롤백을 합의한 후 감시 모드 → 단계적 차단 → 실제 429·Retry-After 검증으로 전환합니다.
5. CDN/제3자 스크립트·iframe 출처를 조사하고 CSP는 report-only로 시작해 호환성을 확인한 뒤 강화합니다.

## 3. 실기기 미디어 QA (미실시)

GitHub Chromium 자동화와 정적 미디어 회귀 테스트는 존재하지만, 실제 LTE/5G 품질·Safari iPhone·Chrome Android와 동일한 검증은 아닙니다.

| 확인 장면 | iPhone Safari | Android Chrome |
| --- | --- | --- |
| LTE/5G 네트워크에서 최초 화면 진입 전 게임 영상 다운로드 없음 | 미실시 | 미실시 |
| 게임 시작 후 재생·일시중지·재개, 결과 화면 영상 정상 | 미실시 | 미실시 |
| 통신 속도 저하/일시 끊김 후 재시도, 화면 이탈/복귀 | 미실시 | 미실시 |
| 저속 네트워크에서 리포트·혜택 WebP가 깨짐 없이 표시 | 미실시 | 미실시 |
| 모바일 화면/터치 접근성·권한 안내 | 미실시 | 미실시 |

실기기 결과는 기기 모델·OS·브라우저 버전·실제 네트워크·기대/실제 결과를 이슈에 기록한 후에만 완료 표시합니다.

## 2026-10-27 후속 점검 도구 및 브라우저 QA

### #88: 과거 Blob 메타데이터만 점검

`scripts/audit-blob-inventory.js`를 추가했습니다. 직접 실행하기 전까지 운영 Blob은 조회하지 않습니다. 이 도구는 예약·계정·세션·계정 예약 색인·공유의 **고정된 5개 경로**를 `list()`로만 제한적으로 조회합니다. 기본값은 경로별 최대 3페이지 × 100개이고, 목록이 더 있으면 `complete=false`를 반환합니다. 결과에는 집계 건수·용량·업로드 시각만 표시하고, **개별 파일명·개인정보·비공개 URL·토큰은 출력하지 않습니다**. 목록에 나타난 객체를 테스트 데이터라고 가정하지 않으며, 분류는 항상 `unattributed`입니다.

Vercel Blob 목록 조회는 과금 가능한 작업이므로 권한·사용량을 확인한 관리자가 승인된 **로컬 셸**에서만 실행합니다. CI/프로덕션 함수에서는 실행을 차단합니다. 이 도구는 운영 코드의 `resolveBlobStoreId()`와 **직접 입력한 확인 ID**가 일치해야만 실행됩니다. 저장소 ID·OIDC 토큰의 실제 값은 기록하지 마세요.

```bash
npm --prefix src install --omit=dev
# 로컬 셸에 아래 값이 안전하게 주입돼 있다고 가정합니다.
# MOSIGO_BLOB_STORE_ID 또는 BLOB_STORE_ID: 실제 운영 코드와 동일한 저장소 ID
# MOSIGO_AUDIT_EXPECTED_STORE_ID: 관리자가 별도로 확인한 동일 ID
# VERCEL_OIDC_TOKEN: 만료 시간이 짧은 승인된 OIDC 토큰
# BLOB_READ_WRITE_TOKEN: 반드시 unset (예기치 않은 다른 store 선택 방지)
MOSIGO_AUDIT_BLOB_METADATA_ONLY=yes node scripts/audit-blob-inventory.js
```

필수 조건 중 하나라도 맞지 않으면 점검을 거부하며, 모든 `list()` 호출에 검증한 `storeId`·OIDC 자격을 직접 전달합니다. 2026-10-27 연결된 Vercel 관리자 API에서 **애플리케이션 기본 저장소가 존재하고 유형이 Blob임**은 확인했지만, 개별 객체나 과거 테스트 레코드 여부는 확인하지 않았습니다. 결과는 메타데이터 개요일 뿐이며 삭제 허가·테스트 데이터 소유권 증명이 아닙니다. **실제 과거 데이터 점검, 물리적 격리, TTL, 삭제는 미완료**입니다.

### #90: 공유 권한 거부 테스트

만료되거나 철회된 공유 토큰으로 `PATCH /api/bookings`를 호출해도 401이 반환되고 원본 예약 revision이 증가하지 않는 테스트를 추가했습니다. 활성 공유 토큰의 기존 수정 권한은 유지됩니다. 실제 공유 권한 정책 변경과 모든 인스턴스에 공통 적용되는 WAF/Edge 요청 제한은 여전히 사용자 결정과 운영 설정 확인이 필요합니다.

### 모바일 미디어 브라우저 회귀 테스트

Chromium 모바일 뷰포트에서 게임 MP4 지연 로딩과 MP4 전송 실패 후 기본 흐름 복구를 자동화했습니다. 이것은 시뮬레이션이며 **실제 iPhone/Android, LTE/5G 통신망 QA의 대체가 아닙니다**.

### #90: 안전한 공유 링크 권한 전환 준비

배포 환경변수 `MOSIGO_SHARE_WRITE_POLICY`의 명시적 값으로 **`edit` 또는 `read-only`**를 선택할 수 있는 서버 측 권한 게이트를 구현했습니다. **기본값은 `edit`**이며, 별도 운영 설정을 변경하지 않는 한 이전처럼 유효한 공유 링크로 예약 상태를 수정할 수 있습니다.

- `edit`(현행): 유효한 공유 토큰으로 조회·PATCH 모두 가능
- `read-only`(향후 선택): 공유 토큰으로 조회는 가능하지만 예약 PATCH는 403 `booking_share_read_only`; 복구 키와 예약 소유 계정 세션은 정상 변경 가능
- `GET /api/bookings` capability에 `shareParticipantWriteAccess` 값을 표시해 UI가 실제 권한을 확인할 수 있도록 했습니다. 기존 UI는 현재와 동일하게 유지합니다.
- 만료·철회 토큰은 기존처럼 401이며, 권한 미충족 요청에 저장소 쓰기가 일어나지 않도록 자동 검사합니다.
- 공유자 UI가 서버 capability의 `shareParticipantWriteAccess=read-only`에 맞춰 **열람 전용·소유자 변경 요청** 문구를 표시하도록 준비하고, 브라우저 테스트에서 `edit`와 `read-only` 양쪽을 검증했습니다. 기존 운영 `edit` 정책은 변경하지 않습니다.
- 읽기 전용 공유 참여자에게는 **예약 취소 데모 버튼을 숨기고 비활성화**해 실제 권한과 상충하는 안내를 방지합니다. `edit` 또는 소유자 상태로 바뀌면 원래 버튼 상태를 복원합니다. API의 서버 측 권한 검사가 최종 권한 경계이며 UI 제어만으로 보안을 보장하지 않습니다.
- PR #103이 숨긴 예약 취소 버튼 외에도, 확인되지 않은 공유 권한·읽기 전용 공유 참여자의 취소 확인 및 동행 완료 버튼을 비활성화하고 로컬 낙관적 예약 변경을 차단합니다. `edit` 권한 확인 후 복원하며 소유자는 그대로 변경할 수 있습니다. API의 서버 측 권한 검사는 별도로 유지합니다.
- `read-only` 운영 전환은 **아직 하지 않았습니다**. 실제로 전환하려면 공유자 UI의 수정 버튼·설명·403 처리 검증, 복구 UX, 정책 결정과 단계적 배포가 선행되어야 합니다.

### 2026-10-27 모바일 브라우저 추가 검증

`playwright.mobile.config.cjs`로 **Android Chromium(Pixel 5 에뮬레이션)**과 **iPhone WebKit(iPhone 13 에뮬레이션)**의 영상 지연 로딩·MP4 네트워크 실패 복구 테스트를 PR/메인 브랜치 필수 Browser Experience QA에 추가했습니다. 기존 모바일 미디어 회귀 검사의 잘못 이스케이프된 MP4 매칭 정규식을 실제 `.mp4` URL과 일치하도록 수정했습니다. WebKit 교차 검사에서 **`preload="none"`을 준 video도 첫 클릭 전 4개 MP4를 요청**하는 회귀를 발견했고, `<video data-src>`로 파일 경로를 보관한 뒤 사용자 시작·결과 표시 시에만 `src`를 할당하도록 수정했습니다. 이 동작은 자동 테스트에서 MP4 실제 요청 목록과 `src` 부재를 모두 확인합니다. 해당 테스트는 실제 네트워크를 사용하지 않는 브라우저 에뮬레이션으로서 LTE/5G 실제 기기 검증을 대체하지 않습니다.


### #90: CSP 모니터링 모드 첫 단계 (외부 리소스 조사 후)

- 현행 HTML 표면(메인, Operations, 이벤트, 게임)과 지도 스크립트에서 확인된 외부 경로는 Leaflet(`unpkg.com`), Pretendard/GmarketSans(`cdn.jsdelivr.net`), Flaticon 아이콘(`cdn-uicons.flaticon.com`), CARTO 지도 타일(`*.basemaps.cartocdn.com`)입니다. 외부 iframe/embed/object의 정적 선언은 발견되지 않았습니다.
- `src/vercel.json`에 **`Content-Security-Policy-Report-Only`만** 설정했습니다. `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `form-action 'self'`와 필요한 외부 출처의 세분화 지시문을 관찰합니다. 기존 동작·권한·운영 데이터를 차단하거나 변경하지 않습니다.
- 현재 마크업에 다수의 인라인 `style=`과 `onclick`·`onerror` 핸들러가 있어 `script-src/style-src 'unsafe-inline'`을 임시 호환 조치로 두었습니다. **강제 CSP로 바로 전환하면 안 되며**, 인라인 이벤트 제거·nonce/hash 전환과 외부 CDN 로딩/오프라인/모바일 경로를 확인해야 합니다.
- 외부 보고 수집 경로(`report-uri`/`report-to`)는 아직 연결하지 않았습니다. 따라서 현재 헤더는 브라우저 경고/개발자도구 관찰용으로, 위반 로그를 중앙 집계한다고 주장할 수 없습니다. 보고 수집 도입 시 공유 토큰·개인정보가 보고서에 담기지 않게 수집 범위와 보존 정책을 먼저 검증합니다.
- 메인·Operations·게임 경로의 실제 배포 헤더와 브라우저 회귀 검사를 확인하고, 이후 안전한 환경에서 프레임 삽입 의존성/오탐을 검증한 뒤 강제 CSP·X-Frame-Options 적용 여부를 별도로 결정합니다. 이 단계는 **CSP 강제 보호 완료가 아님**.

### #90·#99: 운영 CSP/모바일 미디어 회귀 검사 보강

- 로컬 Playwright 테스트 서버가 `src/vercel.json`의 전역 응답 헤더를 그대로 적용하도록 변경했습니다. 로컬 CSP 검사와 실제 운영 헤더 정책이 어긋나는 상황을 줄입니다. 테스트 서버는 기존대로 GET/HEAD 정적 제공만 하며 Production 데이터는 읽거나 쓰지 않습니다.
- Browser QA에서 메인·Operations·게임 페이지에 `Content-Security-Policy-Report-Only`가 있는지 확인하고 브라우저 `securitypolicyviolation` 이벤트의 **지시문 이름만** 점검합니다. 보고된 차단 URL·공유 토큰 같은 상세 정보는 수집하지 않습니다. 이 검사는 일부 기본 경로에 한정되며 운영 전체·실기기 위반 부재를 의미하지 않습니다.
- 읽기 전용 Production Smoke는 메인·Operations·게임 응답의 관찰용 CSP 존재와 강제 CSP 부재를 검사합니다. CSP 정책을 운영 차단으로 전환하지 않습니다.
- 모바일 비디오 실패 후 다시 도전할 때 이전 `src`를 비워 다음 클릭에서 새 네트워크 요청을 허용합니다. WebKit/Chromium 네트워크 실패 → 복구 요청을 모의 검사합니다. 실제 LTE/5G 환경 검증은 여전히 별도 필요합니다.

### #90: Operations 전용 강제 CSP 시범 적용

- `/ops.html`과 `/ops-preview.html`의 정적 스크립트/이벤트 속성을 조사하여 기존 인라인 이벤트가 없음을 확인했습니다. 두 HTML 응답에만 `Content-Security-Policy`를 적용하고 `script-src 'self'`, `script-src-attr 'none'`, `frame-ancestors 'self'`, `object-src 'none'`을 강제합니다.
- Pretendard 외부 스타일·폰트(`cdn.jsdelivr.net`)는 명시 허용하고 현재 레이아웃 호환을 위해 스타일 인라인만 허용합니다. 외부 스크립트 실행은 허용하지 않습니다.
- 메인 예약 앱·게임 화면에는 **기존 report-only 정책만** 유지합니다. 두 운영 화면에 한정된 강화가 전체 CSP 강제 전환을 의미하지는 않습니다.
- 로컬 브라우저 QA 서버에 경로별 헤더 선택을 구현하고, browser QA에서 두 운영 화면의 정상 동작·CSP 위반 유무를 검사합니다. Production Smoke는 경로별 정책을 읽기 전용으로 검증합니다.
- 실제 상용 사용자 임베딩/외부 도메인 연동/모바일 실기기 호환성은 별도 검증하고, 문제가 발생하면 해당 두 경로의 강제 CSP 헤더만 제거하는 롤백을 사용합니다.

### #88: 격리 저장소 연동 전 TTL·소유자 검사 도구

- `scripts/smoke-retention-preflight.js`는 실험 전용 Blob 저장소 ID와 운영 저장소 ID가 반드시 **서로 다른 저장소**인지 확인합니다. 미래의 격리된 테스트 실행에는 충돌 가능성이 낮은 `runId`, 명시적 소유자 `mosigo-isolated-smoke`, 최대 7일 만료를 함께 부여하는 도우미를 제공합니다.
- `planRetention()`은 격리 저장소에서 가져온 별도의 목록을 *오프라인*으로 요약하는 읽기 전용 계획기입니다. 범위 밖 저장소 객체가 보이면 전체 실행을 거부하고, runId·소유자·유효 TTL·증빙 참조가 불완전한 항목을 미분류합니다. 명시적 후보도 **독립적인 출처 증명 전까지 삭제 대상이 아닌 검토 항목**입니다.
- 보고서에는 집계 숫자만 포함하고 키·경로·URL·자격 증명을 출력하지 않습니다. 이 도구는 Blob SDK·네트워크 접근·삭제 기능을 포함하지 않으며 `candidateDeletions=0`, `safeToDelete=false`를 고정합니다. 자동 삭제나 실제 운영 데이터를 조사했다고 주장하지 않습니다.
- **미완료:** 별도 테스트 저장소 실물 생성·접근 권한 검증, 테스트 실행과 메타데이터 기록 연동, 지난 스모크 데이터 소유권 검증, 수동 검토된 객체에 한정한 복구 가능한 회수 작업. 기존 운영 Blob은 손대지 않았습니다.

### #90·#99: 이벤트·게임의 스크립트 CSP 강제 적용

- `new_event.html`과 `new_game.html`의 `onclick`·`onerror` 속성을 제거하고 외부 JS의 이벤트 리스너로 동일한 동작을 연결했습니다. 오류가 난 장식 이미지/영상 정리는 별도의 데이터 속성과 이벤트 리스너로 유지합니다.
- 두 경로에만 `script-src 'self'`, `script-src-attr 'none'`, `frame-ancestors 'self'`, `object-src 'none'`의 강제 CSP를 적용합니다. 필요한 Flaticon·Pretendard 자산은 출처를 명시해 허용하며, 기존 스타일 속성 호환을 위해 `style-src 'unsafe-inline'`은 유지합니다. 메인 예약 화면은 기존 관찰 모드로 유지합니다.
- Browser QA는 같은 출처 iframe 안에서 이벤트→게임 이동 및 클릭이 정상 동작하는지, CSP 위반 이벤트가 없는지 검증합니다. Production Smoke는 각 경로의 실제 응답 헤더를 읽기 전용으로 확인합니다.
- **실제 LTE/5G 단말 검증이나 전체 앱 강제 CSP 완료를 의미하지 않습니다.** 이후 CSP를 더 강화할 때는 메인 화면의 인라인 코드 제거 및 WebKit/Android 실기기 호환성 검증이 필요합니다.

### #88: 격리 Blob의 수동 쓰기·읽기 E2E 준비 (실행 전 권한 검증 필요)

- 2026-10-27에 별도 생성한 테스트용 Private Blob 저장소는 현재 운영 프로젝트와 연결되지 않았습니다. `scripts/check-isolated-blob-store.js`는 향후 **테스트 전용 OIDC 권한을 정상 구성한 후** 지정한 저장소에 **작은 JSON 마커 한 건만 쓰고 → 읽고 → 목록에서 찾는** 수동 E2E 검증기입니다.
- 실행은 승인된 **로컬 셸**로 한정합니다. `CI`, `GITHUB_ACTIONS`, `VERCEL`, `VERCEL_ENV`, `VERCEL_URL` 컨텍스트를 모두 거부하고, 토큰이 없는 경우·기존 `BLOB_READ_WRITE_TOKEN`이 있는 경우·테스트 저장소 ID 이중 확인이 안 된 경우·운영/테스트 저장소 ID가 같은 경우 실행하지 않습니다.
- 모든 Blob SDK 요청은 명시적 `storeId`와 짧은 `VERCEL_OIDC_TOKEN`을 사용합니다. 새 객체는 `mosigo-isolated-smoke/` 네임스페이스, 독립 실행 `runId`, 소유자, 7일 `expiresAt` 메타데이터를 지닙니다. **7일 후 자동 삭제/만료를 적용하지 않으며** 어떤 `del`도 호출하지 않습니다. 쓰기 실패 또는 읽기 검증 실패 후에도 마커가 남을 수 있으므로 별도의 수동 검토가 필요합니다.
- **2026-10-28 갱신:** 새 비공개 `mosigo-smoke-lab-linked-20261028` 저장소를 테스트 전용 프로젝트에 연결하고, 한 프로젝트 연결·객체 0개를 읽기 전용으로 확인했습니다. 기존 2026-10-27의 비연결 저장소와 서로 다른 스토어입니다. 다만 **OIDC 인증 범위와 실제 `put/get/list` 실행은 아직 검증되지 않았습니다.** 공유된 운영 세션 토큰 사용, 운영 저장소 연결, 자동 CI 실행은 금지합니다.
- 승인된 로컬 셸의 명시적 설정 예시(아래 값은 운영 저장소/격리 저장소의 관리자가 각각 안전하게 제공하고, 자격 증명을 출력하거나 리포지토리에 저장하지 않음):

```bash
# Test-only OIDC credentials must be injected securely beforehand.
unset BLOB_READ_WRITE_TOKEN
export MOSIGO_SMOKE_PRODUCTION_STORE_ID="<verified-production-store-id>"
export MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID="<independently-confirmed-production-store-id>"
export MOSIGO_SMOKE_TEST_STORE_ID="<verified-isolated-test-store-id>"
export MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID="<independently-confirmed-isolated-store-id>"
export MOSIGO_ISOLATED_WRITE_ONCE=yes
export MOSIGO_ISOLATED_ACCEPT_RETAINED_MARKER=yes
npm --prefix src ci --omit=dev
node scripts/check-isolated-blob-store.js
```

- 결과는 객체 경로/저장소 ID/토큰을 출력하지 않는 집계형 검증 상태만 제공합니다. **이 저장소에 대한 실제 원격 쓰기/읽기는 이번 변경에서 실행하지 않았습니다.**
- 실제 셀룰러 실기기 QA의 재현·증빙 절차는 `docs/DEVICE-QA-RUNBOOK.md`에 추가했습니다. Android Chromium / iPhone WebKit 테스트에서 **영상 로딩 실패 후 이탈·재진입**과 선제 미디어 요청이 발생하지 않는지 별도 검증합니다. 실제 LTE/5G 결과로 대체하지 않습니다.

### #88·#99: 생산 저장소 식별 이중확인 / 모바일 앱 복귀 복원

- 격리 Blob 수동 검증은 테스트 저장소 확인에 더해 **운영 저장소 ID도 두 번 독립 입력하여 일치 확인**하도록 강화했습니다. 어느 한쪽이 없거나 서로 다르면 Blob 호출 전 즉시 중단됩니다. 아직 테스트 저장소에 연결한 별도 프로젝트·OIDC가 없으므로 원격 읽기/쓰기는 미실시입니다.
- 모바일 게임에서 `visibilitychange` 및 `pagehide/pageshow`를 다뤄 영상 진행 중 앱 전환·브라우저 페이지 캐시 복귀 시 **중단된 타이머를 해제하고 영상을 멈춘 뒤**, 다시 보일 때 사용자 클릭으로 재시작하게 합니다. 자동 재생하거나 백그라운드에서 결과를 확정하지 않습니다.
- Playwright의 Android Chromium/iPhone WebKit에서 브라우저 생명주기 이벤트를 *모의 발생*시켜 새 요청과 재시작 버튼을 검사합니다. 진짜 iOS/Android 백그라운드와 LTE/5G 기기 확인은 여전히 미실시이며, `docs/DEVICE-QA-RUNBOOK.md`에 실기기 승인 기준을 유지합니다.

### #88: 실물 저장소 연결 검증 (2026-10-28)

- **활성 테스트 저장소:** `mosigo-smoke-lab-linked-20261028` (Private, icn1, 사용 가능, 최초 연결 당시 객체 0개·E2E 이후 객체 1개). 테스트 전용 프로젝트 `mosigo-isolated-smoke-lab` **1곳에만 연결**됨을 프로젝트 연결 메타데이터로 확인했습니다. 운영 프로젝트 `mosigo`와는 별개입니다.
- **미사용 이전 저장소:** `mosigo-smoke-isolated-20261027` (Private, 객체 0개, 연결 프로젝트 0개). 이전 문서의 이 저장소를 실제 스모크 검사 대상으로 사용하지 마세요. 추후 관리자가 빈 리소스 유지·삭제 여부를 확인해야 합니다. 현재 삭제하지 않았습니다.
- Vercel이 테스트 프로젝트에 암호화된 `BLOB_READ_WRITE_TOKEN` 환경변수를 생성했지만 해당 값을 조회하지 않았습니다. 수동 검증 스크립트는 주변 RW 토큰을 거부하므로 별도 **테스트 프로젝트 범위 OIDC**가 필요합니다. 실제 검사/쓰기/삭제는 수행하지 않았습니다. 새 리소스 생성과 연결은 Vercel 사용량·과금 정책의 적용 대상일 수 있습니다.

### #88: 수동 격리 저장소 읽기 전용 만료 인벤토리

- `scripts/audit-isolated-retention.js`는 **격리된 테스트 Blob 저장소의 `mosigo-isolated-smoke/` 경로만** 읽기 전용으로 검사합니다. 기본 최대 2페이지 × 25건(최대 100건으로 제한), 최대 4KiB 마커만 읽으며 페이지/경로 중복, 범위 이탈, 이상한 응답은 실패로 처리합니다. 페이지가 남으면 `complete=false`를 표기합니다.
- 경로의 `runId`와 JSON 마커의 `runId`, 지정된 `evidenceRef`, 소유자 및 7일 만료 시간을 검사하고 **현재 유지·만료 후 독립 출처 검토 필요·미분류** 건수만 출력합니다. JSON 자체가 독립 소유권 증명이 아니므로 **`safeToDelete=false`, `candidateDeletions=0`은 항상 유지**합니다. 이 도구에는 삭제 및 쓰기 API가 없습니다.
- Vercel CI/함수에서는 실행하지 않으며 운영/테스트 저장소 ID를 각각 별도로 확인한 안전한 로컬 환경, `MOSIGO_ISOLATED_AUDIT_READ_ONLY=yes`, 저장소 범위로 제한된 **짧은 OIDC**가 필요합니다. 주변 `BLOB_READ_WRITE_TOKEN`이 있으면 실행을 거절하고, 결과에는 저장소 ID·파일명·비공개 URL·토큰을 담지 않습니다. 조회 자체도 Vercel 사용량·과금에 포함될 수 있습니다.
- **실행 전 관리자 조치**: 2026-10-28에 별도 비공개 `mosigo-smoke-lab-linked-20261028` 저장소를 **테스트 프로젝트 `mosigo-isolated-smoke-lab` 1곳에 연결 완료**했습니다. Vercel 저장소 API에서 `totalConnectedProjects=1`, 실제 연결 프로젝트 ID가 테스트 프로젝트와 동일함을 조회했고 객체 수 0·상태 `available`·리전 `icn1`임을 확인했습니다. 운영 `mosigo` 프로젝트와는 연결하지 않았습니다. 이전 `mosigo-smoke-isolated-20261027` 저장소는 객체 수 0·연결 프로젝트 0개인 **별도 미사용 저장소**로 남았습니다. 두 저장소를 혼동하지 마세요. 테스트 프로젝트의 환경변수에 암호화된 `BLOB_READ_WRITE_TOKEN`이 생겼으나 자격 증명을 읽거나 사용하지 않았습니다. 코드의 수동 도구는 이 환경변수가 있으면 거부하므로, **관리자 승인된 테스트 프로젝트 범위의 단기 OIDC**를 별도로 확보하고 주변 RW 토큰을 해제해야 합니다. 승인 및 외부 자격 확인 없이 원격 `put/get/list`를 호출하지 않습니다. 테스트 환경에 `BLOB_STORE_ID`가 있으면 반드시 **새 연결 테스트 저장소**와 일치해야 합니다.
- 위 연결과 별도 승인 후, 실제 실행 권한이 있는 로컬 셸에서만 다음 환경 설정과 실행을 사용합니다. ID와 토큰의 값은 저장소, 이슈, CI 로그에 기록하지 않습니다.

```bash
unset BLOB_READ_WRITE_TOKEN
# VERCEL_OIDC_TOKEN must come from the approved test-only project context
export MOSIGO_SMOKE_PRODUCTION_STORE_ID="<verified-production-store-id>"
export MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID="<independently-confirmed-production-store-id>"
export MOSIGO_SMOKE_TEST_STORE_ID="<verified-test-store-id>"
export MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID="<independently-confirmed-test-store-id>"
export MOSIGO_ISOLATED_AUDIT_READ_ONLY=yes
npm --prefix src ci --omit=dev
node scripts/audit-isolated-retention.js
```

- `scripts/check-isolated-blob-store.js` 수동 1회 쓰기 프로브도 환경에 `BLOB_STORE_ID`가 있으면 테스트 저장소 ID와 일치하는지 검증하도록 수정했습니다. **원격 쓰기/읽기 및 수동 인벤토리는 이번 변경에서 실행하지 않았습니다.** 기존 프로덕션 Blob 객체도 조회·수정·삭제하지 않았습니다.

## 릴리스 판단
- **이번 변경 배포 가능:** Production Smoke 영구 읽기 전용화, 회귀 테스트, 현재 권한 계약 설명 문서.
- **이번 변경에 포함하지 않음:** 기존 Blob 데이터 삭제/만료, 신규 WAF 차단 활성화, 공유 토큰 권한 변경, 실기기 QA 완료 선언.
- 데이터 격리 #88과 실제 모바일 실기기 검증 #99는 완료 증빙 전까지 열어 둡니다. 보안 이슈 #90은 GitHub에서 별도로 닫혀 있으나 WAF/전역 제한을 독립적으로 완료 검증했다고 간주하지 않습니다.
