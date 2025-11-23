# Dockerfile for Resolver Service

FROM node:20-alpine

RUN apk add --no-cache libc6-compat python3 make g++ curl

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY *.ts ./

# Expose resolver port
EXPOSE 3001

# Run the resolver service using ts-node (no build needed)
CMD ["npm", "start"]

