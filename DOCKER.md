# Docker Deployment Guide - Mobile-Rust Bulk Picking System

## Overview

This guide covers Docker deployment for the Mobile-Rust Bulk Picking System. The deployment uses a **single-container architecture** where the Rust backend serves both the Angular frontend static files and the API endpoints on **port 4400**, matching the Windows `start_server.bat` deployment.

### Architecture

```
┌─────────────────────────────────────────────┐
│  Docker Container (mobile-rust-app)         │
│  Port: 4400                                  │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Rust Backend (Axum + tower-http)      │ │
│  │  - Serves API: /api/*                  │ │
│  │  - Serves Static Files: /*             │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Angular 20 Frontend (built)           │ │
│  │  /app/frontend/dist/frontend/browser/  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         │                          │
         ├──────────────────────────┤
         ▼                          ▼
   SQL Server              LDAP Server
   192.168.0.86:49381     192.168.0.1
```

## Prerequisites

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Network Access**: Container must reach:
  - SQL Server: 192.168.0.86:49381
  - LDAP Server: 192.168.0.1
- **Server IP**: 192.168.0.10 (configured in CORS)

## Quick Start

### 1. Build the Docker Image

```bash
cd /home/deachawat/dev/projects/BPP/Mobile-Rust

# Build the image (takes 5-10 minutes first time)
docker-compose build
```

**Build Process:**
- Stage 1: Builds Angular 20 frontend (`npm run build:prod`)
- Stage 2: Builds Rust backend (`cargo build --release`)
- Stage 3: Creates runtime image with both artifacts (~150MB)

### 2. Start the Service

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Access the Application

- **Frontend**: http://192.168.0.10:4400
- **Backend API**: http://192.168.0.10:4400/api
- **Health Check**: http://192.168.0.10:4400/api/health

**Login Credentials** (from CLAUDE.md):
- Username: `deachawat`
- Password: `Wind@password9937`

## Configuration

### Environment Variables

Edit `docker-compose.yml` to customize configuration:

```yaml
environment:
  # Server Configuration
  - SERVER_HOST=0.0.0.0        # Bind to all interfaces
  - SERVER_PORT=4400           # Application port

  # Database Configuration
  - DATABASE_SERVER=192.168.0.86
  - DATABASE_PORT=49381
  - DATABASE_NAME=TFCPILOT3
  - DATABASE_USERNAME=dvl
  - DATABASE_PASSWORD=Pr0gr@mm1ng

  # LDAP Configuration
  - LDAP_URL=ldap://192.168.0.1
  - LDAP_BASE_DN=DC=NWFTH,DC=com
  - LDAP_ENABLED=true

  # JWT Configuration
  - JWT_SECRET=CHANGE_THIS_IN_PRODUCTION_PLEASE
  - JWT_DURATION_HOURS=168

  # CORS Configuration
  - CORS_ORIGINS=http://192.168.0.10:4400,http://localhost:4400
```

### Alternative: .env File Configuration

1. Create a `.env` file in the project root:

```bash
# .env
DATABASE_SERVER=192.168.0.86
DATABASE_PORT=49381
DATABASE_NAME=TFCPILOT3
DATABASE_USERNAME=dvl
DATABASE_PASSWORD=Pr0gr@mm1ng

LDAP_URL=ldap://192.168.0.1
LDAP_BASE_DN=DC=NWFTH,DC=com
LDAP_ENABLED=true

JWT_SECRET=your-strong-jwt-secret-here
JWT_DURATION_HOURS=168

CORS_ORIGINS=http://192.168.0.10:4400,http://localhost:4400
```

2. Uncomment the volume mount in `docker-compose.yml`:

```yaml
volumes:
  - ./.env:/app/.env:ro
```

## Production Configuration

### Resource Limits (Optimized for 24-core, 64GB Server)

The deployment includes production-ready resource limits to prevent runaway resource consumption and enable future scaling:

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'          # Maximum 4 CPU cores per container
      memory: 2G           # Maximum 2GB RAM per container
    reservations:
      cpus: '2.0'          # Minimum 2 cores reserved
      memory: 1G           # Minimum 1GB reserved
  restart_policy:
    condition: on-failure
    delay: 5s
    max_attempts: 3
    window: 120s
```

**Resource Utilization:**
- **Single Container**: Uses 5-8% of CPU capacity (1-2 active cores out of 24)
- **With 4 Replicas** (future scaling): Uses 30-50% of CPU capacity
- **Memory**: ~200-500MB per container under normal load

### Database Connection Pool Configuration

The backend now supports environment-based connection pool tuning:

```yaml
environment:
  - DATABASE_MAX_CONNECTIONS=40           # Default: 20, Production: 40-120
  - DATABASE_MIN_CONNECTIONS=10           # Default: 5, Production: 10-30
  - DATABASE_CONNECTION_TIMEOUT_SECS=10   # Default: 10, Production: 10-30
