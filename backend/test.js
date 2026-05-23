const http = require("http");

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: "127.0.0.1", port: 3001, path, method,
        headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) }
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const post = (path, body) => request("POST", path, body);
const get  = (path)       => request("GET",  path);

async function main() {
  const HANDLE = "WoGenesis_tech";
  const WALLET = "0x0000000000000000000000000000000000000001";

  console.log("\n--- verify-tweet ---");
  console.log(await post("/api/verify-tweet", { walletAddress: WALLET, twitterHandle: HANDLE }));

  console.log("\n--- leaderboard ---");
  console.log(await get("/api/leaderboard"));
}

main().catch(console.error);
