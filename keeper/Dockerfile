FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build || true

# Expose port (if needed for health checks)
EXPOSE 3002

# Start keeper service
CMD ["npm", "start"]

