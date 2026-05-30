/**
 * test-oauth.js — sanity check для X OAuth 2.0 PKCE flow.
 *
 * Что делает:
 *   1. Поднимает локальный HTTP server на :8787
 *   2. Генерит PKCE code_verifier/challenge + state (CSRF)
 *   3. Печатает URL для авторизации в X — открываешь в браузере, разрешаешь
 *   4. Принимает callback с ?code=... → обменивает на access_token+refresh_token
 *   5. Дёргает GET /2/users/me  и  GET /2/users/:id/liked_tweets — печатает результат
 *
 * Запуск (Node 20.6+):
 *   node --env-file=backend/.env backend/scripts/test-oauth.js
 * Или через dotenvx если у тебя он стоит:
 *   npx dotenvx run -f backend/.env -- node backend/scripts/test-oauth.js
 *
 * В X Dev Portal должно быть:
 *   - OAuth 2.0 включён
 *   - Type of App: Web App (Confidential Client) — даёт Client Secret
 *   - Callback URL содержит:  http://localhost:8787/callback
 *   - App permissions: Read
 *
 * В backend/.env нужны:
 *   TWITTER_CLIENT_ID=...
 *   TWITTER_CLIENT_SECRET=...
 */

const http = require("node:http");
const crypto = require("node:crypto");

// Optional proxy support for restricted networks (RU).
// Set HTTPS_PROXY=http://user:pass@host:port  in backend/.env if needed.
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (PROXY) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(PROXY));
    console.log(`→ using proxy: ${PROXY.replace(/:[^:@]+@/, ":***@")}`);
  } catch (e) {
    console.warn("⚠️  HTTPS_PROXY задан, но пакет undici не установлен. Запусти: cd backend && npm i undici");
  }
}

const CLIENT_ID     = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const PORT          = 8787;
const CALLBACK      = `http://localhost:${PORT}/callback`;
const SCOPES        = "tweet.read users.read like.read offline.access";

if (!CLIENT_ID) {
  console.error("❌ TWITTER_CLIENT_ID не задан в env. Добавь в backend/.env и запусти снова.");
  process.exit(1);
}
if (!CLIENT_SECRET) {
  console.warn("⚠️  TWITTER_CLIENT_SECRET не задан — попробую как Public Client (PKCE only).");
}

// PKCE
const verifier  = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const state     = crypto.randomBytes(16).toString("hex");

