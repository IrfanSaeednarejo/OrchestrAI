# Multi-stage production Dockerfile for OrchestrAI backend (Express + LangGraph)
# Pin Node 20-alpine (meets packages requiring Node ^20.19.0+)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies needed for compiling TypeScript)
RUN npm ci

# Copy TypeScript configuration and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# ── Stage 2: Minimal Production Runtime ──────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Ensure container runs with production environment
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript output from the builder stage
COPY --from=builder /app/dist ./dist

# Internal backend port (Express defaults to 4000)
EXPOSE 4000

# Start HTTP server
CMD ["node", "dist/api/server.js"]
