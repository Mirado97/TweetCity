const PinataSDK = require("@pinata/sdk");

const pinata = new PinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretApiKey: process.env.PINATA_SECRET_KEY,
});

async function uploadMetadata(metadata) {
  const result = await pinata.pinJSONToIPFS(metadata, {
    pinataMetadata: { name: `TweetCity-${metadata.twitterHandle}-${Date.now()}` },
  });
  return result.IpfsHash; // CID
}

module.exports = { uploadMetadata };
