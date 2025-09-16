# Mobile-Rust Project Context

## Project Overview

**NWFTH Warehouse Management System** - A high-performance Angular 20 + Rust backend application for Newly Weds Foods (Thailand) warehouse bulk picking operations, extending the BME4 web application workflow with complete financial system integration.

### Key Features
- ✅ Complete Putaway Workflow: Exact replica of official warehouse putaway interface
- ✅ Financial Integration: 6-step transaction pattern with Mintxdh table integration
- ✅ Dual Authentication: SQL Server + LDAP/Active Directory support
- ✅ Cross-Platform PWA: Optimized for PC, tablet, and mobile devices
- ✅ Real-time Operations: Live progress tracking with Bangkok timezone support
- ✅ Unified Database Architecture: TFCPILOT3 primary database for all operations

## Architecture

### Technology Stack
- **Frontend**: Angular 20 + TypeScript + Tailwind CSS + shadcn/ui v4
- **Backend**: Rust + Axum framework + Tiberius SQL Server driver
- **Database**: Microsoft SQL Server (TFCPILOT3 unified architecture)
- **Authentication**: SQL Server tbl.user + LDAP integration
- **Styling**: NWFTH brand colors with responsive design
- **Timezone**: Bangkok/Asia timezone support with chrono-tz

### Project Structure
```
Mobile-Rust/
   frontend/                   # Angular 20 PWA application
      src/app/components/        # UI components
         dashboard/             # Dashboard with 2-menu system
         login/                 # NWFTH branded login page
         putaway/               # Complete putaway interface
      src/lib/ui/                # shadcn/ui component library
      src/services/              # Angular services for API communication
   backend/                    # Rust Axum API server
      src/handlers/              # HTTP request handlers
      src/services/              # Business logic services
      src/models/                # Data models and structures
      src/database/              # Database layer and operations
      src/utils/                 # Utility functions (timezone, etc.)
   docs/                       # Project documentation
       architecture.md             # Architecture overview and UI standards
```

## Database Integration

### Unified Database Architecture ✅
- **TFCPILOT3** (Single Primary Database): All read-write operations for bulk picking, putaway, and system operations
- **Simplified Configuration**: Single database connection eliminates replication complexity
- **Enhanced Performance**: Direct database access without synchronization delays

### Database Configuration
- **Primary Database**: TFCPILOT3 handles all system operations
- **Configuration Variables**: `PRIMARY_DB=TFCPILOT3`, `REPLICA_DB=` (empty for unified approach)
- **Connection Details**: 192.168.0.86:49381 - TFCPILOT3

### Transaction Pattern
6-step unified atomic transaction pattern:
1. Document Generation: Generate BT document number from Seqnum table
2. Financial Integration: Insert Mintxdh record with GL account mapping  
3. Issue Transaction: Create LotTransaction (Type 9) for source removal
4. Receipt Transaction: Create LotTransaction (Type 8) for destination addition
5. Bin Transfer Record: Create BinTransfer record for audit trail
6. LotMaster Updates: Handle lot consolidation and quantity updates directly on TFCPILOT3

### Bulk Picking Rules (BME4 Compatible)
- **Ingredient Filtering**: Only show rows with `ToPickedBulkQty > 0` (4 ingredients, not 26 total)
- **FEFO Logic**: First Expired, First Out lot selection with proper warehouse zone priorities
- **Bin Segregation**: Exclude PARTIAL bins (`User4 = 'PARTIAL'`) - bulk picking uses A/I/K zones only
- **Pack Size Validation**: Only suggest lots with `AvailableQty >= PackSize` for minimum 1 bag picking
- **Progress Updates**: Cumulative `PickedBulkQty` increments with proper rollback on failure
- **Status Transition**: `Cust_BulkRun.Status` changes NEW → PRINT when all ingredients completed

### 6-Table Transaction Pattern (Complete Workflow)

