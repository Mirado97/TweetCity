const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});

async function analyzeCityPersonality(tweets, metrics) {
  const tweetTexts = tweets.map((t) => t.text).join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `I am building a generative NFT app. Given Twitter user metrics and tweet text samples, classify the user's communication style and output a JSON config for rendering their NFT visualization.

Data:
followers=${metrics.followers}, tweets=${metrics.tweetCount}, following=${metrics.following}, avgEngagement=${metrics.avgEngagement || 0}

Tweet samples (for tone analysis):
${tweetTexts}

Output a JSON object (no prose, just the object):
{"style":"<Cyberpunk|Eco-Futurism|Medieval|Brutalist|Minimalist|Baroque|Bio-Punk>","cityName":"<2-3 words>","motto":"<latin phrase>","lore":"<2-3 sentences>","dominantThemes":["<theme1>","<theme2>"],"colorPalette":{"primary":"<#hex>","secondary":"<#hex>","accent":"<#hex>"}}`,
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
