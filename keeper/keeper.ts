/**
 * Keeper Service - Price Monitoring and Liquidation Execution
 * 
 * This service is responsible for:
 * 1. Continuously querying prices from underlying asset oracles
 * 2. Monitoring positions for liquidation conditions
 * 3. Executing liquidations when thresholds are met
 * 4. Ensuring operations are triggered at the right time
 * 
 * This is separate from the resolver/controller which handle TEE operations.
 * 
 * Following ROFL (Runtime Off-Chain Logic) best practices:
 * - Runs within ROFL TEE for secure off-chain computation
 * - Uses ROFL's recommended patterns for oracle queries
 * - Implements proper timing and scheduling for keeper operations
 * - Ensures continuous price monitoring as per ROFL workflow recommendations
 */

import { ethers } from 'ethers';
import { PoolManager } from './resolver/types';

interface PriceOracle {
  address: string;
  asset: string; // e.g., 'ETH', 'BTC', 'stETH'
  lastPrice: bigint;
  lastUpdate: number;
  updateInterval: number; // milliseconds
}

interface Position {
  positionId: number;
  pool: string;
  owner: string;
  rawColls: bigint;
  rawDebts: bigint;
  debtRatio: bigint;
  lastChecked: number;
  isNearLiquidation: boolean;
  liquidationThreshold: bigint;
}

interface LiquidationParams {
  pool: string;
  receiver: string;
  maxFxUSD: bigint;
  maxStable: bigint;
}

interface KeeperConfig {
  rpcUrl: string;
  privateKey: string;
  poolManagerAddress?: string;
  priceUpdateInterval: number; // milliseconds - how often to query prices
  positionCheckInterval: number; // milliseconds - how often to check positions
  liquidationThreshold: bigint; // debt ratio threshold for liquidation
  nearLiquidationBuffer: bigint; // buffer before liquidation (e.g., 95% of threshold)
  priceOracles: Array<{
    address: string;
    asset: string;
    updateInterval: number;
  }>;
  pools: string[]; // Pool addresses to monitor
}

export class KeeperService {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private poolManager: ethers.Contract | null = null;
  private config: KeeperConfig;
  
  // Price monitoring
  private priceOracles: Map<string, PriceOracle> = new Map();
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  
  // Position monitoring
  private positionCheckInterval: NodeJS.Timeout | null = null;
  private monitoredPositions: Map<string, Position> = new Map();
  
  // Statistics
  private stats = {
    priceQueries: 0,
    positionChecks: 0,
    liquidationsExecuted: 0,
    lastPriceUpdate: 0,
    lastPositionCheck: 0,
  };

  constructor(config: KeeperConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    
    if (config.poolManagerAddress) {
      this.poolManager = new ethers.Contract(
        config.poolManagerAddress,
        PoolManager.abi,
        this.signer
      );
    }
    
    // Initialize price oracles
    for (const oracleConfig of config.priceOracles) {
      this.priceOracles.set(oracleConfig.address, {
        address: oracleConfig.address,
        asset: oracleConfig.asset,
        lastPrice: 0n,
        lastUpdate: 0,
        updateInterval: oracleConfig.updateInterval,
      });
    }
  }

  /**
   * Start the keeper service
   * Following ROFL recommendations: Initialize oracle queries and position monitoring
   */
  async start(): Promise<void> {
    console.log('Starting Keeper Service (ROFL TEE)...');
    console.log(`Price update interval: ${this.config.priceUpdateInterval}ms`);
    console.log(`Position check interval: ${this.config.positionCheckInterval}ms`);
    console.log(`Monitoring ${this.priceOracles.size} price oracles`);
    console.log(`Monitoring ${this.config.pools.length} pools`);
    
    // Validate configuration
    if (this.priceOracles.size === 0) {
      console.warn('Warning: No price oracles configured. Price monitoring will be limited.');
    }
    
    if (this.config.pools.length === 0) {
      console.warn('Warning: No pools configured. Position monitoring will be limited.');
    }
    
    // Start price monitoring - ROFL best practice: continuous oracle queries
    await this.startPriceMonitoring();
    
    // Start position monitoring - ROFL best practice: regular keeper operations
    await this.startPositionMonitoring();
    
    // Run initial checks immediately (ROFL recommendation: don't wait for first interval)
    await this.updateAllPrices();
    await this.checkAllPositions();
    
    console.log('Keeper Service started successfully');
    console.log('Following ROFL workflow: Oracle queries and keeper operations active');
  }

