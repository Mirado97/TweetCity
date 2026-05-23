"""
Paste your browser cookie string here and run:
    python make_cookies.py
It will create cookies.json for Twikit.
"""
import json
from pathlib import Path

# Paste the full cookie string from DevTools → Network → Headers → cookie:
COOKIE_STRING = """
PASTE_YOUR_COOKIE_STRING_HERE
""".strip()

def parse_cookies(raw: str) -> list:
    cookies = []
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        cookies.append({
            "name": name.strip(),
            "value": value.strip(),
            "domain": ".x.com",
            "path": "/",
            "secure": True,
            "expires": None,
        })
    return cookies

if __name__ == "__main__":
    if "PASTE_YOUR_COOKIE_STRING_HERE" in COOKIE_STRING:
        print("ERROR: Replace PASTE_YOUR_COOKIE_STRING_HERE with your actual cookie string")
        exit(1)

    cookies = parse_cookies(COOKIE_STRING)
    out = Path(__file__).parent / "cookies.json"
    out.write_text(json.dumps(cookies, indent=2))
    print(f"Saved {len(cookies)} cookies to {out}")
    names = [c["name"] for c in cookies]
    print(f"Keys: {', '.join(names)}")
    if "auth_token" not in names:
        print("WARNING: auth_token not found — make sure you are logged in")
    if "ct0" not in names:
        print("WARNING: ct0 not found — needed for API calls")
