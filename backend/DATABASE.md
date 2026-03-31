# Database Configuration - ttangbu Backend

## Database Path Convention

### Development
- **Path**: `backend/db/ttangbu.db`
- **Relative to**: Project root (`Desktop/ttangbu`)
- **Created by**: Migration runner on first run
- **Gitignore**: Database files excluded (`.db`, `.db-shm`, `.db-wal`)

### Docker/Production
- **Container path**: `/app/db/ttangbu.db`
- **Volume mount**: `./backend/db:/app/db`
- **Persistence**: SQLite database persisted via Docker volume
- **Backup strategy**: Copy `ttangbu.db` file periodically

## Migration Usage

### Run migrations
```bash
cd backend
npm run migrate
```

### Reset database (DANGEROUS - deletes all data)
```bash
cd backend
npm run migrate:reset
```

## Schema Version

Current schema version: **v3** (001_initial_schema.sql + 002_auth_sessions.sql + 003_listing_parcel_geometry.sql)

### Tables
1. **users** - User accounts (owner + renter roles)
2. **listings** - Property/land listings
   - parcel geometry fields: `parcel_pnu`, `center_lat`, `center_lng`, `parcel_geojson`
3. **applications** - Rental applications
4. **messages** - Per-application messaging threads
5. **status_logs** - Append-only audit log for state transitions

## Foreign Key Constraints

⚠️ **CRITICAL**: SQLite foreign keys must be enabled explicitly:
```sql
PRAGMA foreign_keys = ON;
```

This is handled automatically by:
- Migration runner (`migrate.cjs`)
- Application database connections (to be implemented in T6/T7)

## Status Lifecycle Rules

### Application Status Transitions
```
pending → approved → active → completed
        → rejected
        → cancelled
```

**Enforced by**: CHECK constraint in `applications` table
**Logged by**: `status_logs` table (append-only)

## Backup Strategy (for Ubuntu deployment)

### Manual backup
```bash
cp backend/db/ttangbu.db backend/db/ttangbu.backup.$(date +%Y%m%d_%H%M%S).db
```

### Restore from backup
```bash
cp backend/db/ttangbu.backup.YYYYMMDD_HHMMSS.db backend/db/ttangbu.db
```

### Docker volume backup
```bash
docker-compose down
docker run --rm -v ttangbu_db_volume:/data -v $(pwd)/backups:/backup alpine tar czf /backup/db-backup.tar.gz -C /data .
```

## Notes for Future Tasks

- **T6 (Auth)**: Database connection initialization with FK pragma
- **T7 (Listings)**: Use prepared statements to prevent SQL injection
- **T9 (Applications)**: Status transition validation before INSERT/UPDATE
- **T11 (Audit)**: status_logs append-only (no UPDATE/DELETE)
- **T16 (Docker)**: Volume mount configured in docker-compose.yml
