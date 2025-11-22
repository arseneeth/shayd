# Deployment Guide

This guide explains how to deploy the fx-protocol contracts to local Anvil or testnet.

## Prerequisites

1. **Foundry installed** - Make sure you have Foundry installed
2. **Environment variables** - Set up your `.env` file with:
   ```bash
   PRIVATE_KEY=your_private_key_here
   # Optional for testnet:
   FXUSD_BASE_POOL=0x...
   AAVE_LENDING_POOL=0x...
   AAVE_BASE_ASSET=0x...
   PRICE_ORACLE=0x...
   ```

## Deployment Options

### Option 1: Automatic Deployment (Recommended)

Contracts are automatically deployed when running integration tests via Docker Compose:

```bash
docker-compose -f docker-compose.rofl.yml up integration-tests
```

This will automatically deploy contracts before running tests.

### Option 2: Deploy Everything Locally (If Anvil is accessible on localhost)

Deploy all contracts in the correct order:

```bash
# From scaffold/packages/foundry directory
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
```

**Note**: If you get connection errors, Anvil might not be accessible from localhost. Use Option 1 instead.

This will:
1. Deploy mock tokens (fxUSD, USDC, Aave Pool, Price Oracle) - **only on local Anvil**
2. Deploy PoolConfiguration
3. Deploy PoolManager

### Option 2: Deploy Step by Step

#### Step 1: Deploy Mock Tokens (Local Only)

```bash
forge script script/DeployMockTokens.s.sol --rpc-url localhost --broadcast
```

This creates:
- Mock fxUSD token (18 decimals)
- Mock USDC token (6 decimals)
- Mock Aave V3 Pool
- Mock Price Oracle

#### Step 2: Deploy PoolConfiguration

```bash
forge script script/DeployPoolConfiguration.s.sol --rpc-url localhost --broadcast
```

Or for testnet:
```bash
forge script script/DeployPoolConfiguration.s.sol \
  --rpc-url sapphire-testnet \
  --broadcast \
  --env-var FXUSD_BASE_POOL 0x... \
  --env-var AAVE_LENDING_POOL 0x... \
  --env-var AAVE_BASE_ASSET 0x... \
  --env-var PRICE_ORACLE 0x...
```

#### Step 3: Deploy PoolManager

```bash
forge script script/DeployPoolManager.s.sol --rpc-url localhost --broadcast
```

Or for testnet:
```bash
forge script script/DeployPoolManager.s.sol \
  --rpc-url sapphire-testnet \
  --broadcast \
  --env-var FXUSD 0x... \
  --env-var FXBASE 0x... \
  --env-var POOL_CONFIGURATION 0x...
```

## Deployment Addresses

After deployment, addresses are saved to JSON files in `deployments/`:
- `deployments/mocks-{chainId}.json` - Mock token addresses
- `deployments/pool-config-{chainId}.json` - PoolConfiguration address
- `deployments/pool-manager-{chainId}.json` - PoolManager, ReservePool, RevenuePool addresses

## Using with Resolver Service

After deploying, update your resolver service with the PoolManager address:

```bash
# In docker-compose.rofl.yml or .env
POOL_MANAGER_ADDRESS=0x... # from deployments/pool-manager-{chainId}.json
```

## Testnet Deployment (Oasis Sapphire)

For testnet deployment, you'll need real contract addresses:

1. **Get fxUSD token address** from Oasis Sapphire testnet
2. **Get FxUSDBasePool address** (fxBASE)
3. **Get Aave V3 Pool address** on Sapphire
4. **Deploy or get Price Oracle address**

Then deploy with:

```bash
forge script script/Deploy.s.sol \
  --rpc-url sapphire-testnet \
  --broadcast \
  --env-var FXUSD 0x... \
  --env-var FXBASE 0x... \
  --env-var AAVE_LENDING_POOL 0x... \
  --env-var AAVE_BASE_ASSET 0x... \
  --env-var PRICE_ORACLE 0x...
```

## Verification

After deployment, verify contracts on block explorer:

```bash
forge script script/VerifyAll.s.sol --rpc-url sapphire-testnet
```

## Troubleshooting

### "PoolConfiguration not found"
- Make sure you deployed PoolConfiguration before PoolManager
- Check that `deployments/pool-config-{chainId}.json` exists

### "Insufficient funds"
- For local Anvil: The script auto-funds the deployer
- For testnet: Make sure your account has enough tokens

### "Contract already deployed"
- Remove the deployment JSON files if you want to redeploy
- Or use different addresses for new deployments

