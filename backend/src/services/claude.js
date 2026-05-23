const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI urban architect. Given a Twitter user's metrics and recent tweets,
you design a unique fantasy city that reflects their personality and online presence.
Always respond with valid JSON only — no markdown, no explanation.`;

async function analyzeCityPersonality(tweets, metrics) {
  const tweetTexts = tweets.map((t) => t.text).join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this Twitter user and design their city.

METRICS:
- Followers: ${metrics.followers}
- Tweets posted: ${metrics.tweetCount}
- Following: ${metrics.following}
- Avg engagement (likes+retweets): ${metrics.avgEngagement || 0}

RECENT TWEETS (last ${tweets.length}):
${tweetTexts}

Return JSON with exactly these fields:
{
  "style": "one of: Cyberpunk | Eco-Futurism | Medieval | Brutalist | Minimalist | Baroque | Bio-Punk",
  "cityName": "unique 2-3 word city name",
  "motto": "short latin motto",
  "lore": "2-3 sentences describing the city history in fantasy atlas style",
  "dominantThemes": ["theme1", "theme2"],
  "colorPalette": {
    "primary": "#hexcolor",
    "secondary": "#hexcolor",
    "accent": "#hexcolor"
  }
}`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Fallback if Claude wraps JSON in markdown code block
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    throw new Error(`Claude returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

async function generateLevelUpNarrative(cityName, oldLevel, newLevel, metrics) {
  const levelNames = ["", "Village", "Town", "City", "Metropolis", "Megacity"];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `The city of "${cityName}" has just leveled up from ${levelNames[oldLevel]} to ${levelNames[newLevel]}!
Current population (followers): ${metrics.followers}

Write a 2-3 sentence mayor's proclamation announcing this historic moment.
Style: fantasy city herald announcement, dramatic and celebratory.
No hashtags. No emojis. Just the proclamation text.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = { analyzeCityPersonality, generateLevelUpNarrative };
