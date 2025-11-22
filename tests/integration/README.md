# Integration Tests

This directory contains integration tests for the ROFL TEE and Resolver services.

## Running Tests

### Locally (requires services running)

1. Start services:
```bash
docker-compose -f docker-compose.rofl.yml up -d
```

2. Run tests:
```bash
npm run test:integration
```

### In Docker

Run all tests in Docker:
```bash
npm run docker:test
```

This will:
1. Build all services
2. Start Anvil, ROFL TEE, and Resolver
3. Run integration tests
4. Clean up

## Test Structure

- `rofl-resolver.test.ts` - Main integration tests for ROFL TEE and Resolver interactions

## Test Scenarios

1. **ROFL TEE Service Tests**
   - Health check
   - Position parameter hashing
   - Invalid parameter handling

2. **Position Creation Tests**
   - Creating positions with TEE-verified hashes
   - On-chain hash verification

3. **Resolver Service Tests**
   - Position monitoring
   - Liquidation detection
   - Liquidation execution

4. **End-to-End Tests**
   - Complete position lifecycle
   - TEE hashing → Position creation → Monitoring → Liquidation

## Environment Variables

Set these in `.env` or pass to Docker:

- `RPC_URL` - Anvil RPC endpoint (default: http://localhost:8545)
- `ROFL_TEE_URL` - ROFL TEE service URL (default: http://localhost:8080)
- `RESOLVER_URL` - Resolver service URL (default: http://localhost:3001)
- `POOL_MANAGER_ADDRESS` - Pool Manager contract address
- `TEST_PRIVATE_KEY` - Private key for test transactions
