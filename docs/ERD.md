# ttangbu 데이터베이스 ERD

## 엔터티 관계 다이어그램

```mermaid
erDiagram
  USERS ||--o{ LISTINGS : owns
  USERS ||--o{ APPLICATIONS : applies
  LISTINGS ||--o{ APPLICATIONS : receives
  APPLICATIONS ||--o{ MESSAGES : has
  USERS ||--o{ MESSAGES : sends
  APPLICATIONS ||--o{ STATUS_LOGS : tracks
  USERS ||--o{ STATUS_LOGS : changes
  USERS ||--o{ SESSIONS : has

  USERS {
    int id PK
    string email UK
    string password_hash
    string name
    string phone
    string role
    string created_at
    string updated_at
  }

  LISTINGS {
    int id PK
    int owner_id FK
    string title
    string description
    string location
    float area_sqm
    int price_per_month
    string status
    string created_at
    string updated_at
  }

  APPLICATIONS {
    int id PK
    int listing_id FK
    int applicant_id FK
    string status
    string message
    string start_date
    string end_date
    string created_at
    string updated_at
  }

  MESSAGES {
    int id PK
    int application_id FK
    int sender_id FK
    string content
    string created_at
  }

  STATUS_LOGS {
    int id PK
    int application_id FK
    string from_status
    string to_status
    int changed_by FK
    string reason
    string created_at
  }

  SESSIONS {
    int id PK
    int user_id FK
    string token UK
    string expires_at
    string created_at
    string last_used_at
  }
```

## 주요 제약

- `users.email` 유니크
- `sessions.token` 유니크
- `applications(listing_id, applicant_id)` 유니크
- 상태 enum 체크
  - `listings.status`: `active | inactive | rented`
  - `applications.status`: `pending | approved | rejected | active | cancelled | completed`
