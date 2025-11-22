//SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { MockAaveV3Pool } from "../contracts/mocks/MockAaveV3Pool.sol";
import { MockPriceOracle } from "../contracts/mocks/MockPriceOracle.sol";

/**
 * @notice Deploy mock tokens and contracts for local testing
 * @dev Run this first when deploying to local Anvil
 * 
 * Example: forge script script/DeployMockTokens.s.sol --rpc-url localhost --broadcast
 */
contract DeployMockTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying mock tokens with deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock fxUSD token (18 decimals)
        MockERC20 fxUSD = new MockERC20("fxUSD", "fxUSD", 18);
        console.log("Mock fxUSD deployed at:", address(fxUSD));
        
        // Deploy mock USDC token (6 decimals)
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        console.log("Mock USDC deployed at:", address(usdc));

        // Deploy mock Aave V3 Pool
        // Default borrow rate: 5% (0.05 * 1e27 = 5e25)
        MockAaveV3Pool aavePool = new MockAaveV3Pool(5e25);
        // Set normalized variable debt to 1e27 (1.0)
        aavePool.setReserveNormalizedVariableDebt(1e27);
        console.log("Mock Aave V3 Pool deployed at:", address(aavePool));

        // Deploy mock price oracle
        // Anchor price: 1.0 (1e18), Min: 0.99 (99e16), Max: 1.01 (101e16)
        MockPriceOracle priceOracle = new MockPriceOracle(1e18, 99e16, 101e16);
        console.log("Mock Price Oracle deployed at:", address(priceOracle));

        // Mint some tokens to deployer for testing
        fxUSD.mint(deployer, 1000000 ether);
        usdc.mint(deployer, 1000000 * 1e6);
        console.log("Minted tokens to deployer");

        vm.stopBroadcast();

        // Export addresses
        string memory json = "deployment";
        json = vm.serializeAddress(json, "fxUSD", address(fxUSD));
        json = vm.serializeAddress(json, "usdc", address(usdc));
        json = vm.serializeAddress(json, "aavePool", address(aavePool));
        json = vm.serializeAddress(json, "priceOracle", address(priceOracle));
        
        string memory chainId = vm.toString(block.chainid);
        vm.writeJson(json, string.concat("./deployments/mocks-", chainId, ".json"));
    }
}