#### Per Pick Operation (5 Tables)
1. **cust_BulkPicked**: Update pick progress with user ID and timestamp
2. **Cust_BulkLotPicked**: Insert allocation record (QtyIssued=0, IssueDate=NULL) 
3. **LotMaster**: Update `QtyCommitSales` for inventory commitment
4. **LotTransaction**: Insert audit trail with actual issue quantities
5. **Cust_BulkPalletLotPicked**: Insert pallet traceability (CRITICAL - never skip)

#### Run Completion (6th Table)
6. **Cust_BulkRun**: Update Status NEW → PRINT when ALL ingredients completed

### Critical Business Logic Fixes ✅
- **Type Conversion Safety**: Safe BIGINT/INT handling prevents panics
- **Allocation vs Issue Records**: Proper separation in Cust_BulkLotPicked table
- **User Field Truncation**: Smart username truncation for database constraints  
- **Transaction Rollback**: Automatic rollback on any step failure
- **SQL Parameter Types**: Fixed putaway search queries to use proper integer parameters

## Build Commands

### Frontend
```bash
cd frontend
npm install          # Install dependencies
npm start            # Development server (uses .env settings)
npm run build:prod   # Production build via Angular CLI
npm test             # Run unit tests
```

### Backend
```bash
cd backend
cargo run            # Development server
cargo build --release    # Production build
cargo test           # Run tests
cargo clippy -D warnings # Linting before PRs
```

### Full Stack
```bash
npm run dev:all      # starts backend and frontend together (from root)
npm run test:e2e     # runs Playwright E2E tests
```

## Coding Standards

### Rust
- `cargo fmt` for formatting
- `cargo clippy -D warnings` before PRs
- **CRITICAL**: Always fix ALL compilation warnings after `cargo run`, `cargo check`, or `cargo build`
- **MANDATORY**: Never ignore warnings - they MUST be resolved immediately after any build/start operation
- **WARNING POLICY**: Fix warnings by removing unused code, not by disabling/hiding them
- **NEVER USE**: `#[allow(dead_code)]`, `#[allow(unused_imports)]`, `#[allow(unused_variables)]` or similar warning suppressions
- **PROPER FIX**: Remove unused code, make functions public if needed for API access, or refactor to eliminate warnings
- **EXAMPLES**: Remove unused imports, unused variables, dead code, unused functions
- Files/functions `snake_case`, types `CamelCase`, modules `snake_case`

### Angular/TypeScript
- 2-space indent, single quotes
- Files `kebab-case.ts`; components `*.component.ts`, services `*.service.ts`
- **CRITICAL**: Always fix ALL TypeScript/Angular warnings after `npm run build`, `npm start`, or compilation
- **MANDATORY**: Address linting warnings immediately - no ignoring ESLint/TSLint warnings
- **WARNING POLICY**: Fix warnings by removing unused code, not by disabling/hiding them
- **EXAMPLES**: Remove unused imports, unused variables, deprecated APIs, type issues
- Angular 20 standalone components; Tailwind v4 with `tw-` prefix utilities

## Recent Critical Fixes ✅

### Dual Database Load Balancing System (2025-09-15)
- **Enhancement**: Implemented bidirectional database switching for load balancing and concurrency management
- **Solution**: Environment-variable based PRIMARY_DB/REPLICA_DB switching with real-time monitoring
- **Use Case**: Route write operations to less busy database during high concurrency periods
- **Implementation**: Remove hardcoded TFCPILOT3 config, add `/api/database/status` endpoint, enable seamless switching
- **Impact**: Enterprise-grade load balancing, zero downtime database role switching, automatic replication in both directions
- **Files Modified**: `backend/src/main.rs` (removed hardcoded config), added database status endpoint

### Database Unification (2025-09-04)
- **Problem**: Dual database architecture (TFCMOBILE + TFCPILOT3) causing putaway system failures
- **Solution**: Unified to single TFCPILOT3 database for all operations
- **Impact**: Simplified architecture, eliminated replication complexity, improved reliability

