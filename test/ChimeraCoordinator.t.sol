// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "contracts/ChimeraCoordinator.sol";

contract MockComputeRegistry is IComputeRegistry {
    address[] public providers;
    mapping(address => Provider) public providerData;

    function addProvider(address p, uint8 status, uint16 taskTypes) external {
        providers.push(p);
        Provider storage d = providerData[p];
        d.authority = p;
        d.taskTypes = taskTypes;
        d.status = status;
    }

    function getRegisteredProviders() external view override returns (address[] memory) {
        return providers;
    }

    function getProvider(address p) external view override returns (Provider memory) {
        return providerData[p];
    }

    function getProviderStatus(address) external pure override returns (uint8) {
        return 1;
    }

    function TASK_TYPE_COMPUTE() external pure override returns (uint16) { return 1; }
    function TASK_TYPE_STORAGE() external pure override returns (uint16) { return 2; }
    function TASK_TYPE_INFERENCE() external pure override returns (uint16) { return 4; }
    function TASK_TYPE_BANDWIDTH() external pure override returns (uint16) { return 8; }
}

contract MockEscrowVault is IEscrowVault {
    struct JobEntry {
        bytes32 jobId;
        address provider;
        uint256 amount;
        uint8 state;
    }
    mapping(address => JobEntry) public jobs;

    function createJob(
        address provider,
        bytes32,
        uint64,
        uint64,
        uint64,
        bytes calldata,
        uint256 amount,
        address,
        bytes16
    ) external payable override returns (address jobAddress, bytes32 jobId) {
        jobAddress = address(uint160(uint256(keccak256(abi.encodePacked(msg.sender, block.number, amount)))));
        jobId = keccak256(abi.encodePacked(jobAddress));
        jobs[jobAddress] = JobEntry(jobId, provider, amount, 1); // ASSIGNED
        return (jobAddress, jobId);
    }

    function getJob(address jobAddress) external view override returns (Job memory) {
        JobEntry storage e = jobs[jobAddress];
        return Job(
            e.jobId,
            address(0),      // consumer
            e.provider,      // providerAuthority
            bytes32(0),      // providerPeerId
            bytes32(0),      // requestHash
            0, 0, 0,         // nonce, taskType, validUntil
            bytes(""),       // quoteSignature
            e.amount,        // amount
            address(0),      // paymentMint
            0,               // providerFeeBps
            e.state,         // state
            0, 0, 0, 0, 0, 0, 0, // createdAt..settledAt
            bytes32(0),      // responseHash
            bytes(""),       // teeQuote
            0, 0             // klerosDisputeId, klerosRuling
        );
    }
}

contract MockBridgeDispatcher is IBridgeDispatcher {
    bytes32 public lastJobId;
    address public lastJobAddress;
    uint256 public lastAmount;

    function dispatch(
        bytes32 jobId,
        address jobAddress,
        uint64,
        uint8,
        address,
        uint256,
        bytes calldata,
        bytes32
    ) external payable override {
        lastJobId = jobId;
        lastJobAddress = jobAddress;
        lastAmount = msg.value;
    }
}

