# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and tsconfig
COPY package*.json tsconfig.json ./

# Install all dependencies (skip prepare script, we'll build manually)
RUN npm ci --ignore-scripts

# Copy source files
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip prepare script since we copy pre-built dist)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set default environment variables
ENV LMSTUDIO_HOST=host.docker.internal
ENV LMSTUDIO_PORT=1234

# Run as non-root user
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001 -G mcp && \
    chown -R mcp:mcp /app

USER mcp

# MCP servers communicate via stdio
ENTRYPOINT ["node", "dist/index.js"]
