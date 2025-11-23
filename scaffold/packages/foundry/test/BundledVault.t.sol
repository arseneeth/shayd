// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import { BundledVault } from "../contracts/core/BundledVault.sol";
import { PoolManager } from "../contracts/core/PoolManager.sol";
import { PoolConfiguration } from "../contracts/core/PoolConfiguration.sol";
import { ReservePool } from "../contracts/core/ReservePool.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { MockPriceOracle } from "../contracts/mocks/MockPriceOracle.sol";
import { MockAaveV3Pool } from "../contracts/mocks/MockAaveV3Pool.sol";
import { MockWETH } from "../contracts/mocks/MockWETH.sol";
import { IPoolManager } from "../contracts/interfaces/IPoolManager.sol";
import { IPool } from "../contracts/interfaces/IPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BundledVaultTest
 * @notice Comprehensive tests for BundledVault position creation using forked f(x) protocol
 */
contract BundledVaultTest is Test {
    BundledVault public vault;
    PoolManager public poolManager;
    PoolConfiguration public poolConfig;
    ReservePool public reservePool;
    
    MockERC20 public fxUSD;
    MockWETH public weth;
    MockPriceOracle public priceOracle;
    
    address public pool; // Will be set to a mock pool or real pool address
    address public operator;
    address public resolver;
    
    uint256 constant BUNDLE_SIZE = 10;
    uint256 constant INITIAL_BALANCE = 100 ether;
    
    // Test users
    address[10] public users;
    
    function setUp() public {
        // Setup test accounts
        operator = address(0x1234);
        resolver = address(0x5678);
        
        for (uint256 i = 0; i < 10; i++) {
            users[i] = address(uint160(0x1000 + i));
            vm.deal(users[i], INITIAL_BALANCE);
        }
        
        // Deploy mock tokens
        fxUSD = new MockERC20("fxUSD", "fxUSD", 18);
        weth = new MockWETH();
        
        // Deploy price oracle (1 ETH = 1 fxUSD, with reasonable bounds)
        priceOracle = new MockPriceOracle(1e18, 1e18, 1e18);
        
        // Deploy MockAaveV3Pool for PoolConfiguration initialization
        MockAaveV3Pool aavePool = new MockAaveV3Pool(5e25); // 5% borrow rate
        aavePool.setReserveNormalizedVariableDebt(1e27); // 1.0 normalized debt
        
        // Deploy mock USDC for aaveBaseAsset
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        
        // Deploy PoolConfiguration
        poolConfig = new PoolConfiguration(
            address(0), // fxUSDBasePool (can be zero for testing)
            address(aavePool), // aaveLendingPool
            address(usdc), // aaveBaseAsset
            address(0), // poolManager (will be set later)
            address(0)  // shortPoolManager (can be zero)
        );
        
        // Initialize PoolConfiguration with this test contract as admin
        poolConfig.initialize(address(this), address(priceOracle));
        
        // Deploy PoolManager
        poolManager = new PoolManager(
            address(fxUSD),
            address(0), // fxBASE (can be zero for testing)
            address(0), // counterparty (can be zero for testing)
            address(poolConfig),
            address(0)  // whitelist (can be zero for testing)
        );
        
        // Deploy ReservePool
        reservePool = new ReservePool(address(this), address(poolManager));
        
        // Initialize PoolManager
        poolManager.initialize(
            address(this), // admin
            1e7,           // expenseRatio: 1%
            5e7,           // harvesterRatio: 5%
            1e6,           // flashLoanFeeRatio: 0.1%
            address(this), // treasury
            address(reservePool), // revenuePool
            address(reservePool)  // reservePool
        );
        
        // For testing, we'll use a mock pool that implements IPool
        // In a real scenario, you would deploy an actual LongPool
        // For now, we'll create a simple mock pool address
        pool = address(new MockPool(address(poolManager), address(weth), address(fxUSD)));
        
        // Register pool with PoolManager (with capacity limits)
        poolManager.registerPool(pool, type(uint96).max, type(uint96).max);
        
        // Set up rate provider for WETH (1:1 scaling for 18 decimals)
        poolManager.updateRateProvider(address(weth), address(0));
        
        // Set default fee ratios for the pool to avoid division by zero
        // supplyRatio: 0 (no supply fee), supplyRatioStep: 1e18 (to avoid division by zero)
        // withdrawFeeRatio: 0, borrowFeeRatio: 0, repayFeeRatio: 0
        poolConfig.updatePoolFeeRatio(
            pool,
            address(0), // default for all recipients
            0,          // supplyRatio: 0%
            1e18,       // supplyRatioStep: 1e18 (must be > 0 to avoid division by zero)
            0,          // withdrawFeeRatio: 0%
            0,          // borrowFeeRatio: 0%
            0           // repayFeeRatio: 0%
        );
        
        // Deploy BundledVault (no morpho parameter needed - removed flash loans)
        vault = new BundledVault(
            address(poolManager),
            pool,
            address(weth), // collateralToken
            resolver,
            address(weth), // weth address
            operator
        );
        
        // Grant UNLOCK_ROLE to vault so it can unlock between operations
        // In production, this would be handled by the resolver/operator
        // We need to grant this role so the vault can unlock between multiple operate() calls
        poolConfig.grantRole(poolConfig.UNLOCK_ROLE(), address(vault));
        
        // Mint fxUSD to poolManager for borrowing
        fxUSD.mint(address(poolManager), 1000000 ether);
        
        // Mint WETH to users
        for (uint256 i = 0; i < 10; i++) {
            weth.mint(users[i], INITIAL_BALANCE);
        }
    }
    
    function testDeposit() public {
        uint256 depositAmount = 1 ether;
        
        // User deposits ETH (which gets wrapped to WETH)
        vm.prank(users[0]);
        vault.deposit{value: depositAmount}();
        
        // Check deposit was recorded
        (address user, uint256 amount, bool processed) = vault.getPendingDeposit(0);
        assertEq(user, users[0]);
        assertEq(amount, depositAmount);
        assertEq(processed, false);
        assertEq(vault.totalVaultBalance(), depositAmount);
    }
    
    function testBundleReady() public {
        // Make 10 deposits
        uint256 depositAmount = 1 ether;
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        // Check bundle is ready
        assertTrue(vault.isBundleReady());
        assertEq(vault.totalVaultBalance(), depositAmount * BUNDLE_SIZE);
    }
    
    function testCreatePositionsFromBundle() public {
        uint256 depositAmount = 1 ether;
        uint256 collateralPerPosition = 0.8 ether; // 80% of deposit as collateral
        uint256 debtPerPosition = 0.4 ether; // 50% LTV
        
        // Make 10 deposits
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        // Prepare deposit indices and parameters
        uint256[] memory depositIndices = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices[i] = i;
            collaterals[i] = collateralPerPosition;
            debts[i] = debtPerPosition;
        }
        
        // Operator creates positions - this creates ONE big position from the sum of 10 smaller positions
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices, collaterals, debts);
        
        // Verify virtual positions were created for each user
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            uint256[] memory userPositions = vault.getUserPositions(users[i]);
            assertEq(userPositions.length, 1, "User should have one virtual position");
            
            uint256 virtualPositionId = userPositions[0];
            assertEq(vault.positionOwners(virtualPositionId), users[i], "Position owner should match");
            
            // Get the actual big position ID from the virtual position
            uint256 bigPositionId = vault.virtualToBigPosition(virtualPositionId);
            assertGt(bigPositionId, 0, "Big position ID should exist");
        }
        
        // Verify ONE big position was created on the fx protocol with total collateral and debt
        // All virtual positions map to the same big position
        uint256[] memory firstUserPositions = vault.getUserPositions(users[0]);
        uint256 bigPositionId = vault.virtualToBigPosition(firstUserPositions[0]);
        
        // Verify the big position has the total collateral and debt (sum of all 10 positions)
        (uint256 rawColls, uint256 rawDebts) = IPool(pool).getPosition(bigPositionId);
        assertGt(rawColls, 0, "Big position should have collateral");
        assertGt(rawDebts, 0, "Big position should have debt");
        
        // Verify leverage is calculated correctly: totalDebt / totalCollateral
        // Expected: (debtPerPosition * 10) / (collateralPerPosition * 10) = debtPerPosition / collateralPerPosition
        // Actual: rawDebts / rawColls (after scaling)
        uint256 expectedLeverage = (debtPerPosition * 1e18) / collateralPerPosition;
        uint256 actualLeverage = (rawDebts * 1e18) / rawColls;
        // Allow for some rounding differences due to scaling factors
        assertApproxEqAbs(actualLeverage, expectedLeverage, 1e15, "Leverage should match sum of individual positions");
        
        // Verify vault balance decreased
        assertEq(vault.totalVaultBalance(), depositAmount * BUNDLE_SIZE - collateralPerPosition * BUNDLE_SIZE);
    }
    
    function testPositionCreationOnFxProtocol() public {
        uint256 depositAmount = 1 ether;
        uint256 collateralPerPosition = 0.8 ether;
        uint256 debtPerPosition = 0.4 ether;
        
        // Make 10 deposits
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        // Prepare parameters
        uint256[] memory depositIndices = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices[i] = i;
            collaterals[i] = collateralPerPosition;
            debts[i] = debtPerPosition;
        }
        
        // Get initial position count from pool
        uint32 initialNextPositionId = IPool(pool).getNextPositionId();
        
        // Calculate expected totals
        uint256 expectedTotalCollateral = collateralPerPosition * BUNDLE_SIZE;
        uint256 expectedTotalDebt = debtPerPosition * BUNDLE_SIZE;
        
        // Operator creates positions - this creates ONE big position from the sum of 10 smaller positions
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices, collaterals, debts);
        
        // Verify ONE new position was created in forked f(x) protocol (not 10 separate positions)
        uint32 finalNextPositionId = IPool(pool).getNextPositionId();
        
        // Should have created only 1 big position (not BUNDLE_SIZE separate positions)
        assertEq(uint256(finalNextPositionId), uint256(initialNextPositionId) + 1, "Should create only one big position");
        
        // Verify the big position exists and has total collateral/debt (sum of all 10 smaller positions)
        uint256 bigPositionId = initialNextPositionId;
        (uint256 rawColls, uint256 rawDebts) = IPool(pool).getPosition(bigPositionId);
        assertGt(rawColls, 0, "Big position should have collateral");
        assertGt(rawDebts, 0, "Big position should have debt");
        
        // Verify all virtual positions map to the same big position
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            uint256[] memory userPositions = vault.getUserPositions(users[i]);
            uint256 virtualPositionId = userPositions[0];
            uint256 mappedBigPositionId = vault.virtualToBigPosition(virtualPositionId);
            assertEq(mappedBigPositionId, bigPositionId, "All virtual positions should map to same big position");
            
            // Verify position owner mapping
            assertEq(vault.positionOwners(virtualPositionId), users[i], "Position owner should match");
        }
    }
    
    function testMultipleBundles() public {
        uint256 depositAmount = 1 ether;
        uint256 collateralPerPosition = 0.8 ether;
        uint256 debtPerPosition = 0.4 ether;
        
        // Create first bundle
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        uint256[] memory depositIndices1 = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals1 = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts1 = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices1[i] = i;
            collaterals1[i] = collateralPerPosition;
            debts1[i] = debtPerPosition;
        }
        
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices1, collaterals1, debts1);
        
        // Create second bundle
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        uint256[] memory depositIndices2 = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals2 = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts2 = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices2[i] = BUNDLE_SIZE + i;
            collaterals2[i] = collateralPerPosition;
            debts2[i] = debtPerPosition;
        }
        
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices2, collaterals2, debts2);
        
        // Verify both bundles created positions
        uint256 totalPositions = 0;
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            totalPositions += vault.getUserPositions(users[i]).length;
        }
        assertEq(totalPositions, BUNDLE_SIZE * 2);
    }
    
    function testClosePosition() public {
        uint256 depositAmount = 1 ether;
        uint256 collateralPerPosition = 0.8 ether;
        uint256 debtPerPosition = 0.4 ether;
        
        // Create a bundle and positions
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[0]);
            vault.deposit{value: depositAmount}();
        }
        
        uint256[] memory depositIndices = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices[i] = i;
            collaterals[i] = collateralPerPosition;
            debts[i] = debtPerPosition;
        }
        
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices, collaterals, debts);
        
        // Get virtual position ID
        uint256[] memory userPositions = vault.getUserPositions(users[0]);
        uint256 virtualPositionId = userPositions[0];
        
        // Get the actual big position ID
        uint256 bigPositionId = vault.virtualToBigPosition(virtualPositionId);
        
        // Get position details from the big position on pool
        (uint256 rawColls, uint256 rawDebts) = IPool(pool).getPosition(bigPositionId);
        
        // For closing, we need the user's share of the big position
        // In this test, user[0] deposited all 10 positions, so they own the entire big position
        // But in reality, each user would have their own share
        // For simplicity, we'll use the full position amounts
        
        // User needs to approve PoolManager for fxUSD debt repayment
        // PoolManager will transfer fxUSD from user when closing position
        vm.prank(users[0]);
        fxUSD.approve(address(poolManager), rawDebts);
        
        // User closes position using virtual position ID
        // teeCollateralTakeover is 0 since position is not near liquidation in this test
        bytes32 positionHash = keccak256(abi.encodePacked(virtualPositionId, users[0], rawColls, rawDebts));
        uint256 teeCollateralTakeover = 0; // No TEE takeover needed for healthy position
        
        uint256 userBalanceBefore = users[0].balance;
        
        vm.prank(users[0]);
        vault.closePosition(virtualPositionId, rawColls, rawDebts, positionHash, teeCollateralTakeover);
        
        // Verify user received ETH back
        assertGt(users[0].balance, userBalanceBefore);
    }
    
    function testOnlyOperatorCanCreatePositions() public {
        uint256 depositAmount = 1 ether;
        
        // Make 10 deposits
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[i]);
            vault.deposit{value: depositAmount}();
        }
        
        uint256[] memory depositIndices = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices[i] = i;
            collaterals[i] = 0.8 ether;
            debts[i] = 0.4 ether;
        }
        
        // Non-operator cannot create positions
        vm.prank(users[0]);
        vm.expectRevert();
        vault.createPositionsFromBundle(depositIndices, collaterals, debts);
    }
    
    function testClosePositionWithTEETakeover() public {
        uint256 depositAmount = 1 ether;
        uint256 collateralPerPosition = 0.8 ether;
        uint256 debtPerPosition = 0.4 ether;
        
        // Create a bundle and positions (user[0] deposits 10 times to create bundle)
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            vm.prank(users[0]);
            vault.deposit{value: depositAmount}();
        }
        
        uint256[] memory depositIndices = new uint256[](BUNDLE_SIZE);
        uint256[] memory collaterals = new uint256[](BUNDLE_SIZE);
        uint256[] memory debts = new uint256[](BUNDLE_SIZE);
        
        for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
            depositIndices[i] = i;
            collaterals[i] = collateralPerPosition;
            debts[i] = debtPerPosition;
        }
        
        vm.prank(operator);
        vault.createPositionsFromBundle(depositIndices, collaterals, debts);
        
        // Get first position ID for user[0] (they have 10 positions from the bundle)
        uint256[] memory userPositions = vault.getUserPositions(users[0]);
        assertGt(userPositions.length, 0, "User should have at least one position");
        uint256 positionId = userPositions[0];
        
        // Get position details from pool
        (uint256 rawColls, uint256 rawDebts) = IPool(pool).getPosition(positionId);
        
        // User needs to approve PoolManager for fxUSD debt repayment (for both TEE takeover and user withdrawal)
        // TEE takeover reduces debt proportionally, so we need to approve for full debt
        vm.prank(users[0]);
        fxUSD.approve(address(poolManager), rawDebts);
        
        // Simulate TEE taking 20% of collateral (position near liquidation)
        uint256 teeCollateralTakeover = rawColls * 20 / 100; // 20% of collateral
        
        bytes32 positionHash = keccak256(abi.encodePacked(positionId, users[0], rawColls, rawDebts));
        
        uint256 userBalanceBefore = users[0].balance;
        uint256 positionsBefore = userPositions.length;
        
        // Fund resolver with ETH to receive WETH (for testing)
        vm.deal(resolver, 1 ether);
        
        vm.prank(users[0]);
        vault.closePosition(positionId, rawColls, rawDebts, positionHash, teeCollateralTakeover);
        
        // Verify user received ETH back (less the TEE takeover amount)
        assertGt(users[0].balance, userBalanceBefore);
        
        // Verify position was closed (removed from user's positions)
        uint256[] memory remainingPositions = vault.getUserPositions(users[0]);
        assertEq(remainingPositions.length, positionsBefore - 1, "One position should be removed after closing");
        
        // Verify the closed position is not in the list anymore
        bool found = false;
        for (uint256 i = 0; i < remainingPositions.length; i++) {
            if (remainingPositions[i] == positionId) {
                found = true;
                break;
            }
        }
        assertFalse(found, "Closed position should not be in user's position list");
    }
}

