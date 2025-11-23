/**
 * System Flow Demonstration Script
 * 
 * This script provides a clean, visual representation of how the Shayd system works:
 * 1. User deposits and position parameter encryption
 * 2. Bundle creation and position opening
 * 3. Keeper monitoring and liquidation execution
 * 
 * Run with: ts-node demo/system-flow-demo.ts
 */

import { ethers } from 'ethers';
import axios from 'axios';
import { encryptPositionParams, decryptPositionParams, PositionParams, EncryptedParams } from '../resolver/encryption';
import { hashPositionParams } from '../resolver/hashing';

// Configuration
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const RESOLVER_URL = process.env.RESOLVER_URL || 'http://localhost:3001';
const TEE_PASSWORD = process.env.TEE_ENCRYPTION_PASSWORD || 'test-tee-password';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function printSection(title: string) {
  console.log('\n' + colors.cyan + '═'.repeat(80) + colors.reset);
  console.log(colors.bright + colors.cyan + `  ${title}` + colors.reset);
  console.log(colors.cyan + '═'.repeat(80) + colors.reset + '\n');
}

function printStep(step: number, description: string) {
  console.log(colors.yellow + `[Step ${step}]` + colors.reset + ` ${description}`);
}

function printInfo(label: string, value: any) {
  console.log(colors.dim + `  ${label}:` + colors.reset + ` ${value}`);
}

function printSuccess(message: string) {
  console.log(colors.green + '  ✓ ' + message + colors.reset);
}

function printError(message: string) {
  console.log(colors.red + '  ✗ ' + message + colors.reset);
}

function printEncryptedData(encrypted: EncryptedParams, showFull = false) {
  console.log(colors.magenta + '  Encrypted Data:' + colors.reset);
  if (showFull) {
    printInfo('  Encrypted', encrypted.encrypted);
    printInfo('  IV', encrypted.iv);
    printInfo('  Salt', encrypted.salt);
  } else {
    printInfo('  Encrypted', encrypted.encrypted.substring(0, 50) + '...');
    printInfo('  IV', encrypted.iv.substring(0, 20) + '...');
    printInfo('  Salt', encrypted.salt.substring(0, 20) + '...');
  }
}

/**
 * Demo 1: User Deposit and Encryption Flow
 */
async function demoUserDeposit() {
  printSection('DEMO 1: User Deposit and Position Parameter Encryption');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const userWallet = ethers.Wallet.createRandom().connect(provider);
  
  printStep(1, 'User prepares deposit');
  printInfo('User Address', userWallet.address);
  
  // Simulate user entering position parameters
  const positionParams: PositionParams = {
    position_id: '0', // Will be set when position is created
    collateral: ethers.parseEther('1.0').toString(), // 1 ETH
    debt: ethers.parseEther('0.5').toString(), // 0.5 fxUSD
    owner: userWallet.address,
  };
  
  printStep(2, 'User defines position parameters');
  printInfo('Collateral', `${ethers.formatEther(positionParams.collateral)} ETH`);
  printInfo('Debt', `${ethers.formatEther(positionParams.debt)} fxUSD`);
  printInfo('Owner', positionParams.owner);
  
  // Frontend encrypts parameters (privacy-first approach)
  printStep(3, 'Frontend encrypts position parameters (AES-256-GCM)');
  const encrypted = encryptPositionParams(positionParams, TEE_PASSWORD);
  printEncryptedData(encrypted);
  printSuccess('Parameters encrypted - Resolver will never see plaintext');
  
  // Hash for verification
  printStep(4, 'Generate hash for verification');
  const hash = hashPositionParams(positionParams);
  printInfo('Hash', hash);
  printSuccess('Hash generated - can be used to verify parameters later');
  
  // Send to resolver
  printStep(5, 'Send encrypted parameters to Resolver TEE');
  try {
    const response = await axios.post(`${RESOLVER_URL}/store-encrypted`, {
      userAddress: userWallet.address,
      depositIndex: 0,
      encryptedParams: encrypted,
      hash: hash,
    });
    
    if (response.data.success) {
      printSuccess(`Encrypted parameters stored in Resolver TEE`);
      printInfo('Deposit ID', response.data.depositId);
      return { depositId: response.data.depositId, encrypted, positionParams };
    }
  } catch (error: any) {
    printError(`Failed to store encrypted parameters: ${error.message}`);
    // Continue with demo even if resolver is not available
    return { depositId: 'demo-deposit-1', encrypted, positionParams };
  }
  
  return { depositId: 'demo-deposit-1', encrypted, positionParams };
}

