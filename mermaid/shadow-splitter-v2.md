# Shayd: Privacy-First Leveraged Trading/Yield Generation Platform (v2.0)

## System Architecture

```mermaid
graph TB
    subgraph USER["👤 USER LAYER"]
        A["Users<br/>• Deposit ETH<br/>• Set leverage preferences<br/>• Receive f/x tokens"]
    end
    
    subgraph PRIVACY["🔒 PRIVACY & SECURITY"]
        B["Frontend Encryption<br/>• User encrypts parameters<br/>• AES-256-GCM encryption<br/>• Never sent in plaintext"]
        C["Oasis ROFL TEE<br/>• Stores encrypted parameters<br/>• Decrypts for operator only<br/>• Liquidation prices private"]
    end
    
    subgraph CORE["💰 CORE VAULT SYSTEM"]
        D["BundledVault<br/>• Accepts ETH deposits<br/>• Bundles 10 positions<br/>• Atomic flash loan bundle"]
        E["Atomic Position Creation<br/>• Flash loan<br/>• Open all 10 positions<br/>• Repay flash loan<br/>• Single transaction"]
        F["Forked f(x) Protocol<br/>• Pool Manager<br/>• Position management<br/>• Soft liquidations only"]
    end
    
    subgraph REVENUE["📈 REVENUE & DISTRIBUTION"]
        G["Fee Collection<br/>• Management: 2-5%<br/>• Performance: 10-20%<br/>• Trading: 0.1-0.5%"]
        H["Token Distribution<br/>• f/x tokens to users<br/>• Governance rights<br/>• Yield sharing"]
    end
    
    subgraph MONITORING["📊 RISK MONITORING"]
        I["Risk Monitoring<br/>• Liquidation protection<br/>• Market surveillance<br/>• Automated alerts"]
        R["Resolver Service<br/>• Liquidation execution<br/>• Position monitoring<br/>• Automated triggers"]
    end
    
    subgraph EXTERNAL["🌐 EXTERNAL SYSTEMS"]
        K["MEV Bots<br/>• Frontrunners<br/>• Whale Snipers"]
    end
    
    %% Main flow
    A -->|"1. Deposit ETH"| D
    A -->|"2. Encrypt params (frontend)"| B
    B -->|"3. Store encrypted"| C
    C -->|"4. Bundle ready (10 deposits)"| E
    E -->|"5. Atomic: Flash loan + Open positions + Repay"| F
    F -->|"6. Positions created<br/>(liquidation prices private)"| G
    G -->|"7. User rewards"| H
    
    %% Risk management loop
    E -->|"Risk data"| I
    I -->|"Liquidation signals"| R
    R -->|"Execute liquidations"| E
    
    %% Styling
    classDef userStyle fill:#e3f2fd,stroke:#1976d2,stroke-width:3px,color:#000
    classDef privacyStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px,color:#000
    classDef coreStyle fill:#e8f5e8,stroke:#2e7d32,stroke-width:3px,color:#000
    classDef revenueStyle fill:#fff3e0,stroke:#f57c00,stroke-width:3px,color:#000
    classDef monitoringStyle fill:#fce4ec,stroke:#c2185b,stroke-width:3px,color:#000
    classDef externalStyle fill:#ffebee,stroke:#d32f2f,stroke-width:2px,color:#000
    
    class A userStyle
    class B,C privacyStyle
    class D,E,F coreStyle
    class G,H revenueStyle
    class I,R monitoringStyle
    class K externalStyle
```

## Technical Flow Breakdown

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant F as 🌐 Frontend
    participant T as 🔒 Oasis ROFL TEE
    participant V as 💰 BundledVault
    participant FL as 💸 Flash Loan
    participant P as 🏦 Pool Manager (f(x))
    
    Note over U,P: User Deposit & Frontend Encryption
    U->>F: 1. Deposit ETH + set params<br/>(collateral, debt, owner)
    F->>F: 2. Encrypt position params<br/>(AES-256-GCM, frontend)
    F->>T: 3. Store encrypted params<br/>(resolver never sees plaintext)
    U->>V: 4. Deposit ETH transaction
    
    Note over U,P: Bundle & Atomic Position Creation
    V->>V: 5. Wait for 10 deposits<br/>(bundle ready)
    V->>T: 6. Operator requests params<br/>(for bundle)
    T->>T: 7. Decrypt in TEE<br/>(operator only, liquidation prices private)
    T->>V: 8. Return decrypted params<br/>(for position creation)
    V->>FL: 9. Take flash loan<br/>(atomic transaction starts)
    V->>P: 10. Open all 10 positions<br/>(same transaction)
    V->>FL: 11. Repay flash loan<br/>(same transaction)
    V->>V: 12. Positions created<br/>(liquidation prices remain private)
    
    Note over U,P: Withdrawal
    U->>V: 13. Request withdrawal
    V->>T: 14. Request encrypted params
    T->>U: 15. Return encrypted params<br/>(user decrypts on frontend)
    U->>V: 16. Close position<br/>(with decrypted params)
