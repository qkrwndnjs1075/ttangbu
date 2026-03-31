# Security Guardrails (T19)

This project applies baseline guardrails for abuse and unsafe input handling.

## 1) Input and Payload Validation

- Route inputs are validated with Zod schemas.
- Oversized HTTP bodies are blocked before route handlers.
- Default max request body size: `102400` bytes (100KB).
- Configure via `MAX_BODY_BYTES`.

## 2) Login/Register Rate Limiting

- `POST /auth/login` is rate-limited by IP + path.
- `POST /auth/register` is also rate-limited by IP + path.
- Defaults:
  - login: 5 requests / 60 seconds
  - register: 10 requests / 60 seconds
- 429 responses use error type `RateLimitExceeded` and include `Retry-After`.

## 3) Secrets Handling Policy

- Do not commit real secrets to git.
- Use local `.env` files only; they are ignored by `.gitignore`.
- Keep committed config in example form only (`backend/.env.example`).

## 4) Evidence Artifacts

- `task-19-oversize.json`: oversized request rejection proof
- `task-19-ratelimit.txt`: repeated login failure throttling proof
