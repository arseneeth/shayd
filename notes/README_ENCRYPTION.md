# Encryption Flow for Position Parameters

## Current Issue
The current implementation has the resolver encrypt parameters server-side, which means the resolver sees plaintext. This defeats the privacy purpose.

## Correct Flow (Frontend Encryption)

### 1. User Deposits (Frontend)
When a user wants to deposit:
1. User enters position parameters (collateral, debt) in the frontend
2. **Frontend encrypts parameters** using the encryption utilities
3. User deposits ETH to `BundledVault.deposit()`
4. Frontend sends **already-encrypted** parameters to resolver `/store-encrypted` endpoint

### 2. Resolver Storage
- Resolver receives **already-encrypted** parameters
- Resolver stores them without ever seeing plaintext
- Resolver links encrypted params to deposit index

### 3. Position Creation (Operator) - Atomic Bundle with Flash Loan
When bundle is ready:
1. Operator calls resolver `/get-params-for-bundle` with deposit IDs
2. Resolver returns **encrypted** parameters (still encrypted)
3. Operator decrypts using TEE password (only operator has access)
4. **Atomic bundle transaction** - Operator calls `BundledVault.createPositionsFromBundle()` which:
   - Takes flash loan
   - Opens all 10 positions atomically in single transaction
   - Repays flash loan
   - All in one atomic transaction
5. **Liquidation prices remain private** - Only TEE knows position parameters before execution
6. On-chain observers only see final state, not individual position parameters that reveal liquidation prices

### 4. Withdrawal
When user wants to withdraw:
1. User requests withdrawal from vault
2. Vault requests params from resolver
3. Resolver returns encrypted params to user
4. User decrypts on frontend (or resolver decrypts if user authorized)
5. User calls `BundledVault.closePosition()` with decrypted params

## Encryption Implementation

### Frontend (Next.js)
```typescript
import { encryptPositionParams } from '@/utils/encryption';

// When user deposits
const params = {
  position_id: '0', // Will be set later
  collateral: collateralAmount.toString(),
  debt: debtAmount.toString(),
  owner: userAddress,
};

// Encrypt on frontend BEFORE sending
const encrypted = encryptPositionParams(params, TEE_PUBLIC_KEY); // Or symmetric key

// Send encrypted params to resolver
await fetch(`${RESOLVER_URL}/store-encrypted`, {
  method: 'POST',
  body: JSON.stringify({
    userAddress,
    depositIndex,
    encryptedParams: encrypted,
  }),
});
```

### Resolver Endpoint
- `/store-encrypted`: Receives already-encrypted params, stores them
- `/get-params-for-bundle`: Returns encrypted params (operator decrypts)
- `/get-params`: Returns encrypted params (user decrypts on frontend)

## Key Management

**Option 1: Symmetric Encryption (Current)**
- Frontend and resolver share the same TEE password
- Problem: Frontend needs to know the password (less secure)

**Option 2: Asymmetric Encryption (Recommended)**
- Resolver has a public/private key pair
- Frontend encrypts with public key
- Only resolver (with private key) can decrypt
- Better privacy: resolver never sees plaintext

**Option 3: Hybrid**
- Frontend encrypts with user's own key
- Resolver re-encrypts with TEE key
- Double encryption for extra security

## Current Implementation Status

Currently, the resolver's `/encrypt-and-store` endpoint:
- ❌ Receives plaintext parameters
- ❌ Encrypts server-side
- ❌ Resolver sees plaintext

Should be:
- ✅ Frontend encrypts before sending
- ✅ Resolver only receives encrypted data
- ✅ Resolver never sees plaintext

