/**
 * Resolver Service - Combined ROFL TEE and Liquidation Execution
 * 
 * This service provides:
 * 1. ROFL TEE position parameter hashing
 * 2. Position monitoring and liquidation execution
 */

import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import { PoolManager } from './types';
import { hashPositionParams, PositionParams } from './hashing';
import { encryptPositionParams, decryptPositionParams, EncryptedParams, generateDepositId } from './encryption';
import { PersistentStorage } from './storage';

interface Position {
  positionId: number;
  pool: string;
  owner: string;
  rawColls: bigint;
  rawDebts: bigint;
  debtRatio: bigint;
  lastChecked: number; // Timestamp of last health check
  isNearLiquidation: boolean; // True if position is near liquidation threshold
}

interface LiquidationParams {
  pool: string;
  receiver: string;
  maxFxUSD: bigint;
  maxStable: bigint;
}

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

export interface PositionHealth {
  positionId: string;
  debtRatio: bigint;
  liquidationThreshold: bigint;
  isNearLiquidation: boolean;
  teeCollateralTakeover: bigint; // Amount TEE should take if withdrawing near liquidation
}

export class ResolverService {
  private app: express.Application;
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private poolManager: ethers.Contract | null = null;
  private vaultContract: ethers.Contract | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private liquidationThreshold: bigint;
  private server: any = null;
  
  // Persistent storage for all parameters (SQLite database)
  private storage: PersistentStorage;
  
  // TEE encryption password (in production, this would be a secure key management system)
  private teeEncryptionPassword: string;

