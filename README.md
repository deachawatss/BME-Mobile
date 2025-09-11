# NWFTH Warehouse Management System

A high-performance Angular 20 + Rust backend application for Newly Weds Foods (Thailand) warehouse bulk picking operations, extending the BME4 web application workflow with complete financial system integration.

## 🚀 Overview

**Enterprise-grade warehouse management system** that provides a seamless putaway interface for warehouse operations with complete financial integration and audit trail capabilities.

### Key Features

- **🎯 Complete Putaway Workflow**: Exact replica of official warehouse putaway interface
- **💰 Financial Integration**: 8-step transaction pattern with Mintxdh table integration
- **🔐 Dual Authentication**: SQL Server + LDAP/Active Directory support
- **📱 Cross-Platform PWA**: Optimized for PC, tablet, and mobile devices
- **🌐 Real-time Operations**: Live progress tracking with Bangkok timezone support
- **🏗️ Dual Database Architecture**: TFCMOBILE (writes) ↔ TFCPILOT3 (reads)

## 🏛️ Architecture

### Technology Stack

- **Frontend**: Angular 20 + TypeScript + Tailwind CSS + shadcn/ui v4
- **Backend**: Rust + Axum framework + Tiberius SQL Server driver
- **Database**: Microsoft SQL Server (TFCMOBILE + TFCPILOT3)
- **Authentication**: SQL Server tbl.user + LDAP integration
- **Styling**: NWFTH brand colors with responsive design
- **Timezone**: Bangkok/Asia timezone support with chrono-tz

### Project Structure

```
Mobile-Rust/
├── frontend/                   # Angular 20 PWA application
│   ├── src/app/components/        # UI components
│   │   ├── dashboard/             # Dashboard with 2-menu system
│   │   ├── login/                 # NWFTH branded login page
│   │   └── putaway/               # Complete putaway interface
│   ├── src/lib/ui/                # shadcn/ui component library
│   └── src/services/              # Angular services for API communication
├── backend/                    # Rust Axum API server
│   ├── src/handlers/              # HTTP request handlers
│   ├── src/services/              # Business logic services
│   ├── src/models/                # Data models and structures
│   ├── src/database/              # Database layer and operations
│   └── src/utils/                 # Utility functions (timezone, etc.)
├── docs/                       # Project documentation
│   └── architecture.md             # Architecture overview and UI standards
```

## 🔧 Development Setup

### Prerequisites

- **Node.js** 18+ with npm
- **Rust** 1.70+ with Cargo
- **SQL Server** access to TFCMOBILE and TFCPILOT3 databases
- **LDAP** connection to NWFTH Active Directory

### Configuration Setup

**IMPORTANT**: Before running the application, configure your environment settings.

#### 1. Backend Configuration

```bash
cd backend
cp .env.example .env
# Edit .env with your server settings
```

**Essential Settings**:
```bash
# Database Configuration
DB_SERVER=192.168.0.86
DB_PORT=49381
DB_USERNAME=your_username
DB_PASSWORD=your_password

# LDAP Configuration  
LDAP_URL=ldap://192.168.0.1
LDAP_BASE_DN=DC=NWFTH,DC=com

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=4400
CORS_ORIGINS=*
```

#### 2. Frontend Configuration

```bash
cd frontend
cp .env.example .env
# Edit .env with your server settings
```

**Essential Settings**:
```bash
# API Configuration
API_URL=http://your-server-ip:4400/api

# Frontend Server
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=4200
```

**Alternative: Runtime Configuration** (Recommended for deployment)

Edit `frontend/src/assets/config.js` after build:
```javascript
window.appConfig = {
  API_URL: 'http://192.168.1.100:4400/api',
  FRONTEND_HOST: '192.168.1.100',
  FRONTEND_PORT: '8080'
};
```

### Quick Start

#### Frontend Development

```bash
cd frontend
npm install          # Install dependencies
npm start            # Development server (uses .env settings)
npm run start:server # Alternative: server mode (port 8080)
ng build             # Production build
ng test              # Run unit tests
```

#### Backend Development

```bash
cd backend
cargo run            # Development server (uses .env settings)
cargo build --release    # Production build
cargo test           # Run tests
cargo clippy         # Linting
```

