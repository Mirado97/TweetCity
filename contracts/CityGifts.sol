// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CityGifts
 * @notice Gift marketplace for TweetCity NFTs.
 *
 * Flow:
 *   buyer sendGift() → PENDING (funds locked)
 *     → owner approveGift() → ACCEPTED (engage deadline starts)
 *       → oracle verifyEngagement() → VERIFIED (funds released to owner, object appears in city)
 *     → owner rejectGift() → REJECTED (buyer refunded)
 *   If owner ignores for 48h → buyer claimExpired() → EXPIRED (refund)
 *   If owner accepted but didn't engage in time → buyer claimExpired() → EXPIRED (refund)
 *
 * Owner sets their own price per gift type — larger accounts charge more.
 */
contract CityGifts is Ownable, ReentrancyGuard {

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
        uint64  acceptDeadline; // owner must respond within ACCEPT_WINDOW
        uint64  engageDeadline; // owner must complete engagement by this time
    }

    // ─── State ────────────────────────────────────────────────────────────────

    IERC721 public immutable cityNFT;
    address public oracle;
    uint256 public protocolFeeBps = 1000; // 10%

    // Accept window: 48 hours
    uint64 public constant ACCEPT_WINDOW = 48 hours;

    // Engage deadlines per gift type (owner must engage within N days of accepting)
    uint64[6] public engageWindows = [
        3 days,   // Graffiti
        7 days,   // StreetArt
        7 days,   // Flag
        14 days,  // Billboard
        21 days,  // Monument
        30 days   // District
    ];

    uint256 public nextGiftId;

    // tokenId → price per GiftType (0 = type disabled)
    mapping(uint256 => uint256[6]) public cityPrices;

    // giftId → Gift
    mapping(uint256 => Gift) public gifts;

    // tokenId → all gift ids ever (including rejected/expired)
    mapping(uint256 => uint256[]) private _cityGiftIds;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PricesSet(uint256 indexed tokenId, uint256[6] prices);
    event GiftSent(uint256 indexed giftId, uint256 indexed tokenId, address buyer, GiftType giftType, string tweetUrl, uint256 amount);
    event GiftApproved(uint256 indexed giftId, uint256 indexed tokenId);
    event GiftRejected(uint256 indexed giftId, uint256 indexed tokenId);
    event GiftVerified(uint256 indexed giftId, uint256 indexed tokenId, address cityOwner, uint256 payout);
    event GiftExpired(uint256 indexed giftId, uint256 indexed tokenId, address refundedTo);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyCityOwner(uint256 tokenId) {
        require(cityNFT.ownerOf(tokenId) == msg.sender, "CityGifts: not city owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "CityGifts: not oracle");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _cityNFT, address _oracle) Ownable(msg.sender) {
        require(_cityNFT != address(0), "zero address");
        require(_oracle  != address(0), "zero address");
        cityNFT = IERC721(_cityNFT);
        oracle  = _oracle;
    }

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
     * @notice Owner previews the pending gift's tweetUrl on-chain then approves.
     *         Triggers the engage deadline clock.
     */
    function approveGift(uint256 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        require(cityNFT.ownerOf(g.cityTokenId) == msg.sender, "CityGifts: not city owner");
        require(g.status == GiftStatus.Pending, "CityGifts: not pending");
        require(block.timestamp <= g.acceptDeadline, "CityGifts: accept window expired");

        g.status        = GiftStatus.Accepted;
        g.engageDeadline = uint64(block.timestamp) + engageWindows[uint8(g.giftType)];

        emit GiftApproved(giftId, g.cityTokenId);
    }

    /**
     * @notice Owner rejects the gift (e.g. scam link). Buyer is fully refunded.
     */
    function rejectGift(uint256 giftId) external nonReentrant {
        Gift storage g = gifts[giftId];
        require(cityNFT.ownerOf(g.cityTokenId) == msg.sender, "CityGifts: not city owner");
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
            acceptDeadline: uint64(block.timestamp) + ACCEPT_WINDOW,
            engageDeadline: 0
        });
        _cityGiftIds[tokenId].push(giftId);

        // Protocol fee sent immediately
        if (fee > 0) {
            (bool ok,) = owner().call{value: fee}("");
            require(ok, "CityGifts: fee transfer failed");
        }

        emit GiftSent(giftId, tokenId, msg.sender, GiftType(giftType), tweetUrl, msg.value);
    }

    /**
     * @notice Buyer reclaims funds if:
     *         - Owner never responded within 48h (Pending → Expired)
     *         - Owner accepted but didn't engage within their window (Accepted → Expired)
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
     * @notice Called by the backend oracle after verifying on-chain/Twitter that
     *         the city owner completed their engagement obligation.
     *         Releases locked funds to the city owner.
     */
    function verifyEngagement(uint256 giftId) external onlyOracle nonReentrant {
        Gift storage g = gifts[giftId];
        require(g.status == GiftStatus.Accepted, "CityGifts: not accepted");
        require(block.timestamp <= g.engageDeadline, "CityGifts: engage window expired");

        g.status = GiftStatus.Verified;

        address cityOwner = cityNFT.ownerOf(g.cityTokenId);
        (bool ok,) = cityOwner.call{value: g.ownerAmount}("");
        require(ok, "CityGifts: payout failed");

        emit GiftVerified(giftId, g.cityTokenId, cityOwner, g.ownerAmount);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getPrices(uint256 tokenId) external view returns (uint256[6] memory) {
        return cityPrices[tokenId];
    }

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return gifts[giftId];
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
     * @notice Summary stats for city — can be used in NFT metadata / frontend.
     * @return totalGifts      all-time gift count
     * @return totalEarned     MNT earned from verified gifts (wei)
     * @return pendingCount    awaiting owner decision
     * @return activeByType    count of active (Accepted+Verified) gifts per type
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
            if (g.status == GiftStatus.Verified) {
                totalEarned += g.ownerAmount;
            }
            if (g.status == GiftStatus.Pending) {
                pendingCount++;
            }
            if (g.status == GiftStatus.Accepted || g.status == GiftStatus.Verified) {
                activeByType[uint8(g.giftType)]++;
            }
        }
    }

    // ─── Admin functions ──────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "zero address");
        emit OracleChanged(oracle, _oracle);
        oracle = _oracle;
    }

    function setProtocolFee(uint256 bps) external onlyOwner {
        require(bps <= 2000, "CityGifts: max 20%");
        protocolFeeBps = bps;
    }

    function setEngageWindow(uint8 giftType, uint64 window) external onlyOwner {
        require(giftType < 6, "invalid type");
        engageWindows[giftType] = window;
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
}
