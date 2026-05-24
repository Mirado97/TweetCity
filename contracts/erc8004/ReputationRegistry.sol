// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IReputationRegistry.sol";
import "./interfaces/IIdentityRegistry.sol";

contract ReputationRegistry is IReputationRegistry {
    IIdentityRegistry public immutable identityRegistry;

    // keccak256(agentClientId, agentServerId) → feedbackAuthId
    mapping(bytes32 => bytes32) private _feedbackAuthorizations;

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function acceptFeedback(uint256 agentClientId, uint256 agentServerId) external {
        if (!identityRegistry.agentExists(agentClientId)) revert AgentNotFound();
        if (!identityRegistry.agentExists(agentServerId)) revert AgentNotFound();

        IIdentityRegistry.AgentInfo memory serverAgent = identityRegistry.getAgent(agentServerId);
        if (msg.sender != serverAgent.agentAddress) revert UnauthorizedFeedback();

        bytes32 key = keccak256(abi.encodePacked(agentClientId, agentServerId));
        if (_feedbackAuthorizations[key] != bytes32(0)) revert FeedbackAlreadyAuthorized();

        bytes32 feedbackAuthId = keccak256(abi.encodePacked(agentClientId, agentServerId, block.timestamp, block.number, tx.origin));
        _feedbackAuthorizations[key] = feedbackAuthId;

        emit AuthFeedback(agentClientId, agentServerId, feedbackAuthId);
    }

    function isFeedbackAuthorized(uint256 agentClientId, uint256 agentServerId) external view returns (bool authorized, bytes32 feedbackAuthId) {
        bytes32 key = keccak256(abi.encodePacked(agentClientId, agentServerId));
        feedbackAuthId = _feedbackAuthorizations[key];
        authorized = feedbackAuthId != bytes32(0);
    }

    function getFeedbackAuthId(uint256 agentClientId, uint256 agentServerId) external view returns (bytes32) {
        return _feedbackAuthorizations[keccak256(abi.encodePacked(agentClientId, agentServerId))];
    }
}