```

**Configuration Guidelines:**

| Deployment | Max Connections | Min Connections | Notes |
|------------|----------------|-----------------|-------|
| **Development** | 20 | 5 | Default values, single user |
| **Production (Single)** | 40 | 10 | Current deployment (1 container) |
| **Production (4 Replicas)** | 30 | 10 | 4 × 30 = 120 total connections |
| **Production (6 Replicas)** | 20 | 5 | 6 × 20 = 120 total connections |

**Important Notes:**
- SQL Server default max connections: **32,767** (virtually unlimited for this use case)
- Each container needs enough connections for concurrent requests
- Formula: `Total DB Connections = Replicas × Max Connections per Container`
- Monitor with: `docker-compose logs | grep "Connection pool initialized"`

### Performance Tuning

**Expected Performance (Single Container):**
- Throughput: 500-1,000 requests/second
- Latency (p95): 50-100ms
- Max concurrent users: 50-100

**With Multi-Replica Deployment (Future):**
- Throughput: 3,000-6,000 requests/second (6x improvement)
- Latency (p95): 20-40ms (2-3x improvement)
- Max concurrent users: 300-600 (6x improvement)

### Monitoring Resource Usage

```bash
# View real-time resource usage
docker stats mobile-rust-app

# Check CPU and memory limits are applied
docker inspect mobile-rust-app | grep -A 10 "NanoCpus\|Memory"

# Monitor database connection pool
docker-compose logs | grep "Connection pool"
```

**Sample Output:**
```
CONTAINER         CPU %   MEM USAGE / LIMIT   MEM %   NET I/O
mobile-rust-app   8.5%    450MB / 2GB        22.5%   1.2MB / 3.4MB
```

## Docker Commands

### Build and Run

```bash
# Build image
docker-compose build

# Start service
docker-compose up -d

# Start service (foreground with logs)
docker-compose up
```

### Monitor and Debug

```bash
# View logs (all services)
docker-compose logs -f

# View logs (last 100 lines)
docker-compose logs --tail=100

# Check service status
docker-compose ps

# Check health
docker-compose exec mobile-rust-app wget -O- http://localhost:4400/api/health
```

### Stop and Restart

```bash
# Stop service
docker-compose down

# Restart service
docker-compose restart

# Rebuild and restart
docker-compose up -d --build
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker rmi mobile-rust-app:latest

# Full cleanup (containers + images + volumes)
docker-compose down -v --rmi all
```

## Port Configuration

### Current Configuration

- **External Port**: 4400 (matches Windows deployment)
- **Internal Port**: 4400 (Rust backend)
- **No Port Conflicts**: Avoids conflicts with:
  - Partial-Picking: 7075
  - Odoo: 8080

### Changing the Port

To change the external port (e.g., to 5000):

1. Edit `docker-compose.yml`:
```yaml
ports:
  - "5000:4400"  # External:Internal
```

2. Update CORS in `docker-compose.yml`:
```yaml
- CORS_ORIGINS=http://192.168.0.10:5000,http://localhost:5000
```

3. Rebuild and restart:
```bash
docker-compose up -d --build
```

## Comparison with Windows Deployment

| Aspect | Windows (`start_server.bat`) | Docker |
|--------|------------------------------|--------|
| **Port** | 4400 | 4400 |
| **Frontend** | Built by batch script | Built in Stage 1 |
| **Backend** | Built by batch script | Built in Stage 2 |
| **Static Files** | `frontend/dist/frontend/browser/` | `/app/frontend/dist/frontend/browser/` |
| **Binary** | `backend/target/release/bulk_picking_backend.exe` | `/app/bulk_picking_backend` |
| **Serving** | Rust backend (tower-http) | Rust backend (tower-http) |
| **Configuration** | `.env` file | Environment variables + optional .env |
| **Logs** | `backend/logs/` | `backend/logs/` (volume mounted) |

**Key Similarities:**
- ✅ Same port (4400)
- ✅ Same serving mechanism (Rust backend with tower-http)
- ✅ Same static file structure
- ✅ Same API endpoints (/api/*)

## Troubleshooting

### Container Won't Start

**Symptom**: Container exits immediately after `docker-compose up`

**Solution**:
```bash
# Check logs
docker-compose logs

# Common issues:
# 1. Database connection failed
# 2. LDAP server unreachable
# 3. Port 4400 already in use
```

### Database Connection Errors

**Symptom**: Backend logs show "Connection refused" or "Timeout"

**Solution**:
1. Verify database server is reachable from Docker network:
```bash
docker-compose exec mobile-rust-app ping 192.168.0.86
```

2. Check database credentials in `docker-compose.yml`

3. Ensure SQL Server allows connections from Docker network

### Frontend 404 Errors

**Symptom**: Accessing http://192.168.0.10:4400 returns 404

**Solution**:
1. Verify frontend build completed successfully:
```bash
docker-compose logs | grep "npm run build:prod"
```

2. Check static files are copied:
```bash
docker-compose exec mobile-rust-app ls -la /app/frontend/dist/frontend/browser/
```

3. Verify Rust backend is serving static files (check main.rs for tower-http configuration)

### Icons Not Displaying

**Symptom**: Icons missing or broken in UI

**Solution**:
1. Ensure `npm run build:prod` was used (not `npm run build`)
2. Verify icon files exist:
```bash
docker-compose exec mobile-rust-app ls -la /app/frontend/dist/frontend/browser/assets/icons/
```

3. Check MIME types are configured in Rust backend

### Health Check Failing

**Symptom**: Docker reports container unhealthy

**Solution**:
```bash
# Manual health check
docker-compose exec mobile-rust-app wget -O- http://localhost:4400/api/health

