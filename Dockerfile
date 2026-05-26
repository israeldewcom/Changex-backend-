# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install                 # ✅ works without lockfile, or you can add --package-lock
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Copy email templates (adjust if they were in src)
COPY --from=builder /app/src/email/templates ./dist/email/templates
RUN npm ci --only=production    # this works because lockfile is now present (or use npm install --omit=dev)
EXPOSE 5000
USER node
CMD ["node", "dist/index.js"]
