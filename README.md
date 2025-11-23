# Shayd: Privacy-First Leveraged Trading/Yield Generation Platform

A privacy-first leveraged trading/yield generation platform that uses vault bundling and Oasis ROFL TEE for secure position parameter storage.

## 🎯 Overview

Shayd is a privacy-first leveraged trading/yield generation platform, forked from the f(x) protocol, where:
- **Users deposit native ETH** to a vault
- **Vault bundles 10 positions** before opening them using the forked f(x) protocol contracts
- **Atomic position creation** - Flash loan, position opening, and repayment happen in a single bundled transaction
- **Liquidation prices remain private** - Only TEE knows position parameters; on-chain only sees final state
- **Position parameters are encrypted** and stored off-chain in the Resolver TEE
- **Individual position ownership is hidden** from on-chain visibility
- **Soft liquidations only** - positions can be partially liquidated to restore health, no hard liquidations
- **Users can withdraw** by requesting their encrypted parameters from the resolver

## 🏗️ Architecture

### Core Components

1. **BundledVault** - Smart contract that accepts deposits, bundles positions, and manages withdrawals
2. **Resolver Service** - Off-chain service that encrypts/stores position parameters and provides them for withdrawals
3. **Pool Manager** - Part of the forked f(x) protocol for creating and managing positions
4. **Oasis ROFL TEE** - Trusted Execution Environment for secure encryption and storage

### System Flow

```
User Deposit → Frontend Encrypts → Store Encrypted in TEE → Bundle Ready (10 deposits) → 
                                                                                            ↓
Flash Loan → Open All 10 Positions (Atomic Bundle) → Repay Flash Loan → Positions Created
                                                                                            ↓
Liquidation prices remain private (only TEE knows them) - on-chain only sees final state
                                                                                            ↓
User Withdrawal ← Close Position ← User Decrypts ← Get Encrypted Parameters ← Resolver TEE
```

## 🚀 Quick Start

### Prerequisites

