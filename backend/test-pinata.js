require("dotenv").config();
const { uploadMetadata } = require("./src/services/ipfs");

async function main() {
  console.log("Testing Pinata upload...");
  const cid = await uploadMetadata({
    name: "Test City",
    description: "Test lore",
    twitterHandle: "testuser",
    test: true,
  });
  console.log("CID:", cid);
  console.log("IPFS URL:", `https://ipfs.io/ipfs/${cid}`);
}

main().catch(console.error);
