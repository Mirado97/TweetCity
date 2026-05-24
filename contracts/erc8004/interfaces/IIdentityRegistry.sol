// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIdentityRegistry {
    event AgentRegistered(uint256 indexed agentId, string agentDomain, address agentAddress);
    event AgentUpdated(uint256 indexed agentId, string agentDomain, address agentAddress);

    struct AgentInfo {
        uint256 agentId;
        string agentDomain;
        address agentAddress;
    }

    error AgentNotFound();
    error UnauthorizedUpdate();
    error InvalidDomain();
    error InvalidAddress();
    error InsufficientFee();
    error DomainAlreadyRegistered();
    error AddressAlreadyRegistered();

    function REGISTRATION_FEE() external pure returns (uint256);

    function newAgent(string calldata agentDomain, address agentAddress) external payable returns (uint256 agentId);
    function updateAgent(uint256 agentId, string calldata newAgentDomain, address newAgentAddress) external returns (bool success);

    function getAgent(uint256 agentId) external view returns (AgentInfo memory);
    function resolveByDomain(string calldata agentDomain) external view returns (AgentInfo memory);
    function resolveByAddress(address agentAddress) external view returns (AgentInfo memory);
    function getAgentCount() external view returns (uint256);
    function agentExists(uint256 agentId) external view returns (bool);
}
