FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

# Copy everything
COPY package*.json ./
RUN npm install

COPY . .
RUN npx tsc --skipLibCheck || true   # compile even with errors

EXPOSE 3000
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
