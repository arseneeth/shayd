//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IPool } from "../interfaces/IPool.sol";
import { MockERC20 } from "./MockERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPool
 * @notice Simple mock pool for testing and local development
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
    
    struct RebalanceResult {
        uint256 collShares;
        uint256 debtShares;
        int16 tick;
    }
    
    struct LiquidateResult {
        uint256 collShares;
        uint256 debtShares;
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
            pos.rawColls += uint256(newRawColl);
        } else if (newRawColl < 0) {
            uint256 amount = uint256(-newRawColl);
            uint256 balance = IERC20(collateralTokenAddr).balanceOf(address(this));
            if (balance < amount) {
                MockERC20(collateralTokenAddr).mint(address(this), amount - balance);
            }
            IERC20(collateralTokenAddr).transfer(poolManagerAddr, amount);
            pos.rawColls -= amount;
        }
        
        if (newRawDebt > 0) {
            MockERC20(fxUSDAddr).mint(owner, uint256(newRawDebt));
            pos.rawDebts += uint256(newRawDebt);
        } else if (newRawDebt < 0) {
            pos.rawDebts -= uint256(-newRawDebt);
        }
        
        return (positionId, newRawColl, newRawDebt, 0);
    }
    
    function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts) {
        PositionData memory pos = positions[tokenId];
        return (pos.rawColls, pos.rawDebts);
    }
    
    function getPositionDebtRatio(uint256 tokenId) external view returns (uint256) {
        PositionData memory pos = positions[tokenId];
        if (pos.rawColls == 0) return 0;
        // Simple calculation: debtRatio = (debt * 1e18) / collateral
        return (pos.rawDebts * 1e18) / pos.rawColls;
    }
    
    function getNextPositionId() external view returns (uint32) {
        return nextPositionId;
    }
    
    function totalSupply() external view returns (uint256) {
        return nextPositionId - 1;
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        // For mock, return zero address (not an NFT)
        return address(0);
    }
    
    function getLiquidateRatios() external pure returns (uint256 debtRatio, uint256 bonusRatio) {
        return (1e18, 1e8); // 1.0 debt ratio, 10% bonus
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
    function getDebtAndCollateralIndex() external pure returns (uint256, uint256) { return (1e18, 1e18); }
    function getDebtAndCollateralShares() external pure returns (uint256, uint256) { return (0, 0); }
    function getTotalRawCollaterals() external pure returns (uint256) { return 0; }
    function getTotalRawDebts() external pure returns (uint256) { return 0; }
    function redeem(uint256) external pure returns (uint256, uint256) { revert("Not implemented"); }
    function redeem(uint256, bool) external pure returns (uint256, uint256) { revert("Not implemented"); }
    function rebalance(int16, uint256) external pure returns (RebalanceResult memory) { revert("Not implemented"); }
    function rebalance(uint256) external pure returns (RebalanceResult memory) { revert("Not implemented"); }
    function liquidate(uint256, uint256) external pure returns (LiquidateResult memory) { revert("Not implemented"); }
    function reduceDebt(uint256) external pure { revert("Not implemented"); }
}

