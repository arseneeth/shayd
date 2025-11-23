/**
 * Resolver Service - ROFL TEE Operations Only
 * 
 * This service provides:
 * 1. ROFL TEE position parameter hashing
 * 2. Position parameter encryption and storage
 * 3. Position parameter retrieval for withdrawals
 * 
 * NOTE: Keeper functionality (price monitoring, liquidation execution) has been moved
 * to a separate keeper service following ROFL best practices.
 * The resolver now focuses solely on TEE operations.
 */

import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import { PoolManager } from './types';
import { hashPositionParams, PositionParams } from './hashing';
import { encryptPositionParams, decryptPositionParams, EncryptedParams, generateDepositId } from './encryption';
import { PersistentStorage } from './storage';

// NOTE: Position and LiquidationParams interfaces moved to keeper service
// Resolver now focuses only on TEE operations

export interface StoredPositionParams {
  positionId: string;
  collateral: string;
  debt: string;
  owner: string;
  hash: string;
  timestamp: number;
  pool?: string; // Pool address for position
}

export interface EncryptedDepositParams {
  depositId: string;
  userAddress: string;
  depositIndex: number;
  encryptedParams: EncryptedParams;
  timestamp: number;
}

// NOTE: PositionHealth interface moved to keeper service
// Resolver no longer performs health checks - that's the keeper's responsibility

export class ResolverService {
  private app: express.Application;
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private vaultContract: ethers.Contract | null = null;
  private server: any = null;
  
  // Persistent storage for all parameters (SQLite database)
  private storage: PersistentStorage;
  
  // TEE encryption password (in production, this would be a secure key management system)
  private teeEncryptionPassword: string;

