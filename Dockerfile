FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Cloud Run injects PORT automatically
EXPOSE 3000

CMD ["node", "server.js"]
