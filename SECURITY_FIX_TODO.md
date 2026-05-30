# Security Fix TODO

Temporary checklist for fixing the security audit findings. Delete this file after the fixes are complete.

## P0 Critical

- [x] Bind Twitter OAuth linking to wallet ownership.
  - `backend/src/routes/auth.js` currently accepts `address` in `/auth/twitter/start` without a wallet signature.
  - `backend/src/routes/city.js` currently trusts `walletAddress` in `/api/mint` and `/api/sync`.
  - Fix: add wallet nonce/signature verification for OAuth-link, mint, and sync; verify `tokenId`, X handle, and wallet ownership match before backend signs any transaction.

- [x] Remove or protect public manager claiming.
  - `POST /api/city/:tokenId/claim-manager` can register a manager for any unclaimed token through the backend oracle wallet.
  - Fix: remove the public endpoint, move it to admin-only, or require a valid owner/manager wallet signature.

## P1 High

- [x] Unify `CityGifts` authorization model.
  - `setPrices` uses `cityManager`, while `approveGift` and `rejectGift` use `cityNFT.ownerOf`.
  - Payouts go to `cityManager`.
  - Fix: choose one authority model and add tests for the case where NFT owner and city manager differ.

- [x] Protect stored Twitter OAuth tokens.
  - `backend/src/storage/oauthStore.js` stores access and refresh tokens as plaintext JSON.
  - Fix: encrypt at rest, restrict file permissions, rotate existing tokens, and reduce OAuth scopes where possible.

- [x] Replace static oracle sweep token protection.
  - `/api/oracle/sweep` and `/api/gifts/:giftId/verify-manual` use `ORACLE_SWEEP_TOKEN`.
  - Fix: use admin wallet signature or timestamped HMAC, plus rate limiting.

## P2 Medium

- [x] Add rate limits and body limits to expensive backend endpoints.
  - `mint` has a limiter, but `sync`, gift checks, city listing, and city gifts can still hit RPC/X/API heavily.
  - Fix: add endpoint-specific rate limits, `express.json({ limit: "..." })`, request timeouts, and cache where appropriate.

- [ ] Resolve dependency audit findings.
  - Root audit: 45 vulnerabilities, including 10 high.
  - Backend audit: high vulnerabilities via `@pinata/sdk -> axios` fixed by removing unused `@pinata/sdk`; `ws` fixed with npm overrides; backend audit is clean.
  - Frontend audit: `ethers -> ws` fixed with npm overrides; frontend audit is clean.
  - Fix: remove unused `@pinata/sdk` if possible, update/replace vulnerable packages, and avoid blind breaking `npm audit fix --force` without testing.

- [x] Reduce public OAuth status data.
  - `/auth/twitter/status` exposes `twitterUserId`, `ownerAddress`, and `updatedAt`.
  - Fix: return only data required by the UI, ideally just linked state and non-sensitive display info.

## P3 Test Gap

- [x] Fix `TweetCity` tests for upgradeable deployment.
  - `test/TweetCity.test.js` deploys the upgradeable contract like a constructor contract.
  - Fix: deploy through upgrades proxy or initialize explicitly in the test setup, then run the full Hardhat suite.

## Verification Checklist

- [x] `npm run build` in `frontend`
- [x] `node --check` for changed backend files
- [x] `npx hardhat test`
- [ ] `npm audit --audit-level=moderate` in root, `backend`, and `frontend`
  - Backend: clean.
  - Frontend: clean.
  - Root: still reports Hardhat/toolbox dev dependency findings that require breaking upgrades.

## Deploy / AWS Checklist

- [ ] Add `OAUTH_TOKEN_ENCRYPTION_KEY` to AWS backend environment.
  - Generate a 32-byte base64 key, for example with Node or OpenSSL.
  - Do not reuse the local development key unless intentionally migrating the same encrypted `oauth.json`.
- [ ] Redeploy backend so wallet-signature auth, encrypted OAuth storage, disabled public oracle endpoints, and rate limits are live.
- [ ] Redeploy frontend so OAuth linking, mint, and sync send wallet signatures.
- [x] Upgrade the existing `CityGifts` UUPS proxy if the deployed chain contract should use the new `cityManager` authorization model.
  - If upgrading the existing proxy, `GIFTS_CONTRACT_ADDRESS` stays the same.
  - If deploying a brand-new proxy, update AWS `GIFTS_CONTRACT_ADDRESS`.
  - Mantle Sepolia upgrade completed: proxy `0x1F672C3da27a50261524dAbb0FF957f49202c3F3`, implementation `0xE94aD600003e43B2bef39342d6b201E387515e81`.
- [ ] Ask existing users/admin to reconnect X after deploy.
  - Old OAuth records without `walletVerifiedAt` are intentionally not trusted for mint/sync.
