/**
 * Resolver Service for Liquidation Execution
 * 
 * This service monitors positions and executes liquidations when positions
 * become undercollateralized.
 */

import { ethers } from 'ethers';
import { PoolManager } from './types';

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

export class LiquidationResolver {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private poolManager: ethers.Contract;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private liquidationThreshold: bigint;

  constructor(
    rpcUrl: string,
    privateKey: string,
    poolManagerAddress: string,
    liquidationThreshold: bigint = ethers.parseUnits('1.0', 18) // 1.0 = 100% debt ratio threshold
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.poolManager = new ethers.Contract(
      poolManagerAddress,
      PoolManager.abi,
      this.signer
    );
    this.liquidationThreshold = liquidationThreshold;
  }

  /**
   * Start monitoring positions for liquidation conditions
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
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

// Example usage
if (require.main === module) {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const privateKey = process.env.PRIVATE_KEY || '';
  const poolManagerAddress = process.env.POOL_MANAGER_ADDRESS || '';
  const liquidationThreshold = process.env.LIQUIDATION_THRESHOLD 
    ? BigInt(process.env.LIQUIDATION_THRESHOLD) 
    : ethers.parseUnits('1.0', 18);

  if (!privateKey || !poolManagerAddress) {
    console.error('Missing required environment variables: PRIVATE_KEY, POOL_MANAGER_ADDRESS');
    process.exit(1);
  }

  const resolver = new LiquidationResolver(
    rpcUrl,
    privateKey,
    poolManagerAddress,
    liquidationThreshold
  );

  resolver.startMonitoring(30000); // Check every 30 seconds

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down resolver...');
    resolver.stopMonitoring();
    process.exit(0);
  });
}

