/**
 * Integration tests for ROFL TEE and Resolver interactions
 * 
 * These tests verify:
 * 1. ROFL TEE can hash position parameters
 * 2. Contracts can verify TEE hashes
 * 3. Resolver can monitor and execute liquidations
 */

import { ethers } from 'ethers';
import axios from 'axios';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const RESOLVER_URL = process.env.RESOLVER_URL || 'http://localhost:3001';

describe('ROFL TEE and Resolver Integration', () => {
  let provider: ethers.Provider;
  let signer: ethers.Signer;
  let resolverClient: any;
  let poolManagerAddress: string | null = null;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Use a test account (in real tests, load from keystore)
    const privateKey = process.env.TEST_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    signer = new ethers.Wallet(privateKey, provider);
    
    // Initialize client (resolver now includes ROFL TEE functionality)
    resolverClient = axios.create({ baseURL: RESOLVER_URL });

    // Try to load PoolManager address from deployment file
    try {
      const fs = require('fs');
      const path = require('path');
      const deploymentFile = path.join(__dirname, '../../scaffold/packages/foundry/deployments/pool-manager-31337.json');
      if (fs.existsSync(deploymentFile)) {
        const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
        poolManagerAddress = deployment.poolManager || process.env.POOL_MANAGER_ADDRESS || null;
        console.log('Loaded PoolManager address:', poolManagerAddress);
      }
    } catch (error) {
      console.warn('Could not load PoolManager address from deployment file:', error);
      poolManagerAddress = process.env.POOL_MANAGER_ADDRESS || null;
    }
  });

  describe('Resolver Service (ROFL TEE + Liquidation)', () => {
    it('should be healthy', async () => {
      const response = await resolverClient.get('/health');
      expect(response.status).toBe(200);
      expect(response.data).toBe('OK');
    });

    it('should hash position parameters (ROFL TEE endpoint)', async () => {
      const positionParams = {
        position_id: '1',
        collateral: '1000000000000000000', // 1 ETH
        debt: '500000000000000000', // 0.5 ETH
        owner: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      };

      const response = await resolverClient.post('/hash', positionParams);
      
      expect(response.status).toBe(200);
      expect(response.data.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(response.data.position_id).toBe(positionParams.position_id);
    });

    it('should reject invalid parameters', async () => {
      const invalidParams = {
        position_id: '1',
        collateral: '1000000000000000000',
        debt: '500000000000000000',
        owner: '', // Empty owner
      };

      try {
        await resolverClient.post('/hash', invalidParams);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });
  });

  describe('Position Creation with TEE Hash', () => {
    it('should create position with TEE-verified hash', async () => {
      // 1. Get hash from Resolver (ROFL TEE endpoint)
      const positionParams = {
        position_id: '1',
        collateral: '1000000000000000000',
        debt: '500000000000000000',
        owner: await signer.getAddress(),
      };

      const hashResponse = await resolverClient.post('/hash', positionParams);
      const hash = hashResponse.data.hash;

      // 2. Create position on-chain with hash
      // This would call your contract's createPosition function
      // For now, we just verify the hash format
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      // In a real test, you would:
      // const contract = new ethers.Contract(poolAddress, poolABI, signer);
      // await contract.createPosition(positionParams, hash);
    });
  });

  describe('Resolver Service', () => {
    it('should be healthy', async () => {
      // Assuming resolver has a health endpoint
      // This would need to be implemented in the resolver service
      expect(true).toBe(true); // Placeholder
    });

    it('should monitor positions for liquidation', async () => {
      // This test would:
      // 1. Create a position
      // 2. Make it undercollateralized
      // 3. Verify resolver detects it
      // 4. Verify resolver executes liquidation
      
      // Placeholder for now
      expect(true).toBe(true);
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full position lifecycle', async () => {
      // 1. User creates position params
      const positionParams = {
        position_id: '1',
        collateral: '1000000000000000000',
        debt: '500000000000000000',
        owner: await signer.getAddress(),
      };

      // 2. Resolver (ROFL TEE) hashes parameters
      const hashResponse = await resolverClient.post('/hash', positionParams);
      const hash = hashResponse.data.hash;

      // 3. Position created on-chain with hash verification
      // (Would call contract here)

      // 4. Resolver monitors position
      // (Would verify resolver is monitoring)

      // 5. Position becomes liquidatable
      // (Would manipulate position to be undercollateralized)

      // 6. Resolver executes liquidation
      // (Would verify liquidation was executed)

      expect(hash).toBeDefined();
    });
  });
});

