// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Dynamic NFT that represents a Twitter account as an evolving city on Mantle.
/// @custom:oz-upgrades-unsafe-allow constructor
contract TweetCity is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {

    // ─── Structs ────────────────────────────────────────────────────────────

    struct CityMetrics {
        uint32  followers;
        uint32  tweetCount;
        uint32  following;
        uint32  engagement;
        uint8   level;        // 1=Village 2=Town 3=City 4=Metropolis 5=Megacity
        uint64  updatedAt;
        string  ipfsCID;
    }

    struct Snapshot {
        uint32 followers;
        uint32 tweetCount;
        uint32 engagement;
        uint64 timestamp;
    }

    // ─── Storage ────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    mapping(uint256 => CityMetrics)   public  cities;
    mapping(uint256 => Snapshot[])    private _history;
    mapping(string  => uint256)       public  handleToTokenId;
    mapping(uint256 => string)        public  tokenToHandle;   // reverse: tokenId → twitterHandle
    mapping(uint256 => uint256)       public  cityLikes;
    mapping(address => mapping(uint256 => bool)) public hasLiked;

    address public oracle;

    // ERC-8004 Agent Identity Registry
    address public agentIdentityRegistry;
    mapping(uint256 => uint256) public tokenAgentId; // tokenId → ERC-8004 agentId

    // ─── Events ─────────────────────────────────────────────────────────────

    event CityMinted(uint256 indexed tokenId, string twitterHandle, address owner, uint8 level);
    event AgentRegistered(uint256 indexed tokenId, uint256 indexed agentId);
    event CityUpdated(uint256 indexed tokenId, uint32 followers, uint8 level);
    event CityLevelUp(uint256 indexed tokenId, uint8 oldLevel, uint8 newLevel);
    event CityLiked(uint256 indexed tokenId, address visitor);
    event OracleChanged(address oldOracle, address newOracle);

    // ─── Modifiers ──────────────────────────────────────────────────────────

    modifier onlyOracle() {
        require(msg.sender == oracle, "TweetCity: caller is not oracle");
        _;
    }

    // ─── Constructor (disables initializers for proxy safety) ───────────────

    constructor() {
        _disableInitializers();
    }

    // ─── Initializer (replaces constructor for proxy) ───────────────────────

    function initialize(address _oracle) public initializer {
        __ERC721_init("TweetCity", "TCITY");
        __Ownable_init(msg.sender);
        require(_oracle != address(0), "TweetCity: zero oracle address");
        oracle = _oracle;
    }

    // ─── Oracle functions ────────────────────────────────────────────────────

    function mintCity(
        address         to,
        string calldata twitterHandle,
        uint32          followers,
        uint32          tweetCount,
        uint32          following,
        uint32          engagement,
        string calldata ipfsCID
    ) external onlyOracle {
        require(bytes(twitterHandle).length > 0, "TweetCity: empty handle");
        require(handleToTokenId[twitterHandle] == 0, "TweetCity: handle already minted");
        require(to != address(0), "TweetCity: zero address");

        uint256 tokenId = ++_nextTokenId;
        uint8 level = _calcLevel(followers);

        cities[tokenId] = CityMetrics({
            followers:  followers,
            tweetCount: tweetCount,
            following:  following,
            engagement: engagement,
            level:      level,
            updatedAt:  uint64(block.timestamp),
            ipfsCID:    ipfsCID
        });

        _history[tokenId].push(Snapshot({
            followers:  followers,
            tweetCount: tweetCount,
            engagement: engagement,
            timestamp:  uint64(block.timestamp)
        }));

        handleToTokenId[twitterHandle] = tokenId;
        tokenToHandle[tokenId] = twitterHandle;
        _safeMint(to, tokenId);

        emit CityMinted(tokenId, twitterHandle, to, level);
    }

    function updateCity(
        uint256         tokenId,
        uint32          followers,
        uint32          tweetCount,
        uint32          following,
        uint32          engagement,
        string calldata ipfsCID
    ) external onlyOracle {
        require(_ownerOf(tokenId) != address(0), "TweetCity: token does not exist");

        uint8 oldLevel = cities[tokenId].level;
        uint8 newLevel = _calcLevel(followers);

        cities[tokenId].followers  = followers;
        cities[tokenId].tweetCount = tweetCount;
        cities[tokenId].following  = following;
        cities[tokenId].engagement = engagement;
        cities[tokenId].level      = newLevel;
        cities[tokenId].updatedAt  = uint64(block.timestamp);

        if (bytes(ipfsCID).length > 0) {
            cities[tokenId].ipfsCID = ipfsCID;
        }

        _history[tokenId].push(Snapshot({
            followers:  followers,
            tweetCount: tweetCount,
            engagement: engagement,
            timestamp:  uint64(block.timestamp)
        }));

        emit CityUpdated(tokenId, followers, newLevel);

        if (newLevel > oldLevel) {
            emit CityLevelUp(tokenId, oldLevel, newLevel);
        }
    }

    // ─── Public functions ────────────────────────────────────────────────────

    function likeCity(uint256 tokenId) external {
        require(_ownerOf(tokenId) != address(0), "TweetCity: token does not exist");
        require(balanceOf(msg.sender) > 0, "TweetCity: must own a city to like");
        require(!hasLiked[msg.sender][tokenId], "TweetCity: already liked");

        hasLiked[msg.sender][tokenId] = true;
        cityLikes[tokenId]++;

        emit CityLiked(tokenId, msg.sender);
    }

    // ─── View functions ──────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "TweetCity: token does not exist");
        return string(abi.encodePacked("ipfs://", cities[tokenId].ipfsCID));
    }

    function getHistory(uint256 tokenId) external view returns (Snapshot[] memory) {
        require(_ownerOf(tokenId) != address(0), "TweetCity: token does not exist");
        return _history[tokenId];
    }

    function getHistoryLength(uint256 tokenId) external view returns (uint256) {
        return _history[tokenId].length;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setAgentIdentityRegistry(address registry) external onlyOwner {
        agentIdentityRegistry = registry;
    }

    function setTokenAgentId(uint256 tokenId, uint256 agentId) external onlyOwner {
        tokenAgentId[tokenId] = agentId;
        emit AgentRegistered(tokenId, agentId);
    }

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "TweetCity: zero address");
        emit OracleChanged(oracle, newOracle);
        oracle = newOracle;
    }

    // ─── UUPS upgrade authorization ──────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ─── Internal ────────────────────────────────────────────────────────────

    function _calcLevel(uint32 followers) internal pure returns (uint8) {
        if (followers >= 100_000) return 5;
        if (followers >= 10_000)  return 4;
        if (followers >= 1_000)   return 3;
        if (followers >= 100)     return 2;
        return 1;
    }
}
