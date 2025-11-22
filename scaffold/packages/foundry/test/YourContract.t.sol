// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
// import "../contracts/YourContract.sol"; // YourContract was removed

contract YourContractTest is Test {
    // YourContract public yourContract; // YourContract was removed

    function setUp() public {
        // yourContract = new YourContract(vm.addr(1)); // YourContract was removed
    }

    function testMessageOnDeployment() public view {
        // require(keccak256(bytes(yourContract.greeting())) == keccak256("Building Unstoppable Apps!!!")); // YourContract was removed
    }
}
