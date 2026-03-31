#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QA automation for T8 Frontend - Capture filter screenshots
"""

import subprocess
import time
import sys
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# Fix unicode on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Project paths
PROJECT_ROOT = Path(r"C:\Users\user\Desktop\ttangbu")
EVIDENCE_DIR = PROJECT_ROOT / ".sisyphus" / "evidence"
FRONTEND_PORT = 5173
BACKEND_PORT = 3000


def start_backend():
    """Start backend server"""
    print("Starting backend server...")
    backend_dir = PROJECT_ROOT / "backend"
    return subprocess.Popen(
        "npm run dev",
        shell=True,
        cwd=backend_dir,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def start_frontend():
    """Start frontend server"""
    print("Starting frontend server...")
    frontend_dir = PROJECT_ROOT / "frontend"
    return subprocess.Popen(
        "npm run dev",
        shell=True,
        cwd=frontend_dir,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_server(url, max_retries=30):
    """Wait for server to be ready"""
    import urllib.request

    for i in range(max_retries):
        try:
            urllib.request.urlopen(url, timeout=2)
            print(f"Server ready: {url}")
            return True
        except Exception:
            if i < max_retries - 1:
                time.sleep(1)
    print(f"Server not ready: {url}")
    return False


def capture_screenshots():
    """Capture both filter and empty-state screenshots"""

    frontend_url = f"http://localhost:{FRONTEND_PORT}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to listings page
            print(f"Navigating to {frontend_url}")
            page.goto(frontend_url)
            page.wait_for_load_state("networkidle")

            # Wait for the page title to appear
            page.wait_for_selector("h2", timeout=5000)
            time.sleep(1)  # Extra time for initial load

            # ========== SCREENSHOT 1: Price Filter with Results ==========
            print("Capturing price filter screenshot...")

            # Fill in min and max price
            page.fill("#minPrice", "1000000")
            page.fill("#maxPrice", "3000000")

            # Click search button
            page.click('button:has-text("검색")')

            # Wait for results to load
            page.wait_for_load_state("networkidle")
            time.sleep(1)

            # Take screenshot
            screenshot_path = EVIDENCE_DIR / "task-8-price-filter.png"
            page.screenshot(path=str(screenshot_path), full_page=True)
            print(f"Saved: {screenshot_path}")

            # ========== SCREENSHOT 2: Empty State ==========
            print("Capturing empty-state screenshot...")

            # Reset filters
            page.click('button:has-text("초기화")')
            page.wait_for_load_state("networkidle")
            time.sleep(0.5)

            # Set filters that will return no results
            # Using very high min price that won't exist
            page.fill("#minPrice", "99999999")
            page.fill("#maxPrice", "100000000")

            # Click search button
            page.click('button:has-text("검색")')

            # Wait for empty state
            page.wait_for_load_state("networkidle")
            time.sleep(1)

            # Wait for the state message to appear (either empty state or results)
            # The page should show "검색 조건에 맞는 매물이 없습니다" or pagination info
            try:
                page.wait_for_selector(".state-message, .pagination-info", timeout=3000)
            except:
                pass  # Continue anyway

            # Take screenshot
            screenshot_path = EVIDENCE_DIR / "task-8-empty-state.png"
            page.screenshot(path=str(screenshot_path), full_page=True)
            print(f"Saved: {screenshot_path}")

            print("\nAll screenshots captured successfully!")
            return True

        except Exception as e:
            print(f"Error during automation: {e}")
            import traceback

            traceback.print_exc()
            return False
        finally:
            browser.close()


def main():
    """Main execution"""
    backend_proc = None
    frontend_proc = None

    try:
        print("Starting QA automation...\n")

        # Start servers
        backend_proc = start_backend()
        frontend_proc = start_frontend()

        # Wait for servers to be ready
        print("Waiting for servers to start...")
        time.sleep(3)  # Initial wait

        backend_url = f"http://localhost:{BACKEND_PORT}/health"
        frontend_url = f"http://localhost:{FRONTEND_PORT}"

        # Check backend
        if not wait_for_server(backend_url, max_retries=20):
            print("Warning: Backend health check failed, continuing anyway...")

        # Check frontend
        if not wait_for_server(frontend_url, max_retries=20):
            print("Frontend server failed to start")
            return False

        time.sleep(2)  # Extra wait for everything to be ready

        # Capture screenshots
        success = capture_screenshots()

        return success

    except KeyboardInterrupt:
        print("\nInterrupted by user")
        return False
    finally:
        # Clean up processes
        print("\nCleaning up...")
        if backend_proc:
            backend_proc.terminate()
            try:
                backend_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                backend_proc.kill()

        if frontend_proc:
            frontend_proc.terminate()
            try:
                frontend_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                frontend_proc.kill()

        print("Cleanup complete")


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
