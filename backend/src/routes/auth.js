/**
 * OAuth 2.0 PKCE flow for X (Twitter) — links a cityHandle to a Twitter user token.
 *
 * GET /auth/twitter/start?cityHandle=miradonas
 *    → 302 redirect to https://x.com/i/oauth2/authorize?...
 *    Stores {state → {verifier, cityHandle, expiresAt}} in memory for 5 min.
 *
 * GET /auth/twitter/callback?code=...&state=...
 *    → exchanges code for tokens, fetches /2/users/me, saves to oauthStore.
 *    Renders a tiny HTML success page.
 *
 * Required env: TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_OAUTH_CALLBACK_URL.
 */

const express = require("express");
const crypto = require("node:crypto");
const oauthStore = require("../storage/oauthStore");

// Optional proxy for restricted networks (RU dev).
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.HTTP_PROXY));
  } catch {
    console.warn("[auth] HTTPS_PROXY set but undici not installed — fetch will go direct");
  }
}

const router = express.Router();

// Diagnostic — proves the router is mounted.
router.get("/ping", (_req, res) => res.json({ ok: true, route: "auth" }));

// Whether a cityHandle (or owner wallet) has linked their X account. Public.
// Accepts ?cityHandle=... OR ?address=0x...
router.get("/twitter/status", (req, res) => {
  const cityHandle = String(req.query.cityHandle || "").trim().replace(/^@/, "").toLowerCase();
  const address    = String(req.query.address    || "").trim().toLowerCase();
  if (!cityHandle && !address) {
    return res.status(400).json({ error: "cityHandle or address query param is required" });
  }
  const rec = cityHandle ? oauthStore.get(cityHandle) : oauthStore.findByAddress(address);
  if (!rec) return res.json({ linked: false });
  res.json({
    linked:        true,
    cityHandle:    rec.cityHandle || cityHandle,
    twitterUserId: rec.twitterUserId,
    ownerAddress:  rec.ownerAddress || null,
    updatedAt:     rec.updatedAt,
  });
});

const CLIENT_ID     = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL  = process.env.TWITTER_OAUTH_CALLBACK_URL;
const SCOPES        = "tweet.read users.read like.read offline.access";
const STATE_TTL_MS  = 5 * 60 * 1000;

// In-memory PKCE state. Lost on restart — fine, OAuth flow is short.
const pendingStates = new Map(); // state → { verifier, cityHandle?, address?, expiresAt }

function cleanupStates() {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (v.expiresAt < now) pendingStates.delete(k);
}

function basicAuthHeader() {
  return CLIENT_SECRET
    ? "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
    : undefined;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

router.get("/twitter/start", (req, res) => {
  if (!CLIENT_ID || !CALLBACK_URL) {
    return res.status(500).send("TWITTER_CLIENT_ID / TWITTER_OAUTH_CALLBACK_URL not configured");
  }
  const cityHandle = String(req.query.cityHandle || "").trim().replace(/^@/, "");
  const address    = String(req.query.address    || "").trim().toLowerCase();
  if (!cityHandle && !address) {
    return res.status(400).send("cityHandle or address query param is required");
  }

  cleanupStates();

  const verifier  = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state     = crypto.randomBytes(16).toString("hex");

  pendingStates.set(state, {
    verifier,
    cityHandle,
    address,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const authUrl = "https://x.com/i/oauth2/authorize?" + new URLSearchParams({
    response_type:         "code",
    client_id:             CLIENT_ID,
    redirect_uri:          CALLBACK_URL,
    scope:                 SCOPES,
    state,
    code_challenge:        challenge,
    code_challenge_method: "S256",
  });

  res.redirect(authUrl);
});

router.get("/twitter/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.status(400).type("html").send(
      `<h2>Авторизация отменена</h2><p>${escapeHtml(error)}: ${escapeHtml(error_description || "")}</p>`
    );
  }
  if (!code || !state) return res.status(400).send("missing code or state");

  cleanupStates();
  const entry = pendingStates.get(String(state));
  if (!entry) return res.status(400).send("state not found or expired — start over");
  pendingStates.delete(String(state));

  try {
    // 1. Exchange authorization code for tokens.
    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(basicAuthHeader() ? { Authorization: basicAuthHeader() } : {}),
      },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        code:          String(code),
        redirect_uri:  CALLBACK_URL,
        code_verifier: entry.verifier,
        client_id:     CLIENT_ID,
      }),
    });
    const tok = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}: ${JSON.stringify(tok)}`);

    // 2. Confirm identity — fetch /2/users/me with the new access token.
    const meRes = await fetch("https://api.x.com/2/users/me?user.fields=username", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me?.data?.id) throw new Error(`/users/me ${meRes.status}: ${JSON.stringify(me)}`);

    const realHandle = String(me.data.username).toLowerCase();
    const expectedHandle = (entry.cityHandle || "").toLowerCase();
    // Sanity: if start was launched with cityHandle, warn on mismatch.
    // Always save under the REAL handle (whichever account actually authorized).
    const handleMismatch = expectedHandle && realHandle !== expectedHandle;

    const upsertPayload = {
      twitterUserId: me.data.id,
      accessToken:   tok.access_token,
      refreshToken:  tok.refresh_token,
      expiresAt:     Date.now() + (Number(tok.expires_in) || 7200) * 1000,
      scope:         tok.scope,
    };
    if (entry.address) upsertPayload.ownerAddress = entry.address.toLowerCase();
    oauthStore.upsert(realHandle, upsertPayload);

    console.log(`[auth] linked @${realHandle} (userId=${me.data.id})${entry.address ? ` for owner ${entry.address.slice(0,6)}…${entry.address.slice(-4)}` : ""}${expectedHandle ? ` — expected @${expectedHandle}` : ""}`);

    const warn = handleMismatch
      ? `<p style="color:#c33">⚠️ Ожидали <code>@${escapeHtml(expectedHandle)}</code>, а вошли как <code>@${escapeHtml(realHandle)}</code>. Запись сохранена под реальным handle.</p>`
      : "";

    res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OK</title></head><body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<h2>✅ @${escapeHtml(realHandle)} подключён</h2>
${warn}
<p>TweetCity теперь может проверять выполнение гифтов через X API. Можно закрыть вкладку.</p>
</body></html>`);
  } catch (e) {
    console.error("[auth/callback] error:", e.message);
    res.status(500).type("html").send(`<h2>Ошибка</h2><pre>${escapeHtml(e.message)}</pre>`);
  }
});

module.exports = router;
