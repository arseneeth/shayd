/**
 * Position parameter hashing utilities
 * Implements the same hashing logic as ROFL TEE for position parameters
 */

import { keccak256, concat, getBytes, toBeHex, zeroPadValue, getAddress, isAddress } from 'ethers';

export interface PositionParams {
  position_id: string;
  collateral: string;
  debt: string;
  owner: string;
}

/**
 * Hash position parameters using Keccak256
 * This matches the ROFL TEE hashing implementation
 */
export function hashPositionParams(params: PositionParams): string {
  // Convert all parameters to bytes (32 bytes each for numbers, 20 bytes for address)
  const positionIdBytes = zeroPadValue(toBeHex(BigInt(params.position_id)), 32);
  const collateralBytes = zeroPadValue(toBeHex(BigInt(params.collateral)), 32);
  const debtBytes = zeroPadValue(toBeHex(BigInt(params.debt)), 32);
  
  // Parse and validate owner address
  // Normalize the address - remove 0x prefix, validate length, then add 0x back
  let cleanAddr = params.owner.trim().replace(/^0x/i, '');
  
  // Pad with leading zeros if needed (shouldn't happen for valid addresses, but be defensive)
  if (cleanAddr.length < 40) {
    cleanAddr = '0'.repeat(40 - cleanAddr.length) + cleanAddr;
  }
  
  // Validate length (40 hex characters = 20 bytes)
  if (cleanAddr.length !== 40) {
    throw new Error(`Invalid address length: ${params.owner} (expected 40 hex chars after 0x, got ${cleanAddr.length})`);
  }
  
  // Validate it's all hex characters
  if (!/^[0-9a-fA-F]{40}$/i.test(cleanAddr)) {
    throw new Error(`Invalid address format: ${params.owner} (must be 40 hex characters)`);
  }
  
  // Convert to lowercase and add 0x prefix for getBytes
  const ownerAddress = '0x' + cleanAddr.toLowerCase();
  const ownerBytes = getBytes(ownerAddress); // Address is 20 bytes
  
  // Encode parameters: position_id (32) | collateral (32) | debt (32) | owner (20)
  const encoded = concat([
    positionIdBytes,
    collateralBytes,
    debtBytes,
    ownerBytes,
  ]);
  
  // Hash using Keccak256
  return keccak256(encoded);
}

