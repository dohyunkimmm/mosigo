# 모시고 (Mosigo)

자녀가 부모님의 병원 이용을 대신 준비하고, 병원 탐색부터 동행 매니저 매칭·동의/결제·실시간 동행·건강 리포트·재예약까지 이어지는 흐름을 검증하기 위한 인터랙티브 병원동행 서비스 프로토타입입니다.

- **Current stable version:** `v2.0.0`
- **Live Demo:** https://mosigo-nine.vercel.app/

## 프로젝트 개요

모시고는 병원동행 서비스의 핵심 사용자 여정을 한 번에 체험할 수 있도록 만든 모바일 중심 프로토타입입니다. 경쟁 앱 7종과 사용자 리뷰 118건을 분석해 지역 서비스 공백, 본인 신청 중심 구조, 매니저 정보 부족 등의 반복 불편을 정리하고 화면 흐름에 반영했습니다.

주요 흐름은 다음과 같습니다.

`가입·건강 연동 → 병원 탐색 → 매니저 매칭 → 동의·결제 → 실시간 동행 → 건강 리포트 → 재예약·혜택`

## 구현 범위

- 병원 검색 및 진료과 필터
- 동행 매니저 비교·매칭
- 민감정보 동의 및 결제 흐름
- 동행 진행 타임라인
- 건강 리포트와 재예약 흐름
- 모바일 화면 중심 인터랙티브 UI
- 프로토타입용 병원 데이터 API

> 이 프로젝트는 실제 의료·예약 서비스를 제공하는 운영 서비스가 아니라 서비스 기획과 UX 흐름을 검증하기 위한 프로토타입입니다.

## 기술 구성

- HTML / CSS / JavaScript
- Leaflet
- Vercel
- Vercel Serverless Function (`src/api/hospitals.js`)
- Node.js built-in test runner (repository quality checks)
- GitHub Actions

## 저장소 구조

```text
.
├── .github/workflows/
│   ├── quality.yml             # PR/main 자동 QA
│   └── release.yml             # 최종 QA 후 수동 Tag/Release 발행
├── tests/
│   ├── hospitals.test.js       # 병원 API 동작 검증
│   └── static-site.test.js     # 정적 페이지·자산·inline JS 검증
├── CHANGELOG.md                # 버전별 누적 변경 기록
├── VERSION                     # 현재 안정 버전
└── src/
    ├── index.html              # 메인 인터랙티브 데모
    ├── api/
    │   └── hospitals.js        # 프로토타입 병원 검색 API
    ├── vercel.json             # Vercel 프로젝트 설정
    └── ...                     # 이미지·영상 등 UI 자산
```

## 배포

- **Production branch:** `main`
- **Vercel Root Directory:** `src`
- **Production URL:** https://mosigo-nine.vercel.app/

GitHub `main`의 검증된 소스를 기준으로 Vercel Production이 배포됩니다. 저장소 루트의 테스트/문서 파일은 Vercel Root Directory(`src`) 밖에 있어 앱 런타임에 영향을 주지 않습니다.

## 품질 검증

`npm test`는 다음 v2 기준을 자동 검증합니다.

- 병원 API 기본 응답·진료과/이름 검색·결과 수 제한·HTTP method 처리
- 필수 페이지/API/Vercel 설정 파일 존재 여부
- 메인 페이지의 언어·viewport·title·description 등 기본 metadata
- HTML/CSS가 참조하는 로컬 자산의 누락 여부
- classic inline JavaScript의 syntax validity

```bash
npm test
```

동일한 검증은 Pull Request와 `main` push 시 GitHub Actions에서도 실행됩니다. v2 최종 QA에서는 Production의 메인 페이지, 이벤트 페이지, 게임 페이지, 병원 API와 진료과 필터 응답을 실제 Vercel 환경에서 추가 확인하고 runtime error/fatal 로그가 없는지도 점검합니다.

## Release

GitHub Release는 `.github/workflows/release.yml`을 통해 최종 QA 이후에만 수동 발행합니다. Release workflow는 `main`에서 `npm test`를 다시 실행하고 `VERSION` 값을 읽어 동일한 버전의 Release가 없는지 확인한 뒤 Git tag와 GitHub Release를 함께 생성합니다.

저장소 전체 Actions 기본 권한은 read-only로 유지하며, Release workflow에만 `contents: write` 권한을 제한적으로 부여합니다.

## 로컬 확인

정적 화면만 확인할 경우 `src/`를 로컬 정적 서버로 열면 됩니다.

```bash
cd src
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속하세요. `/api/hospitals`까지 포함한 Vercel 환경을 동일하게 확인하려면 Vercel 개발 환경을 사용해야 합니다.

## 버전 전략

Mosigo는 기존 안정 동작을 유지하면서 버전별로 점진적으로 고도화합니다. 각 버전의 변경 내용은 `CHANGELOG.md`에 누적합니다.

## 상태

- `v2.0.0` 안정 기준선 정립
- Vercel Drop 기준 소스 복원 완료
- GitHub `main` 동기화 완료
- Git 기반 Production 재배포 및 동작 검증 완료
- GitHub README와 Notion 프로젝트 문서 동기화 완료
- PR/main 자동 API 및 정적 사이트 QA 추가
- v2 최종 Production runtime smoke QA 통과
- 최종 QA 후 수동 Git tag/GitHub Release 발행 workflow 구성 완료

마지막 문서 동기화: 2026-09-12