  constructor(
    rpcUrl: string,
    privateKey: string,
    vaultAddress?: string,
    teePassword?: string,
    dbPath?: string
  ) {
    this.app = express();
    this.app.use(express.json());
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    
    // Initialize persistent storage
    const storagePath = dbPath || process.env.DB_PATH || './tee-storage.db';
    this.storage = new PersistentStorage(storagePath);
    console.log(`Initialized persistent storage at: ${storagePath}`);
    
    // TEE encryption password (in production, this would come from secure key management)
    this.teeEncryptionPassword = teePassword || process.env.TEE_ENCRYPTION_PASSWORD || 'default-tee-password-change-in-production';
    
    if (vaultAddress) {
      // Load BundledVault ABI (simplified - in production, load from actual ABI file)
      const vaultABI = [
        "event Deposit(address indexed user, uint256 amount, uint256 depositIndex)",
        "event BundleReady(uint256 indexed bundleId, uint256 totalAmount, uint256 positionCount)",
        "event PositionsOpened(uint256 indexed bundleId, uint256[] positionIds)",
        "event PositionCreated(uint256 indexed positionId, address indexed owner)"
      ];
      this.vaultContract = new ethers.Contract(
        vaultAddress,
        vaultABI,
        this.provider
      );
    }
    
    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // ROFL TEE endpoint: Hash position parameters
    this.app.post('/hash', async (req: Request, res: Response) => {
      try {
        const params: PositionParams = req.body;
        
        // Validate parameters
        if (!params.position_id || !params.collateral || !params.debt || !params.owner) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        if (!params.owner || params.owner.length === 0) {
          return res.status(400).json({ error: 'Owner address cannot be empty' });
        }
        
        // Hash the position parameters
        const hash = hashPositionParams(params);
        
        res.json({
          hash,
          position_id: params.position_id,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Store position parameters (hashed) - called when positions are opened
    this.app.post('/store', async (req: Request, res: Response) => {
      try {
        const params: PositionParams = req.body;
        
        // Validate parameters
        if (!params.position_id || !params.collateral || !params.debt || !params.owner) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        if (!params.owner || params.owner.length === 0) {
          return res.status(400).json({ error: 'Owner address cannot be empty' });
        }
        
        // Hash the position parameters
        const hash = hashPositionParams(params);
        
        // Store the position parameters (hashed)
        const stored: StoredPositionParams = {
          positionId: params.position_id,
          collateral: params.collateral,
          debt: params.debt,
          owner: params.owner,
          hash: hash,
          timestamp: Date.now(),
        };
        
        this.storage.storePosition(stored);
        
        res.json({
          success: true,
          position_id: params.position_id,
          hash: hash,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get position parameters for withdrawal - user requests their position params
    // TEE checks position health and determines if collateral takeover is needed
    this.app.post('/get-params', async (req: Request, res: Response) => {
      try {
        const { position_id, owner } = req.body;
        
        if (!position_id || !owner) {
          return res.status(400).json({ error: 'Missing position_id or owner' });
        }
        
        // Retrieve stored position parameters
        const stored = this.storage.getPosition(position_id);
        
        if (!stored) {
          return res.status(404).json({ error: 'Position not found' });
        }
        
        // Verify the owner matches (in production, this would be more secure)
        if (stored.owner.toLowerCase() !== owner.toLowerCase()) {
          return res.status(403).json({ error: 'Unauthorized: position owner mismatch' });
        }
        
        // NOTE: Position health checks are now handled by the keeper service
        // The resolver only returns stored position parameters
        // Health monitoring and liquidation execution are separate keeper responsibilities
        
        // Return position parameters
        res.json({
          position_id: stored.positionId,
          collateral: stored.collateral,
          debt: stored.debt,
          owner: stored.owner,
          hash: stored.hash,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Store encrypted position parameters (called when user deposits)
    // Frontend encrypts parameters BEFORE sending to resolver (privacy-first)
    // Resolver only receives already-encrypted data and stores it
    this.app.post('/store-encrypted', async (req: Request, res: Response) => {
      try {
        const { userAddress, depositIndex, encryptedParams } = req.body;
        
        if (!userAddress || depositIndex === undefined || !encryptedParams) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Validate encrypted params structure
        if (!encryptedParams || typeof encryptedParams !== 'object') {
          return res.status(400).json({ error: 'Invalid encrypted parameters: must be an object' });
        }
        
        if (!encryptedParams.encrypted || typeof encryptedParams.encrypted !== 'string') {
          return res.status(400).json({ error: 'Invalid encrypted parameters: missing or invalid encrypted field' });
        }
        
        if (!encryptedParams.iv || typeof encryptedParams.iv !== 'string') {
          return res.status(400).json({ error: 'Invalid encrypted parameters: missing or invalid IV field' });
        }
        
        if (!encryptedParams.salt || typeof encryptedParams.salt !== 'string') {
          return res.status(400).json({ error: 'Invalid encrypted parameters: missing or invalid salt field' });
        }
        
        // Validate encrypted data format (should contain ':' separator for auth tag)
        if (!encryptedParams.encrypted.includes(':')) {
          return res.status(400).json({ error: 'Invalid encrypted parameters: encrypted data must include authentication tag' });
        }
        
        // Generate deposit ID
        const depositId = generateDepositId(userAddress, depositIndex, Date.now());
        
        // Store encrypted parameters (already encrypted by frontend)
        const stored: EncryptedDepositParams = {
          depositId,
          userAddress,
          depositIndex,
          encryptedParams: encryptedParams as EncryptedParams,
          timestamp: Date.now(),
        };
        
        this.storage.storeEncryptedDeposit(stored);
        
        res.json({
          success: true,
          depositId,
          message: 'Encrypted parameters stored successfully',
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Legacy endpoint: Encrypt and store (for backward compatibility)
    // NOTE: This endpoint sees plaintext - use /store-encrypted for better privacy
    this.app.post('/encrypt-and-store', async (req: Request, res: Response) => {
      try {
        const { userAddress, depositIndex, collateral, debt } = req.body;
        
        if (!userAddress || depositIndex === undefined || !collateral || !debt) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Create position params (position_id will be set later when position is created)
        const params: PositionParams = {
          position_id: '0', // Will be updated when position is created
          collateral: collateral.toString(),
          debt: debt.toString(),
          owner: userAddress,
        };
        
        // Encrypt parameters using TEE encryption
        const encrypted = encryptPositionParams(params, this.teeEncryptionPassword);
        
        // Generate deposit ID
        const depositId = generateDepositId(userAddress, depositIndex, Date.now());
        
        // Store encrypted parameters
        const stored: EncryptedDepositParams = {
          depositId,
          userAddress,
          depositIndex,
          encryptedParams: encrypted,
          timestamp: Date.now(),
        };
        
        this.storage.storeEncryptedDeposit(stored);
        
        res.json({
          success: true,
          depositId,
          // Return encrypted params to user (they can verify encryption worked)
          encrypted: encrypted.encrypted.substring(0, 20) + '...', // Partial for verification only
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get decrypted parameters for position creation (called by operator when bundling)
    // Only returns parameters for specific deposit indices
    this.app.post('/get-params-for-bundle', async (req: Request, res: Response) => {
      try {
        const { depositIds } = req.body;
        
        if (!depositIds || !Array.isArray(depositIds) || depositIds.length === 0) {
          return res.status(400).json({ error: 'Missing or invalid depositIds array' });
        }
        
        // Get all encrypted deposits at once
        const storedDeposits = this.storage.getEncryptedDeposits(depositIds);
        
        if (storedDeposits.length !== depositIds.length) {
          const foundIds = new Set(storedDeposits.map(d => d.depositId));
          const missingIds = depositIds.filter(id => !foundIds.has(id));
          return res.status(404).json({ error: `Deposits not found: ${missingIds.join(', ')}` });
        }
        
        const decryptedParams: Array<{ depositId: string; collateral: string; debt: string; owner: string }> = [];
        
        for (const stored of storedDeposits) {
          // Validate encrypted params structure before decrypting
          if (!stored.encryptedParams || !stored.encryptedParams.encrypted || !stored.encryptedParams.iv || !stored.encryptedParams.salt) {
            throw new Error(`Invalid encrypted parameters for deposit ${stored.depositId}: missing required fields`);
          }
          
          // Decrypt parameters
          const params = decryptPositionParams(stored.encryptedParams, this.teeEncryptionPassword);
          
          decryptedParams.push({
            depositId: stored.depositId,
            collateral: params.collateral,
            debt: params.debt,
            owner: params.owner,
          });
        }
        
        res.json({
          success: true,
          params: decryptedParams,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Update position ID after position is created (links deposit to position)
    this.app.post('/link-position', async (req: Request, res: Response) => {
      try {
        const { depositId, positionId } = req.body;
        
        if (!depositId || !positionId) {
          return res.status(400).json({ error: 'Missing depositId or positionId' });
        }
        
        const stored = this.storage.getEncryptedDeposit(depositId);
        
        if (!stored) {
          return res.status(404).json({ error: 'Deposit not found' });
        }
        
        // Validate encrypted params structure
        if (!stored.encryptedParams || !stored.encryptedParams.encrypted || !stored.encryptedParams.iv || !stored.encryptedParams.salt) {
          return res.status(500).json({ error: 'Invalid encrypted parameters: missing required fields' });
        }
        
        // Decrypt to get original params
        const params = decryptPositionParams(stored.encryptedParams, this.teeEncryptionPassword);
        
        // Update position ID
        params.position_id = positionId.toString();
        
        // Hash and store final position parameters
        const hash = hashPositionParams(params);
        
        // Get pool address from environment or vault contract
        const poolAddress = process.env.POOL_ADDRESS || '';
        
        const positionParams: StoredPositionParams = {
          positionId: positionId.toString(),
          collateral: params.collateral,
          debt: params.debt,
          owner: params.owner,
          hash: hash,
          timestamp: Date.now(),
          pool: poolAddress, // Store pool address for monitoring
        };
        
        this.storage.storePosition(positionParams);
        
        // Remove from encrypted deposit storage (moved to position storage)
        this.storage.deleteEncryptedDeposit(depositId);
        
        res.json({
          success: true,
          positionId: positionId.toString(),
          hash,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.send('OK');
    });
    
    // Stats endpoint - show storage statistics
    this.app.get('/stats', (req: Request, res: Response) => {
      try {
        const stats = this.storage.getStats();
        res.json({
          success: true,
          stats,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Start the HTTP server
   */
  async startServer(port: number = 3001): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`Resolver service listening on port ${port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stopServer(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Resolver service stopped');
          // Close storage connection
          this.storage.close();
          resolve();
        });
      });
    } else {
      // Close storage if server wasn't running
      this.storage.close();
    }
  }

  /**
   * Start listening to PositionCreated events from vault
   * Links position IDs to encrypted deposit parameters
   */
  async startEventListening(): Promise<void> {
    if (!this.vaultContract) {
      console.warn('Vault contract not configured, skipping event listening');
      return;
    }

    console.log('Starting event listener for PositionCreated...');

    // Listen to PositionCreated events (no parameters exposed)
    this.vaultContract.on('PositionCreated', async (
      positionId: bigint,
      owner: string,
      event: any
    ) => {
      try {
        console.log(`Received PositionCreated event for position ${positionId}, owner ${owner}`);
        
        // The operator should have already linked this position via /link-position endpoint
        // This event listener is just for monitoring/verification
        // The actual linking happens when operator calls /link-position with depositId and positionId
      } catch (error) {
        console.error(`Error processing PositionCreated event:`, error);
      }
    });

    console.log('Event listener started');
  }

  /**
   * Stop listening to events
   */
  stopEventListening(): void {
    if (this.vaultContract) {
      this.vaultContract.removeAllListeners('PositionCreated');
      console.log('Stopped event listening');
    }
  }
}

// Helper function to load Vault address from deployment file or env
function loadVaultAddress(): string | undefined {
  // First try environment variable
  if (process.env.VAULT_ADDRESS) {
    return process.env.VAULT_ADDRESS;
  }

  // Try to load from deployment file
  try {
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = path.join(__dirname, '../scaffold/packages/foundry/deployments/bundled-vault-31337.json');
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      if (deployment.bundledVault) {
        return deployment.bundledVault;
      }
    }
  } catch (error) {
    // Ignore errors, fall back to undefined
  }

  return undefined;
}

// Example usage
if (require.main === module) {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const privateKey = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001'; // Dummy key for hashing-only mode
  const vaultAddress = loadVaultAddress();
  const port = parseInt(process.env.PORT || '3001', 10);

  const resolver = new ResolverService(
    rpcUrl,
    privateKey,
    vaultAddress
  );

  // Start HTTP server (hashing endpoint works without pool manager)
  resolver.startServer(port).then(async () => {
    console.log('Resolver service started. ROFL TEE hashing endpoint available at /hash');
    console.log('NOTE: Keeper functionality (price monitoring, liquidation) is handled by separate keeper service');
    
    // Start event listening if vault is configured
    if (vaultAddress) {
      await resolver.startEventListening();
      console.log('Event listening started for PositionCreated events');
    } else {
      console.log('Event listening disabled (VAULT_ADDRESS not set)');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down resolver...');
    resolver.stopEventListening();
    await resolver.stopServer();
    process.exit(0);
  });
}