### Putaway SQL Parameter Fix (2025-09-04)
- **Problem**: SQL Server OFFSET/FETCH NEXT queries using string parameters causing "Token error"
- **Solution**: Changed `&offset.to_string()`, `&limit.to_string()` to `&offset`, `&limit`
- **Impact**: Putaway lots/bins search endpoints now working correctly

### Manual Ingredient Switching Bug Fix (2025-09-08)
- **Problem**: Manual ingredient switching failed due to inconsistent sorting across backend functions
- **Root Cause**: search_run_items (DESC), get_bulk_run_form_data (ASC), get_ingredient_index (no sort) caused indexing mismatches
- **Solution**: Standardized all three functions to use consistent LineId ASC sorting in `backend/src/services/bulk_runs_service.rs:383,397`
- **Impact**: Manual ingredient selection now works correctly, T0005-22.5 → index 0, INBC5548 → index 1

### Lot Filtering Consistency Bug Fix (2025-09-08)
- **Problem**: Inconsistent lot filtering between mobile app and official BME4 system causing missing lots
- **Root Cause**: Over-filtering with `AND b.Nettable = 1` excluded non-nettable bins that should be included for bulk picking
- **Example**: Run 215236 missing lots 2510601 K0802-2B and 2510490 K0802-4B (both Nettable: false)
- **Solution**: Removed `AND b.Nettable = 1` filter from `search_lots_for_run_item_paginated()` in `backend/src/database/bulk_runs.rs:1035,1088`
- **Impact**: Mobile app now shows all 4 lots matching official BME4 system behavior perfectly

### Key Improvements
- **Unified Architecture**: Single database pattern eliminates sync issues
- **Type Safety**: Safe conversion patterns for BIGINT/INT SQL Server types
- **Transaction Atomicity**: Full ACID compliance with proper BEGIN/COMMIT boundaries
- **Error Recovery**: Automatic rollback with user-friendly feedback
- **User Experience**: No manual page refreshes needed
- **BME4 Alignment**: Perfect consistency between mobile app and official system lot availability

## Test Credentials
- **Username**: `deachawat`
- **Password**: `Wind@password9937`

## Environment Configuration

### Backend (.env)
```bash
# Unified Database Configuration
TFCPILOT3_SERVER=192.168.0.86
TFCPILOT3_PORT=49381
PRIMARY_DB=TFCPILOT3
REPLICA_DB=

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=4400

# LDAP Configuration
LDAP_URL=ldap://192.168.0.1
LDAP_BASE_DN=DC=NWFTH,DC=com
```

### Frontend (.env)
```bash
# API Configuration
API_URL=http://localhost:4400/api

# Frontend Server
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=8080
```

## User ID Tracking Implementation 

### Database Field Mapping
- **cust_BulkPicked**: RecUserId (nvarchar 16), ModifiedBy (nvarchar 16) 
- **Cust_BulkLotPicked**: RecUserid (varchar 8), ModifiedBy (nvarchar 16)
- **LotTransaction**: RecUserid (varchar 8)
- **Cust_BulkPalletLotPicked**: RecUserid (varchar 8), ModifiedBy (nvarchar 16)

### Smart Truncation System
- **8-char fields**: Long usernames truncated to fit varchar(8) fields
- **16-char fields**: Full usernames preserved in nvarchar(16) fields  
- **Dynamic User Extraction**: Gets actual logged-in username from JWT token → x-user-id header → request body → "SYSTEM"

## Security & Best Practices

- Never commit secrets; prefer structured logs and clear error messages
- Validate inputs on API boundaries; avoid logging sensitive values
- All timestamps use Bangkok (UTC+7) timezone
- Parameterized SQL queries with Tiberius driver
- CORS configuration and rate limiting

### Commit Message Standards

**Professional Engineering Standards**: All commit messages MUST follow professional software engineering practices without AI signatures.

