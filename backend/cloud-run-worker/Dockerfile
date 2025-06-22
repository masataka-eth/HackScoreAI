FROM node:18-slim

# Install npx and required dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Create non-root user (skip if UID already exists)
RUN useradd -m worker || true
USER worker

EXPOSE 8080

CMD ["npm", "start"]