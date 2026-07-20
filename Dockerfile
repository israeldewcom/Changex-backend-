# ============================================================
# FILE: Dockerfile (FIXED – multi-stage build)
# ============================================================

# ─── STAGE 1: BUILD ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ─── STAGE 2: PRODUCTION ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