/**
 * @title MockPool
 * @notice Simple mock pool for testing
 */
contract MockPool is IPool {
    address public immutable poolManagerAddr;
    address public immutable collateralTokenAddr;
    address public immutable fxUSDAddr;
    
    uint32 private nextPositionId = 1;
    mapping(uint256 => PositionData) public positions;
    
    struct PositionData {
        uint256 rawColls;
        uint256 rawDebts;
    }
    
    constructor(address _poolManager, address _collateralToken, address _fxUSD) {
        poolManagerAddr = _poolManager;
        collateralTokenAddr = _collateralToken;
        fxUSDAddr = _fxUSD;
    }
    
    function operate(
        uint256 positionId,
        int256 newRawColl,
        int256 newRawDebt,
        address owner
    ) external onlyPoolManager returns (uint256, int256, int256, uint256) {
        if (positionId == 0) {
            positionId = nextPositionId++;
        }
        
        PositionData storage pos = positions[positionId];
        
        if (newRawColl > 0) {
            // PoolManager will transfer tokens to this pool
            // We need to receive them (they're transferred from PoolManager)
            // For testing, we'll just record the position
            pos.rawColls += uint256(newRawColl);
        } else if (newRawColl < 0) {
            // Transfer collateral back to poolManager
            // Ensure we have enough balance (mint if needed for testing)
            uint256 amount = uint256(-newRawColl);
            uint256 balance = IERC20(collateralTokenAddr).balanceOf(address(this));
            if (balance < amount) {
                // For testing, mint the difference
                MockERC20(collateralTokenAddr).mint(address(this), amount - balance);
            }
            IERC20(collateralTokenAddr).transfer(poolManagerAddr, amount);
            pos.rawColls -= amount;
        }
        
        if (newRawDebt > 0) {
            // Mint fxUSD to owner (simulating borrow)
            MockERC20(fxUSDAddr).mint(owner, uint256(newRawDebt));
            pos.rawDebts += uint256(newRawDebt);
        } else if (newRawDebt < 0) {
            // Repay debt - PoolManager already transferred fxUSD from user to PoolManager
            // PoolManager will burn it, we just need to record the repayment
            // For testing, we don't need to actually transfer - PoolManager handles it
            pos.rawDebts -= uint256(-newRawDebt);
        }
        
        return (positionId, newRawColl, newRawDebt, 0);
    }
    
    function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts) {
        PositionData memory pos = positions[tokenId];
        return (pos.rawColls, pos.rawDebts);
    }
    
    function getNextPositionId() external view returns (uint32) {
        return nextPositionId;
    }
    
    modifier onlyPoolManager() {
        require(msg.sender == poolManagerAddr, "Only PoolManager");
        _;
    }
    
    // Stub implementations for IPool interface
    function counterparty() external pure returns (address) { return address(0); }
    function fxUSD() external view returns (address) { return fxUSDAddr; }
    function poolManager() external view returns (address) { return poolManagerAddr; }
    function configuration() external pure returns (address) { return address(0); }
    function collateralToken() external view returns (address) { return collateralTokenAddr; }
    function priceOracle() external pure returns (address) { return address(0); }
    function isBorrowPaused() external pure returns (bool) { return false; }
    function isRedeemPaused() external pure returns (bool) { return false; }
    function getTopTick() external pure returns (int16) { return 0; }
    function getNextTreeNodeId() external pure returns (uint48) { return 0; }
    function getDebtRatioRange() external pure returns (uint256, uint256) { return (0, type(uint256).max); }
    function getMaxRedeemRatioPerTick() external pure returns (uint256) { return 0; }
    function getRebalanceRatios() external pure returns (uint256, uint256) { return (0, 0); }
    function getLiquidateRatios() external pure returns (uint256, uint256) { return (0, 0); }
    function getDebtAndCollateralIndex() external pure returns (uint256, uint256) { return (1e18, 1e18); }
    function getDebtAndCollateralShares() external pure returns (uint256, uint256) { return (0, 0); }
    function getPositionDebtRatio(uint256) external pure returns (uint256) { return 0; }
    function getTotalRawCollaterals() external pure returns (uint256) { return 0; }
    function getTotalRawDebts() external pure returns (uint256) { return 0; }
    function redeem(uint256) external pure returns (uint256, uint256) { revert("Not implemented"); }
    function redeem(uint256, bool) external pure returns (uint256, uint256) { revert("Not implemented"); }
    function rebalance(int16, uint256) external pure returns (RebalanceResult memory) { revert("Not implemented"); }
    function rebalance(uint256) external pure returns (RebalanceResult memory) { revert("Not implemented"); }
    function liquidate(uint256, uint256) external pure returns (LiquidateResult memory) { revert("Not implemented"); }
    function reduceDebt(uint256) external pure { revert("Not implemented"); }
}