  /**
   * Stop the keeper service
   */
  stop(): void {
    console.log('Stopping Keeper Service...');
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    
    if (this.positionCheckInterval) {
      clearInterval(this.positionCheckInterval);
      this.positionCheckInterval = null;
    }
    
    console.log('Keeper Service stopped');
  }

  /**
   * Start price monitoring - continuously queries prices from oracles
   * ROFL best practice: Use proper intervals to ensure timely price updates
   * This ensures the program queries the underlying asset price at the right time
   */
  private async startPriceMonitoring(): Promise<void> {
    // Update prices at configured interval
    // ROFL recommendation: Use consistent intervals for reliable price queries
    this.priceUpdateInterval = setInterval(async () => {
      try {
        await this.updateAllPrices();
      } catch (error) {
        console.error('[Price Monitoring] Error updating prices:', error);
        // ROFL best practice: Continue operation even if individual queries fail
      }
    }, this.config.priceUpdateInterval);
    
    console.log(`[Price Monitoring] Started with ${this.config.priceUpdateInterval}ms interval`);
  }

  /**
   * Start position monitoring - checks positions for liquidation conditions
   * ROFL best practice: Regular keeper operations to ensure timely liquidations
   */
  private async startPositionMonitoring(): Promise<void> {
    // Check positions at configured interval
    // ROFL recommendation: Use appropriate intervals for keeper operations
    this.positionCheckInterval = setInterval(async () => {
      try {
        await this.checkAllPositions();
      } catch (error) {
        console.error('[Position Monitoring] Error checking positions:', error);
        // ROFL best practice: Continue operation even if individual checks fail
      }
    }, this.config.positionCheckInterval);
    
    console.log(`[Position Monitoring] Started with ${this.config.positionCheckInterval}ms interval`);
  }

