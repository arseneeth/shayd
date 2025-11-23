# Keeper Architecture - Following ROFL Best Practices

## Overview

This document describes the separation of keeper functionality from resolver/controller operations, following ROFL (Runtime Off-Chain Logic) best practices as outlined in the [Oasis ROFL documentation](https://docs.oasis.io/build/rofl/workflow/init).

## Problem Statement

Previously, the resolver/controller were handling most operations, including keeper-like functionality such as:
- Price monitoring
- Position health checks
- Liquidation execution

This violated separation of concerns and made it difficult to ensure:
1. The program queries prices at the right time
2. Constant price monitoring of underlying assets
3. Proper timing for keeper operations

## Solution: Dedicated Keeper Service

Following ROFL recommendations, we've created a dedicated keeper service that:

### 1. **Continuously Queries Prices** (ROFL Best Practice)
- Queries prices from underlying asset oracles at configurable intervals
- Uses Promise.allSettled for graceful error handling
- Respects per-oracle update intervals
- Ensures the program constantly queries the price of underlying assets

### 2. **Monitors Positions** (ROFL Best Practice)
- Regularly checks all positions in monitored pools
- Detects positions near liquidation threshold
- Executes liquidations when thresholds are met
- Ensures operations are triggered at the right time

### 3. **Proper Separation of Concerns**

#### Resolver Service (TEE Operations Only)
- ROFL TEE position parameter hashing
- Position parameter encryption and storage
- Position parameter retrieval for withdrawals
- Event listening for position creation

#### Keeper Service (Price Monitoring & Liquidation)
- Continuous price oracle queries
- Position health monitoring
- Liquidation execution
- Statistics and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ROFL TEE Environment                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Resolver        │         │  Keeper          │         │
│  │  Service        │         │  Service        │         │
│  ├──────────────────┤         ├──────────────────┤         │
│  │ • TEE Hashing   │         │ • Price Queries  │         │
│  │ • Encryption     │         │ • Position Checks│         │
│  │ • Storage        │         │ • Liquidations   │         │
│  │ • Retrieval      │         │ • Statistics    │         │
│  └──────────────────┘         └──────────────────┘         │
│         │                              │                     │
│         └──────────────┬───────────────┘                     │
│                        │                                     │
│              ┌─────────▼─────────┐                          │
│              │  Blockchain RPC    │                          │
│              │  (Price Oracles,    │                          │
│              │   Pools, Contracts) │                          │
│              └─────────────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## ROFL Workflow Compliance

Following [ROFL workflow recommendations](https://docs.oasis.io/build/rofl/workflow/init):

1. **Initialization**: Both services are properly initialized with ROFL TEE
2. **Oracle Queries**: Keeper constantly queries prices (ROFL requirement)
3. **Keeper Operations**: Regular operations at appropriate intervals (ROFL best practice)
4. **Separation**: Clear separation between TEE operations and keeper operations
5. **Deployment**: Both services can be deployed independently in ROFL environment

## Configuration

### Keeper Service Environment Variables

```bash
# Required
RPC_URL=http://localhost:8545
PRIVATE_KEY=0x...

# Optional
POOL_MANAGER_ADDRESS=0x...
POOL_ADDRESS=0x...
PRICE_UPDATE_INTERVAL=10000      # 10 seconds
POSITION_CHECK_INTERVAL=30000    # 30 seconds
LIQUIDATION_THRESHOLD=1000000000000000000
NEAR_LIQUIDATION_BUFFER=95
PRICE_ORACLE_ADDRESS=0x...
PRICE_ORACLE_ASSET=ETH
PRICE_ORACLE_UPDATE_INTERVAL=10000
```

### Resolver Service Environment Variables

```bash
# Required
RPC_URL=http://localhost:8545
PRIVATE_KEY=0x...  # For hashing only

# Optional
VAULT_ADDRESS=0x...
DB_PATH=./tee-storage.db
TEE_ENCRYPTION_PASSWORD=...
PORT=3001
```

## Docker Compose Integration

The `docker-compose.rofl.yml` file includes both services:

- **resolver**: Handles TEE operations only
- **keeper**: Handles price monitoring and liquidations

Both services run within the ROFL TEE environment and can be deployed together or independently.

## Benefits

1. **Clear Separation**: Resolver handles TEE operations, keeper handles monitoring
2. **Constant Price Queries**: Keeper ensures prices are queried continuously
3. **Proper Timing**: Keeper operations are triggered at the right time
4. **Scalability**: Services can be scaled independently
5. **Maintainability**: Easier to maintain and debug separate concerns
6. **ROFL Compliance**: Follows ROFL best practices for oracle and keeper operations

## Migration Notes

The resolver service has been refactored to remove:
- `startMonitoring()` method
- `checkAndLiquidate()` method
- `getLiquidatablePositions()` method
- `executeLiquidation()` method
- `checkPositionHealth()` method (moved to keeper)
- `monitorAllPositions()` method

All keeper functionality is now in the dedicated keeper service.

## References

- [ROFL Documentation](https://docs.oasis.io/build/rofl/)
- [ROFL Workflow Init](https://docs.oasis.io/build/rofl/workflow/init)
- [ROFL Deployment](https://docs.oasis.io/build/rofl/workflow/deploy)