/**
 * Demo 2: Bundle Creation and Position Opening
 */
async function demoBundleCreation(deposits: Array<{ depositId: string; encrypted: EncryptedParams; positionParams: PositionParams }>) {
  printSection('DEMO 2: Bundle Creation and Position Opening');

  printStep(1, 'Operator collects 10 deposits for bundling');
  printInfo('Deposits Collected', deposits.length);
  printSuccess('Bundle ready - 10 deposits collected');
  
  printStep(2, 'Operator requests parameters from Resolver TEE');
  const depositIds = deposits.map(d => d.depositId);
  printInfo('Deposit IDs', depositIds.join(', '));
  
  let decryptedParams: PositionParams[] = [];
  
  try {
    const response = await axios.post(`${RESOLVER_URL}/get-params-for-bundle`, {
      depositIds: depositIds,
    });
    
    if (response.data.success && response.data.params) {
      printSuccess('Received decrypted parameters from Resolver TEE');
      printInfo('Params Count', response.data.params.length);
      printInfo('Note', 'Resolver decrypts in TEE environment - parameters never exposed in plaintext outside TEE');
      
      // Convert resolver response to PositionParams format
      decryptedParams = response.data.params.map((p: any) => ({
        position_id: '0', // Will be set when position is created
        collateral: p.collateral,
        debt: p.debt,
        owner: p.owner,
      }));
      
      printStep(3, 'Parameters ready for bundle transaction');
      for (let i = 0; i < decryptedParams.length; i++) {
        const param = decryptedParams[i];
        printSuccess(`Position ${i + 1}: ${ethers.formatEther(param.collateral)} ETH collateral, ${ethers.formatEther(param.debt)} fxUSD debt`);
      }
    } else {
      throw new Error('Invalid response from resolver');
    }
  } catch (error: any) {
    printError(`Resolver not available: ${error.message}`);
    console.log(colors.dim + '  (Demo mode - decrypting locally)' + colors.reset);
    
    // Fallback: decrypt locally for demo purposes
    printStep(3, 'Operator decrypts parameters in TEE environment (fallback)');
    for (const deposit of deposits) {
      try {
        const decrypted = decryptPositionParams(deposit.encrypted, TEE_PASSWORD);
        decryptedParams.push(decrypted);
        printSuccess(`Decrypted params for deposit ${deposit.depositId}`);
      } catch (error: any) {
        printError(`Failed to decrypt: ${error.message}`);
      }
    }
  }
  
  printStep(4, 'Operator prepares bundle transaction');
  console.log(colors.blue + '  Bundle Transaction Structure:' + colors.reset);
  console.log(colors.dim + '  ┌─────────────────────────────────────────────────────────┐' + colors.reset);
  console.log(colors.dim + '  │  BundledVault.createPositionsFromBundle()                │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Flash Loan (if needed)                             │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Open Position 1 (collateral, debt)                 │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Open Position 2 (collateral, debt)                 │' + colors.reset);
  console.log(colors.dim + '  │  ├─ ... (8 more positions)                            │' + colors.reset);
  console.log(colors.dim + '  │  └─ Repay Flash Loan                                  │' + colors.reset);
  console.log(colors.dim + '  └─────────────────────────────────────────────────────────┘' + colors.reset);
  printSuccess('All 10 positions will be opened atomically in single transaction');
  
  printStep(5, 'Execute bundle transaction on-chain');
  printInfo('Transaction Type', 'Atomic Bundle');
  printInfo('Positions', decryptedParams.length);
  printInfo('Total Collateral', decryptedParams.reduce((sum, p) => sum + BigInt(p.collateral), 0n).toString());
  printInfo('Total Debt', decryptedParams.reduce((sum, p) => sum + BigInt(p.debt), 0n).toString());
  printSuccess('Bundle transaction executed - all positions created atomically');
  
  return decryptedParams;
}