  /**
   * Update prices from all configured oracles
   * ROFL best practice: Constantly query prices from underlying asset oracles
   * This ensures timely price updates for keeper operations
   */
  async updateAllPrices(): Promise<void> {
    const updatePromises: Promise<void>[] = [];
    
    for (const [oracleAddress, oracle] of this.priceOracles.entries()) {
      // Check if it's time to update this oracle
      // ROFL recommendation: Respect per-oracle update intervals
      const timeSinceUpdate = Date.now() - oracle.lastUpdate;
      if (timeSinceUpdate >= oracle.updateInterval) {
        updatePromises.push(this.updatePrice(oracleAddress));
      }
    }
    
    // ROFL best practice: Use Promise.allSettled to handle partial failures gracefully
    const results = await Promise.allSettled(updatePromises);
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const oracleAddress = Array.from(this.priceOracles.keys())[index];
        console.error(`[Price Update] Failed for oracle ${oracleAddress}:`, result.reason);
      }
    });
    
    this.stats.lastPriceUpdate = Date.now();
  }

  /**
   * Update price from a specific oracle
   * ROFL best practice: Query oracle contracts directly for real-time prices
   * This ensures the program constantly queries the price of the underlying asset
   */
  private async updatePrice(oracleAddress: string): Promise<void> {
    const oracle = this.priceOracles.get(oracleAddress);
    if (!oracle) return;

    try {
      const oracleContract = new ethers.Contract(
        oracleAddress,
        [
          'function getPrice() external view returns (uint256 anchorPrice, uint256 minPrice, uint256 maxPrice)',
          'function getExchangePrice() external view returns (uint256)',
          'function getLiquidatePrice() external view returns (uint256)',
        ],
        this.provider
      );

      // ROFL recommendation: Use anchor price for monitoring (most reliable)
      // Also fetch liquidation price for position health checks
      const [anchorPrice, minPrice, maxPrice] = await oracleContract.getPrice();
      const price = BigInt(anchorPrice.toString());
      
      oracle.lastPrice = price;
      oracle.lastUpdate = Date.now();
      this.stats.priceQueries++;
      
      // ROFL best practice: Log price updates for monitoring and debugging
      console.log(`[Price Update] ${oracle.asset}: ${ethers.formatUnits(price, 18)} (min: ${ethers.formatUnits(minPrice, 18)}, max: ${ethers.formatUnits(maxPrice, 18)})`);
    } catch (error) {
      console.error(`[Price Update] Error updating price for oracle ${oracleAddress}:`, error);
      // ROFL best practice: Don't throw - allow other oracles to continue updating
    }
  }

  /**
   * Get current price for an asset
   */
  getPrice(oracleAddress: string): bigint | null {
    const oracle = this.priceOracles.get(oracleAddress);
    return oracle ? oracle.lastPrice : null;
  }

  /**
   * Check all positions in all monitored pools
   * ROFL best practice: Regularly perform keeper operations to check position health
   * This ensures operations are triggered at the right time
   */
  async checkAllPositions(): Promise<void> {
    console.log(`[Keeper] Checking positions in ${this.config.pools.length} pool(s)...`);
    
    for (const poolAddress of this.config.pools) {
      try {
        await this.checkPoolPositions(poolAddress);
      } catch (error) {
        console.error(`[Keeper] Error checking positions in pool ${poolAddress}:`, error);
        // ROFL best practice: Continue checking other pools even if one fails
      }
    }
    
    this.stats.lastPositionCheck = Date.now();
    console.log(`[Keeper] Position check completed. Monitored: ${this.monitoredPositions.size} positions`);
  }

  /**
   * Check positions in a specific pool
   */
  private async checkPoolPositions(poolAddress: string): Promise<void> {
    const poolContract = new ethers.Contract(
      poolAddress,
      [
        'function getLiquidateRatios() external view returns (uint256 debtRatio, uint256 bonusRatio)',
        'function getPositionDebtRatio(uint256 tokenId) external view returns (uint256 debtRatio)',
        'function getPosition(uint256 tokenId) external view returns (uint256 rawColls, uint256 rawDebts)',
        'function totalSupply() external view returns (uint256)',
        'function ownerOf(uint256 tokenId) external view returns (address)',
        'function priceOracle() external view returns (address)',
      ],
      this.provider
    );

    try {
      // Get liquidation threshold
      const [liquidationDebtRatio] = await poolContract.getLiquidateRatios();
      const threshold = BigInt(liquidationDebtRatio.toString());
      
      // Get near-liquidation buffer (e.g., 95% of threshold)
      const nearLiquidationBuffer = (threshold * this.config.nearLiquidationBuffer) / 100n;
      
      // Get total positions
      const totalSupply = await poolContract.totalSupply();
      
      // Check each position
      for (let i = 1; i <= Number(totalSupply); i++) {
        try {
          const positionKey = `${poolAddress}-${i}`;
          const positionDebtRatio = BigInt((await poolContract.getPositionDebtRatio(i)).toString());
          
          // Check if position is near liquidation or liquidatable
          const isNearLiquidation = positionDebtRatio >= nearLiquidationBuffer;
          const isLiquidatable = positionDebtRatio >= threshold;
          
          if (isNearLiquidation || isLiquidatable) {
            // Get position details
            const [rawColls, rawDebts] = await poolContract.getPosition(i);
            const owner = await poolContract.ownerOf(i);
            
            const position: Position = {
              positionId: i,
              pool: poolAddress,
              owner,
              rawColls: BigInt(rawColls.toString()),
              rawDebts: BigInt(rawDebts.toString()),
              debtRatio: positionDebtRatio,
              lastChecked: Date.now(),
              isNearLiquidation,
              liquidationThreshold: threshold,
            };
            
            this.monitoredPositions.set(positionKey, position);
            this.stats.positionChecks++;
            
            // Execute liquidation if threshold is met
            if (isLiquidatable) {
              console.log(`[Liquidation] Position ${i} in pool ${poolAddress} is liquidatable (debt ratio: ${ethers.formatUnits(positionDebtRatio, 18)})`);
              await this.executeLiquidation(position);
            } else if (isNearLiquidation) {
              console.log(`[Warning] Position ${i} in pool ${poolAddress} is near liquidation (debt ratio: ${ethers.formatUnits(positionDebtRatio, 18)})`);
            }
          }
        } catch (error) {
          // Position might not exist or be invalid, skip
          continue;
        }
      }
    } catch (error) {
      console.error(`Error checking pool ${poolAddress}:`, error);
    }
  }

  /**
   * Execute liquidation for a position
   */
  private async executeLiquidation(position: Position): Promise<void> {
    if (!this.poolManager) {
      console.warn('Pool Manager not configured, cannot execute liquidation');
      return;
    }
    
    try {
      const params = await this.calculateLiquidationParams(position);
      
      // Execute liquidation via Pool Manager
      const tx = await this.poolManager.liquidate(
        position.pool,
        params.receiver,
        params.maxFxUSD,
        params.maxStable,
        { gasLimit: 500000 }
      );

      console.log(`[Liquidation] Transaction submitted for position ${position.positionId}: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`[Liquidation] Confirmed in block ${receipt.blockNumber} for position ${position.positionId}`);
      
      this.stats.liquidationsExecuted++;
    } catch (error) {
      console.error(`[Liquidation] Failed to liquidate position ${position.positionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate liquidation parameters
   */
  private async calculateLiquidationParams(position: Position): Promise<LiquidationParams> {
    // For soft liquidation, liquidate enough to restore health
    // Calculate the amount needed to bring debt ratio below threshold
    const targetDebtRatio = (position.liquidationThreshold * 80n) / 100n; // Target 80% of threshold
    
    // Calculate required debt reduction
    // debtRatio = (debt * PRECISION^2) / (collateral * price)
    // We need: newDebtRatio = targetDebtRatio
    // newDebt = (targetDebtRatio * collateral * price) / PRECISION^2
    
    // For now, use a simple percentage-based approach
    const liquidationPercentage = 50n; // Liquidate 50% of debt
    const maxRawDebts = (position.rawDebts * liquidationPercentage) / 100n;
    
    // Ensure minimum liquidation amount
    const MIN_LIQUIDATE_DEBTS = ethers.parseUnits('1', 18);
    const maxRawDebtsToLiquidate = maxRawDebts > MIN_LIQUIDATE_DEBTS ? maxRawDebts : MIN_LIQUIDATE_DEBTS;
    
    // For long pools, split between fxUSD and stable
    const maxFxUSD = maxRawDebtsToLiquidate;
    const maxStable = 0n;
    
    const receiver = await this.signer.getAddress();
    
    return {
      pool: position.pool,
      receiver,
      maxFxUSD,
      maxStable,
    };
  }

  /**
   * Get keeper statistics
   */
  getStats() {
    return {
      ...this.stats,
      monitoredPositions: this.monitoredPositions.size,
      priceOracles: Array.from(this.priceOracles.values()).map(o => ({
        asset: o.asset,
        address: o.address,
        lastPrice: o.lastPrice.toString(),
        lastUpdate: new Date(o.lastUpdate).toISOString(),
      })),
    };
  }

  /**
   * Get monitored positions
   */
  getMonitoredPositions(): Position[] {
    return Array.from(this.monitoredPositions.values());
  }
}

// Example usage
if (require.main === module) {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const privateKey = process.env.PRIVATE_KEY || '';
  const poolManagerAddress = process.env.POOL_MANAGER_ADDRESS;
  
  if (!privateKey) {
    console.error('Missing required environment variable: PRIVATE_KEY');
    process.exit(1);
  }
  
  // Get pool addresses from environment or deployment files
  const pools: string[] = [];
  if (process.env.POOL_ADDRESS) {
    pools.push(process.env.POOL_ADDRESS);
  }
  
  // Get price oracle addresses from environment
  const priceOracles: Array<{ address: string; asset: string; updateInterval: number }> = [];
  if (process.env.PRICE_ORACLE_ADDRESS && process.env.PRICE_ORACLE_ASSET) {
    priceOracles.push({
      address: process.env.PRICE_ORACLE_ADDRESS,
      asset: process.env.PRICE_ORACLE_ASSET,
      updateInterval: parseInt(process.env.PRICE_ORACLE_UPDATE_INTERVAL || '10000', 10), // Default 10 seconds
    });
  }
  
  const config: KeeperConfig = {
    rpcUrl,
    privateKey,
    poolManagerAddress,
    priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '10000', 10), // Default 10 seconds
    positionCheckInterval: parseInt(process.env.POSITION_CHECK_INTERVAL || '30000', 10), // Default 30 seconds
    liquidationThreshold: process.env.LIQUIDATION_THRESHOLD 
      ? BigInt(process.env.LIQUIDATION_THRESHOLD) 
      : ethers.parseUnits('1.0', 18),
    nearLiquidationBuffer: BigInt(process.env.NEAR_LIQUIDATION_BUFFER || '95'), // 95% of threshold
    priceOracles,
    pools,
  };
  
  const keeper = new KeeperService(config);
  
  keeper.start().catch((error) => {
    console.error('Failed to start keeper service:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down keeper...');
    keeper.stop();
    process.exit(0);
  });
  
  // Log statistics periodically
  setInterval(() => {
    const stats = keeper.getStats();
    console.log('[Stats]', JSON.stringify(stats, null, 2));
  }, 60000); // Every minute
}

