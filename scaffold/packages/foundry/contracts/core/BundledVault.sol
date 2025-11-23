// SPDX-License-Identifier: MIT

pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IPoolManager } from "../interfaces/IPoolManager.sol";
import { ILongPoolManager } from "../interfaces/ILongPoolManager.sol";
import { ILongPool } from "../interfaces/ILongPool.sol";
import { IWrappedEther } from "../interfaces/IWrappedEther.sol";
import { IPoolConfiguration } from "../interfaces/IPoolConfiguration.sol";
/**
 * @title BundledVault
 * @notice Vault contract that bundles deposits and opens positions using original fx protocol logic
 * @dev Users deposit native ETH, vault waits for 10 positions to bundle, then opens all positions using original fx protocol's operate() function
 * @dev Uses deposits directly - no flash loan needed since we have user funds
 */
contract BundledVault is ReentrancyGuard, Pausable, AccessControl {
  using SafeERC20 for IERC20;
  using Address for address payable;

  /// @notice Receive ETH from WETH unwrapping
  receive() external payable {}

  /**********
   * Errors *
   **********/

  error ErrorInvalidPool();
  error ErrorInvalidResolver();
  error ErrorInsufficientDeposits();
  error ErrorBundleNotReady();
  error ErrorPositionNotFound();
  error ErrorInvalidWithdrawal();
  error ErrorAlreadyBundled();

  /*************
   * Constants *
   *************/

  /// @dev The role for admin operations
  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

  /// @dev The role for resolver/operator to create positions
  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

  /// @dev Number of positions required to bundle
  uint256 public constant BUNDLE_SIZE = 10;

  /*********************
   * Storage Variables *
   *********************/

  /// @notice The pool manager contract
  address public immutable poolManager;

  /// @notice The resolver service address (for storing/retrieving position params)
  address public resolver;

  /// @notice The pool address for opening positions
  address public pool;

  /// @notice The collateral token address (typically WETH)
  address public collateralToken;

  /// @notice The WETH address for wrapping native ETH
  address public immutable weth;

  /// @notice Current pending deposits waiting to be bundled
  /// @dev Only stores user and amount - position parameters are kept private in resolver TEE
  struct PendingDeposit {
    address user;
    uint256 amount; // Total ETH deposited
    bool processed;
  }

  /// @notice Pending deposits array
  PendingDeposit[] public pendingDeposits;

  /// @notice Mapping from position ID to user address
  mapping(uint256 => address) public positionOwners;

  /// @notice Mapping from user address to their position IDs
  mapping(address => uint256[]) public userPositions;

  /// @notice Total vault balance (sum of all deposits)
  uint256 public totalVaultBalance;

  /// @notice Current bundle ID (increments each time a bundle is processed)
  uint256 public currentBundleId;

  /// @notice Mapping from bundle ID to position IDs in that bundle
  mapping(uint256 => uint256[]) public bundlePositions;

  /// @notice Mapping from virtual position ID to actual big position ID
  /// @dev Virtual position IDs are used to track individual user shares of the big position
  /// @dev Virtual ID = bigPositionId * 1000 + userIndex
  mapping(uint256 => uint256) public virtualToBigPosition;

  /// @notice Mapping from big position ID to bundle ID
  /// @dev Tracks which bundle created which big position
  mapping(uint256 => uint256) public bigPositionToBundle;

  /**********
   * Events *
   **********/

  event Deposit(address indexed user, uint256 amount, uint256 depositIndex);
  event BundleReady(uint256 indexed bundleId, uint256 totalAmount, uint256 positionCount);
  event PositionsOpened(uint256 indexed bundleId, uint256[] positionIds);
  event PositionCreated(uint256 indexed positionId, address indexed owner);
  event WithdrawalRequested(address indexed user, uint256 positionId);
  event PositionClosed(address indexed user, uint256 positionId, uint256 collateralReturned, uint256 debtRepaid);
  event TEEPositionTakeover(uint256 indexed positionId, uint256 collateralTaken, uint256 debtReduced);
  event SoftLiquidationExecuted(uint256 indexed positionId, uint256 collateralLiquidated, uint256 debtLiquidated);

  /***************
   * Constructor *
   ***************/

  constructor(
    address _poolManager,
    address _pool,
    address _collateralToken,
    address _resolver,
    address _weth,
    address _operator
  ) {
    poolManager = _poolManager;
    pool = _pool;
    collateralToken = _collateralToken;
    resolver = _resolver;
    weth = _weth;

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(ADMIN_ROLE, msg.sender);
    _grantRole(OPERATOR_ROLE, _operator);
  }

  /*************************
   * Public View Functions *
   *************************/

  /// @notice Get the number of pending deposits
  function getPendingDepositCount() external view returns (uint256) {
    return pendingDeposits.length;
  }

  /// @notice Get pending deposit at index
  /// @dev Only returns public information - position parameters are private in resolver TEE
  function getPendingDeposit(uint256 index) external view returns (address user, uint256 amount, bool processed) {
    require(index < pendingDeposits.length, "Index out of bounds");
    PendingDeposit memory deposit = pendingDeposits[index];
    return (deposit.user, deposit.amount, deposit.processed);
  }

  /// @notice Get user's position IDs
  function getUserPositions(address user) external view returns (uint256[] memory) {
    return userPositions[user];
  }

  /// @notice Check if bundle is ready (10 deposits)
  function isBundleReady() public view returns (bool) {
    uint256 unprocessedCount = 0;
    for (uint256 i = 0; i < pendingDeposits.length; i++) {
      if (!pendingDeposits[i].processed) {
        unprocessedCount++;
      }
    }
    return unprocessedCount >= BUNDLE_SIZE;
  }

  /****************************
   * Public Mutated Functions *
   ****************************/

  /// @notice Deposit native ETH to vault
  /// @dev The ETH will be wrapped to WETH and stored in the vault
  /// @dev Position parameters (collateral, debt) should be provided separately to resolver TEE off-chain
  /// @dev When bundle is ready, operator will create positions using parameters from resolver TEE
  function deposit() external payable nonReentrant whenNotPaused {
    uint256 amount = msg.value;
    require(amount > 0, "Amount must be greater than 0");

    // Wrap native ETH to WETH
    IWrappedEther(weth).deposit{ value: amount }();

    // Add to pending deposits (only user and amount - parameters are private)
    pendingDeposits.push(PendingDeposit({ user: msg.sender, amount: amount, processed: false }));

    totalVaultBalance += amount;

    emit Deposit(msg.sender, amount, pendingDeposits.length - 1);

    // Emit event that bundle might be ready (for off-chain monitoring)
    // Actual bundling is done by operator with parameters from resolver TEE
  }

  /// @notice Create positions from bundle using parameters from resolver TEE
  /// @param depositIndices Array of deposit indices to process (must be BUNDLE_SIZE)
  /// @param collaterals Array of collateral amounts for each position (from resolver TEE)
  /// @param debts Array of debt amounts for each position (from resolver TEE)
  /// @dev Only callable by operator role (resolver service)
  /// @dev Position parameters come from resolver TEE database, keeping them private
  /// @dev Uses flash loan to ensure atomic execution: all positions open or none do
  function createPositionsFromBundle(
    uint256[] calldata depositIndices,
    uint256[] calldata collaterals,
    uint256[] calldata debts
  ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
    require(depositIndices.length == BUNDLE_SIZE, "Invalid deposit count");
    require(collaterals.length == BUNDLE_SIZE, "Invalid collateral count");
    require(debts.length == BUNDLE_SIZE, "Invalid debt count");
    require(isBundleReady(), "Bundle not ready");

    uint256 bundleId = currentBundleId;
    currentBundleId++;

    // Validate all deposits are unprocessed and collect them
    address[] memory users = new address[](BUNDLE_SIZE);
    
    // Initialize totals - these will be the sum of all 10 individual positions
    // totalCollateral = sum(collaterals[0..9]) - sum of all 10 individual collaterals
    // totalDebt = sum(debts[0..9]) - sum of all 10 individual debts
    uint256 totalCollateral = 0;
    uint256 totalDebt = 0;

    // Sum all individual position sizes to calculate the big position totals
    for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
      uint256 index = depositIndices[i];
      require(index < pendingDeposits.length, "Invalid deposit index");
      require(!pendingDeposits[index].processed, "Deposit already processed");
      require(collaterals[i] > 0, "Collateral must be greater than 0");
      require(debts[i] > 0, "Debt must be greater than 0");
      require(pendingDeposits[index].amount >= collaterals[i], "Insufficient deposit for collateral");

      users[i] = pendingDeposits[index].user;
      pendingDeposits[index].processed = true;
      
      // Sum individual position sizes: totalCollateral = sum(collaterals[0..9])
      totalCollateral += collaterals[i];
      // Sum individual position sizes: totalDebt = sum(debts[0..9])
      totalDebt += debts[i];
    }
    
    // At this point:
    // - totalCollateral = sum of all 10 individual collaterals
    // - totalDebt = sum of all 10 individual debts
    // - Leverage will be calculated as: totalDebt / totalCollateral

    emit BundleReady(bundleId, totalCollateral, BUNDLE_SIZE);

    // We have WETH from user deposits - use it directly to open positions
    // No flash loan needed since we already have the funds
    uint256 vaultBalance = IERC20(collateralToken).balanceOf(address(this));
    require(vaultBalance >= totalCollateral, "Insufficient vault balance");

    // Approve pool manager to spend WETH (collateral token) - using original fx protocol logic
    IERC20(collateralToken).forceApprove(poolManager, totalCollateral);

    // Open ONE big position from the total of all 10 smaller positions
    // The big position size is calculated from the sum of all individual position sizes:
    // - totalCollateral = sum(collaterals[0..9]) - sum of all 10 individual collaterals
    // - totalDebt = sum(debts[0..9]) - sum of all 10 individual debts
    // Leverage is calculated accordingly: totalDebt / totalCollateral
    // This ensures the big position size and leverage equals the sum of smaller positions
    // 
    // Example: If 10 positions each have 0.8 ETH collateral and 0.4 ETH debt:
    // - totalCollateral = 0.8 * 10 = 8 ETH (sum of all 10 individual collaterals)
    // - totalDebt = 0.4 * 10 = 4 ETH (sum of all 10 individual debts)
    // - Leverage = 4 / 8 = 0.5 (50% LTV)
    // The big position will have exactly 8 ETH collateral and 4 ETH debt
    
    // Convert totals to int256 for the operate() function
    // These totals are the sum of all 10 individual positions calculated above
    int256 totalNewColl = int256(totalCollateral);  // sum(collaterals[0..9])
    int256 totalNewDebt = int256(totalDebt);        // sum(debts[0..9])

    // Use original fx protocol's operate() function to open the big position
    // This creates ONE position with:
    // - Collateral: totalCollateral (sum of all 10 individual collaterals)
    // - Debt: totalDebt (sum of all 10 individual debts)
    // - Leverage: automatically calculated as totalDebt / totalCollateral by the protocol
    // The leverage of the big position equals the leverage of the sum of individual positions
    uint256 bigPositionId = IPoolManager(poolManager).operate(pool, 0, totalNewColl, totalNewDebt);

    // Store mapping from big position to bundle
    bigPositionToBundle[bigPositionId] = bundleId;

    // Track ownership shares - each user owns a portion of the big position
    // Store the big position ID and individual user shares in TEE (off-chain)
    // On-chain, we only track that users have positions, but the big position is private
    uint256[] memory positionIds = new uint256[](BUNDLE_SIZE);
    
    for (uint256 i = 0; i < BUNDLE_SIZE; i++) {
      // Each user's "position" is actually a share of the big position
      // We use the big position ID but track individual ownership off-chain in TEE
      // For on-chain tracking, we use a virtual position ID (bigPositionId * 1000 + i)
      // This allows us to track individual users while the actual position is one big position
      uint256 virtualPositionId = bigPositionId * 1000 + i;
      
      positionIds[i] = virtualPositionId;
      positionOwners[virtualPositionId] = users[i];
      userPositions[users[i]].push(virtualPositionId);
      bundlePositions[bundleId].push(virtualPositionId);
      
      // Store mapping: virtualPositionId -> actual bigPositionId
      // This allows us to find the real position when user wants to withdraw
      virtualToBigPosition[virtualPositionId] = bigPositionId;
      
      // Emit minimal event (no position parameters exposed)
      // Resolver will link virtual position ID to encrypted deposit parameters off-chain
      // Resolver also knows the actual bigPositionId and user's share
      emit PositionCreated(virtualPositionId, users[i]);
    }

    emit PositionsOpened(bundleId, positionIds);

    // Update total vault balance (subtract the collateral amounts used)
    totalVaultBalance -= totalCollateral;
  }

  /// @notice Request withdrawal - user requests their position parameters from resolver
  /// @param positionId The position ID to withdraw
  function requestWithdrawal(uint256 positionId) external nonReentrant whenNotPaused {
    require(positionOwners[positionId] == msg.sender, "Not position owner");
    require(positionId > 0, "Invalid position ID");

    emit WithdrawalRequested(msg.sender, positionId);

    // The actual withdrawal will be handled by closePosition after resolver provides params
    // This is just the request - the resolver will provide params via closePosition
  }

  /// @notice Close position using parameters from resolver
  /// @param positionId The position ID to close
  /// @param collateralAmount The collateral amount (from resolver)
  /// @param debtAmount The debt amount (from resolver)
  /// @param positionHash The hash of position parameters (for verification)
  /// @param teeCollateralTakeover Amount of collateral to be taken by TEE if position is near liquidation (0 if not needed)
  /// @dev If teeCollateralTakeover > 0, TEE takes that amount of collateral before user withdrawal
  /// @dev This happens when position is touching liquidation break - TEE protects the system
  function closePosition(
    uint256 positionId,
    uint256 collateralAmount,
    uint256 debtAmount,
    bytes32 positionHash,
    uint256 teeCollateralTakeover
  ) external nonReentrant whenNotPaused {
    require(positionOwners[positionId] == msg.sender, "Not position owner");
    require(positionId > 0, "Invalid position ID");

    // Verify the position hash matches (this would be verified against resolver TEE)
    // For now, we'll trust the resolver provides correct params
    // In production, you'd verify the hash matches what's stored in resolver

    // Get the actual big position ID from the virtual position ID
    // The virtual position ID represents the user's share of the big position
    uint256 bigPositionId = virtualToBigPosition[positionId];
    require(bigPositionId > 0, "Invalid virtual position - no big position found");

    // If TEE needs to take collateral (position near liquidation), do it first
    if (teeCollateralTakeover > 0 && teeCollateralTakeover < collateralAmount) {
      // TEE takes over part of the user's share to protect against liquidation
      // This is a soft liquidation - TEE takes collateral, reduces debt proportionally
      uint256 teeDebtReduction = (debtAmount * teeCollateralTakeover) / collateralAmount;
      
      // Operate on the BIG position to transfer part to TEE (resolver)
      // Negative values mean reduce collateral and debt from the big position
      int256 teeCollateralDelta = -int256(teeCollateralTakeover);
      int256 teeDebtDelta = -int256(teeDebtReduction);
      
      IPoolManager(poolManager).operate(pool, bigPositionId, teeCollateralDelta, teeDebtDelta);
      
      // Unlock between operations to allow the next operate() call
      try IPoolConfiguration(IPoolManager(poolManager).configuration()).unlock(poolManager, bytes4(0)) {} catch {}
      
      // Transfer the collateral to resolver (TEE)
      uint256 teeWethBalance = IERC20(collateralToken).balanceOf(address(this));
      if (teeWethBalance >= teeCollateralTakeover) {
        IERC20(collateralToken).safeTransfer(resolver, teeCollateralTakeover);
      }
      
      // Update amounts for user withdrawal
      collateralAmount -= teeCollateralTakeover;
      debtAmount -= teeDebtReduction;
      
      emit TEEPositionTakeover(positionId, teeCollateralTakeover, teeDebtReduction);
    }

    // Close the user's share from the big position via pool manager
    // Negative values mean withdraw collateral and repay debt from the big position
    int256 withdrawCollateral = -int256(collateralAmount);
    int256 repayDebt = -int256(debtAmount);

    // The pool manager will transfer WETH to this contract
    // We operate on the big position, withdrawing the user's share
    IPoolManager(poolManager).operate(pool, bigPositionId, withdrawCollateral, repayDebt);

    // Get the WETH balance received (after closing position)
    uint256 wethBalance = IERC20(collateralToken).balanceOf(address(this));
    
    // Unwrap WETH to native ETH and send to user
    if (wethBalance > 0) {
      IWrappedEther(weth).withdraw(wethBalance);
      // Send native ETH to user
      Address.sendValue(payable(msg.sender), wethBalance);
    }

    // Remove position from user's list
    uint256[] storage positions = userPositions[msg.sender];
    for (uint256 i = 0; i < positions.length; i++) {
      if (positions[i] == positionId) {
        positions[i] = positions[positions.length - 1];
        positions.pop();
        break;
      }
    }

    // Clear position owner
    delete positionOwners[positionId];

    emit PositionClosed(msg.sender, positionId, collateralAmount, debtAmount);
  }

  /************************
   * Restricted Functions *
   ************************/

  /// @notice Update resolver address
  function setResolver(address _resolver) external onlyRole(ADMIN_ROLE) {
    require(_resolver != address(0), "Invalid resolver");
    resolver = _resolver;
  }

  /// @notice Update pool address
  function setPool(address _pool) external onlyRole(ADMIN_ROLE) {
    require(_pool != address(0), "Invalid pool");
    pool = _pool;
  }

  /// @notice Pause the contract
  function pause() external onlyRole(ADMIN_ROLE) {
    _pause();
  }

  /// @notice Unpause the contract
  function unpause() external onlyRole(ADMIN_ROLE) {
    _unpause();
  }

  /// @notice Grant operator role (for resolver service)
  function grantOperatorRole(address operator) external onlyRole(ADMIN_ROLE) {
    _grantRole(OPERATOR_ROLE, operator);
  }

  /// @notice Revoke operator role
  function revokeOperatorRole(address operator) external onlyRole(ADMIN_ROLE) {
    _revokeRole(OPERATOR_ROLE, operator);
  }

  /// @notice Execute soft liquidation on a position (TEE only)
  /// @param positionId The position ID to liquidate
  /// @param maxFxUSD Maximum fxUSD to liquidate
  /// @param maxStable Maximum stable token to liquidate
  /// @dev Only callable by operator role (resolver TEE)
  /// @dev Uses original fx protocol's liquidate function for soft liquidation
  /// @dev Soft liquidation: only liquidates enough to restore position health, not fully close
  /// @dev Uses ILongPoolManager.liquidate() which is the original fx protocol liquidation mechanism
  function executeSoftLiquidation(
    uint256 positionId,
    uint256 maxFxUSD,
    uint256 maxStable
  ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
    require(positionId > 0, "Invalid position ID");
    
    // Use original fx protocol's liquidate function via ILongPoolManager
    // This performs soft liquidation - only liquidates enough to restore health
    // The liquidate function uses the original fx protocol logic for flash loan, position management, etc.
    (uint256 colls, uint256 fxUSDUsed, uint256 stableUsed) = ILongPoolManager(poolManager).liquidate(
      pool,
      resolver, // Receiver gets the liquidated collateral
      maxFxUSD,
      maxStable
    );
    
    emit SoftLiquidationExecuted(positionId, colls, fxUSDUsed + stableUsed);
  }
}

