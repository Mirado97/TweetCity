// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputationRegistry {
    event AuthFeedback(uint256 indexed agentClientId, uint256 indexed agentServerId, bytes32 feedbackAuthId);

    error AgentNotFound();
    error UnauthorizedFeedback();
    error FeedbackAlreadyAuthorized();

    function acceptFeedback(uint256 agentClientId, uint256 agentServerId) external;
    function isFeedbackAuthorized(uint256 agentClientId, uint256 agentServerId) external view returns (bool authorized, bytes32 feedbackAuthId);
    function getFeedbackAuthId(uint256 agentClientId, uint256 agentServerId) external view returns (bytes32);
}
