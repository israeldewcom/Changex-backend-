# Builder stage: compile TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc --skipLibCheck || true

# Final stage: install all deps, then prune
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
# Install ALL dependencies (including dev) to ensure nothing missing
RUN npm install
# Then remove dev dependencies to keep image lean
RUN npm prune --omit=dev
EXPOSE 3000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
