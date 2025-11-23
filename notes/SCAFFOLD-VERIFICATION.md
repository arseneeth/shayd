# Scaffold-ETH Verification Guide

This guide helps you verify that Scaffold-ETH 2 is set up correctly and running properly.

## Quick Verification

Run the automated verification script:

```bash
./verify-scaffold.sh
```

## Manual Verification Steps

### 1. Prerequisites Check

```bash
# Check Node.js version (should be >= 20.18.3)
node -v

# Check Yarn version
yarn -v

# Check Foundry installation
forge --version
```

### 2. Install Dependencies

```bash
cd scaffold
yarn install
```

This installs dependencies for:
- Root workspace
- `packages/foundry` (smart contracts)
- `packages/nextjs` (frontend)

### 3. Verify Foundry Package

```bash
cd scaffold/packages/foundry

# Compile contracts
forge build

# Run tests
forge test

# Check deployment files exist
ls -la deployments/
```

**Expected files:**
- `deployments/mocks-31337.json` (mock tokens for local testing)
- `deployments/pool-config-31337.json` (PoolConfiguration)
- `deployments/pool-manager-31337.json` (PoolManager)
- `deployments/bundled-vault-31337.json` (BundledVault - optional)

### 4. Verify Next.js Package

```bash
cd scaffold/packages/nextjs

# Check TypeScript types
yarn check-types

# Check if deployed contracts are configured
cat contracts/deployedContracts.ts | grep -A 5 "31337"
```

**Expected:** The `deployedContracts.ts` file should contain contract addresses for chain ID 31337 (local Anvil).

### 5. Verify Contract Deployment

The contracts should be deployed to your local Anvil instance:

```bash
# Check if Anvil is running
curl http://localhost:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","id":1,"result":"0x7a69"} (31337 in hex)
```

### 6. Start Scaffold-ETH Services

#### Option A: Using Docker (Recommended)

```bash
# Start all services
docker-compose -f docker-compose.rofl.yml up -d anvil nextjs

# Check services are running
docker-compose -f docker-compose.rofl.yml ps

# View logs
docker-compose -f docker-compose.rofl.yml logs nextjs
```

#### Option B: Local Development

```bash
# Terminal 1: Start Anvil
cd scaffold
yarn chain

# Terminal 2: Deploy contracts
cd scaffold
yarn deploy

# Terminal 3: Start frontend
cd scaffold
yarn start
```

### 7. Verify Frontend Access

1. Open browser to `http://localhost:3000`
2. You should see the Scaffold-ETH interface
3. Connect a wallet (or use burner wallet)
4. Navigate to `/debug` page to interact with contracts

### 8. Common Issues and Fixes

#### Issue: Contracts won't compile
```bash
# Clean and rebuild
cd scaffold/packages/foundry
forge clean
forge build
```

#### Issue: TypeScript errors in Next.js
```bash
# Regenerate contract types
cd scaffold/packages/foundry
forge build
# This should auto-generate types in nextjs/contracts/
```

#### Issue: Frontend can't find contracts
```bash
# Ensure contracts are deployed
cd scaffold/packages/foundry
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Check deployedContracts.ts is updated
cat scaffold/packages/nextjs/contracts/deployedContracts.ts
```

#### Issue: Solc rate limiting (429 errors)
```bash
# Wait 10-15 minutes and retry, or manually install solc
svm install 0.8.26
```

### 9. Verify Integration

Run the integration tests to verify everything works together:

```bash
docker-compose -f docker-compose.rofl.yml run --rm integration-tests
```

## Expected File Structure

```
scaffold/
├── packages/
│   ├── foundry/
│   │   ├── contracts/          # Smart contracts
│   │   ├── script/             # Deployment scripts
│   │   ├── test/               # Foundry tests
│   │   ├── deployments/        # Deployment JSON files
│   │   └── out/                # Compiled contracts
│   └── nextjs/
│       ├── app/                 # Next.js app directory
│       ├── contracts/           # Generated contract types
│       │   ├── deployedContracts.ts
│       │   └── externalContracts.ts
│       └── hooks/               # React hooks for contracts
```

## Health Checks

### Anvil (Local Blockchain)
```bash
curl http://localhost:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Next.js Frontend
```bash
curl http://localhost:3000
# Should return HTML
```

### Resolver Service (if running)
```bash
curl http://localhost:3001/health
# Should return: OK
```

## Next Steps

Once verified:
1. ✅ Contracts compile
2. ✅ Contracts deployed to local network
3. ✅ Frontend can connect to contracts
4. ✅ All tests pass

You're ready to develop! 🚀

