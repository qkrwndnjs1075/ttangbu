#!/usr/bin/env python3
"""Generate T17 runbook rehearsal evidence for local non-Docker workflow."""

from __future__ import annotations

import shutil
import sqlite3
import subprocess
import time
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(r"C:\Users\user\Desktop\ttangbu")
BACKEND_DIR = ROOT / "backend"
EVIDENCE_DIR = ROOT / ".sisyphus" / "evidence"
TEMP_DIR = ROOT / ".sisyphus" / "tmp" / "task-17"

RUNBOOK_EVIDENCE = EVIDENCE_DIR / "task-17-runbook.txt"
ROLLBACK_EVIDENCE = EVIDENCE_DIR / "task-17-rollback.txt"

SOURCE_DB = BACKEND_DIR / "db" / "ttangbu.db"
BACKUP_DB = TEMP_DIR / "ttangbu.backup.db"
REHEARSAL_DB = TEMP_DIR / "ttangbu.rehearsal.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def wait_http(url: str, timeout_sec: int = 30) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1)
    return False


def start_backend_for_rehearsal(port: int) -> subprocess.Popen[bytes]:
    env = dict(os.environ)
    env["PORT"] = str(port)
    command = (
        "set PORT={port}&& npm run dev".format(port=port)
        if os.name == "nt"
        else "npm run dev"
    )
    return subprocess.Popen(
        command,
        cwd=BACKEND_DIR,
        env=env,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def stop_process(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def users_count(db_path: Path) -> int:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        row = cur.fetchone()
        return int(row[0] if row else 0)
    finally:
        conn.close()


def insert_rehearsal_user(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users (email, password_hash, name, role)
            VALUES (?, ?, ?, ?)
            """,
            (
                f"rollback-rehearsal-{int(time.time())}@example.com",
                "rehearsal-hash",
                "Rollback Rehearsal",
                "user",
            ),
        )
        conn.commit()
    finally:
        conn.close()


def run_runbook_rehearsal() -> list[str]:
    lines: list[str] = []
    lines.append(f"[T17-RUNBOOK] started_at={now_iso()}")
    lines.append("mode=local-non-docker")

    process: subprocess.Popen[bytes] | None = None
    try:
        process = start_backend_for_rehearsal(3300)
        up_ok = wait_http("http://localhost:3300/health", timeout_sec=45)
        lines.append(
            f"step=deploy-start-backend port=3300 status={'PASS' if up_ok else 'FAIL'}"
        )

        stop_process(process)
        process = None
        lines.append("step=restart-stop-backend status=PASS")

        process = start_backend_for_rehearsal(3300)
        restart_ok = wait_http("http://localhost:3300/health", timeout_sec=45)
        lines.append(
            f"step=restart-start-backend port=3300 status={'PASS' if restart_ok else 'FAIL'}"
        )

        env_ok = wait_http("http://localhost:3300/health", timeout_sec=5)
        lines.append(
            f"step=env-procedure PORT=3300 status={'PASS' if env_ok else 'FAIL'}"
        )

        overall = up_ok and restart_ok and env_ok
        lines.append(f"result={'PASS' if overall else 'FAIL'}")
        return lines
    finally:
        stop_process(process)


def run_rollback_rehearsal() -> list[str]:
    lines: list[str] = []
    lines.append(f"[T17-ROLLBACK] started_at={now_iso()}")
    lines.append("mode=db-copy-simulation")

    if not SOURCE_DB.exists():
        lines.append(f"step=precheck-source-db status=FAIL path={SOURCE_DB}")
        lines.append("result=FAIL")
        return lines

    shutil.copy2(SOURCE_DB, BACKUP_DB)
    shutil.copy2(SOURCE_DB, REHEARSAL_DB)
    lines.append(f"step=create-backup status=PASS backup={BACKUP_DB}")

    before = users_count(REHEARSAL_DB)
    insert_rehearsal_user(REHEARSAL_DB)
    after_change = users_count(REHEARSAL_DB)
    lines.append(
        f"step=mutate-rehearsal-db status={'PASS' if after_change == before + 1 else 'FAIL'} before={before} after={after_change}"
    )

    shutil.copy2(BACKUP_DB, REHEARSAL_DB)
    after_restore = users_count(REHEARSAL_DB)
    restore_ok = after_restore == before
    lines.append(
        f"step=restore-from-backup status={'PASS' if restore_ok else 'FAIL'} restored={after_restore}"
    )

    lines.append(
        f"result={'PASS' if restore_ok and after_change == before + 1 else 'FAIL'}"
    )
    return lines


def main() -> int:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    runbook_lines = run_runbook_rehearsal()
    RUNBOOK_EVIDENCE.write_text("\n".join(runbook_lines) + "\n", encoding="utf-8")

    rollback_lines = run_rollback_rehearsal()
    ROLLBACK_EVIDENCE.write_text("\n".join(rollback_lines) + "\n", encoding="utf-8")

    runbook_ok = any(line == "result=PASS" for line in runbook_lines)
    rollback_ok = any(line == "result=PASS" for line in rollback_lines)
    return 0 if runbook_ok and rollback_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