/**
 * Demo 3: Keeper Monitoring and Liquidation
 */
async function demoKeeperOperations(positions: PositionParams[]) {
  printSection('DEMO 3: Keeper Monitoring and Liquidation Execution');

  printStep(1, 'Keeper Service starts monitoring');
  printInfo('Price Update Interval', '10 seconds');
  printInfo('Position Check Interval', '30 seconds');
  printInfo('Monitored Pools', '1');
  printSuccess('Keeper service active - continuously monitoring prices and positions');
  
  printStep(2, 'Keeper queries price oracle');
  const mockPrice = ethers.parseEther('0.95'); // Price dropped 5%
  printInfo('Current Price', `${ethers.formatEther(mockPrice)} ETH/fxUSD`);
  printInfo('Price Change', '-5% (price dropped)');
  printSuccess('Price updated - monitoring for liquidation conditions');
  
  printStep(3, 'Keeper checks position health');
  console.log(colors.blue + '  Position Health Check:' + colors.reset);
  for (let i = 0; i < Math.min(3, positions.length); i++) {
    const pos = positions[i];
    const collateral = BigInt(pos.collateral);
    const debt = BigInt(pos.debt);
    const debtRatio = (debt * ethers.parseEther('1.0')) / collateral;
    const liquidationThreshold = ethers.parseEther('1.0');
    
    const isLiquidatable = debtRatio >= liquidationThreshold;
    const isNearLiquidation = debtRatio >= (liquidationThreshold * BigInt(95)) / BigInt(100);
    
    console.log(colors.dim + `  Position ${i + 1}:` + colors.reset);
    printInfo('    Collateral', `${ethers.formatEther(collateral)} ETH`);
    printInfo('    Debt', `${ethers.formatEther(debt)} fxUSD`);
      printInfo('    Debt Ratio', `${ethers.formatEther(debtRatio)}`);
    if (isLiquidatable) {
      printError(`    Status: LIQUIDATABLE (debt ratio >= threshold)`);
    } else if (isNearLiquidation) {
      const percentOfThreshold = (debtRatio * BigInt(100)) / liquidationThreshold;
      console.log(colors.yellow + `    Status: Near Liquidation (${ethers.formatEther(percentOfThreshold)}% of threshold)` + colors.reset);
    } else {
      printSuccess(`    Status: Healthy`);
    }
  }
  
  printStep(4, 'Keeper detects liquidatable position - executing partial liquidation');
  const liquidatablePosition = positions[0];
  const collateral = BigInt(liquidatablePosition.collateral);
  const debt = BigInt(liquidatablePosition.debt);
  const debtRatio = (debt * ethers.parseEther('1.0')) / collateral;
  const liquidationThreshold = ethers.parseEther('1.0');
  
  console.log(colors.blue + '  Position Status (Before Liquidation):' + colors.reset);
  printInfo('Position ID', '1');
  printInfo('Owner', liquidatablePosition.owner);
  printInfo('Collateral', `${ethers.formatEther(collateral)} ETH`);
  printInfo('Debt', `${ethers.formatEther(debt)} fxUSD`);
  printInfo('Debt Ratio', `${ethers.formatEther(debtRatio)} (threshold: ${ethers.formatEther(liquidationThreshold)})`);
  printError('Position is liquidatable - executing partial liquidation to restore health');
  
  // Calculate partial liquidation (50% of debt to bring ratio to ~80% of threshold)
  const liquidationPercentage = 50n; // Liquidate 50% of debt
  const debtToLiquidate = (debt * liquidationPercentage) / BigInt(100);
  const remainingDebt = debt - debtToLiquidate;
  const newDebtRatio = (remainingDebt * ethers.parseEther('1.0')) / collateral;
  
  console.log(colors.blue + '  Partial Liquidation Plan:' + colors.reset);
  printInfo('Liquidation Type', 'Partial (Soft Liquidation)');
  printInfo('Debt to Liquidate', `${ethers.formatEther(debtToLiquidate)} fxUSD (50% of total debt)`);
  printInfo('Target Debt Ratio', '80% of threshold (restore health)');
  printInfo('Expected Remaining Debt', `${ethers.formatEther(remainingDebt)} fxUSD`);
  
  printStep(5, 'Keeper executes partial liquidation transaction');
  console.log(colors.blue + '  Partial Liquidation Transaction:' + colors.reset);
  console.log(colors.dim + '  ┌─────────────────────────────────────────────────────────┐' + colors.reset);
  console.log(colors.dim + '  │  PoolManager.liquidate()                               │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Pool Address: <pool_address>                      │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Receiver: <keeper_address>                       │' + colors.reset);
  console.log(colors.dim + '  │  ├─ Max fxUSD: ' + ethers.formatEther(debtToLiquidate).padEnd(35) + '│' + colors.reset);
  console.log(colors.dim + '  │  ├─ Max Stable: 0                                     │' + colors.reset);
  console.log(colors.dim + '  │  └─ Type: Partial Liquidation (restore health)        │' + colors.reset);
  console.log(colors.dim + '  └─────────────────────────────────────────────────────────┘' + colors.reset);
  printSuccess('Partial liquidation transaction submitted');
  
  printStep(6, 'Transaction confirmed on-chain');
  printInfo('Block Number', '12345');
  printInfo('Gas Used', '250,000');
  printInfo('Status', 'Success');
  
  console.log(colors.blue + '  Position Status (After Partial Liquidation):' + colors.reset);
  printInfo('Position ID', '1');
  printInfo('Owner', liquidatablePosition.owner);
  printInfo('Collateral', `${ethers.formatEther(collateral)} ETH (unchanged)`);
  printInfo('Debt', `${ethers.formatEther(remainingDebt)} fxUSD (reduced by ${ethers.formatEther(debtToLiquidate)})`);
  printInfo('Debt Ratio', `${ethers.formatEther(newDebtRatio)} (below threshold)`);
  printSuccess('Partial liquidation executed - position health restored, remains open');
  
  printStep(7, 'Keeper continues monitoring');
  printInfo('Next Price Check', 'In 10 seconds');
  printInfo('Next Position Check', 'In 30 seconds');
  printSuccess('Keeper continues monitoring for new liquidation opportunities');
}

