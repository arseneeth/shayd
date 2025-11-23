//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { BundledVault } from "../contracts/core/BundledVault.sol";
import { MockWETH } from "../contracts/mocks/MockWETH.sol";
import { MockPool } from "../contracts/mocks/MockPool.sol";
import { PoolManager } from "../contracts/core/PoolManager.sol";

/**
 * @notice Deploy BundledVault contract
 * @dev Requires PoolManager to be deployed first
 * 
 * Environment variables:
 * - POOL_MANAGER: Address of PoolManager (or will load from deployment file)
 * - POOL: Address of the pool to use (or will try to get from PoolManager)
 * - RESOLVER: Address of resolver service (defaults to deployer for testing)
 * - OPERATOR: Address of operator with OPERATOR_ROLE (defaults to deployer)
 * 
 * Example: forge script script/DeployBundledVault.s.sol --rpc-url localhost --broadcast
 */
contract DeployBundledVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying BundledVault with deployer:", deployer);

        // Load PoolManager address
        address poolManagerAddr = vm.envOr("POOL_MANAGER", address(0));
        
        // For local testing, try to load from deployment files
        if (block.chainid == 31337 && poolManagerAddr == address(0)) {
            string memory chainId = vm.toString(block.chainid);
            try vm.readFile(string.concat("./deployments/pool-manager-", chainId, ".json")) returns (string memory managerJson) {
                try vm.parseJsonAddress(managerJson, ".poolManager") returns (address parsedPoolManager) {
                    poolManagerAddr = parsedPoolManager;
                    console.log("Loaded PoolManager from deployment file:", poolManagerAddr);
                } catch {
                    console.log("Could not parse poolManager from JSON file");
                }
            } catch {
                console.log("PoolManager deployment file not found. Set POOL_MANAGER env var or deploy PoolManager first.");
            }
        }

        if (poolManagerAddr == address(0)) {
            console.log("Warning: PoolManager address not found. Skipping BundledVault deployment.");
            console.log("Set POOL_MANAGER env var or deploy PoolManager first using Deploy.s.sol");
            return; // Exit gracefully instead of reverting
        }

        // Load or deploy WETH
        address wethAddr = vm.envOr("WETH", address(0));
        
        // For local testing, deploy MockWETH if not provided
        if (block.chainid == 31337 && wethAddr == address(0)) {
            vm.startBroadcast(deployerPrivateKey);
            MockWETH mockWETH = new MockWETH();
            wethAddr = address(mockWETH);
            vm.stopBroadcast();
            console.log("Deployed MockWETH at:", wethAddr);
        }

        if (wethAddr == address(0)) {
            revert("WETH address not found. Set WETH env var or deploy MockWETH first.");
        }

        // Load pool address or deploy MockPool for local testing
        address poolAddr = vm.envOr("POOL", address(0));
        
        // Load fxUSD address (needed for MockPool)
        address fxUSDAddr = vm.envOr("FXUSD", address(0));
        if (block.chainid == 31337 && fxUSDAddr == address(0)) {
            string memory chainId = vm.toString(block.chainid);
            try vm.readFile(string.concat("./deployments/mocks-", chainId, ".json")) returns (string memory mocksJson) {
                try vm.parseJsonAddress(mocksJson, ".fxUSD") returns (address parsedFxUSD) {
                    fxUSDAddr = parsedFxUSD;
                    console.log("Loaded fxUSD from deployment file:", fxUSDAddr);
                } catch {}
            } catch {}
        }
        
        // Use WETH as collateral token for now (can be overridden via env var)
        address collateralTokenAddr = vm.envOr("COLLATERAL_TOKEN", wethAddr);
        
        // For local testing, deploy MockPool if not provided
        if (block.chainid == 31337 && poolAddr == address(0) && fxUSDAddr != address(0)) {
            vm.startBroadcast(deployerPrivateKey);
            MockPool mockPool = new MockPool(poolManagerAddr, collateralTokenAddr, fxUSDAddr);
            poolAddr = address(mockPool);
            vm.stopBroadcast();
            console.log("Deployed MockPool at:", poolAddr);
            
            // Register pool with PoolManager
            vm.startBroadcast(deployerPrivateKey);
            PoolManager poolManager = PoolManager(poolManagerAddr);
            poolManager.registerPool(poolAddr, type(uint96).max, type(uint96).max);
            vm.stopBroadcast();
            console.log("Registered MockPool with PoolManager");
        }
        
        if (poolAddr == address(0)) {
            console.log("Warning: POOL address not set and could not deploy MockPool. Vault will need pool address to be set later via setPool()");
        }

        // Load resolver and operator addresses
        address resolverAddr = vm.envOr("RESOLVER", deployer); // Default to deployer for testing
        address operatorAddr = vm.envOr("OPERATOR", deployer); // Default to deployer for testing

        console.log("Deployment parameters:");
        console.log("  PoolManager:", poolManagerAddr);
        console.log("  Pool:", poolAddr);
        console.log("  CollateralToken:", collateralTokenAddr);
        console.log("  Resolver:", resolverAddr);
        console.log("  WETH:", wethAddr);
        console.log("  Operator:", operatorAddr);

        // Deploy BundledVault
        vm.startBroadcast(deployerPrivateKey);
        
        BundledVault vault = new BundledVault(
            poolManagerAddr,
            poolAddr,
            collateralTokenAddr,
            resolverAddr,
            wethAddr,
            operatorAddr
        );
        
        console.log("BundledVault deployed at:", address(vault));
        
        vm.stopBroadcast();

        // Export addresses
        string memory json = "deployment";
        json = vm.serializeAddress(json, "bundledVault", address(vault));
        json = vm.serializeAddress(json, "poolManager", poolManagerAddr);
        json = vm.serializeAddress(json, "pool", poolAddr);
        json = vm.serializeAddress(json, "weth", wethAddr);
        json = vm.serializeAddress(json, "collateralToken", collateralTokenAddr);
        json = vm.serializeAddress(json, "resolver", resolverAddr);
        json = vm.serializeAddress(json, "operator", operatorAddr);
        
        string memory chainId = vm.toString(block.chainid);
        vm.writeJson(json, string.concat("./deployments/bundled-vault-", chainId, ".json"));
        
        console.log("Deployment info saved to: bundled-vault-", chainId, ".json");
    }
}

