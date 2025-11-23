# System Flow Demonstration

This directory contains a comprehensive demonstration script that visualizes how the Shayd system works end-to-end.

## Overview

The `system-flow-demo.ts` script provides a clean, visual representation of:

1. **User Deposit and Encryption Flow**
   - How users prepare deposits
   - Position parameter encryption (AES-256-GCM)
   - Encrypted parameter storage in Resolver TEE

2. **Bundle Creation and Position Opening**
   - How operators collect 10 deposits
   - Encrypted parameter retrieval from Resolver TEE
   - Decryption in TEE environment
   - Atomic bundle transaction execution

3. **Keeper Monitoring and Liquidation**
   - Continuous price monitoring
   - Position health checks
   - Liquidation detection and execution

4. **System Architecture**
   - Visual overview of all components
   - Data flow diagrams
   - Component interactions

## Prerequisites

- Node.js and npm/yarn installed
- TypeScript and ts-node installed
- Resolver service running (optional - demo works without it)
- Anvil or local blockchain node (optional - for full integration)

## Installation

```bash
# Install dependencies from project root
cd /path/to/shayd
npm install

# Or if using yarn
yarn install
```

## Running the Demo

### Docker (Recommended - All Services Integrated)

The easiest way to run the demo is with Docker, which automatically connects to all services:

```bash
# Run demo with all services (anvil, resolver, keeper)
npm run docker:demo

# Or using docker-compose directly
docker-compose -f docker-compose.rofl.yml up --build demo

# View demo logs
npm run docker:demo:logs
# Or
docker-compose -f docker-compose.rofl.yml logs -f demo
```

The demo service will:
- Wait for Anvil and Resolver services to be healthy
- Connect to services using Docker network names (http://anvil:8545, http://resolver:3001)
- Run the full demonstration with real service interactions
- Exit when complete (restart: "no")

### Basic Demo (No Services Required)

```bash
# From project root
npm run demo
# Or
npx ts-node demo/system-flow-demo.ts
```

### With Resolver Service (Local)

```bash
# Start resolver service first
docker-compose -f docker-compose.rofl.yml up resolver

# In another terminal, run the demo
npm run demo:with-services
# Or
RPC_URL=http://localhost:8545 \
RESOLVER_URL=http://localhost:3001 \
TEE_ENCRYPTION_PASSWORD=test-tee-password \
npx ts-node demo/system-flow-demo.ts
```

### With Full Stack (Local)

```bash
# Start all services
docker-compose -f docker-compose.rofl.yml up

# In another terminal, run the demo
npm run demo:with-services
```

## Environment Variables

- `RPC_URL` - RPC endpoint for blockchain (default: `http://localhost:8545`)
- `RESOLVER_URL` - Resolver service URL (default: `http://localhost:3001`)
- `TEE_ENCRYPTION_PASSWORD` - TEE encryption password (default: `test-tee-password`)

## Output

The demo script provides color-coded, step-by-step output showing:

- **Cyan sections**: Major demo sections
- **Yellow steps**: Individual steps in each demo
- **Green checkmarks**: Successful operations
- **Red X marks**: Errors or warnings
- **Blue boxes**: Transaction structures and data flows
- **Dim text**: Additional information

## Example Output

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║                    SHAYD SYSTEM FLOW DEMONSTRATION                            ║
║                                                                               ║
║         Encrypted Position Parameters • Atomic Bundling • Keeper             ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

════════════════════════════════════════════════════════════════════════════════
  SYSTEM ARCHITECTURE OVERVIEW
════════════════════════════════════════════════════════════════════════════════

[Step 1] User prepares deposit
  User Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

[Step 2] User defines position parameters
  Collateral: 1.0 ETH
  Debt: 0.5 fxUSD
  Owner: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

[Step 3] Frontend encrypts position parameters (AES-256-GCM)
  ✓ Parameters encrypted - Resolver will never see plaintext
  ...
```

## What the Demo Shows

### 1. Encryption Flow
- How position parameters are encrypted using AES-256-GCM
- How encryption ensures privacy (Resolver never sees plaintext)
- How hashes are generated for verification

### 2. Bundle Transaction
- How 10 deposits are collected
- How encrypted parameters are retrieved from Resolver TEE
- How parameters are decrypted in TEE environment
- How atomic bundle transactions are structured

### 3. Keeper Operations
- How keepers continuously monitor prices
- How position health is checked
- How liquidations are detected and executed
- How the keeper continues monitoring after execution

### 4. System Architecture
- Visual representation of all components
- Data flow between components
- Security boundaries (TEE, on-chain, off-chain)

## Customization

You can modify the demo script to:
- Add more detailed transaction examples
- Include actual blockchain interactions
- Show more complex liquidation scenarios
- Demonstrate withdrawal flows
- Add performance metrics

## Troubleshooting

### "Cannot find module '../resolver/encryption'"
Make sure you're running from the project root, not from the demo directory.

### "Resolver service not available"
The demo will continue without the resolver service, but some features will be simulated.

### "Connection refused" (Local)
Make sure the required services (Anvil, Resolver) are running if you want full integration.

### "Connection refused" (Docker)
If running in Docker, make sure:
- Services are on the same Docker network (`shayd-network`)
- Service names are correct (`anvil`, `resolver` - not `localhost`)
- Services have health checks and are marked as healthy
- Check logs: `docker-compose -f docker-compose.rofl.yml logs demo`

### Demo exits immediately
The demo is configured with `restart: "no"` so it exits after completion. This is normal. To see the output, check logs or run without `-d` flag:
```bash
docker-compose -f docker-compose.rofl.yml up demo
```

## Related Documentation

- [Resolver README](../resolver/README.md) - Resolver service documentation
- [Keeper README](../keeper/README.md) - Keeper service documentation
- [ROFL README](../README.ROFL.md) - ROFL TEE integration guide

