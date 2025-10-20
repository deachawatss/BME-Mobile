#!/bin/bash
# Load Test - 10 Concurrent Users (Complete Workflow Test)
# Tests actual pick/unpick operations including 6-table atomic transactions
# Extended test from 7 to 10 users to verify higher capacity

BASE_URL="http://localhost:4400/api"
USERNAME="deachawat"
PASSWORD="Wind@password9937"
TIMESTAMP=$(date +%s)
RESULTS_FILE="/tmp/load_test_10users_${TIMESTAMP}.txt"
METRICS_FILE="/tmp/load_test_10users_metrics_${TIMESTAMP}.csv"

echo "=========================================================================="
echo "LOAD TEST - 10 CONCURRENT USERS (COMPLETE WORKFLOW)"
echo "Testing: Read Operations + Write Transactions (Pick/Unpick)"
echo "=========================================================================="
echo "Start Time: $(date)"
echo "Results: $RESULTS_FILE"
echo "Metrics: $METRICS_FILE"
echo ""

# Initialize metrics CSV
echo "User,Operation,ResponseTime_ms,Status,Timestamp" > "$METRICS_FILE"

# Function to log metric
log_metric() {
    echo "$1,$2,$3,$4,$(date +%s%3N)" >> "$METRICS_FILE"
}

