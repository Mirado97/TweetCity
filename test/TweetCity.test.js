const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("TweetCity", function () {
  let contract;
  let owner, oracle, user1, user2, visitor;

  const FAKE_CID = "QmTestCID123456789";
  const HANDLE = "elonmusk";

  beforeEach(async function () {
    [owner, oracle, user1, user2, visitor] = await ethers.getSigners();
    const TweetCity = await ethers.getContractFactory("TweetCity");
    contract = await upgrades.deployProxy(
      TweetCity,
      [oracle.address],
      { kind: "uups", initializer: "initialize" }
    );
    await contract.waitForDeployment();
  });

  // ─── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets oracle correctly", async function () {
      expect(await contract.oracle()).to.equal(oracle.address);
    });

    it("sets owner correctly", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("starts with zero supply", async function () {
      expect(await contract.totalSupply()).to.equal(0);
    });
  });

  // ─── Minting ───────────────────────────────────────────────────────────────

  describe("mintCity", function () {
    it("mints NFT with correct level — Village (50 followers)", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      const city = await contract.cities(1);
      expect(city.level).to.equal(1);
      expect(city.followers).to.equal(50);
      expect(await contract.ownerOf(1)).to.equal(user1.address);
    });

    it("mints with level 2 — Town (500 followers)", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 500, 200, 50, 1000, FAKE_CID);
      expect((await contract.cities(1)).level).to.equal(2);
    });

    it("mints with level 3 — City (5000 followers)", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 5000, 500, 200, 5000, FAKE_CID);
      expect((await contract.cities(1)).level).to.equal(3);
    });

    it("mints with level 4 — Metropolis (50000 followers)", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50000, 2000, 500, 20000, FAKE_CID);
      expect((await contract.cities(1)).level).to.equal(4);
    });

    it("mints with level 5 — Megacity (100000 followers)", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 100000, 5000, 1000, 50000, FAKE_CID);
      expect((await contract.cities(1)).level).to.equal(5);
    });

    it("maps handle to tokenId", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      expect(await contract.handleToTokenId(HANDLE)).to.equal(1);
    });

    it("creates initial snapshot in history", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      expect(await contract.getHistoryLength(1)).to.equal(1);
    });

    it("reverts if non-oracle tries to mint", async function () {
      await expect(
        contract.connect(user1).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID)
      ).to.be.revertedWith("TweetCity: caller is not oracle");
    });

    it("reverts on duplicate handle", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      await expect(
        contract.connect(oracle).mintCity(user2.address, HANDLE, 50, 100, 30, 200, FAKE_CID)
      ).to.be.revertedWith("TweetCity: handle already minted");
    });

    it("reverts on empty handle", async function () {
      await expect(
        contract.connect(oracle).mintCity(user1.address, "", 50, 100, 30, 200, FAKE_CID)
      ).to.be.revertedWith("TweetCity: empty handle");
    });

    it("emits CityMinted event", async function () {
      await expect(
        contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID)
      ).to.emit(contract, "CityMinted").withArgs(1, HANDLE, user1.address, 1);
    });
  });

  // ─── Updating ──────────────────────────────────────────────────────────────

  describe("updateCity", function () {
    beforeEach(async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
    });

    it("updates metrics correctly", async function () {
      await contract.connect(oracle).updateCity(1, 200, 300, 60, 800, "QmNewCID");
      const city = await contract.cities(1);
      expect(city.followers).to.equal(200);
      expect(city.tweetCount).to.equal(300);
      expect(city.level).to.equal(2);
      expect(city.ipfsCID).to.equal("QmNewCID");
    });

    it("preserves old IPFS CID when empty string passed (no level-up sync)", async function () {
      await contract.connect(oracle).updateCity(1, 60, 150, 40, 300, "");
      const city = await contract.cities(1);
      expect(city.ipfsCID).to.equal(FAKE_CID); // unchanged
      expect(city.followers).to.equal(60);      // metrics updated
    });

    it("appends new snapshot to history", async function () {
      await contract.connect(oracle).updateCity(1, 200, 300, 60, 800, "QmNewCID");
      expect(await contract.getHistoryLength(1)).to.equal(2);
    });

    it("emits CityLevelUp when level increases", async function () {
      await expect(
        contract.connect(oracle).updateCity(1, 1000, 300, 60, 800, "QmNewCID")
      ).to.emit(contract, "CityLevelUp").withArgs(1, 1, 3);
    });

    it("does not emit CityLevelUp when level stays same", async function () {
      const tx = await contract.connect(oracle).updateCity(1, 60, 150, 40, 300, "");
      const receipt = await tx.wait();
      const levelUpEvents = receipt.logs.filter(
        log => log.fragment && log.fragment.name === "CityLevelUp"
      );
      expect(levelUpEvents.length).to.equal(0);
    });

    it("reverts if non-oracle calls", async function () {
      await expect(
        contract.connect(user1).updateCity(1, 200, 300, 60, 800, "QmNewCID")
      ).to.be.revertedWith("TweetCity: caller is not oracle");
    });

    it("reverts on non-existent token", async function () {
      await expect(
        contract.connect(oracle).updateCity(999, 200, 300, 60, 800, "QmNewCID")
      ).to.be.revertedWith("TweetCity: token does not exist");
    });
  });

  // ─── Likes ─────────────────────────────────────────────────────────────────

  describe("likeCity", function () {
    beforeEach(async function () {
      // user1 owns city #1 (HANDLE)
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      // user2 owns city #2 — needed to be allowed to like
      await contract.connect(oracle).mintCity(user2.address, "user2handle", 80, 50, 20, 100, FAKE_CID);
      // visitor has NO city
    });

    it("increments like counter when liker owns a city", async function () {
      await contract.connect(user2).likeCity(1);
      expect(await contract.cityLikes(1)).to.equal(1);
    });

    it("records that liker has liked", async function () {
      await contract.connect(user2).likeCity(1);
      expect(await contract.hasLiked(user2.address, 1)).to.be.true;
    });

    it("reverts if liker has no city (anti-spam)", async function () {
      await expect(
        contract.connect(visitor).likeCity(1)
      ).to.be.revertedWith("TweetCity: must own a city to like");
    });

    it("reverts on double like", async function () {
      await contract.connect(user2).likeCity(1);
      await expect(
        contract.connect(user2).likeCity(1)
      ).to.be.revertedWith("TweetCity: already liked");
    });

    it("emits CityLiked event", async function () {
      await expect(
        contract.connect(user2).likeCity(1)
      ).to.emit(contract, "CityLiked").withArgs(1, user2.address);
    });
  });

  // ─── tokenURI ──────────────────────────────────────────────────────────────

  describe("tokenURI", function () {
    it("returns ipfs:// prefixed CID", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      expect(await contract.tokenURI(1)).to.equal(`ipfs://${FAKE_CID}`);
    });

    it("updates after city update", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      await contract.connect(oracle).updateCity(1, 200, 300, 60, 800, "QmUpdatedCID");
      expect(await contract.tokenURI(1)).to.equal("ipfs://QmUpdatedCID");
    });
  });

  // ─── History ───────────────────────────────────────────────────────────────

  describe("getHistory", function () {
    it("returns full snapshot history", async function () {
      await contract.connect(oracle).mintCity(user1.address, HANDLE, 50, 100, 30, 200, FAKE_CID);
      await contract.connect(oracle).updateCity(1, 200, 300, 60, 800, "QmCID2");
      await contract.connect(oracle).updateCity(1, 1500, 500, 80, 3000, "QmCID3");

      const history = await contract.getHistory(1);
      expect(history.length).to.equal(3);
      expect(history[0].followers).to.equal(50);
      expect(history[1].followers).to.equal(200);
      expect(history[2].followers).to.equal(1500);
    });
  });

  // ─── Admin ────────────────────────────────────────────────────────────────

  describe("setOracle", function () {
    it("allows owner to change oracle", async function () {
      await contract.connect(owner).setOracle(user2.address);
      expect(await contract.oracle()).to.equal(user2.address);
    });

    it("reverts if non-owner tries", async function () {
      await expect(
        contract.connect(user1).setOracle(user2.address)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("emits OracleChanged event", async function () {
      await expect(
        contract.connect(owner).setOracle(user2.address)
      ).to.emit(contract, "OracleChanged").withArgs(oracle.address, user2.address);
    });
  });
});