contract ChimeraCoordinatorTest is Test {
    ChimeraCoordinator coordinator;
    MockComputeRegistry registry;
    MockEscrowVault escrow;
    MockBridgeDispatcher dispatcher;
    address provider = address(0x1111);
    address fallbackProvider = address(0x2222);
    address consumer = address(0x3333);

    uint64 constant TASK_TYPE = 4; // inference
    uint8 constant POLICY_HYBRID = 0;
    uint8 constant POLICY_FIRST_PARTY_ONLY = 1;
    uint8 constant POLICY_SECOND_PARTY_ONLY = 2;

    function setUp() public {
        registry = new MockComputeRegistry();
        escrow = new MockEscrowVault();
        dispatcher = new MockBridgeDispatcher();
        coordinator = new ChimeraCoordinator(address(escrow), address(registry));
        coordinator.setBridgeDispatcher(address(dispatcher));
        coordinator.setBridgeData(TASK_TYPE, address(0x4444), 1, hex"1234");
        coordinator.setRefundBridgeData(TASK_TYPE, address(0x5555), 2, hex"5678");
        coordinator.setRefundTimeout(300); // 5 minutes for tests
        registry.addProvider(provider, 1, uint16(TASK_TYPE));
        registry.addProvider(fallbackProvider, 1, uint16(TASK_TYPE));
        vm.deal(consumer, 100 ether);
        vm.deal(address(coordinator), 100 ether);
    }

    function testHybridHoldsFundsInCoordinator() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        assertEq(coordinator.jobAmount(jobAddress), 1 ether);
        assertEq(coordinator.jobPolicy(jobAddress), POLICY_HYBRID);
        assertEq(address(escrow).balance, 0);
    }

    function testPayVolunteer() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        address selected = coordinator.jobProvider(jobAddress);
        uint256 balanceBefore = selected.balance;
        vm.prank(selected);
        coordinator.payVolunteer(jobAddress, bytes32(0));
        assertTrue(coordinator.paid(jobAddress));
        assertEq(selected.balance - balanceBefore, 1 ether);
        assertEq(coordinator.jobAmount(jobAddress), 0);
    }

    function testTriggerFallbackBridgesHeldAmount() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        vm.warp(block.timestamp + 120);
        coordinator.triggerFallback(jobAddress);
        assertTrue(coordinator.bridged(jobAddress));
        assertEq(dispatcher.lastAmount(), 1 ether);
        assertEq(coordinator.jobAmount(jobAddress), 0);
    }

    function testTriggerFallbackForExpiredJobs() public {
        vm.startPrank(consumer);
        (address jobA, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        (address jobB, ) = coordinator.createJob{value: 2 ether}(
            bytes32(uint256(1)),
            2,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 120);
        coordinator.triggerFallbackForExpiredJobs();
        assertTrue(coordinator.bridged(jobA));
        assertTrue(coordinator.bridged(jobB));
        assertEq(dispatcher.lastAmount(), 2 ether);
    }

    function testRefundSecondPartyJob() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_SECOND_PARTY_ONLY,
            0
        );
        assertTrue(coordinator.bridged(jobAddress));
        assertEq(dispatcher.lastAmount(), 1 ether);
        vm.warp(block.timestamp + 400); // past refundTimeout
        coordinator.refundFallback(jobAddress);
        assertTrue(coordinator.refunded(jobAddress));
        assertEq(dispatcher.lastAmount(), 1 ether);
    }

    function testRefundHybridAfterFallback() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        vm.warp(block.timestamp + 120);
        coordinator.triggerFallback(jobAddress);
        assertTrue(coordinator.bridged(jobAddress));
        vm.warp(block.timestamp + 400); // past refundTimeout
        coordinator.refundFallback(jobAddress);
        assertTrue(coordinator.refunded(jobAddress));
        assertEq(dispatcher.lastAmount(), 1 ether);
    }

    function testMarkFallbackCompletePreventsRefund() public {
        vm.prank(consumer);
        (address jobAddress, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_SECOND_PARTY_ONLY,
            0
        );
        vm.warp(block.timestamp + 400);
        coordinator.markFallbackComplete(jobAddress, bytes32(0));
        vm.expectRevert("ChimeraCoordinator: job already completed by tasking network");
        coordinator.refundFallback(jobAddress);
    }

    function testProcessExpiredJobsBatch() public {
        vm.startPrank(consumer);
        (address hybridJob, ) = coordinator.createJob{value: 1 ether}(
            bytes32(0),
            1,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_HYBRID,
            0
        );
        (address secondPartyJob, ) = coordinator.createJob{value: 2 ether}(
            bytes32(uint256(1)),
            2,
            TASK_TYPE,
            0,
            "",
            address(0),
            bytes16(0),
            POLICY_SECOND_PARTY_ONLY,
            0
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 120);
        coordinator.processExpiredJobs();
        assertTrue(coordinator.bridged(hybridJob));
        assertTrue(coordinator.bridged(secondPartyJob));
        // hybridJob is bridged last in this batch, so it is the last recorded dispatch.
        assertEq(dispatcher.lastAmount(), 1 ether);
        vm.warp(block.timestamp + 400);
        coordinator.processExpiredJobs();
        assertTrue(coordinator.refunded(hybridJob));
        assertTrue(coordinator.refunded(secondPartyJob));
        // secondPartyJob is the second item in jobList, so its refund is the last recorded dispatch.
        assertEq(dispatcher.lastAmount(), 2 ether);
    }
}
