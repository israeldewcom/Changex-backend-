# File: Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY src/email/templates ./dist/email/templates
EXPOSE 5000
USER node
CMD ["node", "dist/index.js"]
