// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IValidationRegistry.sol";
import "./interfaces/IIdentityRegistry.sol";

contract ValidationRegistry is IValidationRegistry {
    uint256 public constant EXPIRATION_SLOTS = 1000;

    IIdentityRegistry public immutable identityRegistry;

    mapping(bytes32 => Request) private _validationRequests;
    mapping(bytes32 => uint8) private _validationResponses;
    mapping(bytes32 => bool) private _hasResponse;

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function validationRequest(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash) external {
        if (dataHash == bytes32(0)) revert InvalidDataHash();
        if (!identityRegistry.agentExists(agentValidatorId)) revert AgentNotFound();
        if (!identityRegistry.agentExists(agentServerId)) revert AgentNotFound();

        Request storage existing = _validationRequests[dataHash];
        if (existing.dataHash != bytes32(0)) {
            if (block.number <= existing.timestamp + EXPIRATION_SLOTS) {
                emit ValidationRequestEvent(agentValidatorId, agentServerId, dataHash);
                return;
            }
        }

        _validationRequests[dataHash] = Request({
            agentValidatorId: agentValidatorId,
            agentServerId: agentServerId,
            dataHash: dataHash,
            timestamp: block.number,
            responded: false
        });

        emit ValidationRequestEvent(agentValidatorId, agentServerId, dataHash);
    }

    function validationResponse(bytes32 dataHash, uint8 response) external {
        if (response > 100) revert InvalidResponse();

        Request storage request = _validationRequests[dataHash];
        if (request.dataHash == bytes32(0)) revert ValidationRequestNotFound();
        if (block.number > request.timestamp + EXPIRATION_SLOTS) revert RequestExpired();
        if (request.responded) revert ValidationAlreadyResponded();

        IIdentityRegistry.AgentInfo memory validatorAgent = identityRegistry.getAgent(request.agentValidatorId);
        if (msg.sender != validatorAgent.agentAddress) revert UnauthorizedValidator();

        request.responded = true;
        _validationResponses[dataHash] = response;
        _hasResponse[dataHash] = true;

        emit ValidationResponseEvent(request.agentValidatorId, request.agentServerId, dataHash, response);
    }

    function getValidationRequest(bytes32 dataHash) external view returns (Request memory) {
        Request memory r = _validationRequests[dataHash];
        if (r.dataHash == bytes32(0)) revert ValidationRequestNotFound();
        return r;
    }

    function isValidationPending(bytes32 dataHash) external view returns (bool exists, bool pending) {
        Request storage r = _validationRequests[dataHash];
        exists = r.dataHash != bytes32(0);
        if (exists) pending = !r.responded && block.number <= r.timestamp + EXPIRATION_SLOTS;
    }

    function getValidationResponse(bytes32 dataHash) external view returns (bool hasResponse, uint8 response) {
        hasResponse = _hasResponse[dataHash];
        if (hasResponse) response = _validationResponses[dataHash];
    }

    function getExpirationSlots() external pure returns (uint256) {
        return EXPIRATION_SLOTS;
    }
}