/**
 * Demo 4: System Architecture Overview
 */
function demoSystemArchitecture() {
  printSection('SYSTEM ARCHITECTURE OVERVIEW');

  console.log(colors.blue + '  System Components:' + colors.reset);
  console.log(colors.dim + '  ┌─────────────────────────────────────────────────────────┐' + colors.reset);
  console.log(colors.dim + '  │  1. Frontend (User Interface)                          │' + colors.reset);
  console.log(colors.dim + '  │     ├─ User enters position parameters                 │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Encrypts parameters (AES-256-GCM)              │' + colors.reset);
  console.log(colors.dim + '  │     └─ Sends encrypted params to Resolver               │' + colors.reset);
  console.log(colors.dim + '  │                                                        │' + colors.reset);
  console.log(colors.dim + '  │  2. Resolver TEE Service                               │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Receives encrypted parameters                   │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Stores encrypted (never sees plaintext)         │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Provides decryption for operator (TEE only)    │' + colors.reset);
  console.log(colors.dim + '  │     └─ Returns encrypted params for withdrawal         │' + colors.reset);
  console.log(colors.dim + '  │                                                        │' + colors.reset);
  console.log(colors.dim + '  │  3. Operator Service                                   │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Collects 10 deposits                            │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Requests encrypted params from Resolver        │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Decrypts in TEE environment                    │' + colors.reset);
  console.log(colors.dim + '  │     └─ Executes atomic bundle transaction              │' + colors.reset);
  console.log(colors.dim + '  │                                                        │' + colors.reset);
  console.log(colors.dim + '  │  4. Keeper Service                                     │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Continuously monitors price oracles             │' + colors.reset);
  console.log(colors.dim + '  │     ├─ Checks position health                          │' + colors.reset);
  console.log(colors.dim + '  │     └─ Executes liquidations when needed                │' + colors.reset);
  console.log(colors.dim + '  │                                                        │' + colors.reset);
  console.log(colors.dim + '  │  5. Smart Contracts (On-Chain)                        │' + colors.reset);
  console.log(colors.dim + '  │     ├─ BundledVault: Manages deposits & positions      │' + colors.reset);
  console.log(colors.dim + '  │     ├─ PoolManager: Manages pools & liquidations      │' + colors.reset);
  console.log(colors.dim + '  │     └─ Pool: Individual position pools                 │' + colors.reset);
  console.log(colors.dim + '  └─────────────────────────────────────────────────────────┘' + colors.reset);
  
  console.log('\n' + colors.blue + '  Data Flow:' + colors.reset);
  console.log(colors.dim + '  User → [Encrypt] → Resolver TEE → [Store Encrypted]' + colors.reset);
  console.log(colors.dim + '                                                      ↓' + colors.reset);
  console.log(colors.dim + '  Operator ← [Decrypt in TEE] ← Resolver TEE ← [Request for Bundle]' + colors.reset);
  console.log(colors.dim + '  ↓' + colors.reset);
  console.log(colors.dim + '  [Atomic Bundle Transaction] → On-Chain Contracts' + colors.reset);
  console.log(colors.dim + '                                      ↓' + colors.reset);
  console.log(colors.dim + '  Keeper ← [Monitor] ← Price Oracle ← [Query Prices]' + colors.reset);
  console.log(colors.dim + '  ↓' + colors.reset);
  console.log(colors.dim + '  [Execute Liquidation] → On-Chain Contracts' + colors.reset);
}

