#!/usr/bin/env python3
"""
Task 10: Test Dashboard Pages
- Capture owner dashboard showing listings and applications
- Capture renter accessing owner page (blocked state)
"""

import sys
import time
import json
import requests
from playwright.sync_api import sync_playwright, Page

AUTH_TOKEN_KEY = "ttangbu_auth_token"


def get_auth_token(email: str, password: str = "password123") -> str | None:
    """Get authentication token via login API"""
    try:
        response = requests.post(
            "http://localhost:3000/auth/login",
            json={"email": email, "password": password},
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("data", {}).get("token")
        else:
            print(f"Login failed for {email}: {response.status_code}")
            return None
    except Exception as e:
        print(f"Error getting token for {email}: {e}")
        return None


def set_auth_token(page: Page, token: str):
    """Inject auth token into localStorage"""
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")

    # Inject token into localStorage
    page.evaluate(f"""
        localStorage.setItem('{AUTH_TOKEN_KEY}', '{token}');
    """)

    # Reload to apply token
    page.reload()
    page.wait_for_load_state("networkidle")


def capture_owner_dashboard(page: Page, output_path: str):
    """Capture owner dashboard showing owned listings and applications"""
    print("Capturing owner dashboard...")

    # Get owner token
    token = get_auth_token("owner@test.com")
    if not token:
        print("ERROR: Failed to get owner token")
        return False

    # Set token in localStorage
    set_auth_token(page, token)

    # Navigate to My Listings page
    page.goto("http://localhost:5173/my-listings")
    page.wait_for_load_state("networkidle")

    # Wait for content to load
    time.sleep(1.5)

    # Wait for either listings or state message
    try:
        page.wait_for_selector(
            ".listings-grid, .application-list, .state-message", timeout=5000
        )
    except:
        pass

    # Take full page screenshot
    page.screenshot(path=output_path, full_page=True)
    print(f"[OK] Owner dashboard captured: {output_path}")
    return True


def capture_renter_blocked(page: Page, output_path: str):
    """Capture renter trying to access owner page (should show blocked state)"""
    print("Capturing renter blocked state...")

    # Get renter token
    token = get_auth_token("renter-t10@test.com")
    if not token:
        print("ERROR: Failed to get renter token")
        return False

    # Set token in localStorage
    set_auth_token(page, token)

    # Navigate to My Listings page (should be blocked)
    page.goto("http://localhost:5173/my-listings")
    page.wait_for_load_state("networkidle")

    # Wait for error/blocked message
    time.sleep(1.5)

    try:
        page.wait_for_selector(".error-message", timeout=5000)
    except:
        pass

    # Take screenshot
    page.screenshot(path=output_path, full_page=True)
    print(f"[OK] Renter blocked state captured: {output_path}")
    return True


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        try:
            # Test 1: Owner dashboard
            success1 = capture_owner_dashboard(
                page, ".sisyphus/evidence/task-10-owner.png"
            )

            # Clear context between tests
            context.clear_cookies()
            page.evaluate(f"localStorage.removeItem('{AUTH_TOKEN_KEY}');")

            # Test 2: Renter blocked from owner page
            success2 = capture_renter_blocked(
                page, ".sisyphus/evidence/task-10-renter-block.png"
            )

            if success1 and success2:
                print("\n[OK] All Task 10 screenshots captured successfully!")
                return 0
            else:
                print("\n[FAIL] Some screenshots failed")
                return 1

        except Exception as e:
            print(f"\n[ERROR] Error during screenshot capture: {e}")
            import traceback

            traceback.print_exc()
            return 1

        finally:
            browser.close()


if __name__ == "__main__":
    sys.exit(main())
