# Multi-stage production Dockerfile for OrchestrAI frontend (Next.js App Router)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies required for Next.js build
RUN npm ci

# Copy application configuration and source code
COPY tsconfig.json ./
COPY next.config.mjs ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY src/ ./src/

# Pass public build arguments if needed during static generation
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Build production Next.js artifacts
RUN npm run build

# ── Stage 2: Minimal Production Runtime ──────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built Next.js artifacts and configuration
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src/app ./src/app

# Expose Next.js SSR default port
EXPOSE 3000

# Start production server
CMD ["npm", "run", "start"]
