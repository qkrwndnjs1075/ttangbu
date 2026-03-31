import json
from pathlib import Path

import requests


BASE = "http://localhost:3000"
EVIDENCE = Path(r"C:\Users\user\Desktop\ttangbu\.sisyphus\evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)


def post(path: str, payload: dict, token: str | None = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{BASE}{path}", headers=headers, json=payload, timeout=20)


def get(path: str, token: str | None = None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE}{path}", headers=headers, timeout=20)


def register_and_login(email: str, name: str, password: str = "Passw0rd!123"):
    post(
        "/auth/register",
        {
            "email": email,
            "password": password,
            "name": name,
            "phone": "010-1234-5678",
            "role": "user",
        },
    )
    login = post("/auth/login", {"email": email, "password": password})
    login.raise_for_status()
    return login.json()["data"]["token"]


def main():
    owner = register_and_login("t13-owner@example.com", "T13 Owner")
    applicant = register_and_login("t13-applicant@example.com", "T13 Applicant")
    outsider = register_and_login("t13-outsider@example.com", "T13 Outsider")

    listing = post(
        "/listings",
        {
            "title": "T13 Message Listing",
            "description": "Listing for task 13 evidence",
            "location": "Seoul",
            "area_sqm": 42.5,
            "price_per_month": 1500000,
        },
        token=owner,
    )
    listing.raise_for_status()
    listing_id = listing.json()["data"]["listing"]["id"]

    application = post(
        "/applications",
        {
            "listing_id": listing_id,
            "message": "안녕하세요. 임대 신청합니다.",
        },
        token=applicant,
    )
    application.raise_for_status()
    app_id = application.json()["data"]["application"]["id"]

    # Exchange messages between participants
    r1 = post(
        f"/applications/{app_id}/messages",
        {"content": "안녕하세요, 임차인입니다."},
        token=applicant,
    )
    r1.raise_for_status()

    r2 = post(
        f"/applications/{app_id}/messages",
        {"content": "안녕하세요. 신청 확인했습니다."},
        token=owner,
    )
    r2.raise_for_status()

    outsider_resp = get(f"/applications/{app_id}/messages", token=outsider)
    outsider_payload = {
        "endpoint": f"/applications/{app_id}/messages",
        "status": outsider_resp.status_code,
        "body": outsider_resp.json(),
        "result": "PASS" if outsider_resp.status_code == 403 else "FAIL",
    }
    (EVIDENCE / "task-13-outsider.json").write_text(
        json.dumps(outsider_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Save context for screenshot step
    context = {
        "application_id": app_id,
        "applicant_token": applicant,
    }
    (EVIDENCE / "task-13-context.json").write_text(
        json.dumps(context, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(context))


if __name__ == "__main__":
    main()
