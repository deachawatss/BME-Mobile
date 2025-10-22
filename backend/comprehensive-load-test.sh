#!/bin/bash
# Comprehensive Load Test - Multiple Scenarios
# Tests: Bulk Picking (4 users) + Putaway (3 users) + Mixed (7 users peak)

BASE_URL="http://localhost:4400/api"
USERNAME="deachawat"
PASSWORD="Wind@password9937"
TIMESTAMP=$(date +%s)
RESULTS_FILE="/tmp/comprehensive_load_test_${TIMESTAMP}.txt"
METRICS_FILE="/tmp/load_test_metrics_${TIMESTAMP}.csv"

echo "=========================================================================="
echo "COMPREHENSIVE LOAD TEST - NWFTH WMS MOBILE-RUST"
echo "=========================================================================="
echo "Start Time: $(date)"
echo "Results: $RESULTS_FILE"
echo "Metrics: $METRICS_FILE"
echo ""

# Initialize metrics CSV
echo "Scenario,User,Operation,ResponseTime_ms,Status,Timestamp" > "$METRICS_FILE"

# Function to log metric
log_metric() {
    echo "$1,$2,$3,$4,$5,$(date +%s%3N)" >> "$METRICS_FILE"
}

# Function: Bulk Picking User Workflow
bulk_picking_user() {
    local USER_ID=$1
    local RUN_NO=$2
    local BATCH_NO=$3
    local SCENARIO="BulkPicking"

    # Login
    local START=$(date +%s%3N)
    local LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST \
        "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
    local END=$(date +%s%3N)
    local LOGIN_TIME=$((END - START))
    local LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "Login" "$LOGIN_TIME" "$LOGIN_STATUS"

    local TOKEN=$(echo "$LOGIN_RESP" | head -n -1 | grep -o '"access_token":"[^"]*"' | head -n 1 | cut -d'"' -f4)

    if [ -z "$TOKEN" ]; then
        echo "[$SCENARIO-User$USER_ID] ❌ Login failed"
        return 1
    fi

    # Search Runs
    START=$(date +%s%3N)
    local SEARCH_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/search?status=NEW&limit=20" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local SEARCH_TIME=$((END - START))
    local SEARCH_STATUS=$(echo "$SEARCH_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "SearchRuns" "$SEARCH_TIME" "$SEARCH_STATUS"

    # Get Run Details
    START=$(date +%s%3N)
    local DETAILS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/${BATCH_NO}" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local DETAILS_TIME=$((END - START))
    local DETAILS_STATUS=$(echo "$DETAILS_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "GetRunDetails" "$DETAILS_TIME" "$DETAILS_STATUS"

    # Search Lots (FEFO - Critical Query)
    START=$(date +%s%3N)
    local LOTS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/${BATCH_NO}/lots?ingredientIndex=0&limit=20" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local LOTS_TIME=$((END - START))
    local LOTS_STATUS=$(echo "$LOTS_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "SearchLots_FEFO" "$LOTS_TIME" "$LOTS_STATUS"

    # Get Ingredient
    START=$(date +%s%3N)
    local ING_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/${BATCH_NO}/ingredients/0" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local ING_TIME=$((END - START))
    local ING_STATUS=$(echo "$ING_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "GetIngredient" "$ING_TIME" "$ING_STATUS"

    echo "[$SCENARIO-User$USER_ID] ✅ Completed: Login(${LOGIN_TIME}ms) Search(${SEARCH_TIME}ms) Details(${DETAILS_TIME}ms) Lots(${LOTS_TIME}ms) Ingredient(${ING_TIME}ms)"
}

# Function: Putaway User Workflow
putaway_user() {
    local USER_ID=$1
    local SCENARIO="Putaway"

    # Login
    local START=$(date +%s%3N)
    local LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST \
        "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
    local END=$(date +%s%3N)
    local LOGIN_TIME=$((END - START))
    local LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "Login" "$LOGIN_TIME" "$LOGIN_STATUS"

    local TOKEN=$(echo "$LOGIN_RESP" | head -n -1 | grep -o '"access_token":"[^"]*"' | head -n 1 | cut -d'"' -f4)

    if [ -z "$TOKEN" ]; then
        echo "[$SCENARIO-User$USER_ID] ❌ Login failed"
        return 1
    fi

    # Search Lots
    START=$(date +%s%3N)
    local LOTS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/putaway/lots/search?query=25&limit=20" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local LOTS_TIME=$((END - START))
    local LOTS_STATUS=$(echo "$LOTS_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "SearchLots" "$LOTS_TIME" "$LOTS_STATUS"

    # Search Bins
    START=$(date +%s%3N)
    local BINS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/putaway/bins/search?query=A&limit=20" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local BINS_TIME=$((END - START))
    local BINS_STATUS=$(echo "$BINS_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "SearchBins" "$BINS_TIME" "$BINS_STATUS"

    # Health Check
    START=$(date +%s%3N)
    local HEALTH_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/putaway/health" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local HEALTH_TIME=$((END - START))
    local HEALTH_STATUS=$(echo "$HEALTH_RESP" | tail -n 1)
    log_metric "$SCENARIO" "$USER_ID" "HealthCheck" "$HEALTH_TIME" "$HEALTH_STATUS"

    echo "[$SCENARIO-User$USER_ID] ✅ Completed: Login(${LOGIN_TIME}ms) Lots(${LOTS_TIME}ms) Bins(${BINS_TIME}ms) Health(${HEALTH_TIME}ms)"
}

echo "=========================================================================="
echo "SCENARIO A: BULK PICKING - 4 CONCURRENT USERS"
echo "=========================================================================="
bulk_picking_user 1 5000008 850858 &
bulk_picking_user 2 5000008 850863 &
bulk_picking_user 3 5000008 850862 &
bulk_picking_user 4 5000025 850866 &
wait
echo ""

echo "=========================================================================="
echo "SCENARIO B: PUTAWAY - 3 CONCURRENT USERS"
echo "=========================================================================="
putaway_user 1 &
putaway_user 2 &
putaway_user 3 &
wait
echo ""

echo "=========================================================================="
echo "SCENARIO C: MIXED PEAK LOAD - 7 CONCURRENT USERS (4 Picking + 3 Putaway)"
echo "=========================================================================="
bulk_picking_user 1 5000008 850858 &
bulk_picking_user 2 5000008 850863 &
bulk_picking_user 3 5000008 850862 &
bulk_picking_user 4 5000025 850866 &
putaway_user 5 &
putaway_user 6 &
putaway_user 7 &
wait
echo ""

echo "=========================================================================="
echo "LOAD TEST COMPLETED"
echo "=========================================================================="
echo "End Time: $(date)"
echo ""

# Analyze Results
echo "Calculating Performance Metrics..."
echo ""

# Calculate average response times per operation
echo "PERFORMANCE SUMMARY:"
echo "==================="
echo ""

for operation in Login SearchRuns GetRunDetails SearchLots_FEFO GetIngredient SearchLots SearchBins HealthCheck; do
    avg=$(awk -F',' -v op="$operation" '$3 == op {sum+=$4; count++} END {if(count>0) print int(sum/count); else print "N/A"}' "$METRICS_FILE")
    if [ "$avg" != "N/A" ]; then
        echo "$operation: ${avg}ms average"
    fi
done

echo ""
echo "Detailed metrics saved to: $METRICS_FILE"
echo "Full results saved to: $RESULTS_FILE"
