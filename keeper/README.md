# Keeper Service

The Keeper Service is responsible for continuously monitoring prices and positions, and executing liquidations when necessary. This service is separate from the resolver/controller which handle TEE operations.

**Following ROFL (Runtime Off-Chain Logic) Best Practices:**
- Runs within ROFL TEE for secure off-chain computation
- Implements ROFL's recommended patterns for oracle queries
- Ensures continuous price monitoring as per ROFL workflow
- Performs keeper operations at appropriate intervals

## Responsibilities

1. **Price Monitoring**: Continuously queries prices from underlying asset oracles (ROFL recommendation: constant price queries)
2. **Position Monitoring**: Monitors positions for liquidation conditions (ROFL recommendation: regular keeper operations)
3. **Liquidation Execution**: Executes liquidations when thresholds are met
4. **Timing**: Ensures operations are triggered at the right time with configurable intervals (ROFL best practice)

## Features

- **Continuous Price Queries**: Configurable intervals for querying prices from multiple oracles
- **Position Health Checks**: Regularly checks all positions in monitored pools
- **Liquidation Execution**: Automatically executes liquidations when positions exceed thresholds
- **Statistics**: Tracks price queries, position checks, and liquidations executed
- **Configurable**: All intervals and thresholds are configurable via environment variables

## Configuration

### Environment Variables

- `RPC_URL`: Ethereum RPC endpoint (default: `http://localhost:8545`)
- `PRIVATE_KEY`: Private key for executing transactions (required)
- `POOL_MANAGER_ADDRESS`: Address of the PoolManager contract (optional)
- `POOL_ADDRESS`: Address of the pool to monitor (can be set multiple times)
- `PRICE_UPDATE_INTERVAL`: Interval in milliseconds for price updates (default: 10000 = 10 seconds)
- `POSITION_CHECK_INTERVAL`: Interval in milliseconds for position checks (default: 30000 = 30 seconds)
- `LIQUIDATION_THRESHOLD`: Debt ratio threshold for liquidation (default: 1.0 = 100%)
- `NEAR_LIQUIDATION_BUFFER`: Buffer percentage before liquidation (default: 95)
- `PRICE_ORACLE_ADDRESS`: Address of price oracle contract
- `PRICE_ORACLE_ASSET`: Asset name (e.g., 'ETH', 'BTC', 'stETH')
- `PRICE_ORACLE_UPDATE_INTERVAL`: Interval in milliseconds for this specific oracle (default: 10000)

## Usage

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm install
npm run build
node dist/keeper.js
```

### Docker

The keeper service can be run in a Docker container. See the main project's docker-compose files for examples.

## Architecture

The keeper service runs two main loops following ROFL recommendations:

1. **Price Monitoring Loop**: Queries prices from configured oracles at regular intervals
   - ROFL best practice: Constantly query the price of underlying assets
   - Uses Promise.allSettled for graceful error handling
   - Respects per-oracle update intervals

2. **Position Monitoring Loop**: Checks all positions in monitored pools for liquidation conditions
   - ROFL best practice: Regular keeper operations to ensure timely liquidations
   - Monitors all positions in configured pools
   - Executes liquidations when thresholds are met

When a position exceeds the liquidation threshold, the keeper automatically executes a liquidation transaction via the PoolManager contract.

## ROFL Integration

This keeper service is designed to run within the ROFL TEE environment:
- Follows ROFL workflow recommendations from [docs.oasis.io/build/rofl/workflow/init](https://docs.oasis.io/build/rofl/workflow/init)
- Implements proper oracle query patterns
- Ensures keeper operations are called at the right time
- Uses ROFL's secure off-chain computation capabilities

## Separation of Concerns

Following ROFL architecture recommendations:

- **Resolver/Controller**: Handles TEE operations, encryption, hashing, and position parameter storage
- **Keeper**: Handles price monitoring, position health checks, and liquidation execution

This separation ensures that:
- Price queries happen continuously and independently (ROFL requirement)
- Operations are triggered at the right time (ROFL best practice)
- Keeper functionality doesn't interfere with resolver/controller operations
- Each service can be scaled and monitored independently
- Follows ROFL's modular architecture recommendations

