#!/bin/bash
# Simple integration test script that doesn't require Jest

set -e

RESOLVER_URL=${RESOLVER_URL:-http://resolver:3001}
RPC_URL=${RPC_URL:-http://anvil:8545}

echo "Testing Resolver Service..."

# Test 1: Health check
echo "1. Testing health endpoint..."
HEALTH=$(curl -s ${RESOLVER_URL}/health)
if [ "$HEALTH" = "OK" ]; then
  echo "   ✓ Health check passed"
else
  echo "   ✗ Health check failed: $HEALTH"
  exit 1
fi

# Test 2: Hash endpoint
echo "2. Testing hash endpoint..."
HASH_RESPONSE=$(curl -s -X POST ${RESOLVER_URL}/hash \
  -H "Content-Type: application/json" \
  -d '{
    "position_id": "1",
    "collateral": "1000000000000000000",
    "debt": "500000000000000000",
    "owner": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }')

if echo "$HASH_RESPONSE" | grep -q '"hash"'; then
  HASH=$(echo "$HASH_RESPONSE" | grep -o '"hash":"[^"]*"' | cut -d'"' -f4)
  if [[ $HASH =~ ^0x[a-fA-F0-9]{64}$ ]]; then
    echo "   ✓ Hash endpoint passed: $HASH"
  else
    echo "   ✗ Invalid hash format: $HASH"
    exit 1
  fi
else
  echo "   ✗ Hash endpoint failed: $HASH_RESPONSE"
  exit 1
fi

# Test 3: Invalid parameters
echo "3. Testing error handling..."
ERROR_RESPONSE=$(curl -s -X POST ${RESOLVER_URL}/hash \
  -H "Content-Type: application/json" \
  -d '{
    "position_id": "1",
    "collateral": "1000000000000000000",
    "debt": "500000000000000000",
    "owner": ""
  }')

if echo "$ERROR_RESPONSE" | grep -q '"error"'; then
  echo "   ✓ Error handling passed"
else
  echo "   ✗ Error handling failed: $ERROR_RESPONSE"
  exit 1
fi

echo ""
echo "All tests passed! ✓"