```

## Position Creation & Atomic Bundling

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant F as 🌐 Frontend
    participant T as 🔒 Oasis ROFL TEE
    participant O as 👷 Operator
    participant V as 💰 BundledVault
    participant FL as 💸 Flash Loan
    participant P as 🏦 Pool Manager (f(x))
    
    Note over U,P: Phase 1: Deposit & Encryption
    U->>F: 1. Deposit ETH<br/>(to BundledVault)
    F->>F: 2. Encrypt position params<br/>(AES-256-GCM, frontend)
    F->>T: 3. Store encrypted params<br/>(resolver never sees plaintext)
    U->>V: 4. Deposit ETH transaction
    
    Note over U,P: Phase 2: Bundle Ready (10 deposits)
    V->>V: 5. Collect 10 deposits<br/>(bundle ready)
    V->>O: 6. Bundle ready event
    
    Note over U,P: Phase 3: Atomic Position Creation
    O->>T: 7. Request encrypted params<br/>(for bundle)
    T->>O: 8. Return encrypted params<br/>(operator decrypts in TEE)
    O->>FL: 9. Take flash loan<br/>(for position creation)
    O->>V: 10. createPositionsFromBundle()<br/>(atomic transaction)
    V->>P: 11. Open position 1<br/>(flash loan active)
    V->>P: 12. Open position 2<br/>(flash loan active)
    V->>P: 13. ... Open positions 3-10<br/>(all in same transaction)
    V->>FL: 14. Repay flash loan<br/>(same transaction)
    V->>V: 15. All positions created<br/>(atomic bundle complete)
    
    Note over U,P: Privacy Protection
    Note over F: Frontend encrypts:<br/>• Position parameters<br/>• Never sent plaintext<br/>• User controls encryption
    Note over T: TEE stores:<br/>• Encrypted parameters<br/>• Decrypts for operator only<br/>• Liquidation prices private
    Note over V: On-chain sees only:<br/>• Final position state<br/>• Not individual params<br/>• Liquidation prices hidden
```

## Liquidation Flow with Resolver

```mermaid
sequenceDiagram
    participant M as 📊 Risk Monitor
    participant R as 🔧 Resolver Service
    participant C as 💰 Vault Contract
    participant P as 🏦 Pool Manager
    participant U as 👤 User
    
    Note over M,U: Liquidation Detection & Execution
    M->>M: 1. Monitor positions<br/>(check debt ratios)
    M->>R: 2. Detect undercollateralized<br/>(liquidation threshold exceeded)
    R->>R: 3. Calculate liquidation params<br/>(maxRawDebts, receiver)
    R->>P: 4. Execute liquidation<br/>(liquidate function call)
    P->>C: 5. Process liquidation<br/>(burn debt, transfer collateral)
    C->>U: 6. Transfer collateral<br/>(to receiver address)
    
    Note over M,U: Resolver Execution
    Note over R: Resolver handles:<br/>• Position monitoring<br/>• Liquidation triggers<br/>• Automated execution
    Note over P: Pool Manager:<br/>• Validates liquidation<br/>• Processes debt/collateral<br/>• Updates position state
```

## Architecture Details

