# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/email/templates ./dist/email/templates   # if templates are in src
RUN npm ci --only=production
EXPOSE 5000
USER node
CMD ["node", "dist/index.js"]
