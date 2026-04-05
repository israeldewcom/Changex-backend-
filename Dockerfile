FROM node:20-alpine
WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy the entire source code
COPY . .

# Create logs directory (avoid permission issues)
RUN mkdir -p logs

# Expose the port
EXPOSE 3000

# Run with ts-node but skip type checking
CMD ["npx", "ts-node", "--transpile-only", "src/server.ts"]
