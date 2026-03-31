import json
import sys

import requests


def main() -> int:
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {"ok": False, "error": "URL argument is required"}, ensure_ascii=False
            )
        )
        return 0

    url = sys.argv[1]
    headers = {}
    if len(sys.argv) >= 3:
        try:
            headers = json.loads(sys.argv[2])
        except json.JSONDecodeError:
            headers = {}

    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(
            json.dumps(
                {
                    "ok": True,
                    "status": response.status_code,
                    "headers": dict(response.headers),
                    "text": response.text,
                },
                ensure_ascii=False,
            )
        )
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
