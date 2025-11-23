/**
 * Encryption utilities for position parameters
 * Implements encryption for position parameters to keep them private
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface PositionParams {
  position_id: string;
  collateral: string;
  debt: string;
  owner: string;
}

export interface EncryptedParams {
  encrypted: string; // Base64 encoded encrypted data
  iv: string; // Initialization vector (hex)
  salt: string; // Salt for key derivation (hex)
}

/**
 * Encrypt position parameters using AES-256-GCM
 * @param params Position parameters to encrypt
 * @param password Password for encryption (derived from TEE secret)
 * @returns Encrypted parameters with IV and salt
 */
export function encryptPositionParams(params: PositionParams, password: string): EncryptedParams {
  // Generate random salt for key derivation
  const salt = randomBytes(32);
  
  // Derive encryption key from password using scrypt
  const key = scryptSync(password, salt, 32);
  
  // Generate random IV
  const iv = randomBytes(16);
  
  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  // Encrypt the parameters (JSON stringified)
  const data = JSON.stringify(params);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine encrypted data with auth tag
  const encryptedWithTag = encrypted + ':' + authTag.toString('base64');
  
  return {
    encrypted: encryptedWithTag,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
  };
}

/**
 * Decrypt position parameters
 * @param encrypted Encrypted parameters
 * @param password Password for decryption (derived from TEE secret)
 * @returns Decrypted position parameters
 * @throws Error if decryption fails or parameters are invalid
 */
export function decryptPositionParams(encrypted: EncryptedParams, password: string): PositionParams {
  // Validate required fields
  if (!encrypted.encrypted || !encrypted.iv || !encrypted.salt) {
    throw new Error('Invalid encrypted parameters: missing encrypted data, IV, or salt');
  }
  
  if (!password) {
    throw new Error('Decryption password is required');
  }
  
  try {
    // Derive encryption key from password using scrypt
    const key = scryptSync(password, Buffer.from(encrypted.salt, 'hex'), 32);
    
    // Get IV
    const iv = Buffer.from(encrypted.iv, 'hex');
    
    // Validate IV length (should be 16 bytes for AES-256-GCM)
    if (iv.length !== 16) {
      throw new Error(`Invalid IV length: expected 16 bytes, got ${iv.length}`);
    }
    
    // Split encrypted data and auth tag
    if (!encrypted.encrypted.includes(':')) {
      throw new Error('Invalid encrypted data format: missing authentication tag');
    }
    
    const [encryptedData, authTagBase64] = encrypted.encrypted.split(':');
    
    if (!encryptedData || !authTagBase64) {
      throw new Error('Invalid encrypted data format: missing data or auth tag');
    }
    
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    // Validate auth tag length (should be 16 bytes for GCM)
    if (authTag.length !== 16) {
      throw new Error(`Invalid auth tag length: expected 16 bytes, got ${authTag.length}`);
    }
    
    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse JSON
    const params = JSON.parse(decrypted) as PositionParams;
    
    // Validate decrypted parameters
    if (!params.collateral || !params.debt || !params.owner) {
      throw new Error('Decrypted parameters missing required fields');
    }
    
    return params;
  } catch (error: any) {
    // Provide more informative error messages
    if (error.message.includes('bad decrypt') || error.message.includes('Unsupported state')) {
      throw new Error('Decryption failed: invalid password or corrupted data');
    }
    if (error.message.includes('Invalid authentication tag')) {
      throw new Error('Decryption failed: authentication tag verification failed');
    }
    // Re-throw with original message if it's already informative
    throw error;
  }
}

/**
 * Generate a deposit identifier for linking encrypted params to deposits
 * @param userAddress User's address
 * @param depositIndex Deposit index
 * @param timestamp Timestamp
 * @returns Deposit identifier
 */
export function generateDepositId(userAddress: string, depositIndex: number, timestamp: number): string {
  return `${userAddress.toLowerCase()}-${depositIndex}-${timestamp}`;
}