#### Full Stack Development

```bash
# Terminal 1: Frontend
cd frontend && npm start

# Terminal 2: Backend
cd backend && cargo run
```

## 🗄️ Database Integration

### Dual-Database Strategy

**CRITICAL**: Optimized dual-database architecture for performance and consistency

#### Database Roles

- **TFCPILOT3** (Primary Read Database):
  - All search operations (lot search, bin validation, ingredient lookup)
  - Data queries and reporting
  - Read-only operations for UI population
  - High-performance queries without transaction locks

- **TFCMOBILE** (Primary Write Database):
  - All transaction operations (bin transfers, putaway transactions)
  - Write operations and data modifications
  - 8-step transaction pattern with Mintxdh integration
  - Real-time updates with automatic replication to TFCPILOT3

#### Transaction Pattern

The system implements an **8-step atomic transaction pattern**:

1. **Document Generation**: Generate BT document number from Seqnum table
2. **Financial Integration**: Insert Mintxdh record with GL account mapping
3. **Issue Transaction**: Create LotTransaction (Type 9) for source removal
4. **Receipt Transaction**: Create LotTransaction (Type 8) for destination addition
5. **Bin Transfer Record**: Create BinTransfer record for audit trail
6. **TFCPILOT3 Replication**: Replicate all records to read database
7. **LotMaster Updates**: Handle lot consolidation and quantity updates
8. **Sequence Update**: Update sequence numbers for consistency

### Key Business Rules

- **GL Account Mapping**: Based on INLOC.Inclasskey (RM→1100, PM→1110, WIP→1120, FG→1140)
- **Standard Cost**: Retrieved from INLOC.Stdcost with proper Numeric type conversion
- **Internal Transfers**: TrnQty=0, TrnAmt=0.000000 (no cost impact, audit trail only)
- **Bangkok Timezone**: All timestamps in Bangkok local time (UTC+7)
- **Document Pattern**: BT-26019153, BT-26019154... sequential generation

## 🎨 UI/UX Design

### NWFTH Brand Integration

