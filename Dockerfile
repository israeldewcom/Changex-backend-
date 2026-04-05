FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

# Copy all source files and install dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

COPY . .

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R node:node /app

EXPOSE 3000
USER node
ENTRYPOINT ["/sbin/tini", "--"]

# Run the TypeScript server directly (no build step)
CMD ["npx", "ts-node", "src/server.ts"]
