#!/usr/bin/env python3
"""Task 18 smoke E2E checks (local, non-docker)."""

from __future__ import annotations

import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(r"C:\Users\user\Desktop\ttangbu")
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

BACKEND_URL = "http://localhost:3000/health"
FRONTEND_URL = "http://localhost:5173"


def is_up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def wait_up(url: str, timeout_sec: int = 45) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if is_up(url):
            return True
        time.sleep(1)
    return False


def stop(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


def main() -> int:
    backend_proc = None
    frontend_proc = None

    if not is_up(BACKEND_URL):
        backend_proc = subprocess.Popen(
            "npm run dev",
            cwd=BACKEND_DIR,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    if not is_up(FRONTEND_URL):
        frontend_proc = subprocess.Popen(
            "npm run dev",
            cwd=FRONTEND_DIR,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    try:
        if not wait_up(BACKEND_URL) or not wait_up(FRONTEND_URL):
            print("SMOKE_FAIL: backend/frontend not ready")
            return 1

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            page.goto("http://localhost:5173/listings", wait_until="domcontentloaded")
            page.wait_for_selector("h2", timeout=10000)
            listings_text = page.locator("h2").first.inner_text()

            page.goto(
                "http://localhost:5173/my-applications", wait_until="domcontentloaded"
            )
            page.wait_for_selector(".page", timeout=10000)
            page_text = page.locator("body").inner_text()

            browser.close()

        if "매물 탐색" not in listings_text:
            print("SMOKE_FAIL: listings heading mismatch")
            return 1

        if "내 신청" not in page_text:
            print("SMOKE_FAIL: protected page did not render expected shell")
            return 1

        print("SMOKE_PASS: listings and my-applications pages rendered")
        return 0
    finally:
        stop(backend_proc)
        stop(frontend_proc)


if __name__ == "__main__":
    raise SystemExit(main())
