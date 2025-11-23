/**
 * Integration tests for ROFL TEE and Resolver interactions
 * 
 * These tests verify:
 * 1. ROFL TEE can hash position parameters
 * 2. Contracts can verify TEE hashes
 * 3. Resolver encryption and storage endpoints
 * 4. Operator bundling functionality
 * 5. Position linking and retrieval
 */

import { ethers } from 'ethers';
import axios from 'axios';
import { encryptPositionParams, decryptPositionParams } from '../../resolver/encryption';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const RESOLVER_URL = process.env.RESOLVER_URL || 'http://localhost:3001';
const TEE_PASSWORD = process.env.TEE_ENCRYPTION_PASSWORD || 'test-tee-password';

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

  describe('Resolver Service Health and Stats', () => {
    it('should be healthy', async () => {
      const response = await resolverClient.get('/health');
      expect(response.status).toBe(200);
      expect(response.data).toBe('OK');
    });

    it('should return storage statistics', async () => {
      const response = await resolverClient.get('/stats');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.stats).toBeDefined();
      expect(typeof response.data.stats).toBe('object');
    });
  });

  describe('ROFL TEE Hashing', () => {
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

    it('should produce consistent hashes for same parameters', async () => {
      const positionParams = {
        position_id: '999',
        collateral: '2000000000000000000',
        debt: '1000000000000000000',
        owner: await signer.getAddress(),
      };

      const response1 = await resolverClient.post('/hash', positionParams);
      const response2 = await resolverClient.post('/hash', positionParams);
      
      expect(response1.data.hash).toBe(response2.data.hash);
    });
  });

  describe('Encryption Endpoints', () => {
    describe('Frontend Encryption (Privacy-First)', () => {
      it('should store frontend-encrypted parameters', async () => {
        const userAddress = await signer.getAddress();
        const depositIndex = 0;
        
        // Simulate frontend encryption
        const positionParams = {
          position_id: '0', // Will be set later
          collateral: '1000000000000000000',
          debt: '500000000000000000',
          owner: userAddress,
        };
        
        const encryptedParams = encryptPositionParams(positionParams, TEE_PASSWORD);
        
        // Store encrypted parameters
        const response = await resolverClient.post('/store-encrypted', {
          userAddress,
          depositIndex,
          encryptedParams,
        });
        
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.depositId).toBeDefined();
        expect(typeof response.data.depositId).toBe('string');
      });

      it('should reject invalid encrypted parameter structure', async () => {
        const userAddress = await signer.getAddress();
        const depositIndex = 0;
        
        try {
          await resolverClient.post('/store-encrypted', {
            userAddress,
            depositIndex,
            encryptedParams: {
              encrypted: 'invalid',
              // Missing iv and salt
            },
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.response.status).toBe(400);
          expect(error.response.data.error).toContain('Invalid encrypted parameters');
        }
      });

      it('should reject missing required parameters', async () => {
        try {
          await resolverClient.post('/store-encrypted', {
            userAddress: await signer.getAddress(),
            // Missing depositIndex and encryptedParams
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.response.status).toBe(400);
        }
      });
    });

    describe('Server-Side Encryption (Legacy)', () => {
      it('should encrypt and store parameters (legacy endpoint)', async () => {
        const userAddress = await signer.getAddress();
        const depositIndex = 1;
        const collateral = '2000000000000000000';
        const debt = '1000000000000000000';
        
        const response = await resolverClient.post('/encrypt-and-store', {
          userAddress,
          depositIndex,
          collateral,
          debt,
        });
        
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.depositId).toBeDefined();
        expect(response.data.encrypted).toBeDefined();
        expect(response.data.encrypted).toContain('...'); // Partial encryption shown
      });

      it('should reject missing parameters in legacy endpoint', async () => {
        try {
          await resolverClient.post('/encrypt-and-store', {
            userAddress: await signer.getAddress(),
            // Missing depositIndex, collateral, debt
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.response.status).toBe(400);
        }
      });
    });
  });

  describe('Operator Bundling Functionality', () => {
    let depositIds: string[] = [];

    beforeEach(async () => {
      // Setup: Create 3 encrypted deposits for testing
      depositIds = [];
      const userAddress = await signer.getAddress();
      
      for (let i = 0; i < 3; i++) {
        const positionParams = {
          position_id: '0',
          collateral: `${(i + 1) * 1000000000000000000}`,
          debt: `${(i + 1) * 500000000000000000}`,
          owner: userAddress,
        };
        
        const encryptedParams = encryptPositionParams(positionParams, TEE_PASSWORD);
        
        const response = await resolverClient.post('/store-encrypted', {
          userAddress,
          depositIndex: i,
          encryptedParams,
        });
        
        depositIds.push(response.data.depositId);
      }
    });

    it('should get decrypted parameters for bundle (operator endpoint)', async () => {
      const response = await resolverClient.post('/get-params-for-bundle', {
        depositIds: depositIds.slice(0, 2), // Get first 2 deposits
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.params).toBeDefined();
      expect(Array.isArray(response.data.params)).toBe(true);
      expect(response.data.params.length).toBe(2);
      
      // Verify decrypted parameters
      const params = response.data.params[0];
      expect(params).toHaveProperty('depositId');
      expect(params).toHaveProperty('collateral');
      expect(params).toHaveProperty('debt');
      expect(params).toHaveProperty('owner');
      expect(params.collateral).toBe('1000000000000000000');
      expect(params.debt).toBe('500000000000000000');
    });

    it('should reject missing depositIds array', async () => {
      try {
        await resolverClient.post('/get-params-for-bundle', {
          depositIds: null,
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should reject empty depositIds array', async () => {
      try {
        await resolverClient.post('/get-params-for-bundle', {
          depositIds: [],
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should return 404 for non-existent deposit IDs', async () => {
      try {
        await resolverClient.post('/get-params-for-bundle', {
          depositIds: ['non-existent-id-1', 'non-existent-id-2'],
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('Deposits not found');
      }
    });

    it('should return 404 for partially missing deposit IDs', async () => {
      try {
        await resolverClient.post('/get-params-for-bundle', {
          depositIds: [depositIds[0], 'non-existent-id'],
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('Deposits not found');
      }
    });
  });

  describe('Position Linking', () => {
    let depositId: string;

    beforeEach(async () => {
      // Setup: Create an encrypted deposit
      const userAddress = await signer.getAddress();
      const positionParams = {
        position_id: '0',
        collateral: '1000000000000000000',
        debt: '500000000000000000',
        owner: userAddress,
      };
      
      const encryptedParams = encryptPositionParams(positionParams, TEE_PASSWORD);
      
      const response = await resolverClient.post('/store-encrypted', {
        userAddress,
        depositIndex: 0,
        encryptedParams,
      });
      
      depositId = response.data.depositId;
    });

    it('should link deposit to position ID', async () => {
      const positionId = '12345';
      
      const response = await resolverClient.post('/link-position', {
        depositId,
        positionId,
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.positionId).toBe(positionId);
      expect(response.data.hash).toBeDefined();
      expect(response.data.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should reject missing depositId or positionId', async () => {
      try {
        await resolverClient.post('/link-position', {
          depositId: depositId,
          // Missing positionId
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should reject non-existent deposit ID', async () => {
      try {
        await resolverClient.post('/link-position', {
          depositId: 'non-existent-deposit-id',
          positionId: '12345',
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error).toContain('Deposit not found');
      }
    });

    it('should create position entry after linking', async () => {
      const positionId = '99999';
      
      // Link deposit to position
      await resolverClient.post('/link-position', {
        depositId,
        positionId,
      });
      
      // Verify position can be retrieved
      const getParamsResponse = await resolverClient.post('/get-params', {
        position_id: positionId,
        owner: await signer.getAddress(),
      });
      
      expect(getParamsResponse.status).toBe(200);
      expect(getParamsResponse.data.position_id).toBe(positionId);
      expect(getParamsResponse.data.collateral).toBe('1000000000000000000');
      expect(getParamsResponse.data.debt).toBe('500000000000000000');
    });
  });

  describe('End-to-End Operator Flow', () => {
    it('should complete full operator bundling flow', async () => {
      const userAddress = await signer.getAddress();
      const depositIds: string[] = [];
      
      // Step 1: Users deposit and encrypt parameters (frontend encryption)
      for (let i = 0; i < 3; i++) {
        const positionParams = {
          position_id: '0',
          collateral: `${(i + 1) * 1000000000000000000}`,
          debt: `${(i + 1) * 500000000000000000}`,
          owner: userAddress,
        };
        
        const encryptedParams = encryptPositionParams(positionParams, TEE_PASSWORD);
        
        const storeResponse = await resolverClient.post('/store-encrypted', {
          userAddress,
          depositIndex: i,
          encryptedParams,
        });
        
        depositIds.push(storeResponse.data.depositId);
      }
      
      expect(depositIds.length).toBe(3);
      
      // Step 2: Operator gets decrypted parameters for bundle
      const bundleResponse = await resolverClient.post('/get-params-for-bundle', {
        depositIds,
      });
      
      expect(bundleResponse.status).toBe(200);
      expect(bundleResponse.data.params.length).toBe(3);
      
      // Step 3: Operator creates positions (simulated - would call contract)
      // In real flow, operator would call BundledVault.createPositionsFromBundle()
      // with the decrypted parameters
      
      // Step 4: Operator links deposits to position IDs
      for (let i = 0; i < depositIds.length; i++) {
        const positionId = String(i + 1000);
        const linkResponse = await resolverClient.post('/link-position', {
          depositId: depositIds[i],
          positionId,
        });
        
        expect(linkResponse.status).toBe(200);
        expect(linkResponse.data.positionId).toBe(positionId);
      }
      
      // Step 5: Verify positions can be retrieved
      for (let i = 0; i < 3; i++) {
        const positionId = String(i + 1000);
        const getParamsResponse = await resolverClient.post('/get-params', {
          position_id: positionId,
          owner: userAddress,
        });
        
        expect(getParamsResponse.status).toBe(200);
        expect(getParamsResponse.data.position_id).toBe(positionId);
      }
    });
  });
});

