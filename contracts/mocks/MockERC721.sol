// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Minimal ERC-721 used only by CityGifts.test.js to simulate TweetCity ownership.
contract MockERC721 is ERC721 {
    constructor() ERC721("MockCity", "MCITY") {}

    function mint(address to, uint256 tokenId) external {
        _safeMint(to, tokenId);
    }
}