# Function: Bulk Picking User Workflow
bulk_picking_user() {
    local USER_ID=$1
    local RUN_NO=$2
    local BATCH_NO=$3

    # Login
    local START=$(date +%s%3N)
    local LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST \
        "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
    local END=$(date +%s%3N)
    local LOGIN_TIME=$((END - START))
    local LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -n 1)
    log_metric "User$USER_ID" "Login" "$LOGIN_TIME" "$LOGIN_STATUS"

    local TOKEN=$(echo "$LOGIN_RESP" | head -n -1 | grep -o '"access_token":"[^"]*"' | head -n 1 | cut -d'"' -f4)

    if [ -z "$TOKEN" ]; then
        echo "[User$USER_ID] ❌ Login failed"
        return 1
    fi

    # Search Runs
    START=$(date +%s%3N)
    local SEARCH_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/available" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local SEARCH_TIME=$((END - START))
    local SEARCH_STATUS=$(echo "$SEARCH_RESP" | tail -n 1)
    log_metric "User$USER_ID" "SearchRuns" "$SEARCH_TIME" "$SEARCH_STATUS"

    # Get Run Details
    START=$(date +%s%3N)
    local DETAILS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/form-data?ingredient_index=0" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local DETAILS_TIME=$((END - START))
    local DETAILS_STATUS=$(echo "$DETAILS_RESP" | tail -n 1)
    log_metric "User$USER_ID" "GetRunDetails" "$DETAILS_TIME" "$DETAILS_STATUS"

    local DETAILS_BODY
    DETAILS_BODY=$(echo "$DETAILS_RESP" | head -n -1)
    # Extract item_key, row_num, line_id using separate Python calls for reliability
    local ITEM_KEY=$(echo "$DETAILS_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin).get('data',{}).get('current_ingredient',{}).get('ingredient',{}); print(d.get('item_key',''))" 2>/dev/null || echo "")
    local DETAIL_ROW_NUM=$(echo "$DETAILS_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin).get('data',{}).get('current_ingredient',{}).get('ingredient',{}); print(d.get('row_num',''))" 2>/dev/null || echo "")
    local DETAIL_LINE_ID=$(echo "$DETAILS_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin).get('data',{}).get('current_ingredient',{}).get('ingredient',{}); print(d.get('line_id',''))" 2>/dev/null || echo "")

    # Search Lots (FEFO - Critical Query)
    START=$(date +%s%3N)
    local LOTS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/lots/search?item_key=${ITEM_KEY}&page=1&page_size=5" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local LOTS_TIME=$((END - START))
    local LOTS_STATUS=$(echo "$LOTS_RESP" | tail -n 1)
    log_metric "User$USER_ID" "SearchLots_FEFO" "$LOTS_TIME" "$LOTS_STATUS"

    # Extract first lot_no and bin_no from FEFO results for pick operation
    local LOTS_BODY
    LOTS_BODY=$(echo "$LOTS_RESP" | head -n -1)
    # Parse nested JSON using simpler approach - get first lot from data.lots array
    local FIRST_LOT=$(echo "$LOTS_BODY" | python3 -c "import sys, json; lots=json.load(sys.stdin).get('data',{}).get('lots',[]); print(lots[0]['lot_no'] if lots else '')" 2>/dev/null || echo "")
    local FIRST_BIN=$(echo "$LOTS_BODY" | python3 -c "import sys, json; lots=json.load(sys.stdin).get('data',{}).get('lots',[]); print(lots[0]['bin_no'] if lots else '')" 2>/dev/null || echo "")

    # Get Ingredient (to extract row_num and line_id)
    START=$(date +%s%3N)
    local ING_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/bulk-runs/${RUN_NO}/next-ingredient" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local ING_TIME=$((END - START))
    local ING_STATUS=$(echo "$ING_RESP" | tail -n 1)
    log_metric "User$USER_ID" "GetIngredient" "$ING_TIME" "$ING_STATUS"

    # Extract row_num and line_id from ingredient response - use data from form-data as fallback
    local ING_BODY
    ING_BODY=$(echo "$ING_RESP" | head -n -1)
    local ROW_NUM_API=$(echo "$ING_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin).get('data',{}); print(d.get('row_num',''))" 2>/dev/null || echo "")
    local LINE_ID_API=$(echo "$ING_BODY" | python3 -c "import sys, json; d=json.load(sys.stdin).get('data',{}); print(d.get('line_id',''))" 2>/dev/null || echo "")

    # Use form-data values as primary source, API values as fallback
    local ROW_NUM=${DETAIL_ROW_NUM:-$ROW_NUM_API}
    local LINE_ID=${DETAIL_LINE_ID:-$LINE_ID_API}

    # Pick Operation (6-table atomic transaction test)
    if [ -n "$FIRST_LOT" ] && [ -n "$FIRST_BIN" ] && [ -n "$ROW_NUM" ] && [ -n "$LINE_ID" ]; then
        START=$(date +%s%3N)
        local PICK_RESP=$(curl -s -w "\n%{http_code}" -X POST \
            "$BASE_URL/bulk-runs/${RUN_NO}/confirm-pick" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"row_num\":${ROW_NUM},\"line_id\":${LINE_ID},\"picked_bulk_qty\":\"10.0\",\"lot_no\":\"${FIRST_LOT}\",\"bin_no\":\"${FIRST_BIN}\",\"user_id\":\"$USERNAME\"}")
        END=$(date +%s%3N)
        local PICK_TIME=$((END - START))
        local PICK_STATUS=$(echo "$PICK_RESP" | tail -n 1)
        log_metric "User$USER_ID" "PickOperation" "$PICK_TIME" "$PICK_STATUS"

        # Unpick Operation (rollback transaction test)
        START=$(date +%s%3N)
        local UNPICK_RESP=$(curl -s -w "\n%{http_code}" -X POST \
            "$BASE_URL/bulk-runs/${RUN_NO}/${ROW_NUM}/${LINE_ID}/unpick" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{}")
        END=$(date +%s%3N)
        local UNPICK_TIME=$((END - START))
        local UNPICK_STATUS=$(echo "$UNPICK_RESP" | tail -n 1)
        log_metric "User$USER_ID" "UnpickOperation" "$UNPICK_TIME" "$UNPICK_STATUS"

        echo "[User$USER_ID] ✅ Completed: Login(${LOGIN_TIME}ms) Search(${SEARCH_TIME}ms) Details(${DETAILS_TIME}ms) Lots(${LOTS_TIME}ms) Ingredient(${ING_TIME}ms) Pick(${PICK_TIME}ms) Unpick(${UNPICK_TIME}ms)"
    else
        echo "[User$USER_ID] ⚠️ Completed (no pick/unpick): Login(${LOGIN_TIME}ms) Search(${SEARCH_TIME}ms) Details(${DETAILS_TIME}ms) Lots(${LOTS_TIME}ms) Ingredient(${ING_TIME}ms)"
    fi
}

