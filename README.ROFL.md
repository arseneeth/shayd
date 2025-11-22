# Resolver Integration Testing Guide

This guide explains how to test contracts and resolver interactions using the combined resolver service (ROFL TEE hashing + liquidation execution) within Docker containers.

## Architecture

The integration testing setup includes:

1. **Anvil** - Local Ethereum blockchain for testing
2. **Resolver Service** - Combined service providing:
   - ROFL TEE position parameter hashing (TypeScript)
   - Position monitoring and liquidation execution
3. **Integration Tests** - End-to-end tests (TypeScript/Jest)

## Quick Start

### 1. Start All Services (Automatic Deployment)

```bash
docker-compose -f docker-compose.rofl.yml up -d
```

This automatically:
- Starts Anvil on port 8545
- **Deploys contracts** (PoolConfiguration, PoolManager, ReservePool, mock tokens)
- Starts Resolver on port 3001 (automatically loads PoolManager address from deployment)
- Runs integration tests

**Contract Deployment:**
- Contracts are automatically deployed by the `integration-tests` service before running tests
- Deployment addresses are saved to `scaffold/packages/foundry/deployments/`
- PoolManager address is automatically loaded by the resolver service from deployment files

### 2. Run Integration Tests

```bash
# Tests run automatically when starting services
# Or run manually:
docker-compose -f docker-compose.rofl.yml up integration-tests

# Or run locally (requires services to be running)
npm run test:integration
```

### 3. View Logs

```bash
npm run docker:logs
```

## Services

### Resolver Service

The resolver service provides both ROFL TEE hashing and liquidation execution:

**ROFL TEE Endpoint:** `POST /hash`

**Request:**
```json
{
  "position_id": "1",
  "collateral": "1000000000000000000",
  "debt": "500000000000000000",
  "owner": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "hash": "0x1234...",
  "position_id": "1"
}
```

**Liquidation Execution:**

- Monitors position debt ratios
- Detects undercollateralized positions
- Executes liquidations via Pool Manager contracts

## Testing Workflow

1. **Position Creation with TEE Hash**
   - User submits position parameters
   - ROFL TEE hashes parameters
   - Contract verifies hash and creates position

2. **Position Monitoring**
   - Resolver continuously monitors positions
   - Detects when positions become liquidatable

3. **Liquidation Execution**
   - Resolver calculates liquidation parameters
   - Executes liquidation via Pool Manager
   - Verifies liquidation was successful

## Development

### Building Resolver Service

```bash
cd resolver
npm install
npm run build
```

### Running Services Individually

```bash
# Resolver (includes ROFL TEE hashing)
cd resolver && npm start

# Anvil
anvil --host 0.0.0.0 --port 8545
```

## Environment Variables

Create a `.env` file:

```env
RPC_URL=http://localhost:8545
ROFL_TEE_URL=http://localhost:8080
RESOLVER_URL=http://localhost:3001
POOL_MANAGER_ADDRESS=0x...
RESOLVER_PRIVATE_KEY=0x...
TEST_PRIVATE_KEY=0x...
```

## Troubleshooting

### Services won't start

Check if ports are already in use:
```bash
lsof -i :8545  # Anvil
lsof -i :3001  # Resolver
```

### Tests failing

1. Ensure all services are running:
```bash
docker-compose -f docker-compose.rofl.yml ps
```

2. Check service logs:
```bash
docker-compose -f docker-compose.rofl.yml logs resolver
```

3. Verify network connectivity:
```bash
curl http://localhost:3001/health  # Resolver
curl http://localhost:3001/hash   # ROFL TEE endpoint (POST)
```

## Next Steps

1. Deploy contracts to Anvil
2. Configure Pool Manager address
3. Run integration tests
4. Verify TEE hashing works correctly
5. Test liquidation flow end-to-end

