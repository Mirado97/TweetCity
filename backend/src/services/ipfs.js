async function uploadMetadata(metadata) {
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: process.env.PINATA_API_KEY,
      pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `TweetCity-${metadata.twitterHandle || "city"}-${Date.now()}` },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

module.exports = { uploadMetadata };
