# Database Concurrency & Performance Optimization Checklist

**Purpose:** Systematic guide to identify and fix concurrency issues, deadlocks, and performance bottlenecks in database-driven applications.

**Use this prompt with AI assistants:** Copy the checklist below and paste it to analyze any project.

---

## 🤖 AI Assistant Prompt

```
Please analyze this project for database concurrency, deadlock risks, and performance issues.

Follow this systematic checklist:

## 1. CONNECTION MANAGEMENT ANALYSIS

### Check for connection pooling:
- [ ] Does the project use connection pooling? (bb8, deadpool, r2d2 for Rust; HikariCP for Java; pg-pool for Node.js)
- [ ] What is the max pool size? Is it appropriate for expected concurrent users?
- [ ] What is the min idle connection count?
- [ ] Are connections properly released after use?
- [ ] Is there connection timeout configuration?
- [ ] Are there connection leaks (connections acquired but never returned)?

**Action:** If no pooling exists, implement connection pooling with:
- Max connections: 2-4x expected concurrent users
- Min idle: 20-30% of max connections
- Connection timeout: 30-60 seconds

**Files to check:**
- Database initialization/setup files
- Database connection configuration
- Environment variables for DB config

---

## 2. TRANSACTION ATOMICITY ANALYSIS

### Check for explicit transaction boundaries:
- [ ] Are multi-step operations wrapped in explicit transactions?
- [ ] Does code use BEGIN TRANSACTION and COMMIT/ROLLBACK?
- [ ] Are transactions using auto-commit mode where atomicity is needed?
- [ ] What isolation level is used? (READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ, SERIALIZABLE)
- [ ] Are long-running transactions holding locks too long?

**Action:** For multi-step operations that modify multiple tables:
```sql
BEGIN TRANSACTION
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ
-- Step 1: Update table A
-- Step 2: Insert into table B
-- Step 3: Update table C
COMMIT -- or ROLLBACK on error
```

**Files to check:**
- Database service/repository files
- Transaction handling middleware
- Business logic files that perform writes

---

## 3. DEADLOCK PREVENTION ANALYSIS

### Check for deadlock patterns:
- [ ] Is there a consistent lock ordering strategy across all operations?
- [ ] Do different operations lock resources in different orders?
- [ ] Are there SELECT...FOR UPDATE queries without proper ordering?
- [ ] Are row-level locks used instead of table-level locks?
- [ ] Is there a "lock hierarchy" documented?

**Common deadlock causes:**
1. **Inconsistent lock ordering:** Operation A locks table1→table2, Operation B locks table2→table1
2. **Missing lock ordering:** Operations don't lock resources in alphabetical/priority order
3. **Circular waits:** Transaction 1 waits for Transaction 2's lock, Transaction 2 waits for Transaction 1

**Action - Implement global lock ordering:**
```sql
-- BAD: Inconsistent ordering
-- Operation 1: Lock BinA, then LotMaster
-- Operation 2: Lock LotMaster, then BinA

-- GOOD: Consistent ordering (always lock LotMaster first)
SELECT * FROM LotMaster WITH (UPDLOCK, ROWLOCK) WHERE ...
SELECT * FROM Bins WITH (UPDLOCK, ROWLOCK) WHERE ...
```

**Additional deadlock prevention strategies:**
- Lock resources in alphabetical order (bin_no ASC)
- Use row-level locks (ROWLOCK) instead of table locks
- Use UPDLOCK to prevent lock escalation
- Keep transactions short
- Use timeout for lock acquisition

**Files to check:**
- All database operations that acquire locks
- Multi-table update operations
- Operations that run concurrently

---

## 4. LOCK GRANULARITY ANALYSIS

### Check locking strategy:
- [ ] Are table-level locks used when row-level would suffice?
- [ ] Are shared locks (SHLOCK) used for reads that don't need updates?
- [ ] Are exclusive locks (UPDLOCK, XLOCK) only used when necessary?
- [ ] Is lock timeout configured?

**SQL Server lock hints:**
- `WITH (UPDLOCK, ROWLOCK)` - Row-level exclusive lock for updates
- `WITH (HOLDLOCK, ROWLOCK)` - Row-level shared lock (hold until transaction end)
- `WITH (NOLOCK)` - No locks (dirty reads, use with caution)

**PostgreSQL:**
- `SELECT ... FOR UPDATE` - Exclusive row lock
- `SELECT ... FOR SHARE` - Shared row lock

**MySQL:**
- `SELECT ... FOR UPDATE` - Exclusive row lock
- `SELECT ... LOCK IN SHARE MODE` - Shared row lock

**Files to check:**
- SELECT queries that need locks
- UPDATE/DELETE operations

---

## 5. QUERY PERFORMANCE ANALYSIS

### Check for slow queries:
- [ ] Are there N+1 query problems?
- [ ] Are indexes properly used?
- [ ] Are there full table scans where indexes should be used?
- [ ] Are LIKE queries using leading wildcards? (LIKE '%value' - can't use index)
- [ ] Are there complex JOINs that could be optimized?
- [ ] Is pagination implemented efficiently? (OFFSET/LIMIT vs keyset pagination)

**Action - Add query performance logging:**
```rust
// Log queries taking > 100ms
if query_duration > Duration::from_millis(100) {
    warn!("Slow query detected: {}ms - {}", query_duration.as_millis(), query);
}
```

**Common optimizations:**
- Add indexes on frequently queried columns
- Use composite indexes for multi-column WHERE clauses
- Avoid SELECT * (select only needed columns)
- Use EXPLAIN/EXPLAIN ANALYZE to identify bottlenecks
- Cache frequently accessed read-only data

**Files to check:**
- Repository/DAO files
- Service layer with database queries
- API endpoints with database calls

---

## 6. CONCURRENT WRITE OPERATIONS

### Check for race conditions:
- [ ] Are there "read-modify-write" operations without locks?
- [ ] Are there UPDATE operations based on SELECT results without FOR UPDATE?
- [ ] Are there inventory/quantity updates that could lead to negative values?
- [ ] Are there duplicate key violations possible from concurrent inserts?

**Example race condition:**
```rust
// BAD: Race condition
let qty = db.query("SELECT qty FROM inventory WHERE id = ?", id);
let new_qty = qty - amount;
db.execute("UPDATE inventory SET qty = ? WHERE id = ?", new_qty, id);

