# Multi-stage build for Next.js application
FROM node:20-alpine AS base

# Enable Corepack for Yarn 3.2.3
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy Yarn configuration and package files
COPY scaffold/.yarnrc.yml scaffold/.yarnrc.yml
COPY scaffold/.yarn ./scaffold/.yarn
COPY scaffold/package.json scaffold/yarn.lock ./
COPY scaffold/packages/nextjs/package.json ./packages/nextjs/
COPY scaffold/packages/foundry/package.json ./packages/foundry/

# Install dependencies
WORKDIR /app/scaffold
RUN yarn install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY scaffold ./scaffold

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js application
WORKDIR /app/scaffold/packages/nextjs
RUN yarn build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/scaffold ./scaffold
COPY --from=builder /app/node_modules ./node_modules

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

WORKDIR /app/scaffold/packages/nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["yarn", "serve"]

