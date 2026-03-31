# ttangbu Ubuntu Runbook (Local, Non-Docker)

This runbook is for Ubuntu hosts that run ttangbu directly with Node.js and systemd.
It does not use Docker.

## 1) Prerequisites

- Ubuntu 22.04+
- Node.js 20.x
- npm 9+
- Git
- systemd

## 2) Environment Variables

Create `backend/.env`:

```bash
PORT=3000
NODE_ENV=production
```

Create `frontend/.env.production`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000
```

## 3) First-Time Deployment

```bash
# 1. Clone
git clone <REPO_URL> /opt/ttangbu
cd /opt/ttangbu

# 2. Install dependencies
npm ci

# 3. Database migration
cd backend && npm run migrate && cd ..

# 4. Build
npm run build
```

Install systemd service files from `ops/systemd/`:

```bash
sudo cp ops/systemd/ttangbu-backend.service /etc/systemd/system/
sudo cp ops/systemd/ttangbu-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ttangbu-backend ttangbu-frontend
sudo systemctl start ttangbu-backend ttangbu-frontend
```

Health checks:

```bash
curl -sSf http://127.0.0.1:3000/health
curl -sSf http://127.0.0.1:5173
```

## 4) Restart Procedure

```bash
sudo systemctl restart ttangbu-backend
sudo systemctl restart ttangbu-frontend

sudo systemctl status ttangbu-backend --no-pager
sudo systemctl status ttangbu-frontend --no-pager
```

## 5) Rolling Update Procedure

```bash
cd /opt/ttangbu
git pull --ff-only
npm ci
cd backend && npm run migrate && cd ..
npm run build
sudo systemctl restart ttangbu-backend ttangbu-frontend
curl -sSf http://127.0.0.1:3000/health
```

## 6) Rollback Procedure

Before deploy, keep backup files:

```bash
cp backend/db/ttangbu.db backend/db/ttangbu.backup.$(date +%Y%m%d_%H%M%S).db
```

Rollback steps:

```bash
# 1) Stop services
sudo systemctl stop ttangbu-backend ttangbu-frontend

# 2) Restore previous code revision
cd /opt/ttangbu
git reset --hard <PREVIOUS_COMMIT>
npm ci
npm run build

# 3) Restore DB backup if schema/data mismatch is suspected
cp backend/db/ttangbu.backup.<STAMP>.db backend/db/ttangbu.db

# 4) Start services and verify
sudo systemctl start ttangbu-backend ttangbu-frontend
curl -sSf http://127.0.0.1:3000/health
```

## 7) Logs and Troubleshooting

```bash
sudo journalctl -u ttangbu-backend -n 200 --no-pager
sudo journalctl -u ttangbu-frontend -n 200 --no-pager
```

Common fixes:

- Port conflict: check process and free 3000/5173.
- Migration issue: restore DB backup, re-run migration.
- Frontend API mismatch: verify `frontend/.env.production` `VITE_API_BASE_URL`.

## 8) Local Rehearsal Commands (without Docker)

Use this repository helper to generate rehearsal evidence:

```bash
python scripts/rehearse_task17_local.py
```

Expected output files:

- `.sisyphus/evidence/task-17-runbook.txt`
- `.sisyphus/evidence/task-17-rollback.txt`
