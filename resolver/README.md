# Resolver Service

The Resolver Service is an off-chain service that provides encryption, storage, and retrieval of position parameters for the BundledVault system. It integrates with Oasis ROFL TEE for secure parameter handling.

## 🎯 Overview

The resolver service:
- **Encrypts position parameters** using AES-256-GCM encryption
- **Stores encrypted parameters** in memory (TEE storage in production)
- **Provides decrypted parameters** for position creation (operator only)
- **Returns encrypted parameters** for user withdrawal (user decrypts on frontend)
- **Monitors positions** for soft liquidation (optional) - executes soft liquidations only, no hard liquidations

## 🏗️ Architecture

```
Frontend → Encrypt → Resolver (stores encrypted) → Operator (decrypts) → Create Positions
                                                              ↓
User Withdrawal ← Decrypt (frontend) ← Get Encrypted ← Resolver
```

## 🔐 Encryption Flow

### Frontend Encryption (Privacy-First)

**Recommended approach** - Frontend encrypts before sending:

1. User deposits ETH → `BundledVault.deposit()`
2. Frontend encrypts parameters → `encryptPositionParams(params, password)`
3. Send encrypted to resolver → `POST /store-encrypted`
4. Resolver stores → Never sees plaintext ✅

### Server-Side Encryption (Legacy)

**Alternative approach** - Resolver encrypts (less private):

1. User deposits ETH → `BundledVault.deposit()`
2. Send plaintext to resolver → `POST /encrypt-and-store`
3. Resolver encrypts → Sees plaintext ⚠️
4. Resolver stores encrypted

## 📡 API Endpoints

### Health Check

```http
GET /health
```

**Response:**
```
OK
```

### Store Encrypted Parameters (Recommended)

```http
POST /store-encrypted
Content-Type: application/json

{
  "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "depositIndex": 0,
  "encryptedParams": {
    "encrypted": "base64-encoded-ciphertext:auth-tag",
    "iv": "hex-encoded-iv",
    "salt": "hex-encoded-salt"
  }
}
```

**Response:**
```json
{
  "success": true,
  "depositId": "0x742d35cc6634c0532925a3b844bc9e7595f0beb-0-1234567890",
  "message": "Encrypted parameters stored successfully"
}
```

### Get Parameters for Bundle (Operator Only)

```http
POST /get-params-for-bundle
Content-Type: application/json

{
  "depositIds": [
    "0x742d35cc6634c0532925a3b844bc9e7595f0beb-0-1234567890",
    "..."
  ],
  "password": "tee-encryption-password"
}
```

**Response:**
```json
{
  "success": true,
  "params": [
    {
      "position_id": "0",
      "collateral": "800000000000000000",
      "debt": "400000000000000000",
      "owner": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    },
    ...
  ]
}
```

### Get Parameters (User Withdrawal)

```http
POST /get-params
Content-Type: application/json

{
  "position_id": "1",
  "owner": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response:**
```json
{
  "position_id": "1",
  "encryptedParams": {
    "encrypted": "...",
    "iv": "...",
    "salt": "..."
  }
}
```

### Link Position ID

```http
POST /link-position
Content-Type: application/json

{
  "depositId": "0x742d35cc6634c0532925a3b844bc9e7595f0beb-0-1234567890",
  "positionId": "1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Position linked successfully"
}
```

### Legacy: Encrypt and Store

```http
POST /encrypt-and-store
Content-Type: application/json

{
  "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "depositIndex": 0,
  "collateral": "800000000000000000",
  "debt": "400000000000000000"
}
```

**Note:** This endpoint sees plaintext. Use `/store-encrypted` for better privacy.

## 🔧 Configuration

### Environment Variables

```env
# Blockchain
RPC_URL=http://localhost:8545

# Contracts
POOL_MANAGER_ADDRESS=0x...
VAULT_ADDRESS=0x...

# Authentication
PRIVATE_KEY=0x...

# Encryption
TEE_ENCRYPTION_PASSWORD=your-secure-password

# Monitoring (optional)
LIQUIDATION_THRESHOLD=1000000000000000000
MONITORING_INTERVAL=30000
```

### Starting the Service

```bash
# Install dependencies
npm install

# Start service
npm start

# Or in development mode
npm run dev
```

## 🔐 Encryption Implementation

### Encryption Algorithm

- **Algorithm**: AES-256-GCM
- **Key Derivation**: scrypt (N=16384, r=8, p=1)
- **IV**: Random 16 bytes
- **Salt**: Random 32 bytes
- **Authentication**: GCM auth tag

### Encryption Functions

```typescript
import { encryptPositionParams, decryptPositionParams } from './encryption';

// Encrypt
const encrypted = encryptPositionParams(params, password);

// Decrypt
const params = decryptPositionParams(encrypted, password);
```

### Position Parameters Structure

```typescript
interface PositionParams {
  position_id: string;
  collateral: string;
  debt: string;
  owner: string;
}
```

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

See [tests/integration/README.md](../tests/integration/README.md)

## 🐳 Docker

The resolver service is included in `docker-compose.rofl.yml`:

```bash
# Start resolver service
docker-compose -f docker-compose.rofl.yml up resolver

# View logs
docker-compose -f docker-compose.rofl.yml logs resolver
```

## 🔒 Security Considerations

### Encryption Key Management

- **TEE Password**: Should be stored securely (environment variable, secrets manager)
- **Key Derivation**: Uses scrypt for secure key derivation
- **Salt**: Unique salt per encryption (prevents rainbow table attacks)

### Privacy Best Practices

1. **Frontend Encryption**: Encrypt on frontend before sending to resolver
2. **TEE Storage**: In production, use Oasis ROFL TEE for secure storage
3. **Access Control**: Only operator can decrypt for position creation
4. **User Decryption**: Users decrypt on frontend (resolver never sees plaintext)

### Production Deployment

For production:
- Use Oasis ROFL TEE for secure storage
- Implement proper access control
- Use secure key management (HSM, secrets manager)
- Enable HTTPS/TLS
- Implement rate limiting
- Add authentication/authorization

## 📚 Related Documentation

- [Main README](../README.md) - Project overview
- [Encryption Guide](../notes/README_ENCRYPTION.md) - Detailed encryption documentation
- [Architecture Documentation](../notes/shayd-v2.md) - System architecture
- [ROFL Integration Guide](../README.ROFL.md) - ROFL TEE integration

## 🐛 Troubleshooting

### Service won't start

- Check port 3001 is available: `lsof -i :3001`
- Verify environment variables are set
- Check logs: `npm start` or `docker-compose logs resolver`

### Encryption errors

- Verify TEE_ENCRYPTION_PASSWORD is set
- Check encryption utilities are imported correctly
- Ensure parameters match expected structure

### Connection errors

- Verify RPC_URL is correct and accessible
- Check POOL_MANAGER_ADDRESS is set
- Ensure contracts are deployed