```mermaid
graph LR
    subgraph USER["👤 USER SIDE"]
        A["User Input<br/>Position params:<br/>• Collateral amount<br/>• Debt amount<br/>• Owner address"]
        B["Ethers.js Wallet<br/>Sign transaction<br/>Submit to TEE<br/>Submit to contract"]
    end
    
    subgraph TEE["🔒 OASIS ROFL TEE"]
        C["Encrypted Storage<br/>Store encrypted params<br/>Decrypt for operator only<br/>Liquidation prices private"]
    end
    
    subgraph ONCHAIN["⛓️ ON-CHAIN EXECUTION"]
        D["BundledVault<br/>Accept deposits<br/>Bundle 10 positions<br/>Atomic flash loan bundle"]
        E["Pool Manager (f(x))<br/>Position operations<br/>Debt/collateral management<br/>Soft liquidations"]
    end
    
    subgraph RESOLVER["🔧 RESOLVER SERVICE"]
        F["Position Monitoring<br/>Monitor debt ratios<br/>Detect liquidations"]
        G["Liquidation Execution<br/>Calculate params<br/>Execute liquidations"]
    end
    
    subgraph MONITORING["📊 RISK MONITORING"]
        H["Risk Monitor<br/>Market surveillance<br/>Automated alerts"]
    end
    
    %% Main flow
    A -->|"1. Deposit ETH"| D
    A -->|"2. Encrypt params"| B
    B -->|"3. Store encrypted"| C
    C -->|"4. Bundle ready"| D
    D -->|"5. Atomic flash loan bundle"| E
    
    %% Monitoring flow
    E -->|"5"| H
    H -->|"6"| F
    F -->|"7"| G
    G -->|"8"| E
    
    %% Styling
    classDef userStyle fill:#e3f2fd,stroke:#1976d2,stroke-width:3px,color:#000
    classDef teeStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px,color:#000
    classDef onchainStyle fill:#fff3e0,stroke:#f57c00,stroke-width:3px,color:#000
    classDef resolverStyle fill:#e8f5e8,stroke:#2e7d32,stroke-width:3px,color:#000
    classDef monitoringStyle fill:#fce4ec,stroke:#c2185b,stroke-width:3px,color:#000
    
    class A,B userStyle
    class C teeStyle
    class D,E onchainStyle
    class F,G resolverStyle
    class H monitoringStyle
```

## Core Concept

**Shayd** implements a privacy-first leveraged trading/yield generation platform using Oasis ROFL TEE for secure parameter hashing and a dedicated resolver service for automated liquidations.

### Key Innovation: Frontend Encryption + Atomic Bundling

**Problem**: Position parameters (collateral, debt, owner) reveal liquidation prices, making positions vulnerable to MEV extraction.

**Solution**: Privacy-first architecture:
1. **Frontend Encryption**: Users encrypt position parameters before sending to resolver
2. **TEE Storage**: Encrypted parameters stored in TEE, resolver never sees plaintext
3. **Atomic Bundling**: Flash loan + Open all 10 positions + Repay in single transaction
4. **Liquidation Prices Private**: Only TEE knows position parameters; on-chain only sees final state
5. **Soft Liquidations**: Positions can be partially liquidated, no hard liquidations

### Technical Implementation

**Architecture Layers**:
- **Frontend Layer**: User-side encryption (AES-256-GCM) before sending to resolver
- **TEE Layer**: Oasis ROFL TEE for encrypted parameter storage and operator decryption
- **Vault Core**: BundledVault with atomic flash loan bundling (forked f(x) protocol)
- **Resolver Layer**: Automated soft liquidation execution and position monitoring
- **Monitoring Layer**: Risk management and position monitoring

**Key Technical Features**:
- **Frontend Encryption**: Position parameters encrypted before leaving user's device
- **Atomic Bundling**: Flash loan + position opening + repayment in single transaction
- **Privacy Protection**: Liquidation prices only known to TEE, on-chain sees final state only
- **Forked f(x) Protocol**: Direct fork with soft liquidation support
- **No Hard Liquidations**: Positions can be partially liquidated to restore health

### Position Parameter Encryption

Position parameters that are encrypted on the frontend include:
- **Collateral Amount**: The amount of collateral tokens
- **Debt Amount**: The amount of debt tokens
- **Owner Address**: The address of the position owner
- **Position ID**: The unique identifier for the position

The frontend encrypts these parameters using AES-256-GCM before sending to the resolver. The TEE stores encrypted parameters and only decrypts for the operator when creating positions. This ensures liquidation prices remain private until after the atomic bundle transaction completes.

### Soft Liquidation Execution

Soft liquidations are executed by the resolver service located in the `resolver/` folder:
- **Position Monitoring**: Continuously monitors position debt ratios
- **Liquidation Detection**: Identifies undercollateralized positions
- **Automated Execution**: Executes soft liquidations via Pool Manager contract (forked f(x))
- **Partial Liquidation**: Positions are partially liquidated to restore health, never fully closed
- **No Hard Liquidations**: Users can recover positions after soft liquidation

### Revenue Model

**Fee Structure**:
- Management fees: 2-5% on AUM
- Performance fees: 10-20% of generated yield  
- Trading fees: 0.1-0.5% on DEX transactions

**Revenue Drivers**:
- Higher yields due to efficient execution (15-25% vs 5-8% traditional)
- Lower gas costs on L2 (90%+ reduction)
- Automated management reduces user friction

### Risk Management

**Technical Risks**:
- Smart contract vulnerabilities (mitigated by audits + formal verification)
- TEE failures (redundant systems + monitoring)
- Resolver service availability (high availability deployment)

**Market Risks**:
- Yield source failures (diversified strategies)
- Liquidity constraints (L2 efficiency + partnerships)
- Position liquidation timing (automated resolver execution)

