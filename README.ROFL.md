# ROFL TEE Integration & BundledVault Testing Guide

This guide explains how to test the BundledVault system with ROFL TEE encryption and resolver integration using Docker containers.

## 🏗️ Architecture

The integration testing setup includes:

1. **Anvil** - Local Ethereum blockchain for testing
2. **Resolver Service** - Combined service providing:
   - Position parameter encryption/decryption
   - Encrypted parameter storage
   - Position parameter retrieval for withdrawals
3. **BundledVault** - Smart contract for bundling deposits and managing positions
4. **Integration Tests** - End-to-end tests (TypeScript/Jest)

## 🚀 Quick Start

### 1. Start All Services (Automatic Deployment)

```bash
# Start all services and run tests
npm run docker:test

# Or start services in background
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

This automatically:
- Starts Anvil on port 8545
- **Deploys contracts** (PoolConfiguration, PoolManager, ReservePool, mock tokens)
- Starts Resolver on port 3001
- Runs integration tests

### 2. Run Integration Tests

```bash
# Tests run automatically when starting services
# Or run manually:
docker-compose -f docker-compose.rofl.yml up integration-tests

# Or run locally (requires services to be running)
npm run test:integration
```

## 📋 Services

### Anvil (Local Blockchain)

- **Port**: 8545
- **Purpose**: Local Ethereum network for testing
- **Auto-funds**: Test accounts with 10,000 ETH

### Resolver Service

The resolver service provides encryption and storage for position parameters:

**Endpoints:**

1. **`POST /store-encrypted`** - Store encrypted position parameters
   ```json
   {
     "userAddress": "0x...",
     "depositIndex": 0,
     "encryptedParams": {
       "encrypted": "...",
       "iv": "...",
       "salt": "..."
     }
   }
   ```

2. **`POST /get-params-for-bundle`** - Get decrypted parameters for operator
   ```json
   {
     "depositIds": ["...", "..."],
     "password": "tee-password"
   }
   ```

3. **`POST /get-params`** - Get encrypted parameters for user
   ```json
   {
     "position_id": "1",
     "owner": "0x..."
   }
   ```

4. **`POST /link-position`** - Link position ID to deposit
   ```json
   {
     "depositId": "...",
     "positionId": "1"
   }
   ```

5. **`GET /health`** - Health check

**Port**: 3001

### BundledVault Contract

**Key Functions:**

- `deposit()` - Accept native ETH deposits
- `createPositionsFromBundle()` - Operator creates positions from bundle (requires OPERATOR_ROLE)
- `requestWithdrawal()` - User requests withdrawal
- `closePosition()` - Close position using parameters from resolver

## 🔐 Encryption Flow

### Frontend Encryption (Recommended)

1. **User deposits ETH** → `BundledVault.deposit()`
2. **Frontend encrypts parameters** → Uses encryption utilities
3. **Send encrypted to resolver** → `POST /store-encrypted`
4. **Resolver stores** → Never sees plaintext

### Operator Decryption

1. **Bundle ready** → 10 deposits accumulated
2. **Operator gets encrypted params** → `POST /get-params-for-bundle`
3. **Operator decrypts** → Using TEE password
4. **Operator creates positions** → `BundledVault.createPositionsFromBundle()`
5. **Link positions** → `POST /link-position`

### User Withdrawal

1. **User requests withdrawal** → `BundledVault.requestWithdrawal()`
2. **Get encrypted params** → `POST /get-params`
3. **Frontend decrypts** → User decrypts on frontend
4. **Close position** → `BundledVault.closePosition()`

## 🧪 Testing Workflow

### 1. Position Creation with Encryption

```typescript
// 1. User deposits ETH
await vault.deposit({ value: ethers.parseEther("1.0") });

// 2. Frontend encrypts parameters
const encrypted = encryptPositionParams(params, password);

// 3. Store encrypted in resolver
await resolverClient.post('/store-encrypted', {
  userAddress,
  depositIndex,
  encryptedParams: encrypted
});

// 4. Operator gets decrypted params and creates positions
const params = await resolverClient.post('/get-params-for-bundle', {
  depositIds,
  password
});

await vault.createPositionsFromBundle(depositIndices, collaterals, debts);
```

### 2. Position Monitoring

- Resolver continuously monitors positions
- Detects when positions become liquidatable
- Executes liquidations via Pool Manager

### 3. Withdrawal Flow

```typescript
// 1. User requests withdrawal
await vault.requestWithdrawal(positionId);

// 2. Get encrypted params from resolver
const encrypted = await resolverClient.post('/get-params', {
  position_id: positionId,
  owner: userAddress
});

// 3. Frontend decrypts
const params = decryptPositionParams(encrypted, password);

// 4. Close position
await vault.closePosition(
  positionId,
  params.collateral,
  params.debt,
  positionHash
);
```

## 🔧 Development

### Building Resolver Service

```bash
cd resolver
npm install
npm run build
```

### Running Services Individually

```bash
# Resolver
cd resolver && npm start

# Anvil
anvil --host 0.0.0.0 --port 8545
```

### Contract Deployment

```bash
cd scaffold/packages/foundry

# Deploy all contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy BundledVault
forge script script/DeployBundledVault.s.sol --rpc-url http://localhost:8545 --broadcast
```

## 📝 Environment Variables

Create a `.env` file:

```env
# Blockchain
RPC_URL=http://localhost:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Resolver
RESOLVER_URL=http://localhost:3001
POOL_MANAGER_ADDRESS=0x...
RESOLVER_PRIVATE_KEY=0x...
TEE_ENCRYPTION_PASSWORD=your-secure-password

# Contracts (optional, loaded from deployment files)
VAULT_ADDRESS=0x...
POOL_ADDRESS=0x...
WETH_ADDRESS=0x...
OPERATOR_ADDRESS=0x...
```

## 🐛 Troubleshooting

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
docker-compose -f docker-compose.rofl.yml logs integration-tests
```

3. Verify network connectivity:
```bash
curl http://localhost:3001/health  # Resolver
```

### Deployment Issues

If contracts fail to deploy:
- Check Anvil is running: `curl http://localhost:8545`
- Verify PRIVATE_KEY is set in environment
- Check deployment logs: `docker-compose logs integration-tests`

### Solc Installation Errors

If you see rate limit errors (429) when installing solc:
- Wait a few minutes and retry
- Or pre-install solc in Docker image
- Or use a different solc version

## 📊 Test Results

**Foundry Tests:** ✅ 7/7 passing
- Deposit functionality
- Bundle readiness
- Position creation using forked f(x) protocol
- Multiple bundles
- Access control
- Position closing

**Integration Tests:** ✅ 16/16 passing
- Resolver service health
- Encryption/decryption
- Parameter storage
- End-to-end flows

## 🔗 Related Documentation

- [Main README](README.md) - Project overview
- [Architecture Documentation](notes/shayd-v2.md) - System architecture
- [Encryption Guide](notes/README_ENCRYPTION.md) - Encryption implementation
- [Resolver README](resolver/README.md) - Resolver service details
- [Deployment Guide](scaffold/packages/foundry/DEPLOYMENT.md) - Contract deployment
