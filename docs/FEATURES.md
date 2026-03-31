# ttangbu MVP 기능 명세

## 1. 목표

- 오프라인 토지 임대 과정을 온라인화한다.
- 핵심 사용자 흐름은 `매물 탐색 -> 신청 -> 승인/거절 -> 상태 추적 -> 메시지`다.

## 2. 사용자 역할

- 단일 계정 기반 사용자 (`users.role=user` 기본)
- 한 사용자가 소유자/임차인 역할을 동시에 수행할 수 있다.

## 3. 핵심 기능 (구현 완료)

### 3.1 인증/세션
- 회원가입 (`POST /auth/register`)
- 로그인 (`POST /auth/login`)
- 내 정보 조회 (`GET /auth/me`)
- Bearer 토큰 기반 세션 인증

### 3.2 매물 관리
- 매물 등록 (`POST /listings`)
- 매물 목록 조회 (`GET /listings`)
- 매물 상세 조회 (`GET /listings/:id`)
- 매물 수정 (`PATCH /listings/:id`)
- 매물 비활성화 (`PATCH /listings/:id/deactivate`)

### 3.3 검색/필터
- 지역 텍스트 검색
- 가격 범위(min/max) 필터
- 상태(active/inactive/rented) 필터
- 페이지네이션(`page`, `limit`)
- 지도 기반 필지 경계 표시 및 클릭 사이드패널

### 3.4 신청/상태머신
- 신청 생성 (`POST /applications`)
- 상태 전이 (`PATCH /applications/:id/transition`)
- 내 신청/내 매물 관련 신청 목록 (`GET /applications`)
- 신청 상세 + 상태 로그 (`GET /applications/:id`)

### 3.5 메시지
- 신청 단위 메시지 조회 (`GET /applications/:id/messages`)
- 신청 단위 메시지 작성 (`POST /applications/:id/messages`)
- 참여자(소유자/신청자)만 접근 가능

## 4. 보안/입력 가드레일

- Zod 입력 검증
- 요청 바디 크기 제한 (기본 100KB, `MAX_BODY_BYTES`)
- 로그인/회원가입 rate limit (IP + path)
- 에러 응답 표준화 (`error`, `message`, `path`, `timestamp`)

## 5. 비기능 요구사항

- 로컬 비도커 운영 기준 (사용자 지시 반영)
- 품질 게이트: type-check, lint, test, build
- SQLite 기반 단일 인스턴스 MVP
- 브이월드 API 키 설정 시 실제 공공 필지 경계 조회 가능

## 6. 제외 범위

- 결제/정산
- 실시간 웹소켓 채팅
- 마이크로서비스 분리