- Node.js (>= v20.18.3)
- Docker and Docker Compose
- Foundry (for contract development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd shayd

# Install dependencies
npm install
cd scaffold && yarn install
cd ../resolver && npm install
```

### Running with Docker (Recommended)

```bash
# Start all services (Anvil, Resolver, Integration Tests)
npm run docker:test

# Or start services separately
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Local Development

#### 1. Start Local Blockchain

```bash
# Terminal 1: Start Anvil
cd scaffold/packages/foundry
anvil --host 0.0.0.0 --port 8545
```

#### 2. Deploy Contracts

```bash
# Terminal 2: Deploy contracts
cd scaffold/packages/foundry
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

#### 3. Start Resolver Service

```bash
# Terminal 3: Start resolver
cd resolver
npm install
npm start
```

#### 4. Run Tests

```bash
# Foundry tests
cd scaffold/packages/foundry
forge test

# Integration tests
npm run test:integration
```

## 📁 Project Structure

```
shayd/
├── scaffold/                    # Scaffold-ETH 2 monorepo
│   └── packages/
│       ├── foundry/            # Smart contracts
│       │   ├── contracts/
│       │   │   └── core/
│       │   │       └── BundledVault.sol  # Main vault contract
│       │   ├── test/
│       │   │   └── BundledVault.t.sol    # Foundry tests
│       │   └── script/                   # Deployment scripts
│       └── nextjs/             # Frontend (Next.js)
├── resolver/                    # Resolver TEE service
│   ├── resolver.ts             # Main resolver service
│   ├── encryption.ts           # Encryption utilities
│   └── hashing.ts              # Hashing utilities
├── tests/
│   └── integration/            # Integration tests
│       └── bundled-vault.test.ts
├── notes/                      # Architecture documentation
│   └── shayd-v2.md   # System architecture
└── docker-compose.rofl.yml     # Docker setup
```

## 🔐 Privacy & Encryption

### Encryption Flow

Position parameters are **encrypted on the frontend** before being sent to the resolver:

1. **User deposits ETH** → `BundledVault.deposit()`
2. **Frontend encrypts parameters** → Sends encrypted data to resolver
3. **Resolver stores encrypted** → Never sees plaintext
4. **Operator decrypts for bundling** → Prepares position parameters (only TEE knows liquidation prices)
5. **Atomic bundle transaction** → Flash loan + Open all 10 positions + Repay flash loan (all in one transaction)
6. **Liquidation prices remain private** → On-chain only sees final state, not individual position parameters
7. **User decrypts for withdrawal** → Closes position

See [notes/README_ENCRYPTION.md](notes/README_ENCRYPTION.md) for detailed encryption documentation.

### API Endpoints

**Resolver Service** (`http://localhost:3001`):

- `POST /store-encrypted` - Store encrypted position parameters (frontend encrypts first)
- `POST /get-params-for-bundle` - Get decrypted parameters for operator (for bundling)
- `POST /get-params` - Get encrypted parameters for user (user decrypts on frontend)
- `POST /link-position` - Link position ID to deposit ID
- `GET /health` - Health check

## 🧪 Testing

### Foundry Tests

```bash
cd scaffold/packages/foundry
forge test --match-path test/BundledVault.t.sol -vv
```

**Test Coverage:**
- ✅ Deposit functionality
- ✅ Bundle readiness detection
- ✅ Position creation using forked f(x) protocol
- ✅ Multiple bundles
- ✅ Access control
- ✅ Position closing and withdrawal

### Integration Tests

```bash
# Run in Docker (recommended)
npm run docker:test

# Or run locally (requires services running)
npm run test:integration
```

## 📚 Documentation

- **[Architecture Documentation](notes/shayd-v2.md)** - System architecture and flow diagrams
- **[Encryption Guide](notes/README_ENCRYPTION.md)** - Encryption flow and implementation
- **[Resolver README](resolver/README.md)** - Resolver service documentation
- **[ROFL Integration Guide](README.ROFL.md)** - ROFL TEE integration details
- **[Deployment Guide](scaffold/packages/foundry/DEPLOYMENT.md)** - Contract deployment instructions

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
# Blockchain
RPC_URL=http://localhost:8545
PRIVATE_KEY=0x...

# Resolver
RESOLVER_URL=http://localhost:3001
POOL_MANAGER_ADDRESS=0x...
RESOLVER_PRIVATE_KEY=0x...

# Contracts (optional, loaded from deployment files)
VAULT_ADDRESS=0x...
POOL_ADDRESS=0x...
WETH_ADDRESS=0x...
```

## 🚢 Deployment

### Local Deployment

```bash
cd scaffold/packages/foundry

# Deploy all contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy BundledVault (requires PoolManager and Pool)
forge script script/DeployBundledVault.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Testnet Deployment

See [scaffold/packages/foundry/DEPLOYMENT.md](scaffold/packages/foundry/DEPLOYMENT.md) for detailed instructions.

## 🛠️ Development

### Smart Contract Development

```bash
cd scaffold/packages/foundry

# Compile contracts
forge build

# Run tests
forge test

# Format code
forge fmt

# Lint
forge test --gas-report
```

### Frontend Development

```bash
cd scaffold/packages/nextjs

# Start development server
yarn start

# Visit http://localhost:3000
```

### Resolver Service Development

```bash
cd resolver

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build
```

## 🔍 Key Features

### Privacy Protection

- **Position parameters encrypted** before storage
- **Individual ownership hidden** from on-chain visibility
- **TEE-based encryption** for secure parameter handling
- **Frontend encryption** ensures resolver never sees plaintext
- **Atomic bundling** - Flash loan and position opening in single transaction keeps liquidation prices private
- **Only TEE knows liquidation prices** - On-chain observers only see final state, not individual position parameters

### Vault Bundling & Atomic Position Creation

- **Bundles 10 deposits** before opening positions
- **Atomic transaction** - Flash loan + Open all positions + Repay flash loan in one transaction
- **Liquidation prices remain private** - Only TEE knows position parameters before execution
- **On-chain privacy** - Individual position parameters not visible until after atomic bundle completes
- **Gas optimization** through batch operations

### Native ETH Support

- **Accepts native ETH** deposits
- **Automatically wraps to WETH** internally
- **Unwraps for withdrawals** - users receive native ETH

### Soft Liquidation System

- **Soft liquidations only** - positions can be partially liquidated to restore health
- **No hard liquidations** - positions are never fully closed against user's will
- **Recovery mechanism** - users can restore positions after soft liquidation
- **Reserve pool protection** - reserve funds help cover bad debts during liquidation

## 📊 Test Results

**Foundry Tests:** ✅ 7/7 passing
- Deposit functionality
- Bundle readiness
- Position creation
- Multiple bundles
- Access control
- Position closing

**Integration Tests:** ✅ 16/16 passing
- Resolver service
- Encryption/decryption
- End-to-end flows

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

[Add license information]

## 🔗 Links

- [Architecture Documentation](notes/shayd-v2.md)
- [Encryption Guide](notes/README_ENCRYPTION.md)
- [Resolver Service](resolver/README.md)
- [ROFL Integration](README.ROFL.md)

## 💬 Support

For questions or issues, please open an issue on GitHub.
