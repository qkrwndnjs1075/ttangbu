-- Migration: 002_auth_sessions.sql
-- Purpose: Add session management for authentication
-- Date: 2026-03-04

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
-- Token-based session management
-- Each login creates a session with a cryptographically random token
-- Sessions expire after 30 days of inactivity
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
