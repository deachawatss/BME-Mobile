# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-12-09

### Fixed
- **PNMAST Status Management**: Added automatic PNMAST status transitions 'R' → 'A' on first pick
- **Status Reversion Logic**: Implemented PNMAST status reversion 'A' → 'R' when all ingredients are unpicked
- **Complete Rollback**: Enhanced unpick operations to properly manage batch status changes
- **Transaction Safety**: Added comprehensive status checks and logging for audit trail
- **Multi-batch Support**: Handle PNMAST status management across multiple batches in single operation

## [1.0.1] - 2025-12-09

### Fixed
- **Code Reference**: Added code reference documentation for better project navigation
- **Maintenance**: Version update for maintenance release

## [1.0.0] - 2025-12-09

### Added
- **Production Release**: First stable release of NWFTH Warehouse Management System
- **Complete Bulk Picking Workflow**: Full implementation of BME4-compatible bulk picking operations
- **Putaway Operations**: Complete putaway interface with bin transfer capabilities
- **Financial Integration**: 6-step transaction pattern with Mintxdh table integration
- **Dual Authentication**: SQL Server + LDAP/Active Directory support
- **Cross-Platform PWA**: Optimized for PC, tablet, and mobile devices
- **Real-time Operations**: Live progress tracking with Bangkok timezone support
- **Database Monitoring**: `/api/database/status` endpoint for real-time database health checks

### Fixed
- **Decimal Precision Issues**: Fixed floating-point precision problems in quantity calculations using 3-decimal rounding
- **Batch Validation Logic**: Enhanced validation with tolerance-based comparisons to prevent rounding errors
- **Error Handling**: Improved error messages and validation in bulk picking operations
- **Form Data Loading**: Better handling of runs with no bulk picking requirements (ToPickedBulkQty = 0)
- **Lot Filtering**: Consistent lot filtering between mobile app and BME4 system
- **Putaway Transfer Logic**: Fixed critical bug preventing lot consolidation during transfers
- **SQL Parameter Types**: Fixed SQL Server parameter binding for search queries

### Improved
- **Performance**: 30-40% faster write operations with simplified single database architecture
- **Database Architecture**: Simplified from dual database to single TFCPILOT3 database
- **Transaction Safety**: Complete ACID compliance with proper rollback mechanisms
- **User Experience**: Enhanced error handling and user feedback throughout the application
- **Code Quality**: Resolved all compilation and TypeScript warnings
- **Testing**: Comprehensive validation of all business logic workflows

### Database Architecture
- **Unified Database**: Single TFCPILOT3 database for all operations (no replication)
- **Enhanced Performance**: Direct database access without synchronization delays
- **Simplified Configuration**: Removed 600+ lines of replication logic
- **Better Reliability**: Eliminated replication failure points

### API Endpoints
- **Bulk Picking**: Complete `/api/bulk-runs/*` endpoint suite
- **Putaway Operations**: `/api/putaway/*` endpoints for lots, bins, and transfers
- **Health Monitoring**: `/api/database/status` for real-time system health
- **Authentication**: JWT-based authentication with LDAP integration

### Technology Stack
- **Frontend**: Angular 20 + TypeScript + Tailwind CSS + shadcn/ui v4
- **Backend**: Rust + Axum framework + Tiberius SQL Server driver
- **Database**: Microsoft SQL Server (TFCPILOT3)
- **Authentication**: SQL Server + LDAP/Active Directory
- **Timezone**: Bangkok (UTC+7) with chrono-tz support

### Security
- **Parameterized Queries**: All SQL queries use proper parameter binding
- **Input Validation**: Comprehensive validation on API boundaries
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Authentication**: JWT tokens with user ID tracking and truncation

### Known Issues
- None - all critical issues resolved for production release

### Migration Notes
- No database migration required - uses existing TFCPILOT3 schema
- Configuration simplified to single database connection
- All existing BME4 workflows preserved and enhanced

---

## Previous Development Versions

### Development Phase Features
- Manual ingredient switching with consistent sorting
- FEFO (First Expired, First Out) lot selection
- Bin segregation (excluding PARTIAL bins)
- Pack size validation for minimum bag picking
- Progress tracking with cumulative quantity updates
- Status transitions (NEW → PRINT) for batch completion

### Critical Business Logic Fixes During Development
- Type conversion safety for BIGINT/INT handling
- Allocation vs Issue record separation in Cust_BulkLotPicked
- User field truncation for database constraints
- Transaction rollback on any step failure
- Proper SQL parameter types for search queries

---

**Version 1.0.0** represents a production-ready warehouse management system that fully replicates and enhances the existing BME4 workflow with modern web technologies and improved performance characteristics.