/**
 * Test setup file for integration tests
 */

// Increase timeout for integration tests
jest.setTimeout(60000); // 60 seconds

// Try to load PoolManager address from deployment file if not in env
if (!process.env.POOL_MANAGER_ADDRESS) {
  try {
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = path.join(__dirname, '../scaffold/packages/foundry/deployments/pool-manager-31337.json');
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      if (deployment.poolManager) {
        process.env.POOL_MANAGER_ADDRESS = deployment.poolManager;
        console.log('Loaded PoolManager address from deployment file:', deployment.poolManager);
      }
    }
  } catch (error) {
    // Ignore errors
  }
}

// Global test utilities
global.console = {
  ...console,
  // Uncomment to suppress console logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