  constructor(
    rpcUrl: string,
    privateKey: string,
    poolManagerAddress?: string,
    vaultAddress?: string,
    liquidationThreshold: bigint = ethers.parseUnits('1.0', 18), // 1.0 = 100% debt ratio threshold
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
    
    if (poolManagerAddress) {
      this.poolManager = new ethers.Contract(
        poolManagerAddress,
        PoolManager.abi,
        this.signer
      );
    }
    
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
    
    this.liquidationThreshold = liquidationThreshold;
    
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
        
        // TEE checks position health - monitor individual position
        // If health check fails (e.g., pool not available), return default values
        let health: PositionHealth;
        try {
          health = await this.checkPositionHealth(position_id, stored.pool || process.env.POOL_ADDRESS || '');
        } catch (error) {
          // If health check fails, return default (healthy position)
          console.warn(`Health check failed for position ${position_id}:`, error);
          health = {
            positionId: position_id,
            debtRatio: 0n,
            liquidationThreshold: 0n,
            isNearLiquidation: false,
            teeCollateralTakeover: 0n,
          };
        }
        
        // Calculate TEE collateral takeover if position is near liquidation
        let teeCollateralTakeover = '0';
        if (health.isNearLiquidation) {
          // TEE takes 20% of collateral to protect against liquidation
          // This is a soft liquidation - position remains open but TEE takes part
          const collateralAmount = BigInt(stored.collateral);
          teeCollateralTakeover = (collateralAmount * BigInt(20) / BigInt(100)).toString();
        }
        
        // Return position parameters with health status
        res.json({
          position_id: stored.positionId,
          collateral: stored.collateral,
          debt: stored.debt,
          owner: stored.owner,
          hash: stored.hash,
          teeCollateralTakeover, // Amount TEE will take if position is near liquidation
          isNearLiquidation: health.isNearLiquidation,
          debtRatio: health.debtRatio.toString(),
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
      this.vaultContract.removeAllListeners('PositionParamsForStorage');
      console.log('Stopped event listening');
    }
  }

  /**
   * Start monitoring positions for liquidation conditions
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (!this.poolManager) {
      console.warn('Pool Manager not configured, skipping position monitoring');
      return;
    }
    
    console.log('Starting position monitoring...');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkAndLiquidate();
      } catch (error) {
        console.error('Error during monitoring cycle:', error);
      }
    }, intervalMs);

    // Run initial check
    await this.checkAndLiquidate();
  }

  /**
   * Stop monitoring positions
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Stopped position monitoring');
    }
    this.stopEventListening();
  }

  /**
   * Check positions and execute liquidations if needed
   * TEE monitors individual positions, not total bundle
   */
  async checkAndLiquidate(): Promise<void> {
    console.log('TEE checking individual positions for health...');
    
    // Monitor all stored positions (TEE holds all state)
    await this.monitorAllPositions();
    
    // Also check for liquidatable positions in pools (legacy support)
    const pools = await this.getRegisteredPools();
    
    for (const pool of pools) {
      try {
        const positions = await this.getLiquidatablePositions(pool);
        
        for (const position of positions) {
          // Only execute if not already handled by monitorAllPositions
          const health = this.storage.getPositionHealth(position.positionId.toString());
          if (!health || !health.isNearLiquidation) {
            console.log(`Liquidating position ${position.positionId} in pool ${pool}`);
            await this.executeLiquidation(position);
          }
        }
      } catch (error) {
        console.error(`Error processing pool ${pool}:`, error);
      }
    }
  }

  /**
   * Get registered pools from Pool Manager
   * Tracks pools by listening to RegisterPool events or from configuration
   */
  async getRegisteredPools(): Promise<string[]> {
    if (!this.poolManager) {
      return [];
    }

    // Try to get pools from PoolConfiguration registry
    try {
      // Get configuration address from pool manager
      const configAddress = await (this.poolManager as any).configuration();
      if (configAddress && typeof configAddress === 'string') {
        // Pool address is typically stored in registry or passed as parameter
        // For now, we'll track pools from events or use a known pool address
        // In production, you'd query the registry or maintain a list from events
        const poolAddress = process.env.POOL_ADDRESS;
        if (poolAddress) {
          return [poolAddress];
        }
      }
    } catch (error) {
      console.warn('Error getting pools from configuration:', error);
    }

    // Fallback: return pool from environment or empty array
    const poolAddress = process.env.POOL_ADDRESS;
    return poolAddress ? [poolAddress] : [];
  }

  /**
   * Get positions that need liquidation in a pool
   * Checks debt ratios against liquidation threshold (soft liquidation only)
   */
  async getLiquidatablePositions(pool: string): Promise<Position[]> {
    const liquidatablePositions: Position[] = [];
    
    if (!this.provider) {
      return liquidatablePositions;
    }

    try {
      // Get liquidation threshold from pool
      const poolContract = new ethers.Contract(
        pool,
        [
          'function getLiquidateRatios() external view returns (uint256 debtRatio, uint256 bonusRatio)',
          'function getPositionDebtRatio(uint256 tokenId) external view returns (uint256 debtRatio)',
          'function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts)',
          'function totalSupply() external view returns (uint256)',
          'function ownerOf(uint256 tokenId) external view returns (address)',
        ],
        this.provider
      );

      // Get liquidation threshold
      const [liquidationDebtRatio] = await poolContract.getLiquidateRatios();
      
      // Get total positions (assuming ERC721 token IDs)
      const totalSupply = await poolContract.totalSupply();
      
      // Check each position
      for (let i = 1; i <= Number(totalSupply); i++) {
        try {
          // Get position debt ratio
          const positionDebtRatio = await poolContract.getPositionDebtRatio(i);
          
          // Check if position exceeds liquidation threshold (soft liquidation)
          // Soft liquidation: position is liquidatable if debt ratio >= liquidation threshold
          if (positionDebtRatio >= liquidationDebtRatio) {
            // Get position details
            const [rawColls, rawDebts] = await poolContract.getPosition(i);
            const owner = await poolContract.ownerOf(i);
            
            liquidatablePositions.push({
              positionId: i,
              pool: pool,
              owner: owner,
              rawColls: rawColls,
              rawDebts: rawDebts,
              debtRatio: positionDebtRatio,
              lastChecked: Date.now(),
              isNearLiquidation: true,
            });
          }
        } catch (error) {
          // Position might not exist or be invalid, skip
          continue;
        }
      }
    } catch (error) {
      console.error(`Error querying liquidatable positions for pool ${pool}:`, error);
    }
    
    return liquidatablePositions;
  }

  /**
   * Execute soft liquidation for a position
   * Soft liquidations partially liquidate positions to restore health, never fully close them
   */
  async executeLiquidation(position: Position): Promise<void> {
    if (!this.poolManager) {
      throw new Error('Pool Manager not configured');
    }
    
    try {
      const params = await this.calculateLiquidationParams(position);
      
      // Execute soft liquidation via Pool Manager
      // Soft liquidation: only liquidates enough to restore position health, not fully close
      const tx = await this.poolManager.liquidate(
        position.pool,
        params.receiver,
        params.maxFxUSD,
        params.maxStable,
        { gasLimit: 500000 } // Adjust gas limit as needed
      );

      console.log(`Soft liquidation transaction submitted for position ${position.positionId}: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Soft liquidation confirmed in block ${receipt.blockNumber} for position ${position.positionId}`);
      
      // Log liquidation details
      if (this.poolManager) {
        const poolManagerAddress = await this.poolManager.getAddress();
        const logs = await this.provider.getLogs({
          address: poolManagerAddress,
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
        });
      }
      
      console.log(`Soft liquidation executed - position ${position.positionId} partially liquidated`);
      
    } catch (error) {
      console.error(`Failed to liquidate position ${position.positionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate liquidation parameters for soft liquidation
   * Soft liquidation: only liquidates enough to restore position health, not fully close
   */
  async calculateLiquidationParams(position: Position): Promise<LiquidationParams> {
    // For soft liquidation, we only liquidate enough to restore health
    // Calculate the amount needed to bring debt ratio below threshold
    // This is a partial liquidation, not a full close
    
    // Get pool liquidation threshold
    const poolContract = new ethers.Contract(
      position.pool,
      ['function getLiquidateRatios() external view returns (uint256 debtRatio, uint256 bonusRatio)'],
      this.provider
    );
    
    const [liquidationDebtRatio] = await poolContract.getLiquidateRatios();
    
    // Calculate how much debt to liquidate to restore health
    // Target: bring debt ratio below liquidation threshold
    // We'll liquidate a portion of the debt (e.g., 50% or enough to restore health)
    const liquidationPercentage = 50n; // 50% for soft liquidation
    const maxRawDebts = (position.rawDebts * liquidationPercentage) / 100n;
    
    // Ensure we liquidate at least the minimum required
    const MIN_LIQUIDATE_DEBTS = ethers.parseUnits('1', 18); // Minimum liquidation amount
    const maxRawDebtsToLiquidate = maxRawDebts > MIN_LIQUIDATE_DEBTS ? maxRawDebts : MIN_LIQUIDATE_DEBTS;
    
    // For long pools, split between fxUSD and stable (USDC)
    // For now, use all fxUSD - adjust based on pool configuration
    const maxFxUSD = maxRawDebtsToLiquidate;
    const maxStable = 0n;
    
    // Receiver is typically the resolver service address or a fee recipient
    const receiver = await this.signer.getAddress();
    
    return {
      pool: position.pool,
      receiver,
      maxFxUSD,
      maxStable,
    };
  }

  /**
   * Get position debt ratio
   */
  async getPositionDebtRatio(pool: string, positionId: number): Promise<bigint> {
    if (!this.provider) {
      return 0n;
    }
    
    try {
      const poolContract = new ethers.Contract(
        pool,
        ['function getPositionDebtRatio(uint256 tokenId) external view returns (uint256 debtRatio)'],
        this.provider
      );
      
      const debtRatio = await poolContract.getPositionDebtRatio(positionId);
      return BigInt(debtRatio.toString());
    } catch (error) {
      console.error(`Error getting position debt ratio for position ${positionId}:`, error);
      return 0n;
    }
  }

  /**
   * Check position health - TEE monitors individual positions
   * Returns health status including liquidation proximity
   */
  async checkPositionHealth(positionId: string, pool: string): Promise<PositionHealth> {
    if (!this.provider || !pool) {
      return {
        positionId,
        debtRatio: 0n,
        liquidationThreshold: 0n,
        isNearLiquidation: false,
        teeCollateralTakeover: 0n,
      };
    }

    try {
      const poolContract = new ethers.Contract(
        pool,
        [
          'function getPositionDebtRatio(uint256 tokenId) external view returns (uint256 debtRatio)',
          'function getLiquidateRatios() external view returns (uint256 debtRatio, uint256 bonusRatio)',
          'function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts)',
        ],
        this.provider
      );

      // Get current debt ratio
      const debtRatio = BigInt((await poolContract.getPositionDebtRatio(positionId)).toString());
      
      // Get liquidation threshold
      const [liquidationDebtRatio] = await poolContract.getLiquidateRatios();
      const threshold = BigInt(liquidationDebtRatio.toString());
      
      // Check if position is near liquidation (within 5% of threshold)
      // TEE monitors individual positions, not the total bundle
      const nearLiquidationBuffer = (threshold * BigInt(95)) / BigInt(100); // 95% of liquidation threshold
      const isNearLiquidation = debtRatio >= nearLiquidationBuffer;
      
      // Calculate TEE collateral takeover if near liquidation
      let teeCollateralTakeover = 0n;
      if (isNearLiquidation) {
        const [rawColls] = await poolContract.getPosition(positionId);
        const collateral = BigInt(rawColls.toString());
        // TEE takes 20% of collateral as soft liquidation protection
        teeCollateralTakeover = (collateral * BigInt(20)) / BigInt(100);
      }

      // Store health status in TEE
      const health: PositionHealth = {
        positionId,
        debtRatio,
        liquidationThreshold: threshold,
        isNearLiquidation,
        teeCollateralTakeover,
      };
      
      this.storage.storePositionHealth(health);

      return health;
    } catch (error) {
      console.error(`Error checking position health for position ${positionId}:`, error);
      // Return default health status (position is healthy)
      return {
        positionId,
        debtRatio: 0n,
        liquidationThreshold: 0n,
        isNearLiquidation: false,
        teeCollateralTakeover: 0n,
      };
    }
  }

  /**
   * Monitor all positions and update health status
   * TEE holds all state and monitors individual positions
   */
  async monitorAllPositions(): Promise<void> {
    console.log('TEE monitoring all positions for health...');
    
    // Get all stored positions
    const allPositions = this.storage.getAllPositions();
    for (const stored of allPositions) {
      try {
        const pool = stored.pool || process.env.POOL_ADDRESS || '';
        if (!pool) continue;
        
        // Check position health
        await this.checkPositionHealth(stored.positionId, pool);
        
        // If position is near liquidation, execute soft liquidation
        const health = this.storage.getPositionHealth(stored.positionId);
        if (health && health.isNearLiquidation) {
          console.log(`Position ${stored.positionId} is near liquidation - executing soft liquidation`);
          
          // Get position details for liquidation
          const poolContract = new ethers.Contract(
            pool,
            ['function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts)'],
            this.provider
          );
          
          const [rawColls, rawDebts] = await poolContract.getPosition(parseInt(stored.positionId));
          
          // Execute soft liquidation via vault contract
          if (this.vaultContract) {
            // Calculate liquidation amounts (20% of position)
            const maxFxUSD = (BigInt(rawDebts.toString()) * 20n / 100n).toString();
            const maxStable = '0';
            
            try {
              const tx = await this.vaultContract.executeSoftLiquidation(
                stored.positionId,
                maxFxUSD,
                maxStable,
                { gasLimit: 500000 }
              );
              
              console.log(`Soft liquidation transaction submitted for position ${stored.positionId}: ${tx.hash}`);
              await tx.wait();
              console.log(`Soft liquidation executed for position ${stored.positionId}`);
            } catch (error) {
              console.error(`Failed to execute soft liquidation for position ${stored.positionId}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error monitoring position ${stored.positionId}:`, error);
      }
    }
  }
}

// Helper function to load PoolManager address from deployment file
function loadPoolManagerAddress(): string | undefined {
  // First try environment variable
  if (process.env.POOL_MANAGER_ADDRESS) {
    return process.env.POOL_MANAGER_ADDRESS;
  }

  // Try to load from deployment file
  try {
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = path.join(__dirname, '../scaffold/packages/foundry/deployments/pool-manager-31337.json');
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      if (deployment.poolManager) {
        return deployment.poolManager;
      }
    }
  } catch (error) {
    // Ignore errors, fall back to undefined
  }

  return undefined;
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
  const poolManagerAddress = loadPoolManagerAddress();
  const vaultAddress = loadVaultAddress();
  const liquidationThreshold = process.env.LIQUIDATION_THRESHOLD 
    ? BigInt(process.env.LIQUIDATION_THRESHOLD) 
    : ethers.parseUnits('1.0', 18);
  const port = parseInt(process.env.PORT || '3001', 10);

  // Only require private key if pool manager is configured (for liquidations)
  if (poolManagerAddress && !process.env.PRIVATE_KEY) {
    console.error('Missing required environment variable: PRIVATE_KEY (required when POOL_MANAGER_ADDRESS is set)');
    process.exit(1);
  }

  const resolver = new ResolverService(
    rpcUrl,
    privateKey,
    poolManagerAddress,
    vaultAddress,
    liquidationThreshold
  );

  // Start HTTP server (hashing endpoint works without pool manager)
  resolver.startServer(port).then(async () => {
    console.log('Resolver service started. ROFL TEE hashing endpoint available at /hash');
    
    // Start event listening if vault is configured
    if (vaultAddress) {
      await resolver.startEventListening();
      console.log('Event listening started for PositionParamsForStorage events');
    } else {
      console.log('Event listening disabled (VAULT_ADDRESS not set)');
    }
    
    // Start monitoring if pool manager is configured
    if (poolManagerAddress) {
      resolver.startMonitoring(30000); // Check every 30 seconds
      console.log('Liquidation monitoring started');
    } else {
      console.log('Liquidation monitoring disabled (POOL_MANAGER_ADDRESS not set)');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down resolver...');
    resolver.stopMonitoring();
    await resolver.stopServer();
    process.exit(0);
  });
}