# Function: Putaway User Workflow
putaway_user() {
    local USER_ID=$1

    # Login
    local START=$(date +%s%3N)
    local LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST \
        "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
    local END=$(date +%s%3N)
    local LOGIN_TIME=$((END - START))
    local LOGIN_STATUS=$(echo "$LOGIN_RESP" | tail -n 1)
    log_metric "User$USER_ID" "Login" "$LOGIN_TIME" "$LOGIN_STATUS"

    local TOKEN=$(echo "$LOGIN_RESP" | head -n -1 | grep -o '"access_token":"[^"]*"' | head -n 1 | cut -d'"' -f4)

    if [ -z "$TOKEN" ]; then
        echo "[User$USER_ID] ❌ Login failed"
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
    log_metric "User$USER_ID" "SearchLots" "$LOTS_TIME" "$LOTS_STATUS"

    # Search Bins
    START=$(date +%s%3N)
    local BINS_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/putaway/bins/search?query=A&limit=20" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local BINS_TIME=$((END - START))
    local BINS_STATUS=$(echo "$BINS_RESP" | tail -n 1)
    log_metric "User$USER_ID" "SearchBins" "$BINS_TIME" "$BINS_STATUS"

    # Health Check
    START=$(date +%s%3N)
    local HEALTH_RESP=$(curl -s -w "\n%{http_code}" \
        "$BASE_URL/putaway/health" \
        -H "Authorization: Bearer $TOKEN")
    END=$(date +%s%3N)
    local HEALTH_TIME=$((END - START))
    local HEALTH_STATUS=$(echo "$HEALTH_RESP" | tail -n 1)
    log_metric "User$USER_ID" "HealthCheck" "$HEALTH_TIME" "$HEALTH_STATUS"

    echo "[User$USER_ID] ✅ Completed: Login(${LOGIN_TIME}ms) Lots(${LOTS_TIME}ms) Bins(${BINS_TIME}ms) Health(${HEALTH_TIME}ms)"
}

echo "=========================================================================="
echo "PEAK LOAD TEST: 10 CONCURRENT USERS (6 Picking + 4 Putaway)"
echo "Bulk Picking: Complete workflow with Pick + Unpick transactions"
echo "=========================================================================="

# Launch 6 bulk picking users
bulk_picking_user 1 5000008 850858 &
bulk_picking_user 2 5000008 850863 &
bulk_picking_user 3 5000008 850862 &
bulk_picking_user 4 5000025 850866 &
bulk_picking_user 5 5000025 850865 &
bulk_picking_user 6 5000008 850861 &

# Launch 4 putaway users
putaway_user 7 &
putaway_user 8 &
putaway_user 9 &
putaway_user 10 &

# Wait for all users to complete
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

echo "PERFORMANCE SUMMARY:"
echo "==================="
echo ""

for operation in Login SearchRuns GetRunDetails SearchLots_FEFO GetIngredient PickOperation UnpickOperation SearchLots SearchBins HealthCheck; do
    avg=$(awk -F',' -v op="$operation" '$2 == op {sum+=$3; count++} END {if(count>0) print int(sum/count); else print "N/A"}' "$METRICS_FILE")
    min=$(awk -F',' -v op="$operation" '$2 == op {if(min==""){min=$3} if($3<min){min=$3}} END {print min}' "$METRICS_FILE")
    max=$(awk -F',' -v op="$operation" '$2 == op {if(max==""){max=$3} if($3>max){max=$3}} END {print max}' "$METRICS_FILE")

    if [ "$avg" != "N/A" ]; then
        if [ "$operation" = "PickOperation" ] || [ "$operation" = "UnpickOperation" ]; then
            echo "$operation: ${avg}ms avg (min: ${min}ms, max: ${max}ms) ⭐ (write transaction)"
        else
            echo "$operation: ${avg}ms avg (min: ${min}ms, max: ${max}ms)"
        fi
    fi
done

echo ""
echo "Total Operations: $(( $(wc -l < "$METRICS_FILE") - 1 ))"
echo "Concurrent Users: 10"
echo ""
echo "Detailed metrics saved to: $METRICS_FILE"
echo "Full results saved to: $RESULTS_FILE"
