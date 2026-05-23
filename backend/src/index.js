require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cityRoutes = require("./routes/city");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

app.use("/api", cityRoutes);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TweetCity backend running on port ${PORT}`);
});