# If fails, check backend logs
docker-compose logs | grep -i error
```

### Permission Errors

**Symptom**: Container logs show "Permission denied"

**Solution**:
1. Verify non-root user has proper permissions (Dockerfile creates `appuser`)
2. Check log directory permissions:
```bash
docker-compose exec mobile-rust-app ls -la /app/logs
```

## Production Deployment Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Verify database credentials are correct
- [ ] Configure CORS for production domain
- [ ] Set up log rotation for `/app/logs`
- [ ] Configure firewall rules for port 4400
- [ ] Test health check endpoint: `/api/health`
- [ ] Verify LDAP authentication works
- [ ] Test with production database connection
- [ ] Set up monitoring and alerting
- [ ] Document rollback procedure
- [ ] Test from workstations (192.168.0.10:4400)

## Advanced Configuration

### Using External .env File

Create a `.env` file and mount it:

```yaml
# docker-compose.yml
volumes:
  - ./backend/logs:/app/logs
  - ./.env:/app/.env:ro  # Read-only mount
```

### Exposing Multiple Ports

If you need to expose additional ports:

```yaml
ports:
  - "4400:4400"  # Main application
  - "9000:9000"  # Example: Metrics endpoint
```

### Custom Network Configuration

```yaml
networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

services:
  mobile-rust-app:
    networks:
      app-network:
        ipv4_address: 172.20.0.10
```

## Performance Optimization

### Image Size Optimization

Current image size: ~150MB

Further optimizations:
- Use `strip` on binary (already done)
- Use `musl` libc for smaller binary (already using Alpine)
- Remove debug symbols: `RUSTFLAGS="-C strip=symbols"`

### Build Cache Optimization

The Dockerfile uses multi-stage builds with dependency caching:
- Stage 1: Frontend dependencies cached if `package.json` unchanged
- Stage 2: Backend dependencies cached if `Cargo.toml` unchanged

**Rebuild after code changes only:**
```bash
docker-compose build --no-cache  # Force full rebuild
docker-compose build             # Use cache
```

## Security Considerations

1. **Non-root User**: Container runs as `appuser` (non-root)
2. **Read-only Mounts**: Mount `.env` as read-only (`:ro`)
3. **JWT Secret**: Change default JWT secret in production
4. **CORS**: Configure strict CORS origins (currently allows specific IPs)
5. **Network**: Use Docker networks to isolate services
6. **Secrets Management**: Consider using Docker secrets for sensitive data

## Monitoring and Logging

### View Logs

```bash
# Real-time logs
docker-compose logs -f

# Logs since timestamp
docker-compose logs --since 2024-01-01T00:00:00

# Logs for last 1 hour
docker-compose logs --since 1h
```

### Log Persistence

Logs are stored in `backend/logs/` and mounted as volume:

```bash
# View log files
ls -lh backend/logs/

# Tail application logs
tail -f backend/logs/app.log
```

### Container Metrics

```bash
# CPU and memory usage
docker stats mobile-rust-app

# Detailed container info
docker inspect mobile-rust-app
```

## Backup and Recovery

### Backup Logs

```bash
# Backup logs directory
tar -czf logs-backup-$(date +%Y%m%d).tar.gz backend/logs/
```

### Backup Configuration

```bash
# Backup docker-compose.yml and .env
cp docker-compose.yml docker-compose.yml.backup
cp .env .env.backup
```

## Integration with CI/CD

### Example GitHub Actions Workflow

```yaml
name: Build and Deploy Docker

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: docker-compose build

      - name: Run tests
        run: docker-compose run --rm mobile-rust-app /app/bulk_picking_backend --test

      - name: Deploy to production
        run: |
          docker save mobile-rust-app:latest | gzip > mobile-rust-app.tar.gz
          scp mobile-rust-app.tar.gz user@192.168.0.10:/tmp/
          ssh user@192.168.0.10 'cd /app && docker load < /tmp/mobile-rust-app.tar.gz && docker-compose up -d'
```

## Support and Resources

- **Project Documentation**: See `DEPLOYMENT.md` for general deployment guide
- **Partial-Picking Reference**: `/home/deachawat/dev/projects/BPP/Partial-Picking/` (Docker reference implementation)
- **Windows Deployment**: See `start_server.bat` for native Windows deployment

## Version History

- **v1.0.0** (2025-01-29): Initial Docker deployment
  - Single-container architecture
  - Port 4400 (matches Windows deployment)
  - Multi-stage build (Angular 20 + Rust)
  - Alpine Linux base (~150MB final image)
