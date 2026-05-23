const rateLimit = require("express-rate-limit");

// Max 1 sync per tokenId per hour — stored in memory
const syncCooldowns = new Map();

function checkSyncCooldown(req, res, next) {
  const { tokenId } = req.body;
  if (!tokenId) return next();

  const lastSync = syncCooldowns.get(String(tokenId));
  if (lastSync && Date.now() - lastSync < 60 * 60 * 1000) {
    const waitMin = Math.ceil((60 * 60 * 1000 - (Date.now() - lastSync)) / 60000);
    return res.status(429).json({ error: `Sync cooldown. Try again in ${waitMin} min.` });
  }

  syncCooldowns.set(String(tokenId), Date.now());
  next();
}

const mintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many mint requests. Try again later." },
});

module.exports = { checkSyncCooldown, mintLimiter };
