# Multi-stage production Dockerfile for OrchestrAI backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install all dependencies (including devDependencies needed for building TS)
RUN npm ci

# Copy source code and tsconfig
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifests and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled assets from builder stage
COPY --from=builder /app/dist ./dist

# Server defaults to 4000 (APP_PORT or PORT)
EXPOSE 4000

# Run compiled HTTP server
CMD ["node", "dist/api/server.js"]
