//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { PoolManager } from "../contracts/core/PoolManager.sol";
import { PoolConfiguration } from "../contracts/core/PoolConfiguration.sol";
import { ReservePool } from "../contracts/core/ReservePool.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";

/**
 * @notice Deploy PoolManager contract
 * @dev Requires PoolConfiguration to be deployed first
 * 
 * Example: forge script script/DeployPoolManager.s.sol --rpc-url localhost --broadcast
 */
contract DeployPoolManager is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying PoolManager with deployer:", deployer);

        // Load addresses from environment or deployment files
        address fxUSD = vm.envOr("FXUSD", address(0));
        address fxBASE = vm.envOr("FXBASE", address(0)); // FxUSDBasePool address
        address counterparty = vm.envOr("COUNTERPARTY", address(0)); // Can be zero for testing
        address whitelist = vm.envOr("WHITELIST", address(0)); // Can be zero for testing
        address poolConfiguration = vm.envOr("POOL_CONFIGURATION", address(0));
        address treasury = vm.envOr("TREASURY", deployer);
        address revenuePool = vm.envOr("REVENUE_POOL", address(0));
        address reservePool = vm.envOr("RESERVE_POOL", address(0));

        // For local testing, try to load from deployment files
        if (block.chainid == 31337) {
            string memory chainId = vm.toString(block.chainid);
            
            // Load fxUSD from mocks
            if (fxUSD == address(0)) {
                try vm.readFile(string.concat("./deployments/mocks-", chainId, ".json")) returns (string memory mocksJson) {
                    fxUSD = vm.parseJsonAddress(mocksJson, ".fxUSD");
                } catch {}
            }

            // Load PoolConfiguration
            if (poolConfiguration == address(0)) {
                try vm.readFile(string.concat("./deployments/pool-config-", chainId, ".json")) returns (string memory configJson) {
                    poolConfiguration = vm.parseJsonAddress(configJson, ".poolConfiguration");
                } catch {
                    revert("PoolConfiguration not found. Deploy it first.");
                }
            }
        }

        // If fxUSD still zero, deploy mock inline
        vm.startBroadcast(deployerPrivateKey);
        
        if (fxUSD == address(0)) {
            MockERC20 mockFxUSD = new MockERC20("fxUSD", "fxUSD", 18);
            fxUSD = address(mockFxUSD);
            console.log("Deployed inline Mock fxUSD at:", fxUSD);
        }

        // Deploy PoolManager first (ReservePool needs its address)
        PoolManager poolManager = new PoolManager(
            fxUSD,
            fxBASE,  // Can be zero initially, will be set later
            counterparty,  // Can be zero for testing
            poolConfiguration,
            whitelist  // Can be zero for testing
        );
        console.log("PoolManager deployed at:", address(poolManager));

        // Deploy ReservePool (needs poolManager address)
        if (reservePool == address(0)) {
            ReservePool reserve = new ReservePool(deployer, address(poolManager));
            reservePool = address(reserve);
            console.log("Deployed ReservePool at:", reservePool);
        }

        // Use ReservePool as RevenuePool if not provided
        if (revenuePool == address(0)) {
            revenuePool = reservePool;
        }

        // Initialize PoolManager
        // Fee ratios: expense 1%, harvester 5%, flash loan 0.1%
        poolManager.initialize(
            deployer,  // admin
            1e7,       // expenseRatio: 1% = 1e7 / 1e9
            5e7,       // harvesterRatio: 5% = 5e7 / 1e9
            1e6,       // flashLoanFeeRatio: 0.1% = 1e6 / 1e9
            treasury,
            revenuePool,
            reservePool
        );
        console.log("PoolManager initialized");

        // Update PoolConfiguration with PoolManager address
        PoolConfiguration config = PoolConfiguration(poolConfiguration);
        // Note: This might require a setter function or will be set via governance
        // For now, we'll just log it
        console.log("Note: Update PoolConfiguration.POOL_MANAGER to:", address(poolManager));

        vm.stopBroadcast();

        // Export address
        string memory json = "deployment";
        json = vm.serializeAddress(json, "poolManager", address(poolManager));
        json = vm.serializeAddress(json, "reservePool", reservePool);
        json = vm.serializeAddress(json, "revenuePool", revenuePool);
        string memory chainId = vm.toString(block.chainid);
        vm.writeJson(json, string.concat("./deployments/pool-manager-", chainId, ".json"));
    }
}

