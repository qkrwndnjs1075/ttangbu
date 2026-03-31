# 땅부 (ttangbu) - 토지 임대 플랫폼 MVP

4주 완성 MVP 프로젝트: 오프라인 토지 임대 과정을 온라인화

## 프로젝트 구조

```text
ttangbu/
├── frontend/          # React + TypeScript + React Query
├── backend/           # Node.js Hono + SQLite
├── docs/              # 기능 명세, ERD, API 문서
├── package.json       # 루트 패키지 정의
├── README.md          # 이 파일
└── .gitignore         # Git 제외 패턴
```

## 핵심 기능 (MVP)

- **매물 관리**: 등록, 조회, 수정, 비활성화
- **지도 기반 필지 시각화**: 저장된 필지 경계를 지도 위에 표시, 클릭 시 옆 패널에서 상세 정보 확인
- **검색/필터**: 지역 텍스트, 가격 범위, 상태 필터
- **임대 신청**: 임차인 신청, 소유자 승인/거절
- **상태 관리**: 신청 및 계약 상태 타임라인
- **메시지**: 신청 단위 비동기 메시지

## 제외 사항 (가드레일)

- 결제/정산 기능
- 마이크로서비스/이벤트 버스
- 실시간 웹소켓 채팅
- 고급 지도/지리 검색 (PostGIS 등)
- 과도한 인증 확장

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 19 + TypeScript + React Query + Vite |
| **Backend** | Node.js + Hono + SQLite |
| **Infra** | Local Node runtime + Ubuntu systemd runbook |
| **CI** | GitHub Actions |

## 실행 명령어

### 개발 서버 실행

```bash
npm run dev:frontend
npm run dev:backend
npm run dev
```

### 빌드

```bash
npm run build
```

### 테스트

```bash
npm run test
```

### 타입 체크 & 린트

```bash
npm run check
```

## 일정

- **시작**: 2026.03.09
- **마감**: 2026.04.04 (4주)
- **개발 인원**: 1인

## 참고 문서

- 기능 명세: `docs/FEATURES.md`
- 데이터베이스 ERD: `docs/ERD.md`
- API 명세: `docs/API.md`
- 운영 런북(로컬 비도커): `docs/runbook-ubuntu-local.md`
- 보안 가드레일: `docs/security-guardrails.md`
- 최종 보고서: `docs/FINAL_REPORT.md`

## 지도 API 설정

- 실제 공공 필지 경계 조회는 브이월드 키가 필요합니다.
- `frontend/.env.example`를 참고해 `VITE_VWORLD_API_KEY`를 설정하세요.

---

**상태**: T1~T20 구현 완료, Final Wave 검증 진행 가능
