# ============================================================================
# Mobile-Rust Dockerfile - Bulk Picking System (Angular 20 + Rust + Axum)
# ============================================================================
# Single-container multi-stage build
# Rust backend serves both static files and API on port 4400
# Final image size: ~150MB (Rust binary + Angular dist + Alpine)
# ============================================================================

# ============================================================================
# Stage 1: Build Frontend (Angular 20)
# ============================================================================
FROM node:20-alpine AS frontend-builder

# Build arguments for frontend configuration (passed from docker-compose.yml)
ARG API_URL=http://192.168.0.11:4400/api
ARG FRONTEND_HOST=192.168.0.11
ARG FRONTEND_PORT=4400

# Set as environment variables for the build process
# These will be picked up by src/environments/load-env.js
ENV API_URL=${API_URL}
ENV FRONTEND_HOST=${FRONTEND_HOST}
ENV FRONTEND_PORT=${FRONTEND_PORT}
ENV PRODUCTION=true
# CSP Configuration for Content Security Policy
ENV CSP_API_HOST=${FRONTEND_HOST}
ENV CSP_API_PORT=${FRONTEND_PORT}
ENV CSP_NETWORK_HOST=${FRONTEND_HOST}
ENV CSP_NETWORK_PORT=${FRONTEND_PORT}
ENV CSP_WS_PORT=4200

# Set working directory
WORKDIR /app/frontend

# Copy package files first (for better layer caching)
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy frontend source code
COPY frontend/ ./

# Build production bundle (CRITICAL: build:prod ensures icons are included)
# load-env.js will use the environment variables set above
RUN npm run build:prod

# ============================================================================
# Stage 2: Build Backend (Rust + Axum)
# ============================================================================
FROM rust:alpine AS backend-builder

# Install build dependencies
RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    openssl-libs-static

# Set working directory
WORKDIR /app/backend

# Copy dependency manifests first (for better layer caching)
COPY backend/Cargo.toml backend/Cargo.lock ./

# Build dependencies only (creates dummy src/main.rs)
# This layer is cached unless Cargo.toml/Cargo.lock changes
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy actual backend source code
COPY backend/src ./src

# Build application
# touch src/main.rs forces rebuild of main crate after dummy build
RUN touch src/main.rs && \
    cargo build --release && \
    strip target/release/bulk_picking_backend

# ============================================================================
# Stage 3: Runtime - Single Container (Backend serves Frontend)
# ============================================================================
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    libgcc \
    openssl \
    wget

# Create non-root user for security
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    mkdir -p /app/logs && \
    mkdir -p /app/frontend/dist/frontend/browser && \
    chown -R appuser:appgroup /app

# Set working directory
WORKDIR /app

# Copy backend binary from builder stage
COPY --from=backend-builder /app/backend/target/release/bulk_picking_backend /app/bulk_picking_backend

# Copy frontend build from builder stage
COPY --from=frontend-builder /app/frontend/dist/frontend/browser /app/frontend/dist/frontend/browser

# Change ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port 4400 (single port for both frontend and API)
EXPOSE 4400

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4400/api/health || exit 1

# Set environment variables
ENV RUST_LOG=info \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=4400 \
    RUST_ENV=production

# Run application (Rust backend serves both static files and API)
CMD ["/app/bulk_picking_backend"]
