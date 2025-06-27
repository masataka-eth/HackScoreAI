FROM node:18-slim

# Install npx and required dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# npxは Node.js 18には既に含まれているので、corepackの有効化のみ
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN useradd -m -u 1001 worker

# npm/npxのキャッシュディレクトリを設定（重要！）
ENV NPM_CONFIG_CACHE=/tmp/.npm
RUN mkdir -p /tmp/.npm && chown -R worker:worker /tmp/.npm

# MCPサーバー用の一時ディレクトリも作成（重要！）
RUN mkdir -p /tmp/mcp && chown -R worker:worker /tmp/mcp

# Change to non-root user
USER worker

EXPOSE 8080

CMD ["npm", "start"]