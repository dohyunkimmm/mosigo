# 모시고 (Mosigo)

자녀가 부모님의 병원 이용을 대신 준비하고, 병원 탐색부터 동행 매니저 매칭·동의/결제·실시간 동행·건강 리포트·재예약까지 이어지는 흐름을 검증하기 위한 인터랙티브 병원동행 서비스 프로토타입입니다.

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

## 저장소 구조

```text
.
└── src/
    ├── index.html          # 메인 인터랙티브 데모
    ├── api/
    │   └── hospitals.js    # 프로토타입 병원 검색 API
    ├── vercel.json         # Vercel 프로젝트 설정
    └── ...                 # 이미지·영상 등 UI 자산
```

## 배포

- **Production branch:** `main`
- **Vercel Root Directory:** `src`
- **Production URL:** https://mosigo-nine.vercel.app/

현재 GitHub `main`의 복원된 소스를 기준으로 Vercel Production이 배포되도록 연결되어 있습니다.

## 로컬 확인

정적 화면만 확인할 경우 `src/`를 로컬 정적 서버로 열면 됩니다.

예시:

```bash
cd src
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속하세요. `/api/hospitals`까지 포함한 Vercel 환경을 동일하게 확인하려면 Vercel 개발 환경을 사용해야 합니다.

## 상태

- Vercel Drop 기준 소스 복원 완료
- GitHub `main` 동기화 완료
- Git 기반 Production 재배포 및 동작 검증 완료
- GitHub README와 Notion 프로젝트 문서 동기화 완료

마지막 문서 동기화: 2026-09-12