```bash
# Standard Format
git commit -m "feat: Add user authentication with JWT tokens"
git commit -m "fix: Resolve SQL parameter type error in putaway search"  
git commit -m "refactor: Optimize database connection pooling"
git commit -m "docs: Update API endpoint documentation"

# NEVER use AI signatures in commit messages:
# ❌ WRONG: "🤖 Generated with [Claude Code](https://claude.ai/code)"
# ❌ WRONG: "Co-Authored-By: Claude <noreply@anthropic.com>"
# ✅ CORRECT: Clean, professional commit messages only
```

**Commit Message Types**:
- `feat:` - New feature implementation
- `fix:` - Bug fixes and corrections  
- `refactor:` - Code restructuring without behavior change
- `docs:` - Documentation updates
- `test:` - Test additions or modifications
- `chore:` - Maintenance tasks (dependencies, cleanup)
- `perf:` - Performance improvements
- `security:` - Security-related changes

## Dual Database Load Balancing System ⚖️

### Overview
The system supports **bidirectional database switching** for enterprise-grade load balancing and concurrency management. Route write operations between TFCPILOT3 and TFCMOBILE based on current load conditions.

### Load Balancing Scenarios

#### Scenario 1: High TFCPILOT3 Concurrency
```bash
# Edit backend/.env
PRIMARY_DB=TFCMOBILE
REPLICA_DB=TFCPILOT3

# Restart application
npm run dev:all
```
**Result**: Write operations → TFCMOBILE, Replication: TFCMOBILE → TFCPILOT3

#### Scenario 2: High TFCMOBILE Concurrency
```bash
# Edit backend/.env
PRIMARY_DB=TFCPILOT3
REPLICA_DB=TFCMOBILE

# Restart application
npm run dev:all
```
**Result**: Write operations → TFCPILOT3, Replication: TFCPILOT3 → TFCMOBILE

### Real-time Monitoring

#### Database Status Endpoint
```bash
curl http://localhost:4400/api/database/status
```

**Response Example:**
```json
{
  "success": true,
  "primary_database": "TFCPILOT3",
  "replica_database": "TFCMOBILE",
  "available_databases": ["TFCPILOT3", "TFCMOBILE"],
  "has_replica": true,
  "timestamp": "2025-09-15T02:46:04.703778771+00:00"
}
```

### Key Features ✅
- **⚖️ Bidirectional Switching**: TFCPILOT3 ⇄ TFCMOBILE seamless role switching
- **📊 Real-time Monitoring**: Live database configuration status via API
- **🔄 Automatic Replication**: Data synchronization regardless of which database is primary
- **🚀 Zero Code Changes**: Environment variable configuration only
- **⚡ Hot Switching**: Change database roles by restart only (no code deployment)
- **🛡️ Data Consistency**: All transactions and replication work in both directions

### Usage Workflow
1. **Monitor Load**: Observe database performance and concurrency
2. **Detect High Load**: Identify which database (TFCPILOT3 or TFCMOBILE) is under stress
3. **Switch Configuration**: Update PRIMARY_DB/REPLICA_DB in backend/.env
4. **Restart Service**: `npm run dev:all` to apply new configuration
5. **Verify Switch**: Check `/api/database/status` endpoint
6. **Monitor Operations**: Ensure all functionality works with new configuration

## Documentation References

- `AGENTS.md`: Repository guidelines and coding standards
- `README.md`: Complete setup and deployment guide
- **`docs/actual-pick-workflow.md`**: **CRITICAL** - Complete BME4 workflow implementation guide with business logic patterns

## Current Status: FULLY OPERATIONAL ✅

The system is production-ready with **dual database load balancing architecture**:
- ✅ Complete bulk picking workflow implementation
- ✅ Complete putaway workflow implementation
- ✅ **Bidirectional database load balancing** (TFCPILOT3 ⇄ TFCMOBILE)
- ✅ **Real-time database monitoring** via `/api/database/status` endpoint
- ✅ Enterprise-grade transaction safety with ACID compliance
- ✅ Enhanced user experience with seamless error handling
- ✅ Full BME4 compatibility maintained
- ✅ **Zero-downtime database role switching** via environment variables
- ✅ **Automatic replication** in both directions
- ✅ Comprehensive testing and validation completed

