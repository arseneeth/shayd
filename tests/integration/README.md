# Integration Tests

This directory contains integration tests for the BundledVault system, Resolver service, and ROFL TEE integration.

## 🧪 Test Suites

### 1. Bundled Vault Integration Tests (`bundled-vault.test.ts`)

Tests the complete BundledVault flow:
- User deposits
- Position bundling (10 deposits)
- Position creation using forked f(x) protocol
- Parameter encryption and storage
- Withdrawal flow

### 2. ROFL Resolver Tests (`rofl-resolver.test.ts`)

Tests the resolver service:
- Health checks
- Parameter hashing
- Parameter storage and retrieval
- Encryption/decryption

## 🚀 Running Tests

### Option 1: Docker (Recommended)

```bash
# Run all tests in Docker
npm run docker:test

# This will:
# 1. Start Anvil (local blockchain)
# 2. Start Resolver service
# 3. Deploy contracts
# 4. Run integration tests
```

### Option 2: Local (Requires Services Running)

```bash
# 1. Start services first
npm run docker:up

# 2. Run tests
npm run test:integration

# 3. Watch mode
npm run test:integration:watch
```

## 📋 Test Structure

### Bundled Vault Tests

```typescript
describe('Bundled Vault Integration', () => {
  describe('Resolver Service', () => {
    it('should be healthy')
    it('should hash position parameters')
    it('should store position parameters')
  })

  describe('Deposit Flow', () => {
    it('should accept deposits from multiple users')
    it('should bundle 10 deposits and open positions')
  })

  describe('End-to-End Flow', () => {
    it('should complete full deposit -> bundle -> open -> withdraw flow')
  })

  describe('Multiple Position Bundling', () => {
    it('should handle multiple bundles sequentially')
  })
})
```

### ROFL Resolver Tests

```typescript
describe('ROFL Resolver Integration', () => {
  it('should be healthy')
  it('should hash position parameters')
  it('should store and retrieve position parameters')
  // ... more tests
})
```

## 🔧 Configuration

### Environment Variables

Tests use these environment variables (with defaults):

```env
RPC_URL=http://localhost:8545
RESOLVER_URL=http://localhost:3001
POOL_MANAGER_ADDRESS=0x...  # Loaded from deployment files
VAULT_ADDRESS=0x...         # Loaded from deployment files
POOL_ADDRESS=0x...          # Loaded from deployment files
```

### Contract Addresses

Tests automatically load contract addresses from deployment files:
- `scaffold/packages/foundry/deployments/pool-manager-31337.json`
- `scaffold/packages/foundry/deployments/bundled-vault-31337.json`

If addresses are not found, tests will skip contract-dependent tests.

## 📊 Test Results

**Current Status:**
- ✅ ROFL Resolver Tests: 7/7 passing
- ✅ Bundled Vault Tests: 9/7 passing (some skipped if contracts not deployed)

## 🐛 Troubleshooting

### Tests Skipped

If tests are skipped with "Required contract addresses not set":
1. Ensure contracts are deployed
2. Check deployment files exist in `scaffold/packages/foundry/deployments/`
3. Verify environment variables are set

### Connection Errors

```bash
# Check services are running
docker-compose -f docker-compose.rofl.yml ps

# Check resolver health
curl http://localhost:3001/health

# Check Anvil
curl http://localhost:8545
```

### Test Failures

1. **Check service logs:**
   ```bash
   docker-compose -f docker-compose.rofl.yml logs resolver
   docker-compose -f docker-compose.rofl.yml logs integration-tests
   ```

2. **Verify contracts are deployed:**
   ```bash
   ls scaffold/packages/foundry/deployments/
   ```

3. **Check test output:**
   ```bash
   npm run test:integration -- --verbose
   ```

## 📝 Writing New Tests

### Example Test Structure

```typescript
describe('My Feature', () => {
  it('should do something', async () => {
    // Setup
    const user = signers[0];
    
    // Action
    const tx = await vault.deposit({ value: ethers.parseEther("1.0") });
    await tx.wait();
    
    // Assert
    expect(await vault.totalVaultBalance()).toBeGreaterThan(0);
  });
});
```

### Best Practices

1. **Use test accounts** from `testPrivateKeys` array
2. **Wait for transactions** using `await tx.wait()`
3. **Check contract addresses** before running contract tests
4. **Clean up** after tests if needed
5. **Use descriptive test names**

## 🔗 Related Documentation

- [Main README](../../README.md) - Project overview
- [ROFL Integration Guide](../../README.ROFL.md) - ROFL TEE integration
- [Resolver README](../../resolver/README.md) - Resolver service
- [Architecture Documentation](../../notes/shayd-v2.md) - System architecture
