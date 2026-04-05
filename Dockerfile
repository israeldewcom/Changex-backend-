FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc --skipLibCheck || true

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
# Copy compiled code
COPY --from=builder /app/dist ./dist
# Copy the entire node_modules (which includes cookie-parser)
COPY --from=builder /app/node_modules ./node_modules
# Double‑check that cookie-parser is actually there
RUN ls -la node_modules | grep cookie-parser || (echo "cookie-parser missing, installing now" && npm install cookie-parser)
EXPOSE 3000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
