//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { PoolConfiguration } from "../contracts/core/PoolConfiguration.sol";
import { MockAaveV3Pool } from "../contracts/mocks/MockAaveV3Pool.sol";
import { MockPriceOracle } from "../contracts/mocks/MockPriceOracle.sol";

/**
 * @notice Deploy PoolConfiguration contract
 * @dev Requires mock tokens to be deployed first (or real addresses for testnet)
 * 
 * Example: forge script script/DeployPoolConfiguration.s.sol --rpc-url localhost --broadcast
 */
contract DeployPoolConfiguration is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying PoolConfiguration with deployer:", deployer);

        // Load addresses from environment or deployment files
        address fxUSDBasePool = vm.envOr("FXUSD_BASE_POOL", address(0)); // Can be zero for initial deployment
        address aaveLendingPool = vm.envOr("AAVE_LENDING_POOL", address(0));
        address aaveBaseAsset = vm.envOr("AAVE_BASE_ASSET", address(0));
        address poolManager = vm.envOr("POOL_MANAGER", address(0)); // Can be zero initially
        address shortPoolManager = vm.envOr("SHORT_POOL_MANAGER", address(0)); // Can be zero initially
        address priceOracle = vm.envOr("PRICE_ORACLE", address(0));

        // For local testing, try to load from mock deployment
        if (block.chainid == 31337) {
            string memory chainId = vm.toString(block.chainid);
            try vm.readFile(string.concat("./deployments/mocks-", chainId, ".json")) returns (string memory mocksJson) {
                // Parse JSON - the file has keys like "aavePool", "priceOracle", etc.
                try vm.parseJsonAddress(mocksJson, ".aavePool") returns (address parsedAavePool) {
                    aaveLendingPool = parsedAavePool;
                } catch {
                    console.log("Could not parse aavePool from JSON");
                }
                try vm.parseJsonAddress(mocksJson, ".priceOracle") returns (address parsedPriceOracle) {
                    priceOracle = parsedPriceOracle;
                } catch {
                    console.log("Could not parse priceOracle from JSON");
                }
                console.log("Loaded mock addresses from deployment file");
            } catch {
                console.log("No mock deployment file found, using environment variables");
            }
        }

        // If still zero, deploy mocks inline (for convenience)
        vm.startBroadcast(deployerPrivateKey);
        
        if (aaveLendingPool == address(0)) {
            MockAaveV3Pool aavePool = new MockAaveV3Pool(5e25);
            aavePool.setReserveNormalizedVariableDebt(1e27);
            aaveLendingPool = address(aavePool);
            console.log("Deployed inline MockAaveV3Pool at:", aaveLendingPool);
        }

        if (aaveBaseAsset == address(0)) {
            // Use USDC as base asset (or load from mocks)
            if (block.chainid == 31337) {
                string memory chainId = vm.toString(block.chainid);
                try vm.readFile(string.concat("./deployments/mocks-", chainId, ".json")) returns (string memory mocksJson) {
                    aaveBaseAsset = vm.parseJsonAddress(mocksJson, ".usdc");
                } catch {
                    console.log("Warning: aaveBaseAsset not set, using zero address");
                }
            } else {
                // Mainnet USDC
                aaveBaseAsset = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
            }
        }

        if (priceOracle == address(0)) {
            MockPriceOracle oracle = new MockPriceOracle(1e18, 99e16, 101e16);
            priceOracle = address(oracle);
            console.log("Deployed inline MockPriceOracle at:", priceOracle);
        }

        // Deploy PoolConfiguration
        PoolConfiguration config = new PoolConfiguration(
            fxUSDBasePool,  // Can be zero initially
            aaveLendingPool,
            aaveBaseAsset,
            poolManager,    // Can be zero initially
            shortPoolManager // Can be zero initially
        );
        console.log("PoolConfiguration deployed at:", address(config));

        // Initialize
        config.initialize(deployer, priceOracle);
        console.log("PoolConfiguration initialized");

        vm.stopBroadcast();

        // Export address
        string memory json = "deployment";
        json = vm.serializeAddress(json, "poolConfiguration", address(config));
        string memory chainId = vm.toString(block.chainid);
        vm.writeJson(json, string.concat("./deployments/pool-config-", chainId, ".json"));
    }
}

