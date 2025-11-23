// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MockERC20 } from "./MockERC20.sol";
import { IWrappedEther } from "../interfaces/IWrappedEther.sol";

/**
 * @title MockWETH
 * @notice Mock WETH contract that implements IWrappedEther
 */
contract MockWETH is MockERC20, IWrappedEther {
    constructor() MockERC20("Wrapped Ether", "WETH", 18) {}
    
    function deposit() external payable override {
        _mint(msg.sender, msg.value);
    }
    
    function withdraw(uint256 wad) external override {
        require(balanceOf(msg.sender) >= wad, "Insufficient balance");
        _burn(msg.sender, wad);
        payable(msg.sender).transfer(wad);
    }
    
    receive() external payable {
        this.deposit();
    }
}

