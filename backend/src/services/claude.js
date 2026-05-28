const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

const STYLES = ["Cyberpunk", "Eco-Futurism", "Medieval", "Brutalist", "Minimalist", "Baroque", "Bio-Punk"];
const PALETTES = [
  { primary: "#00d4ff", secondary: "#a855f7", accent: "#ec4899" }, // cyberpunk
  { primary: "#10b981", secondary: "#84cc16", accent: "#fbbf24" }, // eco
  { primary: "#7c2d12", secondary: "#a16207", accent: "#fbbf24" }, // medieval
  { primary: "#475569", secondary: "#1e293b", accent: "#94a3b8" }, // brutalist
  { primary: "#f1f5f9", secondary: "#cbd5e1", accent: "#0f172a" }, // minimalist
  { primary: "#d97706", secondary: "#7e22ce", accent: "#facc15" }, // baroque
  { primary: "#22d3ee", secondary: "#a3e635", accent: "#f472b6" }, // biopunk
];
const NAME_PREFIXES = ["Nova", "Aether", "Crystal", "Iron", "Velvet", "Echo", "Solar", "Lunar", "Onyx", "Verdant", "Ember", "Silent", "Wandering", "Eternal"];
const NAME_SUFFIXES = ["Reach", "Spire", "Haven", "Bastion", "Hollow", "Arc", "Crown", "Domain", "Nexus", "Citadel", "Roost", "Pinnacle", "Anchor"];
const MOTTOS = [
  "Fortuna favit audaces",
  "Ad astra per aspera",
  "Sic itur ad astra",
  "Per aspera ad lucem",
  "Vincit qui se vincit",
  "Lux in tenebris lucet",
  "Memento navigare",
  "Verba volant scripta manent",
];

// Deterministic numeric hash from a string — stable across runs.
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pick(arr, n) { return arr[n % arr.length]; }

/**
 * Deterministic fallback used when Claude refuses or returns non-JSON.
 * Seeded by handle so the same user always gets the same city.
 */
function fallbackCity(metrics, seedKey) {
  const seed = strHash(String(seedKey || metrics.username || metrics.followers || "tweetcity"));
  const styleIdx   = seed % STYLES.length;
  const palette    = pick(PALETTES, seed >>> 3);
  const prefix     = pick(NAME_PREFIXES, seed >>> 5);
  const suffix     = pick(NAME_SUFFIXES, seed >>> 7);
  return {
    style: STYLES[styleIdx],
    cityName: `${prefix} ${suffix}`,
    motto: pick(MOTTOS, seed >>> 11),
    lore: `A quiet ${STYLES[styleIdx].toLowerCase()} settlement on Mantle, still finding its voice. Its streets remember every word its founder will one day post.`,
    dominantThemes: ["beginnings", "exploration"],
    colorPalette: palette,
  };
}

/**
 * Tolerant JSON extractor — handles markdown code blocks and any prose
 * wrapping (Claude sometimes adds intro text before the JSON).
 */
function extractJson(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Direct parse
  try { return JSON.parse(trimmed); } catch {}
  // Markdown code block ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // First {...} block in the text
  const first = trimmed.indexOf("{");
  const last  = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}

async function analyzeCityPersonality(tweets, metrics) {
  // No real content to analyze → don't waste an API call, just use fallback.
  const realTweets = (tweets || []).filter((t) => t.text && t.text.trim().length > 10);
  if (realTweets.length < 2) {
    console.log("[claude] not enough tweets to analyze, using deterministic fallback");
    return fallbackCity(metrics, metrics.username);
  }

  const tweetTexts = realTweets.map((t) => t.text).join("\n");

  let raw;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a JSON-only API. Output ONLY a JSON object, no prose, no apologies, no explanations. If you cannot analyze the input, still output a valid JSON object with reasonable defaults.

Task: Given Twitter user metrics and tweet samples, classify the user's communication style for an NFT city visualization.

Data:
followers=${metrics.followers}, tweets=${metrics.tweetCount}, following=${metrics.following}, avgEngagement=${metrics.avgEngagement || 0}

Tweet samples:
${tweetTexts}

Output schema (use these EXACT keys):
{"style":"<Cyberpunk|Eco-Futurism|Medieval|Brutalist|Minimalist|Baroque|Bio-Punk>","cityName":"<2-3 words>","motto":"<latin phrase>","lore":"<2-3 sentences>","dominantThemes":["<theme1>","<theme2>"],"colorPalette":{"primary":"<#hex>","secondary":"<#hex>","accent":"<#hex>"}}`,
        },
      ],
    });
    raw = response.content[0]?.text?.trim() || "";
  } catch (err) {
    console.warn("[claude] API call failed, using fallback:", err.message);
    return fallbackCity(metrics, metrics.username);
  }

  const parsed = extractJson(raw);
  if (parsed && parsed.style && parsed.cityName) return parsed;

  console.warn(`[claude] non-JSON response, using fallback. Raw: ${raw.slice(0, 150)}`);
  return fallbackCity(metrics, metrics.username);
}

async function generateLevelUpNarrative(cityName, oldLevel, newLevel, metrics) {
  const levelNames = ["", "Village", "Town", "City", "Metropolis", "Megacity"];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Write a 2-3 sentence fantasy city herald proclamation for a city NFT project.

City name: "${cityName}"
Level change: ${levelNames[oldLevel]} → ${levelNames[newLevel]}
Population (followers): ${metrics.followers}

The proclamation should be dramatic and celebratory, written in a fantasy medieval style. No hashtags, no emojis.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = { analyzeCityPersonality, generateLevelUpNarrative };
