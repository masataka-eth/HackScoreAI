# HackScore AI Worker Dockerfile
# Multi-stage build for production optimization

# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including dev dependencies for potential build steps
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Production stage
FROM node:20-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    ca-certificates \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code from builder stage
COPY --from=builder --chown=nodeuser:nodejs /app/src ./src

# Create necessary directories with proper permissions
RUN mkdir -p /tmp/.npm-global /tmp/.config && \
    chown -R nodeuser:nodejs /tmp/.npm-global /tmp/.config && \
    chown -R nodeuser:nodejs /app

# Set environment variables for Claude Code SDK
ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_PREFIX=/tmp/.npm-global \
    HOME=/tmp \
    TMPDIR=/tmp \
    NPM_CONFIG_CACHE=/tmp/.npm \
    NPM_CONFIG_UNSAFE_PERM=true \
    NODE_OPTIONS=--max-old-space-size=8192 \
    XDG_CONFIG_HOME=/tmp/.config

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]