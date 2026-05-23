"""
TweetCity Twitter scraper — called by TwikitProvider.js as a subprocess.
Reads one JSON argument from argv[1], executes the command, prints JSON result.
"""
import sys
import json
import asyncio
import os
from pathlib import Path
from twikit import Client

# Load backend .env (subprocess inherits env from Node, manual runs load from file)
_env_file = Path(__file__).parent.parent / "backend" / ".env"
if _env_file.exists():
    for line in _env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")  # remove surrounding quotes
            os.environ.setdefault(k, v)

TWITTER_USERNAME = os.environ.get("TWIKIT_USERNAME")
TWITTER_EMAIL    = os.environ.get("TWIKIT_EMAIL")
TWITTER_PASSWORD = os.environ.get("TWIKIT_PASSWORD")
TWIKIT_PROXY     = os.environ.get("TWIKIT_PROXY")  # e.g. http://user:pass@host:port
COOKIES_FILE     = os.path.join(os.path.dirname(__file__), "cookies.json")


async def get_client() -> Client:
    proxy = os.environ.get("TWIKIT_PROXY")
    print(f"[scraper] proxy={'SET' if proxy else 'NOT SET'}", file=sys.stderr)

    client = Client("en-US", proxy=proxy)

    if os.path.exists(COOKIES_FILE):
        print("[scraper] loading cookies...", file=sys.stderr)
        client.load_cookies(COOKIES_FILE)
    else:
        raise RuntimeError(
            f"cookies.json not found at {COOKIES_FILE}. "
            "Export cookies from your browser (see README) and save to twitter-scraper/cookies.json"
        )

    return client


async def get_user_metrics(handle: str) -> dict:
    client = await get_client()
    user = await client.get_user_by_screen_name(handle)
    return {
        "followers": user.followers_count,
        "tweetCount": user.statuses_count,
        "following": user.following_count,
        "name": user.name,
        "username": user.screen_name,
    }


async def get_user_tweets(handle: str, count: int = 50) -> list:
    client = await get_client()
    user = await client.get_user_by_screen_name(handle)
    tweets = await user.get_tweets("Tweets", count=count)
    return [
        {
            "text": t.text,
            "likes": t.favorite_count,
            "retweets": t.retweet_count,
            "createdAt": t.created_at,
        }
        for t in tweets
    ]


async def find_tweet(handle: str, search_text: str):
    tweets = await get_user_tweets(handle, 20)
    for t in tweets:
        if search_text in t["text"]:
            return t
    return None


async def main(payload: dict) -> dict:
    command = payload["command"]
    args = payload["args"]

    if command == "get_user_metrics":
        data = await get_user_metrics(args["handle"])
        return {"ok": True, "data": data}

    elif command == "get_user_tweets":
        data = await get_user_tweets(args["handle"], args.get("count", 50))
        return {"ok": True, "data": data}

    elif command == "find_tweet":
        data = await find_tweet(args["handle"], args["search_text"])
        return {"ok": True, "data": data}

    else:
        return {"ok": False, "error": f"Unknown command: {command}"}


if __name__ == "__main__":
    # Read from stdin (utf-8-sig handles PowerShell BOM)
    raw = sys.stdin.buffer.read().decode("utf-8-sig").strip()
    if not raw:
        print(json.dumps({"ok": False, "error": "Empty stdin"}))
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"Invalid JSON: {e}"}))
        sys.exit(1)

    try:
        result = asyncio.run(main(payload))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