## Development Tools & MCP Servers

### Always Use During Development
- **Context7 MCP**: For library documentation lookup and framework patterns
- **SQL Server MCP (sqlserver)**: To inspect TFCPILOT3 database (primary unified database)

### Database Inspection Commands
```bash
# TFCPILOT3 (Unified Primary Database) - Use sqlserver MCP
mcp__sqlserver__list_tables
mcp__sqlserver__describe_table table_name
mcp__sqlserver__read_query "SELECT * FROM table_name"
```

## Development Server Management Rules

### Important: Single Server Command Only
- **ALWAYS use**: `npm run dev:all` - starts both frontend and backend together
- **NEVER run multiple commands**: Don't run cargo run + npm start separately
- **Simple workflow**: Kill all processes → run `npm run dev:all` → test

### Server Management Protocol
1. **Kill specific ports**: Use `lsof -ti:PORT | xargs kill -9` for specific ports (4200 frontend, 4400 backend)
2. **NEVER kill all npm/node**: Avoid `pkill -9 -f "cargo|npm|node"` - kills unrelated processes
3. **Start clean**: Always use `npm run dev:all` from project root
4. **No parallel servers**: Avoid running multiple cargo run or npm commands
5. **Single command rule**: One `npm run dev:all` handles everything

### When to Restart
Claude should request restart only when:
- Backend Rust code changes affect server startup/configuration
- Database connection configurations are modified
- Environment variables (.env) are changed
- Cargo.toml dependencies are updated
- Critical bug fixes that modify core server logic

### Restart Process
```bash
# 1. Kill specific port processes only
lsof -ti:4200 | xargs kill -9  # Frontend
lsof -ti:4400 | xargs kill -9  # Backend

# 2. Start everything with single command
npm run dev:all

# 3. Test functionality
```

## Test Credentials

For Playwright MCP testing, always use:
- **Username**: `deachawat`
- **Password**: `Wind@password9937`

## API Endpoints Status ✅

### Bulk Picking APIs
- ✅ `/api/bulk-runs/*` - All bulk picking endpoints operational
- ✅ Complete 6-step transaction workflow
- ✅ FEFO lot selection and bin management

### Putaway APIs
- ✅ `/api/putaway/lots/search` - Returns 6,999 lot records with pagination
- ✅ `/api/putaway/bins/search` - Returns 6,722 bin records with pagination
- ✅ `/api/putaway/health` - Service health monitoring
- ✅ `/api/putaway/bin/{location}/{bin_no}` - Bin validation
- ✅ `/api/putaway/transfer` - Execute bin transfer operations

### Database Management APIs
- ✅ `/api/database/status` - **NEW** Real-time database configuration monitoring
- ✅ Returns current PRIMARY_DB, REPLICA_DB, available databases, and replication status
- ✅ Essential for load balancing verification and database role monitoring

### System Health
- ✅ Frontend: Angular 20 compiling without TypeScript errors
- ✅ Backend: Rust server with unified TFCPILOT3 database connection
- ✅ Database: All SQL queries optimized for proper parameter types

## Development Workflow & MCP Requirements

### Required MCP Servers for Development
Always use these MCP servers during development:
- **sqlserver**: Primary database inspection (TFCPILOT3 unified database)
- **sqlserver2**: Secondary database operations if needed
- **context7**: Library documentation lookup and framework patterns

### Development Session Protocol
1. **Session Start**: Read `@docs/task/context_session.md` before beginning any development task
2. **During Development**: Use MCP servers for database inspection, documentation, and context
3. **Task Completion**: After confirming everything works, update `docs/task/context_sessions/` with session results

This ensures proper context management and knowledge transfer between development sessions.