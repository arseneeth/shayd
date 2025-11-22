# Resolver Service

The Resolver Service is responsible for monitoring positions and executing liquidations when positions become undercollateralized.

## Overview

The resolver service:
- Monitors position debt ratios continuously
- Detects undercollateralized positions
- Executes liquidations via Pool Manager contracts
- Calculates liquidation parameters (maxRawDebts, receiver)

## Architecture

The resolver service runs as an off-chain service that:
1. Connects to blockchain nodes to monitor positions
2. Queries position data and debt ratios
3. Detects liquidation conditions
4. Executes liquidations by calling Pool Manager contracts

## Configuration

The resolver requires:
- RPC endpoint for blockchain access
- Pool Manager contract addresses
- Private key for transaction signing
- Liquidation threshold parameters

