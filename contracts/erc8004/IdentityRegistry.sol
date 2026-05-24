// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";

contract IdentityRegistry is IIdentityRegistry {
    uint256 public constant REGISTRATION_FEE = 0.005 ether;

    uint256 private _agentIdCounter;
    mapping(uint256 => AgentInfo) private _agents;
    mapping(string => uint256) private _domainToAgentId;
    mapping(address => uint256) private _addressToAgentId;

    constructor() {
        _agentIdCounter = 1;
    }

    function newAgent(string calldata agentDomain, address agentAddress) external payable returns (uint256 agentId) {
        if (msg.value != REGISTRATION_FEE) revert InsufficientFee();
        if (bytes(agentDomain).length == 0) revert InvalidDomain();
        if (agentAddress == address(0)) revert InvalidAddress();
        if (_domainToAgentId[agentDomain] != 0) revert DomainAlreadyRegistered();
        if (_addressToAgentId[agentAddress] != 0) revert AddressAlreadyRegistered();

        agentId = _agentIdCounter++;
        _agents[agentId] = AgentInfo({ agentId: agentId, agentDomain: agentDomain, agentAddress: agentAddress });
        _domainToAgentId[agentDomain] = agentId;
        _addressToAgentId[agentAddress] = agentId;

        emit AgentRegistered(agentId, agentDomain, agentAddress);
    }

    function updateAgent(uint256 agentId, string calldata newAgentDomain, address newAgentAddress) external returns (bool) {
        AgentInfo storage agent = _agents[agentId];
        if (agent.agentId == 0) revert AgentNotFound();
        if (msg.sender != agent.agentAddress) revert UnauthorizedUpdate();

        if (bytes(newAgentDomain).length > 0) {
            if (_domainToAgentId[newAgentDomain] != 0) revert DomainAlreadyRegistered();
            delete _domainToAgentId[agent.agentDomain];
            agent.agentDomain = newAgentDomain;
            _domainToAgentId[newAgentDomain] = agentId;
        }
        if (newAgentAddress != address(0)) {
            if (_addressToAgentId[newAgentAddress] != 0) revert AddressAlreadyRegistered();
            delete _addressToAgentId[agent.agentAddress];
            agent.agentAddress = newAgentAddress;
            _addressToAgentId[newAgentAddress] = agentId;
        }

        emit AgentUpdated(agentId, agent.agentDomain, agent.agentAddress);
        return true;
    }

    function getAgent(uint256 agentId) external view returns (AgentInfo memory) {
        AgentInfo memory a = _agents[agentId];
        if (a.agentId == 0) revert AgentNotFound();
        return a;
    }

    function resolveByDomain(string calldata agentDomain) external view returns (AgentInfo memory) {
        uint256 id = _domainToAgentId[agentDomain];
        if (id == 0) revert AgentNotFound();
        return _agents[id];
    }

    function resolveByAddress(address agentAddress) external view returns (AgentInfo memory) {
        uint256 id = _addressToAgentId[agentAddress];
        if (id == 0) revert AgentNotFound();
        return _agents[id];
    }

    function getAgentCount() external view returns (uint256) {
        return _agentIdCounter - 1;
    }

    function agentExists(uint256 agentId) external view returns (bool) {
        return _agents[agentId].agentId != 0;
    }
}