const authUrl = "https://x.com/i/oauth2/authorize?" + new URLSearchParams({
  response_type:          "code",
  client_id:              CLIENT_ID,
  redirect_uri:           CALLBACK,
  scope:                  SCOPES,
  state,
  code_challenge:         challenge,
  code_challenge_method:  "S256",
}).toString();

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    redirect_uri:  CALLBACK,
    code_verifier: verifier,
    client_id:     CLIENT_ID,
  });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (CLIENT_SECRET) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  }
  const res = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function apiGet(path, accessToken) {
  const res = await fetch(`https://api.x.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token,
    client_id:     CLIENT_ID,
  });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (CLIENT_SECRET) {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  }
  const res = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`refresh ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== "/callback") {
    res.writeHead(404).end("not found");
    return;
  }

  const code       = u.searchParams.get("code");
  const recvState  = u.searchParams.get("state");
  const error      = u.searchParams.get("error");

  if (error) {
    console.error("❌ X вернул ошибку:", error, u.searchParams.get("error_description"));
    res.writeHead(400).end(`error: ${error}`);
    setTimeout(() => process.exit(1), 500);
    return;
  }
  if (recvState !== state) {
    res.writeHead(400).end("state mismatch (CSRF)");
    setTimeout(() => process.exit(1), 500);
    return;
  }
  if (!code) {
    res.writeHead(400).end("no code");
    setTimeout(() => process.exit(1), 500);
    return;
  }

  const summary = {
    tokenOK: false, refreshPresent: false, meOK: false,
    likedOK: false, tweetsOK: false, refreshFlowOK: false,
    referencedFound: 0, mentionsFound: 0,
  };

  try {
    console.log("\n→ exchanging code for token...");
    const tok = await exchangeCode(code);
    summary.tokenOK = !!tok.access_token;
    summary.refreshPresent = !!tok.refresh_token;

    console.log("\n✅ TOKEN OK");
    console.log("  access_token:  ", tok.access_token  ? tok.access_token.slice(0, 25) + "..." : "(missing)");
    console.log("  refresh_token: ", tok.refresh_token ? "present"                              : "MISSING (нет offline.access?)");
    console.log("  expires_in:    ", tok.expires_in, "sec");
    console.log("  scope:         ", tok.scope);

    console.log("\n→ GET /2/users/me ...");
    const me = await apiGet("/2/users/me?user.fields=pinned_tweet_id,public_metrics,username", tok.access_token);
    summary.meOK = me.status === 200 && !!me.json?.data?.username;
    console.log(`  status: ${me.status}`);
    console.log("  body:  ", JSON.stringify(me.json, null, 2));

    const userId = me.json?.data?.id;
    if (userId) {
      console.log("\n→ GET /2/users/:id/liked_tweets ...");
      const liked = await apiGet(`/2/users/${userId}/liked_tweets?max_results=5&tweet.fields=created_at,author_id`, tok.access_token);
      summary.likedOK = liked.status === 200 && Array.isArray(liked.json?.data);
      console.log(`  status: ${liked.status}`);
      console.log("  body:  ", JSON.stringify(liked.json, null, 2));

      // Critical for Flag (reply) / Billboard (quote) / StreetArt (retweet) / Monument (mention).
      // referenced_tweets gives reply/quote/retweet target id; entities.mentions gives mentioned handles.
      console.log("\n→ GET /2/users/:id/tweets (referenced_tweets + entities) ...");
      const tweets = await apiGet(
        `/2/users/${userId}/tweets?max_results=10` +
        `&tweet.fields=created_at,author_id,referenced_tweets,entities,in_reply_to_user_id` +
        `&expansions=referenced_tweets.id,referenced_tweets.id.author_id`,
        tok.access_token
      );
      summary.tweetsOK = tweets.status === 200 && Array.isArray(tweets.json?.data);
      if (summary.tweetsOK) {
        for (const t of tweets.json.data) {
          if (Array.isArray(t.referenced_tweets) && t.referenced_tweets.length) summary.referencedFound++;
          if (t.entities?.mentions?.length) summary.mentionsFound++;
        }
      }
      console.log(`  status: ${tweets.status}`);
      console.log("  body:  ", JSON.stringify(tweets.json, null, 2));
    }

    if (tok.refresh_token) {
      console.log("\n→ testing refresh_token flow ...");
      try {
        const newTok = await refreshAccessToken(tok.refresh_token);
        summary.refreshFlowOK = !!newTok.access_token;
        console.log("  new access_token:  ", newTok.access_token ? newTok.access_token.slice(0, 25) + "..." : "(missing)");
        console.log("  new refresh_token: ", newTok.refresh_token
          ? (newTok.refresh_token === tok.refresh_token ? "same as before" : "rotated (new value)")
          : "MISSING");
        console.log("  expires_in:        ", newTok.expires_in, "sec");
      } catch (e) {
        console.error("  refresh failed:", e.message);
      }
    }

    // ─── compact summary so you don't have to scroll ───
    const m = (ok) => ok ? "✅" : "❌";
    const allOK = summary.tokenOK && summary.refreshPresent && summary.meOK
      && summary.likedOK && summary.tweetsOK && summary.refreshFlowOK;
    console.log("\n━━━━━━━━━━━━━━━━ SUMMARY ━━━━━━━━━━━━━━━━");
    console.log(`${m(summary.tokenOK)}        OAuth token received`);
    console.log(`${m(summary.refreshPresent)}        refresh_token present (offline.access OK)`);
    console.log(`${m(summary.meOK)}        GET /users/me   — username/pinned_tweet_id`);
    console.log(`${m(summary.likedOK)}        GET /liked_tweets — Graffiti/StreetArt like-check`);
    console.log(`${m(summary.tweetsOK)}        GET /users/:id/tweets — Flag/Billboard/Monument/StreetArt`);
    console.log(`           ↳ ${summary.referencedFound} tweets with referenced_tweets (reply/quote/RT)`);
    console.log(`           ↳ ${summary.mentionsFound} tweets with mentions`);
    console.log(`${m(summary.refreshFlowOK)}        refresh_token → new access_token`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(allOK
      ? "\n🎉 ALL GOOD — можно начинать интеграцию (шаг 2)."
      : "\n⚠️  Что-то не ок — пришли только нижний блок (SUMMARY), я скажу куда копать.");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>✅ OK — закрой вкладку, смотри терминал</h1>");
    console.log("\n🎉 готово. Сервер закроется через 1 сек.");
  } catch (e) {
    console.error("❌ ERROR:", e.message);
    res.writeHead(500).end(`error: ${e.message}`);
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 1500);
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on http://localhost:${PORT}`);
  console.log("\n📋 СКОПИРУЙ ЭТУ ССЫЛКУ В БРАУЗЕР И АВТОРИЗУЙСЯ:\n");
  console.log(authUrl);
  console.log("\n(ждём callback...)\n");
});
