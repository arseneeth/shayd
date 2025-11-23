#!/bin/bash
# Verification script for Scaffold-ETH setup

set -e

echo "🔍 Verifying Scaffold-ETH Setup..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "scaffold" ]; then
    echo -e "${RED}❌ Error: scaffold directory not found. Run this from the project root.${NC}"
    exit 1
fi

cd scaffold

# 1. Check Node.js version
echo "1. Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1,2)
REQUIRED_VERSION="20.18"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Required: >= $REQUIRED_VERSION${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"
fi

# 2. Check Yarn
echo ""
echo "2. Checking Yarn..."
if ! command -v yarn &> /dev/null; then
    echo -e "${RED}❌ Yarn not found. Install with: npm install -g yarn${NC}"
    exit 1
fi
YARN_VERSION=$(yarn -v)
echo -e "${GREEN}✓ Yarn version: $YARN_VERSION${NC}"

# 3. Check dependencies
echo ""
echo "3. Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Dependencies not installed. Running yarn install...${NC}"
    yarn install
else
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# 4. Check Foundry package
echo ""
echo "4. Checking Foundry package..."
cd packages/foundry

# Check if forge is available
if ! command -v forge &> /dev/null; then
    echo -e "${YELLOW}⚠ Foundry not found in PATH. Checking if it's installed locally...${NC}"
    if [ ! -f ".foundry/bin/forge" ]; then
        echo -e "${RED}❌ Foundry not found. Install with: foundryup${NC}"
        exit 1
    fi
    export PATH="$PATH:$(pwd)/.foundry/bin"
fi

FORGE_VERSION=$(forge --version | head -n1)
echo -e "${GREEN}✓ Foundry version: $FORGE_VERSION${NC}"

# Check if contracts compile
echo ""
echo "5. Compiling contracts..."
if forge build --force 2>&1 | grep -q "Error"; then
    echo -e "${RED}❌ Contract compilation failed${NC}"
    forge build --force
    exit 1
else
    echo -e "${GREEN}✓ Contracts compiled successfully${NC}"
fi

# 6. Check Next.js package
echo ""
echo "6. Checking Next.js package..."
cd ../nextjs

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Next.js dependencies not installed. Running yarn install...${NC}"
    yarn install
else
    echo -e "${GREEN}✓ Next.js dependencies installed${NC}"
fi

# Check TypeScript compilation
echo ""
echo "7. Checking TypeScript types..."
if yarn check-types 2>&1 | grep -q "error"; then
    echo -e "${YELLOW}⚠ TypeScript errors found (non-blocking)${NC}"
    yarn check-types || true
else
    echo -e "${GREEN}✓ TypeScript types valid${NC}"
fi

# 8. Check deployment files
echo ""
echo "8. Checking deployment files..."
cd ../foundry
if [ -d "deployments" ] && [ "$(ls -A deployments/*.json 2>/dev/null)" ]; then
    echo -e "${GREEN}✓ Deployment files found:${NC}"
    ls -1 deployments/*.json 2>/dev/null | sed 's/^/  - /'
else
    echo -e "${YELLOW}⚠ No deployment files found. Contracts need to be deployed.${NC}"
fi

# 9. Check deployed contracts in Next.js
echo ""
echo "9. Checking deployed contracts configuration..."
cd ../nextjs
if [ -f "contracts/deployedContracts.ts" ]; then
    if grep -q "31337" contracts/deployedContracts.ts; then
        echo -e "${GREEN}✓ Local network (31337) contracts configured${NC}"
    else
        echo -e "${YELLOW}⚠ No local network contracts found in deployedContracts.ts${NC}"
    fi
else
    echo -e "${YELLOW}⚠ deployedContracts.ts not found${NC}"
fi

# 10. Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Scaffold-ETH verification complete!${NC}"
echo ""
echo "To start Scaffold-ETH:"
echo "  1. Start blockchain:  cd scaffold && yarn chain"
echo "  2. Deploy contracts:  cd scaffold && yarn deploy"
echo "  3. Start frontend:    cd scaffold && yarn start"
echo ""
echo "Or use Docker:"
echo "  docker-compose -f docker-compose.rofl.yml up nextjs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

