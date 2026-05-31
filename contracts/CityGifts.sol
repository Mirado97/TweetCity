// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title CityGifts (UUPS upgradeable)
 * @notice Gift marketplace for TweetCity NFTs.
 *
 * Flow:
 *   buyer sendGift() → PENDING (funds locked)
 *     → manager approveGift() → ACCEPTED (engage deadline starts)
 *       → oracle verifyEngagement() → VERIFIED (funds released to manager)
 *     → manager rejectGift() → REJECTED (buyer refunded)
 *   If manager ignores past acceptWindow → buyer claimExpired() → EXPIRED (refund)
 *   If manager accepted but didn't engage in time → buyer claimExpired() → EXPIRED (refund)
 *
 * Owner sets their own price per gift type — larger accounts charge more.
 * @custom:oz-upgrades-unsafe-allow constructor
 */
contract CityGifts is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    // ─── Types ────────────────────────────────────────────────────────────────

    enum GiftType {
        Graffiti,   // 0 — like the tweet
        StreetArt,  // 1 — like + retweet
        Flag,       // 2 — comment on tweet
        Billboard,  // 3 — quote tweet
        Monument,   // 4 — dedicated mention post
        District    // 5 — pinned tweet for 7 days
    }

    enum GiftStatus { Pending, Accepted, Verified, Rejected, Expired }

    struct Gift {
        uint256 id;
        address buyer;
        uint256 cityTokenId;
        GiftType giftType;
        string  tweetUrl;       // tweet buyer wants engagement on
        uint256 amount;         // total paid by buyer
        uint256 ownerAmount;    // amount after protocol fee (released on verify)
        GiftStatus status;
        uint64  createdAt;
        uint64  acceptDeadline; // owner must respond within acceptWindow
        uint64  engageDeadline; // owner must complete engagement by this time
    }

    struct ResidentCampaign {
        uint256 id;
        address creator;
        uint256 cityTokenId;
        string  postUrl;
        uint256 escrowRemaining;
        uint256 grossAmount;
        uint64  createdAt;
        uint64  deadline;
        bool    active;
        uint256[6] unitPrices;
        uint256[6] unitPayouts;
        uint32[6] totalCounts;
        uint32[6] remaining;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────
    // NOTE: do not reorder, remove, or change types of existing variables.
    // Append new state below the existing ones to keep storage layout compatible.

    IERC721 public cityNFT;
    address public oracle;
    uint256 public protocolFeeBps; // basis points, e.g. 1000 = 10%

    // Accept window — how long owner has to Approve/Reject a pending gift.
    uint64 public acceptWindow;

    // Engage deadlines per gift type (owner must engage within this time after Accept).
    uint64[6] public engageWindows;

    uint256 public nextGiftId;

    // tokenId → registered city manager (the wallet that minted the city)
    // Separate from ERC-721 owner: oracle may hold the NFT, minter manages the city.
    mapping(uint256 => address) public cityManager;

    // tokenId → price per GiftType (0 = type disabled)
    mapping(uint256 => uint256[6]) public cityPrices;

    // giftId → Gift
    mapping(uint256 => Gift) public gifts;

    // tokenId → all gift ids ever (including rejected/expired)
    mapping(uint256 => uint256[]) private _cityGiftIds;

    uint256 public nextCampaignId;

    // Resident campaigns invert the normal gift flow:
    // resident funds escrow up front, other X-city owners claim after verified engagement.
    mapping(uint256 => ResidentCampaign) public residentCampaigns;
    mapping(uint256 => uint256[]) private _cityCampaignIds;
    mapping(uint256 => mapping(uint8 => mapping(address => bool))) public campaignWalletClaimed;
    mapping(uint256 => mapping(uint8 => mapping(bytes32 => bool))) public campaignHandleClaimed;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ManagerSet(uint256 indexed tokenId, address indexed manager);
    event PricesSet(uint256 indexed tokenId, uint256[6] prices);
    event GiftSent(uint256 indexed giftId, uint256 indexed tokenId, address buyer, GiftType giftType, string tweetUrl, uint256 amount);
    event GiftApproved(uint256 indexed giftId, uint256 indexed tokenId);
    event GiftRejected(uint256 indexed giftId, uint256 indexed tokenId);
    event GiftVerified(uint256 indexed giftId, uint256 indexed tokenId, address cityOwner, uint256 payout);
    event GiftExpired(uint256 indexed giftId, uint256 indexed tokenId, address refundedTo);
    event ResidentCampaignCreated(uint256 indexed campaignId, uint256 indexed tokenId, address indexed creator, uint256 grossAmount, uint256 escrowAmount);
    event ResidentCampaignClaimed(uint256 indexed campaignId, uint8 indexed giftType, address indexed worker, bytes32 handleHash, uint256 payout);
    event ResidentCampaignWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);
    event AcceptWindowChanged(uint64 oldWindow, uint64 newWindow);
    event EngageWindowChanged(uint8 indexed giftType, uint64 oldWindow, uint64 newWindow);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyCityOwner(uint256 tokenId) {
        require(cityManager[tokenId] == msg.sender, "CityGifts: not city manager");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "CityGifts: not oracle");
        _;
    }

    // ─── Constructor disabled for proxy safety ────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ──────────────────────────────────────────────────────────

    /**
     * @notice One-time initializer for the proxy.
     *         Defaults: ACCEPT=24h, engageWindows=48h for all 6 types, fee=10%.
     */
    function initialize(address _cityNFT, address _oracle) public initializer {
        require(_cityNFT != address(0), "CityGifts: zero NFT");
        require(_oracle  != address(0), "CityGifts: zero oracle");

        __Ownable_init(msg.sender);

        cityNFT        = IERC721(_cityNFT);
        oracle         = _oracle;
        protocolFeeBps = 1000;          // 10%
        acceptWindow   = 24 hours;      // owner has 24h to respond
        // 48 hours engage window for every gift type by default
        for (uint8 i; i < 6; i++) {
            engageWindows[i] = 48 hours;
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Owner (city) functions ───────────────────────────────────────────────

    /**
     * @notice City owner sets their own price list.
     *         Set 0 for a type to disable it.
     */
    function setPrices(uint256 tokenId, uint256[6] calldata prices)
        external
        onlyCityOwner(tokenId)
    {
        cityPrices[tokenId] = prices;
        emit PricesSet(tokenId, prices);
    }

    /**
     * @notice City manager approves a pending gift, triggering the engage deadline.
     */
    function approveGift(uint256 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        require(cityManager[g.cityTokenId] == msg.sender, "CityGifts: not city manager");
        require(g.status == GiftStatus.Pending, "CityGifts: not pending");
        require(block.timestamp <= g.acceptDeadline, "CityGifts: accept window expired");

        g.status         = GiftStatus.Accepted;
        g.engageDeadline = uint64(block.timestamp) + engageWindows[uint8(g.giftType)];

        emit GiftApproved(giftId, g.cityTokenId);
    }

    /**
     * @notice City manager rejects a pending gift (e.g. scam link). Buyer is refunded 90%.
     */
    function rejectGift(uint256 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        require(cityManager[g.cityTokenId] == msg.sender, "CityGifts: not city manager");
        require(g.status == GiftStatus.Pending, "CityGifts: not pending");

        g.status = GiftStatus.Rejected;

        (bool ok,) = g.buyer.call{value: g.ownerAmount}("");
        require(ok, "CityGifts: refund failed");

        emit GiftRejected(giftId, g.cityTokenId);
    }

    // ─── Buyer functions ──────────────────────────────────────────────────────

    /**
     * @notice Send a gift to a city. Funds are locked until verified or refunded.
     *         msg.value must be >= cityPrices[tokenId][giftType].
     */
    function sendGift(uint256 tokenId, uint8 giftType, string calldata tweetUrl)
        external
        payable
        nonReentrant
    {
        require(giftType < 6, "CityGifts: invalid gift type");
        uint256 price = cityPrices[tokenId][giftType];
        require(price > 0,          "CityGifts: gift type not enabled by owner");
        require(msg.value >= price, "CityGifts: insufficient payment");
        require(bytes(tweetUrl).length > 0, "CityGifts: empty tweet URL");

        uint256 fee         = (msg.value * protocolFeeBps) / 10000;
        uint256 ownerAmount = msg.value - fee;

        uint256 giftId = nextGiftId++;
        gifts[giftId] = Gift({
            id:             giftId,
            buyer:          msg.sender,
            cityTokenId:    tokenId,
            giftType:       GiftType(giftType),
            tweetUrl:       tweetUrl,
            amount:         msg.value,
            ownerAmount:    ownerAmount,
            status:         GiftStatus.Pending,
            createdAt:      uint64(block.timestamp),
            acceptDeadline: uint64(block.timestamp) + acceptWindow,
            engageDeadline: 0
        });
        _cityGiftIds[tokenId].push(giftId);

        if (fee > 0) {
            (bool ok,) = owner().call{value: fee}("");
            require(ok, "CityGifts: fee transfer failed");
        }

        emit GiftSent(giftId, tokenId, msg.sender, GiftType(giftType), tweetUrl, msg.value);
    }

    /**
     * @notice Resident funds a reward campaign for other X-city owners.
     *         Counts select which gift actions are open. Prices come from My City.
     */
    function createResidentCampaign(
        uint256 tokenId,
        string calldata postUrl,
        uint64 durationSeconds,
        uint32[6] calldata counts
    )
        external
        payable
        nonReentrant
        onlyCityOwner(tokenId)
    {
        require(bytes(postUrl).length > 0, "CityGifts: empty post URL");
        require(durationSeconds > 0, "CityGifts: zero duration");

        uint256[6] memory unitPrices;
        uint256[6] memory unitPayouts;
        uint256 grossAmount;
        uint256 escrowAmount;
        uint256 totalSlots;

        for (uint8 i; i < 6; i++) {
            uint32 count = counts[i];
            if (count == 0) continue;

            uint256 price = cityPrices[tokenId][i];
            require(price > 0, "CityGifts: gift type not enabled by owner");

            uint256 payout = price - ((price * protocolFeeBps) / 10000);
            require(payout > 0, "CityGifts: zero payout");

            unitPrices[i] = price;
            unitPayouts[i] = payout;
            grossAmount += price * count;
            escrowAmount += payout * count;
            totalSlots += count;
        }

        require(totalSlots > 0, "CityGifts: empty campaign");
        require(msg.value == grossAmount, "CityGifts: wrong payment");

        uint256 fee = grossAmount - escrowAmount;
        if (fee > 0) {
            (bool ok,) = owner().call{value: fee}("");
            require(ok, "CityGifts: fee transfer failed");
        }

        uint256 campaignId = nextCampaignId++;
        ResidentCampaign storage c = residentCampaigns[campaignId];
        c.id = campaignId;
        c.creator = msg.sender;
        c.cityTokenId = tokenId;
        c.postUrl = postUrl;
        c.escrowRemaining = escrowAmount;
        c.grossAmount = grossAmount;
        c.createdAt = uint64(block.timestamp);
        c.deadline = uint64(block.timestamp) + durationSeconds;
        c.active = true;
        c.unitPrices = unitPrices;
        c.unitPayouts = unitPayouts;
        c.totalCounts = counts;
        c.remaining = counts;

        _cityCampaignIds[tokenId].push(campaignId);

        emit ResidentCampaignCreated(campaignId, tokenId, msg.sender, grossAmount, escrowAmount);
    }

    /**
     * @notice Buyer reclaims funds when:
     *         - Owner never responded within acceptWindow (Pending → Expired), or
     *         - Owner accepted but didn't engage within engage window (Accepted → Expired).
     */
    function claimExpired(uint256 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        require(g.buyer == msg.sender, "CityGifts: not buyer");
        require(
            (g.status == GiftStatus.Pending  && block.timestamp > g.acceptDeadline) ||
            (g.status == GiftStatus.Accepted && block.timestamp > g.engageDeadline),
            "CityGifts: not expired"
        );

        g.status = GiftStatus.Expired;

        (bool ok,) = g.buyer.call{value: g.ownerAmount}("");
        require(ok, "CityGifts: refund failed");

        emit GiftExpired(giftId, g.cityTokenId, msg.sender);
    }

    // ─── Oracle functions ─────────────────────────────────────────────────────

    /**
     * @notice Oracle marks a gift as verified — releases escrow to the city manager.
     */
    function verifyEngagement(uint256 giftId) external onlyOracle nonReentrant {
        Gift storage g = gifts[giftId];
        require(g.status == GiftStatus.Accepted, "CityGifts: not accepted");
        require(block.timestamp <= g.engageDeadline, "CityGifts: engage window expired");

        g.status = GiftStatus.Verified;

        address manager = cityManager[g.cityTokenId];
        require(manager != address(0), "CityGifts: no manager registered");
        (bool ok,) = manager.call{value: g.ownerAmount}("");
        require(ok, "CityGifts: payout failed");

        emit GiftVerified(giftId, g.cityTokenId, manager, g.ownerAmount);
    }

    /**
     * @notice Oracle pays a worker after verifying their X action for a resident campaign.
     *         Each wallet and each X handle can claim a campaign/giftType only once.
     */
    function verifyResidentCampaignEngagement(
        uint256 campaignId,
        uint8 giftType,
        address worker,
        bytes32 handleHash
    )
        external
        onlyOracle
        nonReentrant
    {
        require(giftType < 6, "CityGifts: invalid gift type");
        require(worker != address(0), "CityGifts: zero worker");
        require(handleHash != bytes32(0), "CityGifts: zero handle");

        ResidentCampaign storage c = residentCampaigns[campaignId];
        require(c.creator != address(0), "CityGifts: unknown campaign");
        require(c.active, "CityGifts: campaign inactive");
        require(block.timestamp <= c.deadline, "CityGifts: campaign expired");
        require(c.remaining[giftType] > 0, "CityGifts: no slots");
        require(!campaignWalletClaimed[campaignId][giftType][worker], "CityGifts: wallet claimed");
        require(!campaignHandleClaimed[campaignId][giftType][handleHash], "CityGifts: handle claimed");

        uint256 payout = c.unitPayouts[giftType];
        require(payout > 0, "CityGifts: zero payout");
        require(c.escrowRemaining >= payout, "CityGifts: insufficient escrow");

        campaignWalletClaimed[campaignId][giftType][worker] = true;
        campaignHandleClaimed[campaignId][giftType][handleHash] = true;
        c.remaining[giftType] -= 1;
        c.escrowRemaining -= payout;

        if (_campaignRemainingTotal(c) == 0 || c.escrowRemaining == 0) {
            c.active = false;
        }

        (bool ok,) = worker.call{value: payout}("");
        require(ok, "CityGifts: payout failed");

        emit ResidentCampaignClaimed(campaignId, giftType, worker, handleHash, payout);
    }

    /**
     * @notice Creator withdraws unused escrow after campaign deadline.
     */
    function withdrawResidentCampaign(uint256 campaignId) external nonReentrant {
        ResidentCampaign storage c = residentCampaigns[campaignId];
        require(c.creator == msg.sender, "CityGifts: not campaign creator");
        require(block.timestamp > c.deadline, "CityGifts: campaign not expired");

        uint256 amount = c.escrowRemaining;
        require(amount > 0, "CityGifts: nothing to withdraw");

        c.active = false;
        c.escrowRemaining = 0;

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "CityGifts: withdraw failed");

        emit ResidentCampaignWithdrawn(campaignId, msg.sender, amount);
    }

    /**
     * @notice Oracle registers the city manager (minter wallet) for a city.
     */
    function registerManager(uint256 tokenId, address manager) external onlyOracle {
        require(manager != address(0), "CityGifts: zero address");
        cityManager[tokenId] = manager;
        emit ManagerSet(tokenId, manager);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getPrices(uint256 tokenId) external view returns (uint256[6] memory) {
        return cityPrices[tokenId];
    }

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return gifts[giftId];
    }

    function getResidentCampaign(uint256 campaignId) external view returns (ResidentCampaign memory) {
        return residentCampaigns[campaignId];
    }

    function getCityResidentCampaignIds(uint256 tokenId) external view returns (uint256[] memory) {
        return _cityCampaignIds[tokenId];
    }

    function hasResidentCampaignClaimed(
        uint256 campaignId,
        uint8 giftType,
        address worker,
        bytes32 handleHash
    ) external view returns (bool walletClaimed, bool handleClaimed) {
        return (
            campaignWalletClaimed[campaignId][giftType][worker],
            campaignHandleClaimed[campaignId][giftType][handleHash]
        );
    }

    /** All gifts ever sent to this city (all statuses). */
    function getAllGifts(uint256 tokenId) external view returns (Gift[] memory) {
        return _buildList(tokenId, type(uint8).max);
    }

    /** Pending gifts — for owner's inbox (approve / reject). */
    function getPendingGifts(uint256 tokenId) external view returns (Gift[] memory) {
        return _buildList(tokenId, uint8(GiftStatus.Pending));
    }

    /** Active gifts (Accepted + Verified) — rendered visually in city. */
    function getActiveGifts(uint256 tokenId) external view returns (Gift[] memory) {
        uint256[] storage ids = _cityGiftIds[tokenId];
        uint256 count;
        for (uint256 i; i < ids.length; i++) {
            GiftStatus s = gifts[ids[i]].status;
            if (s == GiftStatus.Accepted || s == GiftStatus.Verified) count++;
        }
        Gift[] memory result = new Gift[](count);
        uint256 j;
        for (uint256 i; i < ids.length; i++) {
            GiftStatus s = gifts[ids[i]].status;
            if (s == GiftStatus.Accepted || s == GiftStatus.Verified) {
                result[j++] = gifts[ids[i]];
            }
        }
        return result;
    }

    /**
     * @notice Summary stats for a city.
     */
    function getCityStats(uint256 tokenId) external view returns (
        uint256 totalGifts,
        uint256 totalEarned,
        uint256 pendingCount,
        uint256[6] memory activeByType
    ) {
        uint256[] storage ids = _cityGiftIds[tokenId];
        for (uint256 i; i < ids.length; i++) {
            Gift storage g = gifts[ids[i]];
            totalGifts++;
            if (g.status == GiftStatus.Verified)  totalEarned += g.ownerAmount;
            if (g.status == GiftStatus.Pending)   pendingCount++;
            if (g.status == GiftStatus.Accepted || g.status == GiftStatus.Verified) {
                activeByType[uint8(g.giftType)]++;
            }
        }
    }

    // ─── Admin functions ──────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "CityGifts: zero address");
        emit OracleChanged(oracle, _oracle);
        oracle = _oracle;
    }

    function setProtocolFee(uint256 bps) external onlyOwner {
        require(bps <= 2000, "CityGifts: max 20%");
        protocolFeeBps = bps;
    }

    function setAcceptWindow(uint64 newWindow) external onlyOwner {
        require(newWindow > 0, "CityGifts: zero window");
        emit AcceptWindowChanged(acceptWindow, newWindow);
        acceptWindow = newWindow;
    }

    function setEngageWindow(uint8 giftType, uint64 newWindow) external onlyOwner {
        require(giftType < 6, "CityGifts: invalid type");
        require(newWindow > 0, "CityGifts: zero window");
        emit EngageWindowChanged(giftType, engageWindows[giftType], newWindow);
        engageWindows[giftType] = newWindow;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _buildList(uint256 tokenId, uint8 statusFilter) internal view returns (Gift[] memory) {
        uint256[] storage ids = _cityGiftIds[tokenId];
        uint256 count;
        for (uint256 i; i < ids.length; i++) {
            if (statusFilter == type(uint8).max || uint8(gifts[ids[i]].status) == statusFilter)
                count++;
        }
        Gift[] memory result = new Gift[](count);
        uint256 j;
        for (uint256 i; i < ids.length; i++) {
            if (statusFilter == type(uint8).max || uint8(gifts[ids[i]].status) == statusFilter)
                result[j++] = gifts[ids[i]];
        }
        return result;
    }

    function _campaignRemainingTotal(ResidentCampaign storage c) internal view returns (uint256 total) {
        for (uint8 i; i < 6; i++) {
            total += c.remaining[i];
        }
    }
}