// GOOD: Atomic update with validation
db.execute(
    "UPDATE inventory SET qty = qty - ?
     WHERE id = ? AND qty >= ?",
    amount, id, amount
);
```

**Files to check:**
- Inventory management operations
- Financial transaction operations
- Counter/sequence operations
- Any read-modify-write patterns

---

## 7. LOAD TESTING REQUIREMENTS

### Create load tests that simulate:
- [ ] Expected peak concurrent users (minimum 1.5x production estimate)
- [ ] Complete workflow including write operations (not just reads)
- [ ] Realistic data scenarios
- [ ] Concurrent operations on same resources (same lot, same bin, etc.)

**Load test must measure:**
- Response times (avg, min, max, p95, p99)
- Success rate (should be 100%)
- Deadlock occurrences (should be 0)
- Connection pool utilization
- Database CPU/memory usage
- Error rates by operation type

**Action - Create load test script:**
```bash
#!/bin/bash
# Launch N concurrent users performing full workflow
for i in {1..10}; do
    user_workflow $i &
done
wait

# Analyze results
echo "Success rate: $(calculate_success_rate)"
echo "Deadlocks detected: $(count_deadlocks)"
echo "Avg response time: $(calculate_avg_response_time)"
```

**Files to create:**
- `load-test-{N}-users.sh` - Concurrent user simulation
- `docs/LOAD_TEST_REPORT.md` - Test results and analysis

---

## 8. ERROR HANDLING & ROLLBACK

### Check transaction error handling:
- [ ] Are failed transactions properly rolled back?
- [ ] Are partial updates prevented (atomicity)?
- [ ] Are retry mechanisms in place for transient errors?
- [ ] Are deadlock victims retried automatically?
- [ ] Are error messages logged with sufficient context?

**Action - Implement proper error handling:**
```rust
match transaction_result {
    Ok(response) => {
        client.simple_query("COMMIT").await?;
        Ok(response)
    }
    Err(e) => {
        client.simple_query("ROLLBACK").await?;
        Err(e)
    }
}
```

**Retry strategy for deadlocks:**
```rust
const MAX_RETRIES: u32 = 3;
for attempt in 1..=MAX_RETRIES {
    match execute_transaction().await {
        Ok(result) => return Ok(result),
        Err(e) if is_deadlock_error(&e) && attempt < MAX_RETRIES => {
            warn!("Deadlock detected, retry {}/{}", attempt, MAX_RETRIES);
            tokio::time::sleep(Duration::from_millis(100 * attempt as u64)).await;
            continue;
        }
        Err(e) => return Err(e),
    }
}
```

**Files to check:**
- Transaction execution code
- Error handling middleware
- Retry logic implementation

---

## 9. MONITORING & OBSERVABILITY

### Check for monitoring capabilities:
- [ ] Are slow queries logged?
- [ ] Are deadlocks logged with full context?
- [ ] Is connection pool usage monitored?
- [ ] Are transaction durations tracked?
- [ ] Is database CPU/memory monitored?

**Action - Add comprehensive logging:**
```rust
info!("Transaction started: operation={}, user={}", op_type, user_id);
// ... execute transaction ...
info!("Transaction completed: duration={}ms, rows_affected={}",
      duration.as_millis(), rows_affected);

