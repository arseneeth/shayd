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

interface Position {
  positionId: number;
  pool: string;
  owner: string;
  rawColls: bigint;
  rawDebts: bigint;
  debtRatio: bigint;
}

interface LiquidationParams {
  pool: string;
  receiver: string;
  maxFxUSD: bigint;
  maxStable: bigint;
}

export class ResolverService {
  private app: express.Application;
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private poolManager: ethers.Contract | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private liquidationThreshold: bigint;
  private server: any = null;

  constructor(
    rpcUrl: string,
    privateKey: string,
    poolManagerAddress?: string,
    liquidationThreshold: bigint = ethers.parseUnits('1.0', 18) // 1.0 = 100% debt ratio threshold
  ) {
    this.app = express();
    this.app.use(express.json());
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    
    if (poolManagerAddress) {
      this.poolManager = new ethers.Contract(
        poolManagerAddress,
        PoolManager.abi,
        this.signer
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
    
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.send('OK');
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
          resolve();
        });
      });
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
  }

  /**
   * Check positions and execute liquidations if needed
   */
  async checkAndLiquidate(): Promise<void> {
    console.log('Checking positions for liquidation...');
    
    // Get all pools to monitor
    const pools = await this.getRegisteredPools();
    
    for (const pool of pools) {
      try {
        const positions = await this.getLiquidatablePositions(pool);
        
        for (const position of positions) {
          console.log(`Liquidating position ${position.positionId} in pool ${pool}`);
          await this.executeLiquidation(position);
        }
      } catch (error) {
        console.error(`Error processing pool ${pool}:`, error);
      }
    }
  }

  /**
   * Get registered pools from Pool Manager
   */
  async getRegisteredPools(): Promise<string[]> {
    // This would need to be implemented based on the actual Pool Manager interface
    // For now, return empty array - implement based on contract structure
    return [];
  }

  /**
   * Get positions that need liquidation in a pool
   */
  async getLiquidatablePositions(pool: string): Promise<Position[]> {
    const liquidatablePositions: Position[] = [];
    
    // Query positions from the pool contract
    // This would need to be implemented based on the actual pool interface
    // Check debt ratios and identify positions above liquidation threshold
    
    return liquidatablePositions;
  }

  /**
   * Execute liquidation for a position
   */
  async executeLiquidation(position: Position): Promise<void> {
    if (!this.poolManager) {
      throw new Error('Pool Manager not configured');
    }
    
    try {
      const params = await this.calculateLiquidationParams(position);
      
      // Execute liquidation via Pool Manager
      const tx = await this.poolManager.liquidate(
        position.pool,
        params.receiver,
        params.maxFxUSD,
        params.maxStable,
        { gasLimit: 500000 } // Adjust gas limit as needed
      );

      console.log(`Liquidation transaction submitted: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Liquidation confirmed in block ${receipt.blockNumber}`);
      
    } catch (error) {
      console.error(`Failed to liquidate position ${position.positionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate liquidation parameters
   */
  async calculateLiquidationParams(position: Position): Promise<LiquidationParams> {
    // Calculate maxRawDebts based on position debt
    // Split between fxUSD and stable (USDC) based on pool configuration
    const maxRawDebts = position.rawDebts;
    
    // For now, use all fxUSD - adjust based on pool requirements
    const maxFxUSD = maxRawDebts;
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
    // Query position debt ratio from pool contract
    // This would need to be implemented based on the actual pool interface
    return 0n;
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

// Example usage
if (require.main === module) {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const privateKey = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001'; // Dummy key for hashing-only mode
  const poolManagerAddress = loadPoolManagerAddress();
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
    liquidationThreshold
  );

  // Start HTTP server (hashing endpoint works without pool manager)
  resolver.startServer(port).then(() => {
    console.log('Resolver service started. ROFL TEE hashing endpoint available at /hash');
    
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

