# 땅부(ttangbu) MVP 최종 보고서

## 1. 프로젝트 개요

- 프로젝트명: 땅부 (토지 임대 플랫폼 MVP)
- 목표: 오프라인 임대 절차를 온라인 핵심 흐름으로 전환
- 기간: 4주 계획 기반 실행
- 구조: `frontend` + `backend` 분리 모노레포

## 2. 구현 범위 요약

- 완료: T1 ~ T20 (계획서 기준)
- 핵심 흐름 구현 완료:
  1) 회원가입/로그인
  2) 매물 등록/조회/검색/수정/비활성화
  3) 신청 생성 및 상태 전이
  4) 상태 타임라인 조회
  5) 신청 단위 비동기 메시지

## 3. 운영/배포 방식

- 현재 실행 기준: 로컬 비도커 운영
- 운영 문서: `docs/runbook-ubuntu-local.md`
- 시스템 서비스 템플릿: `ops/systemd/`

참고: 원 계획의 Docker 항목(T16)은 사용자 지시에 따라 로컬 운영 기준으로 대체 진행됨.

## 4. 품질/검증

- 표준 검증 명령:
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- E2E/스모크 검증:
  - `scripts/test-task-18-smoke-e2e.py`
- 보안 가드레일 검증:
  - oversized payload 차단(413)
  - brute-force 로그인 시도 제한(429)

## 5. 데이터 모델 및 API 문서

- ERD: `docs/ERD.md`
- API: `docs/API.md`
- 기능 명세: `docs/FEATURES.md`

## 6. 리스크 및 후속 개선

- 현재 rate limit은 인메모리 기반이므로 단일 프로세스 환경에서만 유효
- 확장 시 Redis 기반 분산 rate limiter 전환 필요
- 인증 토큰 저장 정책(localStorage)은 XSS 대비 강화 여지 존재

## 7. 결론

MVP 필수 범위와 사용자 핵심 여정을 구현했고, 테스트/문서/운영 절차를 포함한 제출 가능한 수준의 산출물을 정리했다.
