// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './reactive-lib/abstract-base/AbstractPausableReactive.sol';

interface IChimeraCoordinator {
    function processExpiredJobs() external;
}

/**
 * @title ChimeraReactive
 * @dev Reactive Network contract that periodically triggers fallback bridging for expired hybrid jobs.
 *
 * The contract subscribes to Reactive Network's built-in CRON events. On each tick it emits a
 * callback to the origin chain's ChimeraCoordinator, which scans pending jobs and triggers
 * fallback for any hybrid job whose deadline has passed and which has not yet been paid or bridged.
 *
 * CRON topics (Reactive Network):
 *   - Cron1:    0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514
 *   - Cron10:   0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687
 *   - Cron100:  0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70
 *   - Cron1000: 0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4
 *
 * The contract is pausable and can be resumed without redeployment.
 */
contract ChimeraReactive is AbstractPausableReactive {
    uint256 public originChainId;
    address public coordinator;
    uint256 public cronTopic;
    uint64 private constant GAS_LIMIT = 2000000;

    constructor(
        uint256 _originChainId,
        address _coordinator,
        uint256 _cronTopic
    ) payable {
        require(_coordinator != address(0), 'ChimeraReactive: coordinator required');
        require(_originChainId != 0, 'ChimeraReactive: origin chain required');
        require(_cronTopic != 0, 'ChimeraReactive: cron topic required');
        originChainId = _originChainId;
        coordinator = _coordinator;
        cronTopic = _cronTopic;

        if (!vm) {
            service.subscribe(
                block.chainid,
                address(service),
                _cronTopic,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    function getPausableSubscriptions() internal view override returns (Subscription[] memory) {
        Subscription[] memory result = new Subscription[](1);
        result[0] = Subscription(
            block.chainid,
            address(service),
            cronTopic,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        return result;
    }

    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == cronTopic) {
            bytes memory payload = abi.encodeWithSignature('processExpiredJobs()');
            emit Callback(originChainId, coordinator, GAS_LIMIT, payload);
        }
    }
}
