const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CityGifts", function () {
  let gifts, nft;
  let admin, oracle, cityOwner, buyer, other;

  // GiftStatus enum (must mirror contract)
  const Status = { Pending: 0, Accepted: 1, Verified: 2, Rejected: 3, Expired: 4 };

  // GiftType: Graffiti=0, StreetArt=1, Flag=2, Billboard=3, Monument=4, District=5

  const TOKEN_ID = 1;
  const PRICE    = ethers.parseEther("1.0");
  const TWEET    = "https://x.com/someone/status/12345";

  beforeEach(async function () {
    [admin, oracle, cityOwner, buyer, other] = await ethers.getSigners();

    const MockNFT = await ethers.getContractFactory("MockERC721");
    nft = await MockNFT.deploy();
    await nft.mint(cityOwner.address, TOKEN_ID);

    const Gifts = await ethers.getContractFactory("CityGifts");
    gifts = await Gifts.connect(admin).deploy(await nft.getAddress(), oracle.address);

    // Oracle registers the city manager (= same as NFT owner here for simplicity)
    await gifts.connect(oracle).registerManager(TOKEN_ID, cityOwner.address);
  });

  // ─── Deployment ───────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores cityNFT and oracle", async function () {
      expect(await gifts.cityNFT()).to.equal(await nft.getAddress());
      expect(await gifts.oracle()).to.equal(oracle.address);
    });

    it("default protocol fee is 10%", async function () {
      expect(await gifts.protocolFeeBps()).to.equal(1000);
    });
  });

  // ─── setPrices ────────────────────────────────────────────────────────────

  describe("setPrices", function () {
    it("city manager can set prices", async function () {
      const arr = [PRICE, PRICE * 2n, PRICE * 3n, PRICE * 4n, PRICE * 5n, PRICE * 6n];
      await gifts.connect(cityOwner).setPrices(TOKEN_ID, arr);
      const stored = await gifts.getPrices(TOKEN_ID);
      expect(stored[0]).to.equal(arr[0]);
      expect(stored[5]).to.equal(arr[5]);
    });

    it("non-manager cannot set prices", async function () {
      const arr = [PRICE, 0n, 0n, 0n, 0n, 0n];
      await expect(
        gifts.connect(other).setPrices(TOKEN_ID, arr)
      ).to.be.revertedWith("CityGifts: not city manager");
    });

    it("emits PricesSet", async function () {
      const arr = [PRICE, 0n, 0n, 0n, 0n, 0n];
      await expect(gifts.connect(cityOwner).setPrices(TOKEN_ID, arr))
        .to.emit(gifts, "PricesSet")
        .withArgs(TOKEN_ID, arr);
    });
  });

  // ─── sendGift ─────────────────────────────────────────────────────────────

  describe("sendGift", function () {
    beforeEach(async function () {
      await gifts.connect(cityOwner).setPrices(TOKEN_ID,
        [PRICE, 0n, 0n, 0n, 0n, 0n]);
    });

    it("creates Pending gift, locks 90%, sends 10% fee to contract admin", async function () {
      const adminBefore = await ethers.provider.getBalance(admin.address);

      const tx = await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await tx.wait();

      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Pending);
      expect(g.buyer).to.equal(buyer.address);
      expect(g.amount).to.equal(PRICE);
      expect(g.ownerAmount).to.equal(PRICE - PRICE / 10n);
      expect(g.tweetUrl).to.equal(TWEET);

      // Contract holds the locked owner amount
      const contractBal = await ethers.provider.getBalance(await gifts.getAddress());
      expect(contractBal).to.equal(g.ownerAmount);

      // Admin received the protocol fee
      const adminAfter = await ethers.provider.getBalance(admin.address);
      expect(adminAfter - adminBefore).to.equal(PRICE / 10n);
    });

    it("reverts if gift type disabled (price 0)", async function () {
      await expect(
        gifts.connect(buyer).sendGift(TOKEN_ID, 1 /* StreetArt */, TWEET, { value: PRICE })
      ).to.be.revertedWith("CityGifts: gift type not enabled by owner");
    });

    it("reverts on underpayment", async function () {
      await expect(
        gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE - 1n })
      ).to.be.revertedWith("CityGifts: insufficient payment");
    });

    it("reverts on empty tweetUrl", async function () {
      await expect(
        gifts.connect(buyer).sendGift(TOKEN_ID, 0, "", { value: PRICE })
      ).to.be.revertedWith("CityGifts: empty tweet URL");
    });

    it("reverts on invalid gift type", async function () {
      await expect(
        gifts.connect(buyer).sendGift(TOKEN_ID, 6, TWEET, { value: PRICE })
      ).to.be.revertedWith("CityGifts: invalid gift type");
    });

    it("emits GiftSent", async function () {
      await expect(
        gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE })
      ).to.emit(gifts, "GiftSent");
    });
  });

  // ─── approveGift / rejectGift ─────────────────────────────────────────────

  describe("approve/reject", function () {
    beforeEach(async function () {
      await gifts.connect(cityOwner).setPrices(TOKEN_ID,
        [PRICE, 0n, 0n, 0n, 0n, 0n]);
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
    });

    it("NFT owner approves Pending → Accepted, sets engageDeadline", async function () {
      await gifts.connect(cityOwner).approveGift(0);
      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Accepted);
      expect(g.engageDeadline).to.be.gt(g.createdAt);
    });

    it("non-NFT-owner cannot approve", async function () {
      await expect(
        gifts.connect(other).approveGift(0)
      ).to.be.revertedWith("CityGifts: not city owner");
    });

    it("cannot approve after accept window", async function () {
      await time.increase(48 * 3600 + 1);
      await expect(
        gifts.connect(cityOwner).approveGift(0)
      ).to.be.revertedWith("CityGifts: accept window expired");
    });

    it("rejectGift refunds buyer 90% and marks Rejected", async function () {
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await gifts.connect(cityOwner).rejectGift(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerAfter - buyerBefore).to.equal(PRICE - PRICE / 10n);

      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Rejected);
    });

    it("cannot reject after approval", async function () {
      await gifts.connect(cityOwner).approveGift(0);
      await expect(
        gifts.connect(cityOwner).rejectGift(0)
      ).to.be.revertedWith("CityGifts: not pending");
    });
  });

  // ─── verifyEngagement ─────────────────────────────────────────────────────

  describe("verifyEngagement", function () {
    beforeEach(async function () {
      await gifts.connect(cityOwner).setPrices(TOKEN_ID,
        [PRICE, 0n, 0n, 0n, 0n, 0n]);
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await gifts.connect(cityOwner).approveGift(0);
    });

    it("only oracle can verify", async function () {
      await expect(
        gifts.connect(cityOwner).verifyEngagement(0)
      ).to.be.revertedWith("CityGifts: not oracle");
    });

    it("Accepted → Verified, pays cityManager", async function () {
      const ownerBefore = await ethers.provider.getBalance(cityOwner.address);
      const tx = await gifts.connect(oracle).verifyEngagement(0);
      await tx.wait();
      const ownerAfter = await ethers.provider.getBalance(cityOwner.address);
      expect(ownerAfter - ownerBefore).to.equal(PRICE - PRICE / 10n);

      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Verified);
    });

    it("emits GiftVerified with payout", async function () {
      const payout = PRICE - PRICE / 10n;
      await expect(gifts.connect(oracle).verifyEngagement(0))
        .to.emit(gifts, "GiftVerified")
        .withArgs(0, TOKEN_ID, cityOwner.address, payout);
    });

    it("cannot verify after engage deadline", async function () {
      await time.increase(3 * 24 * 3600 + 1); // Graffiti = 3 days
      await expect(
        gifts.connect(oracle).verifyEngagement(0)
      ).to.be.revertedWith("CityGifts: engage window expired");
    });

    it("cannot verify Pending gift", async function () {
      // Second gift not yet accepted
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await expect(
        gifts.connect(oracle).verifyEngagement(1)
      ).to.be.revertedWith("CityGifts: not accepted");
    });
  });

  // ─── claimExpired ─────────────────────────────────────────────────────────

  describe("claimExpired", function () {
    beforeEach(async function () {
      await gifts.connect(cityOwner).setPrices(TOKEN_ID,
        [PRICE, 0n, 0n, 0n, 0n, 0n]);
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
    });

    it("buyer can claim if owner ignored Pending for 48h", async function () {
      await time.increase(48 * 3600 + 1);

      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await gifts.connect(buyer).claimExpired(0);
      const r = await tx.wait();
      const after = await ethers.provider.getBalance(buyer.address);
      const gasUsed = r.gasUsed * r.gasPrice;
      expect(after - before + gasUsed).to.equal(PRICE - PRICE / 10n);

      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Expired);
    });

    it("buyer can claim if owner accepted but missed engage deadline", async function () {
      await gifts.connect(cityOwner).approveGift(0);
      await time.increase(3 * 24 * 3600 + 1); // Graffiti window

      const tx = await gifts.connect(buyer).claimExpired(0);
      await tx.wait();
      const g = await gifts.gifts(0);
      expect(g.status).to.equal(Status.Expired);
    });

    it("only buyer can claim", async function () {
      await time.increase(48 * 3600 + 1);
      await expect(
        gifts.connect(other).claimExpired(0)
      ).to.be.revertedWith("CityGifts: not buyer");
    });

    it("cannot claim before expiry", async function () {
      await expect(
        gifts.connect(buyer).claimExpired(0)
      ).to.be.revertedWith("CityGifts: not expired");
    });
  });

  // ─── views: getCityStats / getActiveGifts ─────────────────────────────────

  describe("views", function () {
    beforeEach(async function () {
      await gifts.connect(cityOwner).setPrices(TOKEN_ID,
        [PRICE, PRICE, 0n, 0n, 0n, 0n]);
    });

    it("getCityStats reflects pending/accepted/verified", async function () {
      // Gift #0 → Pending
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      // Gift #1 → Accepted
      await gifts.connect(buyer).sendGift(TOKEN_ID, 1, TWEET, { value: PRICE });
      await gifts.connect(cityOwner).approveGift(1);
      // Gift #2 → Verified
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await gifts.connect(cityOwner).approveGift(2);
      await gifts.connect(oracle).verifyEngagement(2);

      const stats = await gifts.getCityStats(TOKEN_ID);
      expect(stats.totalGifts).to.equal(3n);
      expect(stats.pendingCount).to.equal(1n);
      expect(stats.totalEarned).to.equal(PRICE - PRICE / 10n);
      expect(stats.activeByType[0]).to.equal(1n); // Verified counts as active
      expect(stats.activeByType[1]).to.equal(1n); // Accepted counts as active
    });

    it("getActiveGifts returns Accepted + Verified", async function () {
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await gifts.connect(buyer).sendGift(TOKEN_ID, 1, TWEET, { value: PRICE });
      await gifts.connect(cityOwner).approveGift(1);

      const active = await gifts.getActiveGifts(TOKEN_ID);
      expect(active.length).to.equal(1);
      expect(active[0].giftType).to.equal(1);
    });

    it("getPendingGifts returns only Pending", async function () {
      await gifts.connect(buyer).sendGift(TOKEN_ID, 0, TWEET, { value: PRICE });
      await gifts.connect(buyer).sendGift(TOKEN_ID, 1, TWEET, { value: PRICE });
      await gifts.connect(cityOwner).approveGift(1);

      const pending = await gifts.getPendingGifts(TOKEN_ID);
      expect(pending.length).to.equal(1);
      expect(pending[0].giftType).to.equal(0);
    });
  });

  // ─── admin ────────────────────────────────────────────────────────────────

  describe("admin", function () {
    it("owner can update oracle", async function () {
      await gifts.connect(admin).setOracle(other.address);
      expect(await gifts.oracle()).to.equal(other.address);
    });

    it("non-owner cannot update oracle", async function () {
      await expect(
        gifts.connect(other).setOracle(other.address)
      ).to.be.revertedWithCustomError(gifts, "OwnableUnauthorizedAccount");
    });

    it("owner can update protocolFee up to 20%", async function () {
      await gifts.connect(admin).setProtocolFee(1500);
      expect(await gifts.protocolFeeBps()).to.equal(1500n);
    });

    it("protocol fee > 20% reverts", async function () {
      await expect(
        gifts.connect(admin).setProtocolFee(2500)
      ).to.be.revertedWith("CityGifts: max 20%");
    });
  });
});