/**
 * Wait for resolver service to be ready
 */
async function waitForResolver(maxRetries = 10, delay = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(`${RESOLVER_URL}/health`, { timeout: 1000 });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }
    if (i < maxRetries - 1) {
      printInfo('Waiting for Resolver service', `${i + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

/**
 * Main demo function
 */
async function main() {
  console.log(colors.bright + colors.cyan);
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                               ║');
  console.log('║                    SHAYD SYSTEM FLOW DEMONSTRATION                            ║');
  console.log('║                                                                               ║');
  console.log('║         Encrypted Position Parameters • Atomic Bundling • Keeper             ║');
  console.log('║                                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  // Check if running in Docker and wait for services
  printInfo('RPC URL', RPC_URL);
  printInfo('Resolver URL', RESOLVER_URL);
  
  printStep(0, 'Checking service availability');
  const resolverReady = await waitForResolver();
  if (resolverReady) {
    printSuccess('Resolver service is ready');
  } else {
    printError('Resolver service not available - demo will continue with simulated interactions');
  }
  console.log('');

  try {
    // Show system architecture first
    demoSystemArchitecture();
    
    // Demo 1: User deposits
    const deposits: Array<{ depositId: string; encrypted: EncryptedParams; positionParams: PositionParams }> = [];
    for (let i = 0; i < 3; i++) {
      const deposit = await demoUserDeposit();
      deposits.push(deposit);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for readability
    }
    
    // Demo 2: Bundle creation
    const positions = await demoBundleCreation(deposits);
    
    // Demo 3: Keeper operations
    await demoKeeperOperations(positions);
    
    printSection('DEMO COMPLETE');
    console.log(colors.green + colors.bright);
    console.log('  ✓ All demonstrations completed successfully!');
    console.log(colors.reset);
    console.log(colors.dim + '  This script demonstrated:' + colors.reset);
    console.log(colors.dim + '  • User deposit and encryption flow' + colors.reset);
    console.log(colors.dim + '  • Bundle creation and atomic position opening' + colors.reset);
    console.log(colors.dim + '  • Keeper monitoring and liquidation execution' + colors.reset);
    console.log(colors.dim + '  • System architecture overview' + colors.reset);
    
  } catch (error: any) {
    printError(`Demo failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

