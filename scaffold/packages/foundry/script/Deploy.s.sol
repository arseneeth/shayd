//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./DeployHelpers.s.sol";
import { DeployMockTokens } from "./DeployMockTokens.s.sol";
import { DeployPoolConfiguration } from "./DeployPoolConfiguration.s.sol";
import { DeployPoolManager } from "./DeployPoolManager.s.sol";

/**
 * @notice Main deployment script for all contracts
 * @dev Run this when you want to deploy all contracts sequentially
 *
 * Deployment order:
 * 1. Mock tokens (for local testing only)
 * 2. PoolConfiguration
 * 3. PoolManager
 *
 * Example: 
 *   yarn deploy # local anvil chain
 *   forge script script/Deploy.s.sol --rpc-url localhost --broadcast
 *   forge script script/Deploy.s.sol --rpc-url sapphire-testnet --broadcast
 */
contract DeployScript is ScaffoldETHDeploy {
    function run() external {
        // Deploy all contracts sequentially
        // For local testing, deploy mocks first
        if (block.chainid == 31337) {
            console.log("Deploying to local Anvil - deploying mocks first");
            DeployMockTokens mockDeployer = new DeployMockTokens();
            mockDeployer.run();
        }

        // Deploy PoolConfiguration
        console.log("Deploying PoolConfiguration...");
        DeployPoolConfiguration configDeployer = new DeployPoolConfiguration();
        configDeployer.run();

        // Deploy PoolManager
        console.log("Deploying PoolManager...");
        DeployPoolManager managerDeployer = new DeployPoolManager();
        managerDeployer.run();

        console.log("All contracts deployed successfully!");
    }
}
