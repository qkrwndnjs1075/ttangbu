# ttangbu API 명세 (MVP)

Base URL (local): `http://localhost:3000`

## 1. 공통 규칙

- 인증: `Authorization: Bearer <token>`
- 콘텐츠 타입: `application/json`
- 공통 에러 스키마:

```json
{
  "error": "ValidationError",
  "message": "...",
  "path": "/endpoint",
  "timestamp": "2026-03-05T00:00:00.000Z"
}
```

## 2. 엔드포인트 목록

### Health
- GET /health

### Auth
- POST /auth/register
- POST /auth/login
- GET /auth/me

### Listings
- GET /listings
- GET /listings/:id
- POST /listings
- PATCH /listings/:id
- PATCH /listings/:id/deactivate

### Applications
- POST /applications
- PATCH /applications/:id/transition
- GET /applications
- GET /applications/:id

### Messages
- GET /applications/:id/messages
- POST /applications/:id/messages

## 3. 요청/응답 예시

### 회원가입

`POST /auth/register`

```json
{
  "email": "user@example.com",
  "password": "Passw0rd!123",
  "name": "홍길동",
  "phone": "010-1234-5678"
}
```

성공(201):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "홍길동",
      "phone": "010-1234-5678",
      "role": "user",
      "created_at": "..."
    }
  }
}
```

### 로그인

`POST /auth/login`

```json
{
  "email": "user@example.com",
  "password": "Passw0rd!123"
}
```

성공(200):

```json
{
  "success": true,
  "data": {
    "token": "...",
    "expires_at": "...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "홍길동",
      "phone": "010-1234-5678",
      "role": "user"
    }
  }
}
```

### 매물 목록 조회(필터)

`GET /listings?location=Seoul&min_price=1000000&max_price=3000000&status=active&page=1&limit=20`

성공(200):

```json
{
  "success": true,
  "data": {
    "listings": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "pages": 0
    }
  }
}
```

### 신청 상태 전이

`PATCH /applications/:id/transition`

```json
{
  "status": "approved",
  "reason": "서류 확인 완료"
}
```

성공(200) 또는 비허용 전이(409 `ConflictError`)

### 메시지 전송

`POST /applications/:id/messages`

```json
{
  "content": "안녕하세요. 추가 서류를 전달드립니다."
}
```

성공(201): `data.message` 반환

## 4. 보안/가드레일 관련 응답

- 요청 본문 초과: `413 PayloadTooLarge`
- 로그인 과다 시도: `429 RateLimitExceeded`
- 권한 없음: `401 Unauthorized`, `403 Forbidden`
