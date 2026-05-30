export function buildWalletAuthMessage(address, action, timestamp) {
  return `TweetCity Wallet Authorization\nAction: ${action}\nAddress: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
}

export async function createWalletAuth(signer, action) {
  if (!signer) throw new Error("Connect wallet first");
  const walletAddress = (await signer.getAddress()).toLowerCase();
  const walletTimestamp = Date.now();
  const walletSignature = await signer.signMessage(
    buildWalletAuthMessage(walletAddress, action, walletTimestamp)
  );
  return { walletAddress, walletTimestamp, walletSignature };
}

export function walletAuthParams(auth) {
  return new URLSearchParams({
    address: auth.walletAddress,
    walletTimestamp: String(auth.walletTimestamp),
    walletSignature: auth.walletSignature,
  });
}