- **Primary Colors**: Coffee brown (#523325) and golden amber (#F0B429)
- **Typography**: Professional warehouse-optimized fonts
- **Layout**: Mobile-first responsive design with 4→2→1 column breakpoints
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation

### Component Features

#### Dashboard
- Clean 2-menu system with perfect center alignment
- "Bulk Picking" and "Putaway" navigation cards
- System status indicators with NWFTH brand colors

#### Login Page
- Authentic NWFTH branding with animated background effects
- Multi-domain LDAP support (@NWFTH.com, @newlywedsfoods.co.th)
- Professional form styling with enhanced logo display

#### Putaway Interface
- Exact replica of official warehouse putaway interface
- 11 fields: Lot #, Bin #, ItemKey, Location, UOM, QtyOnHand, Qty Available, Exp Date, Putaway Qty, Print Report, To Bin #
- Enhanced search buttons with 🔍 icons and touch optimization
- Real-time validation and auto-population from lot search

## 🔐 Authentication & Security

### Authentication Flow

1. **SQL Authentication**: Check tbl.user table first (future implementation)
2. **LDAP Fallback**: Multiple domain formats supported
3. **JWT Tokens**: Bearer tokens for API authentication with proper expiration
4. **User Attributes**: Retrieved from LDAP (displayName, mail, department)

### Security Features

- **Input Validation**: Comprehensive sanitization and validation
- **SQL Injection Prevention**: Parameterized queries with Tiberius driver
- **Audit Logging**: Complete activity tracking for compliance
- **Network Security**: CORS configuration and rate limiting

## 🚀 Deployment

### Development Environment

- **Frontend**: `http://localhost:4200` (Angular dev server)
- **Backend**: `http://localhost:4400` (Rust Axum server)
- **Database**: Connect to existing TFCMOBILE/TFCPILOT3 servers
- **LDAP**: Connect to existing Active Directory infrastructure

### Production Deployment Options

1. **Single Rust Binary** (Recommended): Rust serves both API and Angular static files
2. **Containerized**: Docker deployment with both frontend and backend
3. **Traditional**: Separate Apache/IIS for frontend, Rust backend service

### Performance Targets

- **Bundle Size**: <500KB compressed (currently 103.87 kB)
- **API Response**: <200ms for standard operations
- **Database Queries**: <100ms for lookup operations
- **PWA Performance**: Lighthouse score >90 for all categories

## 📊 Testing & Quality

### Testing Strategy

- **Frontend**: Angular testing with Jasmine/Karma
- **Backend**: Rust unit and integration tests with `cargo test`
- **E2E Testing**: Playwright for end-to-end workflow testing
- **Database Testing**: Test against both TFCMOBILE and TFCPILOT3 connections

### Quality Standards

- **TypeScript**: Strict mode enabled with comprehensive type definitions
- **Rust**: Clippy lints enabled with proper error handling
- **Code Coverage**: Comprehensive unit tests for business logic
- **Documentation**: Inline code comments for complex business rules

## 🔗 Integration Points

### BME4 Integration

- **Shared Database**: Same TFCMOBILE/TFCPILOT3 infrastructure
- **User Management**: Consistent authentication and authorization
- **Business Logic**: Same validation rules and calculation methods
- **Workflow Continuity**: Seamless transition from BME4 bulk run creation

### Enterprise Systems

- **Active Directory**: LDAP authentication with domain support
- **SQL Server**: Dual-database strategy for read/write optimization
- **Network Infrastructure**: Integration with existing NWFTH network
- **Security Compliance**: Enterprise security standards and policies

## 📈 Current Status

### ✅ Production-Ready Features

- **Complete Putaway Workflow**: Full API endpoints and UI implementation
- **Financial Integration**: 8-step transaction pattern with Mintxdh table
- **Authentication System**: LDAP authentication with multiple domain support
- **Responsive Design**: Cross-platform PWA optimized for warehouse devices
- **Bangkok Timezone**: All operations display correct local time
- **Audit Trail**: Complete transaction logging and document sequencing

### 🎯 Test Credentials

- **Username**: `deachawat`
- **Password**: `Wind@password9937`
- **Access**: Login → Dashboard → Bulk Picking/Putaway navigation

## ⚙️ Production Configuration Guide

### Environment Variables Reference

#### Backend Configuration (.env)

```bash
# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
SERVER_HOST=0.0.0.0                    # Bind address (0.0.0.0 for all interfaces)
SERVER_PORT=4400                       # Backend server port
CORS_ORIGINS=*                         # CORS origins (* for all, or comma-separated list)

# =============================================================================
# DUAL DATABASE CONFIGURATION
# =============================================================================
# TFCMOBILE Database (Write Operations - Bin Transfers, Transactions)
TFCMOBILE_SERVER=192.168.0.86          # TFCMOBILE SQL Server host
TFCMOBILE_PORT=49381                   # TFCMOBILE SQL Server port
TFCMOBILE_DATABASE=TFCMOBILE           # TFCMOBILE database name
TFCMOBILE_USERNAME=dvl                 # TFCMOBILE database username
TFCMOBILE_PASSWORD=Pr0gr@mm1ng         # TFCMOBILE database password

# TFCPILOT3 Database (Read Operations - Lot Search, Bin Validation)
TFCPILOT3_SERVER=192.168.0.86          # TFCPILOT3 SQL Server host
TFCPILOT3_PORT=49381                   # TFCPILOT3 SQL Server port
TFCPILOT3_DATABASE=TFCPILOT3           # TFCPILOT3 database name
TFCPILOT3_USERNAME=dvl                 # TFCPILOT3 database username
TFCPILOT3_PASSWORD=Pr0gr@mm1ng         # TFCPILOT3 database password

# Legacy Configuration (Backward Compatibility)
DB_SERVER=192.168.0.86                 # Fallback SQL Server host
DB_PORT=49381                          # Fallback SQL Server port
DB_DATABASE=TFCMOBILE                  # Fallback database name
DB_USERNAME=dvl                        # Fallback database username
DB_PASSWORD=Pr0gr@mm1ng                # Fallback database password

# =============================================================================
# LDAP CONFIGURATION
# =============================================================================
LDAP_URL=ldap://192.168.0.1            # LDAP server URL
LDAP_BASE_DN=DC=NWFTH,DC=com           # LDAP base DN
LDAP_ENABLED=true                      # Enable/disable LDAP authentication

# =============================================================================
# APPLICATION SETTINGS
# =============================================================================
RUST_LOG=info                          # Logging level (trace, debug, info, warn, error)
ENVIRONMENT=production                 # Environment mode
DEBUG=false                            # Enable debug features

# =============================================================================
# BULK PICKING DATABASE ROUTING
# =============================================================================
# Select which database acts as the PRIMARY for bulk picking operations
# Allowed values (case-insensitive): TFCPILOT3 | TFCMOBILE | READ | WRITE
# Default: TFCPILOT3 primary (writes happen on TFCPILOT3 for bulk picking)
BULK_PICKING_PRIMARY=TFCPILOT3

# Select which database acts as the REPLICA target for best-effort sync
# Default: TFCMOBILE replica
BULK_PICKING_REPLICA=TFCMOBILE
```

#### Frontend Configuration (.env)

```bash
# =============================================================================
# API CONFIGURATION
# =============================================================================
API_URL=http://192.168.1.100:4400/api  # Backend API endpoint

# =============================================================================
# FRONTEND SERVER CONFIGURATION
# =============================================================================
FRONTEND_HOST=0.0.0.0                  # Angular dev server host
FRONTEND_PORT=8080                     # Angular dev server port

# =============================================================================
# ENVIRONMENT SETTINGS
# =============================================================================
PRODUCTION=true                        # Production mode
DEBUG=false                            # Debug features
ENABLE_MOCK_DATA=false                 # Mock data for development
```

### Deployment Scenarios

#### Scenario 1: Local Development
```bash
# Backend
SERVER_HOST=localhost
SERVER_PORT=4400
CORS_ORIGINS=http://localhost:4200

# Frontend
API_URL=http://localhost:4400/api
FRONTEND_HOST=localhost
FRONTEND_PORT=4200
```

#### Scenario 2: Server Deployment (Single Machine)
```bash
# Backend
SERVER_HOST=0.0.0.0
SERVER_PORT=4400
CORS_ORIGINS=http://192.168.1.100:8080

# Frontend
API_URL=http://192.168.1.100:4400/api
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=8080
```

#### Scenario 3: Production with Custom Ports
```bash
# Backend
SERVER_HOST=0.0.0.0
SERVER_PORT=5000
CORS_ORIGINS=http://your-domain.com

# Frontend (Runtime Configuration)
# Edit frontend/src/assets/config.js:
window.appConfig = {
  API_URL: 'http://your-domain.com:5000/api'
};
```

### Configuration Priority

1. **Runtime Configuration** (`frontend/src/assets/config.js`) - Highest priority
2. **Environment Variables** (`.env` files)
3. **Default Values** (hardcoded in source)

### Security Best Practices

- ✅ Never commit `.env` files to version control
- ✅ Use strong passwords for database connections
- ✅ Restrict CORS origins in production
- ✅ Use HTTPS in production environments
- ✅ Regularly rotate database credentials
- ✅ Monitor access logs for suspicious activity

## 📝 Documentation

- **[Architecture Overview](./docs/architecture.md)**: High-level system design and UI standards

## 🤝 Contributing

### Development Workflow

1. **📖 Architecture Review**: Read `docs/architecture.md` for system design and standards
2. **🔍 Research**: Use appropriate tools for library documentation and patterns
3. **💻 Implementation**: Develop using established patterns and best practices
4. **✅ Validation**: Test and validate implementation thoroughly
5. **📝 Documentation**: Update context and documentation with completed work

### Code Quality Guidelines

- **Frontend**: Standalone Angular components with reactive patterns
- **Backend**: RESTful APIs with structured error responses
- **Database**: Transaction-based operations with proper error handling
- **Testing**: Comprehensive unit and integration test coverage

## 📄 License

Copyright © 2025 Newly Weds Foods (Thailand). All rights reserved.

---

**Built with ❤️ for warehouse efficiency and operational excellence.**
