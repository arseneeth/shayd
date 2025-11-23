/**
 * Persistent Storage Module for TEE Resolver
 * 
 * Provides encrypted SQLite-based storage for:
 * - Position parameters (hashed)
 * - Encrypted deposit parameters
 * - Position health monitoring data
 */

import Database from 'better-sqlite3';
import { StoredPositionParams, EncryptedDepositParams } from './resolver';
import { EncryptedParams } from './encryption';

// PositionHealth interface - kept here for storage purposes
// Health checks are now performed by keeper service, but storage still needs this interface
interface PositionHealth {
  positionId: string;
  debtRatio: bigint;
  liquidationThreshold: bigint;
  isNearLiquidation: boolean;
  teeCollateralTakeover: bigint;
}

export class PersistentStorage {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = './tee-storage.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    // Table for stored position parameters (hashed)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS position_storage (
        position_id TEXT PRIMARY KEY,
        collateral TEXT NOT NULL,
        debt TEXT NOT NULL,
        owner TEXT NOT NULL,
        hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        pool TEXT
      )
    `);

    // Table for encrypted deposit parameters (before positions are created)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encrypted_deposit_storage (
        deposit_id TEXT PRIMARY KEY,
        user_address TEXT NOT NULL,
        deposit_index INTEGER NOT NULL,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        salt TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Table for position health monitoring
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS position_health_storage (
        position_id TEXT PRIMARY KEY,
        debt_ratio TEXT NOT NULL,
        liquidation_threshold TEXT NOT NULL,
        is_near_liquidation INTEGER NOT NULL,
        tee_collateral_takeover TEXT NOT NULL,
        last_updated INTEGER NOT NULL
      )
    `);

    // Create indexes for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_position_owner ON position_storage(owner);
      CREATE INDEX IF NOT EXISTS idx_deposit_user ON encrypted_deposit_storage(user_address);
      CREATE INDEX IF NOT EXISTS idx_health_updated ON position_health_storage(last_updated);
    `);

    console.log('Database tables initialized');
  }

  /**
   * Store position parameters
   */
  storePosition(params: StoredPositionParams): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO position_storage 
      (position_id, collateral, debt, owner, hash, timestamp, pool)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      params.positionId,
      params.collateral,
      params.debt,
      params.owner,
      params.hash,
      params.timestamp,
      params.pool || null
    );
  }

  /**
   * Get position parameters by position ID
   */
  getPosition(positionId: string): StoredPositionParams | null {
    const stmt = this.db.prepare(`
      SELECT * FROM position_storage WHERE position_id = ?
    `);
    
    const row = stmt.get(positionId) as any;
    
    if (!row) {
      return null;
    }

    return {
      positionId: row.position_id,
      collateral: row.collateral,
      debt: row.debt,
      owner: row.owner,
      hash: row.hash,
      timestamp: row.timestamp,
      pool: row.pool || undefined,
    };
  }

  /**
   * Get all positions
   */
  getAllPositions(): StoredPositionParams[] {
    const stmt = this.db.prepare(`SELECT * FROM position_storage`);
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      positionId: row.position_id,
      collateral: row.collateral,
      debt: row.debt,
      owner: row.owner,
      hash: row.hash,
      timestamp: row.timestamp,
      pool: row.pool || undefined,
    }));
  }

  /**
   * Delete position
   */
  deletePosition(positionId: string): void {
    const stmt = this.db.prepare(`DELETE FROM position_storage WHERE position_id = ?`);
    stmt.run(positionId);
  }

  /**
   * Store encrypted deposit parameters
   */
  storeEncryptedDeposit(params: EncryptedDepositParams): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO encrypted_deposit_storage
      (deposit_id, user_address, deposit_index, encrypted_data, iv, salt, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      params.depositId,
      params.userAddress,
      params.depositIndex,
      params.encryptedParams.encrypted,
      params.encryptedParams.iv,
      params.encryptedParams.salt,
      params.timestamp
    );
  }

  /**
   * Get encrypted deposit by deposit ID
   */
  getEncryptedDeposit(depositId: string): EncryptedDepositParams | null {
    const stmt = this.db.prepare(`
      SELECT * FROM encrypted_deposit_storage WHERE deposit_id = ?
    `);
    
    const row = stmt.get(depositId) as any;
    
    if (!row) {
      return null;
    }

    return {
      depositId: row.deposit_id,
      userAddress: row.user_address,
      depositIndex: row.deposit_index,
      encryptedParams: {
        encrypted: row.encrypted_data,
        iv: row.iv,
        salt: row.salt,
      },
      timestamp: row.timestamp,
    };
  }

  /**
   * Get encrypted deposits by deposit IDs
   */
  getEncryptedDeposits(depositIds: string[]): EncryptedDepositParams[] {
    if (depositIds.length === 0) {
      return [];
    }

    const placeholders = depositIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM encrypted_deposit_storage 
      WHERE deposit_id IN (${placeholders})
    `);
    
    const rows = stmt.all(...depositIds) as any[];
    
    return rows.map(row => ({
      depositId: row.deposit_id,
      userAddress: row.user_address,
      depositIndex: row.deposit_index,
      encryptedParams: {
        encrypted: row.encrypted_data,
        iv: row.iv,
        salt: row.salt,
      },
      timestamp: row.timestamp,
    }));
  }

  /**
   * Delete encrypted deposit
   */
  deleteEncryptedDeposit(depositId: string): void {
    const stmt = this.db.prepare(`DELETE FROM encrypted_deposit_storage WHERE deposit_id = ?`);
    stmt.run(depositId);
  }

  /**
   * Store position health
   */
  storePositionHealth(health: PositionHealth): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO position_health_storage
      (position_id, debt_ratio, liquidation_threshold, is_near_liquidation, tee_collateral_takeover, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      health.positionId,
      health.debtRatio.toString(),
      health.liquidationThreshold.toString(),
      health.isNearLiquidation ? 1 : 0,
      health.teeCollateralTakeover.toString(),
      Date.now()
    );
  }

  /**
   * Get position health
   */
  getPositionHealth(positionId: string): PositionHealth | null {
    const stmt = this.db.prepare(`
      SELECT * FROM position_health_storage WHERE position_id = ?
    `);
    
    const row = stmt.get(positionId) as any;
    
    if (!row) {
      return null;
    }

    return {
      positionId: row.position_id,
      debtRatio: BigInt(row.debt_ratio),
      liquidationThreshold: BigInt(row.liquidation_threshold),
      isNearLiquidation: row.is_near_liquidation === 1,
      teeCollateralTakeover: BigInt(row.tee_collateral_takeover),
    };
  }

  /**
   * Get all position health records
   */
  getAllPositionHealth(): PositionHealth[] {
    const stmt = this.db.prepare(`SELECT * FROM position_health_storage`);
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      positionId: row.position_id,
      debtRatio: BigInt(row.debt_ratio),
      liquidationThreshold: BigInt(row.liquidation_threshold),
      isNearLiquidation: row.is_near_liquidation === 1,
      teeCollateralTakeover: BigInt(row.tee_collateral_takeover),
    }));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get database statistics
   */
  getStats(): {
    positions: number;
    encryptedDeposits: number;
    healthRecords: number;
  } {
    const positions = this.db.prepare(`SELECT COUNT(*) as count FROM position_storage`).get() as any;
    const deposits = this.db.prepare(`SELECT COUNT(*) as count FROM encrypted_deposit_storage`).get() as any;
    const health = this.db.prepare(`SELECT COUNT(*) as count FROM position_health_storage`).get() as any;

    return {
      positions: positions.count,
      encryptedDeposits: deposits.count,
      healthRecords: health.count,
    };
  }
}