// Log errors with context
error!("Transaction failed: operation={}, error={:?}, context={:?}",
       op_type, error, context);
```

**Files to check:**
- Logging configuration
- Database monitoring setup
- Application performance monitoring (APM)

---

## 10. SPECIFIC PATTERNS TO LOOK FOR

### Critical anti-patterns:
- [ ] **Auto-commit for multi-step operations** - Should use explicit transactions
- [ ] **Table-level locks** - Should use row-level locks where possible
- [ ] **No timeout on lock acquisition** - Can cause indefinite waits
- [ ] **Long-running transactions** - Hold locks too long
- [ ] **SELECT without FOR UPDATE** - Read-modify-write race condition
- [ ] **Inconsistent lock ordering** - Primary deadlock cause
- [ ] **No connection pooling** - Performance bottleneck
- [ ] **No isolation level specified** - May use unsafe default
- [ ] **No retry logic for deadlocks** - User sees errors needlessly
- [ ] **Partial transaction commits** - Data integrity risk

---

## ANALYSIS OUTPUT FORMAT

Please provide your analysis in this format:

### 1. Current State Summary
- Connection pooling: [YES/NO + details]
- Transaction management: [Explicit/Auto-commit + details]
- Lock ordering strategy: [YES/NO + details]
- Deadlock prevention: [Rating: Poor/Fair/Good/Excellent]
- Query performance: [Rating: Poor/Fair/Good/Excellent]

### 2. Critical Issues Found
List all critical issues with:
- Issue type (deadlock risk, race condition, performance bottleneck)
- Location (file:line)
- Severity (Critical/High/Medium/Low)
- Impact if not fixed

### 3. Recommended Fixes
For each critical issue:
- Specific code changes needed
- Files to modify
- Priority (P0/P1/P2)
- Estimated effort (hours/days)

### 4. Load Testing Recommendations
- Suggested concurrent user count
- Operations to test
- Expected performance targets
- Acceptance criteria

### 5. Implementation Plan
Step-by-step plan to implement all fixes:
1. [Priority P0 fixes - do first]
2. [Priority P1 fixes - do next]
3. [Priority P2 fixes - nice to have]
4. [Load testing & validation]

---

## FILES TO ANALYZE (customize for your project)

Please analyze these files/patterns:

**Database Layer:**
- [ ] `src/database/*.rs` or equivalent
- [ ] Database connection configuration
- [ ] Transaction management code
- [ ] Repository/DAO layer

**Business Logic:**
- [ ] Service layer files
- [ ] Multi-step operation handlers
- [ ] Inventory management
- [ ] Financial transactions
- [ ] Any concurrent write operations

**Configuration:**
- [ ] Database connection settings
- [ ] Environment variables
- [ ] Connection pool configuration
- [ ] Timeout settings

**Testing:**
- [ ] Existing load tests (if any)
- [ ] Unit tests for concurrent operations
- [ ] Integration tests

**Documentation:**
- [ ] Architecture documentation
- [ ] Database schema
- [ ] Transaction flow diagrams
```

---

## ✅ SUCCESS CRITERIA

After applying all fixes, your system should achieve:

1. **Zero deadlocks** under peak concurrent load
2. **100% success rate** for all operations (no partial failures)
3. **Sub-100ms response times** for write operations (P95)
4. **50% connection pool headroom** at peak load
5. **Atomic transactions** - all-or-nothing for multi-step operations
6. **Proper error handling** - automatic rollback on failure
7. **Load tested** with 1.5x expected production concurrency

---

## 🔧 TECHNOLOGY-SPECIFIC NOTES

### Rust + Tiberius (SQL Server)
- Use `bb8` or `deadpool` for connection pooling
- Use `client.simple_query("BEGIN TRANSACTION")` for explicit transactions
- Use `WITH (UPDLOCK, ROWLOCK)` for row-level locks
- Set isolation level: `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`

### Node.js + PostgreSQL
- Use `pg-pool` for connection pooling
- Use `BEGIN; ... COMMIT;` for transactions
- Use `SELECT ... FOR UPDATE` for row locks
- Set isolation level: `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`

### Java + Spring Boot
- Use `HikariCP` for connection pooling
- Use `@Transactional` annotation with proper propagation
- Use `SELECT ... FOR UPDATE` for pessimistic locking
- Configure `spring.jpa.properties.hibernate.connection.isolation=4` (REPEATABLE READ)

### Python + SQLAlchemy
- Use SQLAlchemy connection pooling
- Use `with session.begin()` for transactions
- Use `.with_for_update()` for row locks
- Set isolation level: `session.connection(execution_options={"isolation_level": "REPEATABLE_READ"})`

---

**Prepared by:** Deachawat
**Based on:** Mobile-Rust WMS production optimization
**Last updated:** October 2025
**Validated with:** 10 concurrent users, 100% success rate, zero deadlocks
