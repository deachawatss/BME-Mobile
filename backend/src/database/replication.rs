use crate::database::Database;
use anyhow::{Context, Result};
use tiberius::Query as TiberiusQuery;
use tracing::{error, info, warn};

/// Bulk picking table replication operations for TFCMOBILE synchronization
impl Database {
    /// Replicate bulk picking transaction to TFCMOBILE
    /// This is a best-effort operation that logs failures but doesn't fail the main transaction
    pub async fn replicate_bulk_pick_transaction(
        &self,
        run_no: i32,
        row_num: i32,
        line_id: i32,
        picked_bulk_qty: f64,
        picked_qty: f64,
        lot_no: &str,
        bin_no: &str,
        user_id: &str,
    ) -> Result<()> {
        match self.try_replicate_bulk_pick_transaction(
            run_no, row_num, line_id, picked_bulk_qty, picked_qty, lot_no, bin_no, user_id,
        ).await {
            Ok(()) => {
                info!("Successfully replicated bulk pick transaction to TFCMOBILE for run {}, lot {}", run_no, lot_no);
                Ok(())
            }
            Err(e) => {
                error!("Failed to replicate bulk pick transaction to TFCMOBILE: {}", e);
                // Don't propagate the error - replication is best-effort
                Ok(())
            }
        }
    }

    /// Internal method for actual replication attempt
    async fn try_replicate_bulk_pick_transaction(
        &self,
        run_no: i32,
        row_num: i32,
        line_id: i32,
        picked_bulk_qty: f64,
        picked_qty: f64,
        lot_no: &str,
        bin_no: &str,
        user_id: &str,
    ) -> Result<()> {
        let mut replica_client = match self.get_replica_client().await? {
            Some(client) => client,
            None => {
                warn!("No replica database configured, skipping replication");
                return Ok(());
            }
        };

        // NOTE: Tiberius doesn't support transactions in the same way
        // We'll execute operations without explicit transaction for now

        // Replicate cust_BulkPicked update
        self.replicate_bulk_picked_update(
            &mut replica_client,
            run_no,
            row_num,
            line_id,
            picked_bulk_qty,
            picked_qty,
            user_id,
        )
        .await
        .context("Failed to replicate cust_BulkPicked update")?;

        // Replicate Cust_BulkLotPicked insert
        self.replicate_bulk_lot_picked_insert(
            &mut replica_client,
            run_no,
            row_num,
            line_id,
            lot_no,
            bin_no,
            picked_qty,
            user_id,
        )
        .await
        .context("Failed to replicate Cust_BulkLotPicked insert")?;

        // Replicate LotMaster update
        self.replicate_lot_master_update(&mut replica_client, lot_no, picked_qty)
            .await
            .context("Failed to replicate LotMaster update")?;

        // Replicate LotTransaction insert (4th table for complete BME4 pattern)
        self.replicate_lot_transaction_insert(
            &mut replica_client,
            run_no,
            row_num,
            line_id,
            lot_no,
            bin_no,
            picked_qty,
            user_id,
        )
        .await
        .context("Failed to replicate LotTransaction insert")?;

        Ok(())
    }

    /// Replicate cust_BulkPicked table update to TFCMOBILE
    async fn replicate_bulk_picked_update(
        &self,
        client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
        run_no: i32,
        row_num: i32,
        line_id: i32,
        picked_bulk_qty: f64,
        picked_qty: f64,
        user_id: &str,
    ) -> Result<()> {
        let update_query = r#"
            UPDATE cust_BulkPicked 
            SET PickedBulkQty = @P1,
                PickedQty = @P2,
                PickingDate = GETDATE(),
                ModifiedBy = @P6,
                ModifiedDate = GETDATE()
            WHERE RunNo = @P3 
                AND RowNum = @P4 
                AND LineId = @P5
        "#;

        let mut query = TiberiusQuery::new(update_query);
        query.bind(picked_bulk_qty);
        query.bind(picked_qty);
        query.bind(run_no);
        query.bind(row_num);
        query.bind(line_id);
        query.bind(user_id);

        query
            .execute(client)
            .await
            .context("Failed to execute cust_BulkPicked replica update")?;

        Ok(())
    }

    /// Replicate Cust_BulkLotPicked table insert to TFCMOBILE
    async fn replicate_bulk_lot_picked_insert(
        &self,
        client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
        run_no: i32,
        row_num: i32,
        line_id: i32,
        lot_no: &str,
        bin_no: &str,
        picked_qty: f64,
        user_id: &str,
    ) -> Result<()> {
        // First check if record already exists to avoid duplicates
        let check_query = r#"
            SELECT COUNT(*) as RecordCount
            FROM Cust_BulkLotPicked
            WHERE RunNo = @P1 AND RowNum = @P2 AND LineId = @P3 AND LotNo = @P4
        "#;

        let mut check = TiberiusQuery::new(check_query);
        check.bind(run_no);
        check.bind(row_num);
        check.bind(line_id);
        check.bind(lot_no);

        let check_stream = check
            .query(client)
            .await
            .context("Failed to check existing Cust_BulkLotPicked record")?;

        let check_rows: Vec<tiberius::Row> = check_stream
            .into_first_result()
            .await
            .context("Failed to get check results")?;

        let record_exists = check_rows
            .first()
            .and_then(|row| row.get::<i32, _>("RecordCount"))
            .unwrap_or(0) > 0;

        if record_exists {
            // Update existing record
            let update_query = r#"
                UPDATE Cust_BulkLotPicked
                SET QtyReceived = QtyReceived + @P1,
                    AllocLotQty = AllocLotQty + @P2,
                    ModifiedDate = GETDATE()
                WHERE RunNo = @P3 AND RowNum = @P4 AND LineId = @P5 AND LotNo = @P6
            "#;

            let mut update = TiberiusQuery::new(update_query);
            update.bind(picked_qty);
            update.bind(picked_qty);
            update.bind(run_no);
            update.bind(row_num);
            update.bind(line_id);
            update.bind(lot_no);

            update
                .execute(client)
                .await
                .context("Failed to update existing Cust_BulkLotPicked record")?;
        } else {
            // Insert new record with all required NOT NULL fields (schema now aligned with TFCPILOT3)
            let insert_query = r#"
                INSERT INTO Cust_BulkLotPicked 
                (RunNo, RowNum, LineId, LotNo, BinNo, ItemKey, LocationKey,
                 DateReceived, DateExpiry, TransactionType, 
                 ReceiptDocNo, ReceiptDocLineNo, QtyReceived, 
                 Vendorkey, VendorlotNo, IssueDocNo, IssueDocLineNo, IssueDate, QtyIssued,
                 CustomerKey, RecUserid, RecDate, ModifiedBy, ModifiedDate,
                 DateQuarantine, PackSize, QtyOnHand, PalletNo, PalletId,
                 User1, User2, User3, User4, User5, User6,
                 User7, User8, User9, User10, User11, User12,
                 AllocLotQty, LotStatus, 
                 CUSTOM1, CUSTOM2, CUSTOM3, CUSTOM4, CUSTOM5, CUSTOM6, CUSTOM7, CUSTOM8, CUSTOM9, CUSTOM10,
                 ESG_REASON, ESG_APPROVER)
                VALUES (
                    @P1, @P2, @P3, @P4, @P5,  -- RunNo, RowNum, LineId, LotNo, BinNo
                    (SELECT ItemKey FROM cust_BulkPicked WHERE RunNo = @P1 AND RowNum = @P2 AND LineId = @P3), -- ItemKey from bulk run
                    'TFC1', -- LocationKey
                    GETDATE(), DATEADD(YEAR, 1, GETDATE()), -- DateReceived, DateExpiry  
                    5, -- TransactionType (bulk picking)
                    'BULK-' + CAST(@P1 AS VARCHAR) + '-' + CAST(@P2 AS VARCHAR), 1, @P6, -- ReceiptDocNo, ReceiptDocLineNo, QtyReceived
                    'BULK_PICK', 'MOBILE_LOT', -- Vendorkey, VendorlotNo
                    'BT-BULK-' + CAST(@P1 AS VARCHAR), 1, GETDATE(), @P7, -- IssueDocNo, IssueDocLineNo, IssueDate, QtyIssued
                    'INTERNAL', @P10, GETDATE(), @P11, GETDATE(), -- CustomerKey, RecUserid, RecDate, ModifiedBy, ModifiedDate
                    '1900-01-01', 25.0, @P8, 'BULK-PALLET', 'BULK-ID', -- DateQuarantine, PackSize, QtyOnHand, PalletNo, PalletId
                    '', '', '', '', '', '1900-01-01', -- User1-6
                    0.0, 0.0, 0.0, 0.0, 0, 0, -- User7-12
                    @P9, 'P', -- AllocLotQty, LotStatus
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -- CUSTOM1-10
                    '', '' -- ESG_REASON, ESG_APPROVER
                )
            "#;

            let mut insert = TiberiusQuery::new(insert_query);
            insert.bind(run_no);           // P1
            insert.bind(row_num);          // P2
            insert.bind(line_id);          // P3
            insert.bind(lot_no);           // P4
            insert.bind(bin_no);           // P5
            insert.bind(picked_qty);       // P6 - QtyReceived
            insert.bind(picked_qty);       // P7 - QtyIssued
            insert.bind(picked_qty);       // P8 - QtyOnHand
            insert.bind(picked_qty);       // P9 - AllocLotQty
            insert.bind(user_id);          // P10 - RecUserid
            insert.bind(user_id);          // P11 - ModifiedBy

            insert
                .execute(client)
                .await
                .context("Failed to insert Cust_BulkLotPicked replica record with aligned schema")?;
        }

        Ok(())
    }

    /// Replicate LotMaster table update to TFCMOBILE
    async fn replicate_lot_master_update(
        &self,
        client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
        lot_no: &str,
        picked_qty: f64,
    ) -> Result<()> {
        let update_query = r#"
            UPDATE LotMaster 
            SET QtyCommitSales = QtyCommitSales + @P1,
                ModifiedDate = GETDATE()
            WHERE LotNo = @P2 AND LocationKey = 'TFC1'
        "#;

        let mut query = TiberiusQuery::new(update_query);
        query.bind(picked_qty);
        query.bind(lot_no);

        query
            .execute(client)
            .await
            .context("Failed to execute LotMaster replica update")?;

        Ok(())
    }

    /// Replicate LotTransaction table insert to TFCMOBILE (4th table for complete BME4 pattern)
    async fn replicate_lot_transaction_insert(
        &self,
        client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
        run_no: i32,
        row_num: i32,
        line_id: i32,
        lot_no: &str,
        bin_no: &str,
        picked_qty: f64,
        user_id: &str,
    ) -> Result<()> {
        // Generate BT-XXXXXXXX document number like TFCPILOT3 does
        // Use the existing method from bulk_runs.rs
        let doc_no = self.generate_bt_document_number(client).await?;
        
        let insert_query = r#"
            INSERT INTO LotTransaction (
                LotNo, 
                ItemKey, 
                LocationKey, 
                TransactionType, 
                DocumentNumber, 
                DocumentLineNumber,
                TransactionDate, 
                TransactionQty, 
                TransactionAmount, 
                TransactionReference,
                BinNo,
                RecUserid, 
                RecDate, 
                ModifiedBy, 
                ModifiedDate
            ) VALUES (
                @P1,    -- LotNo
                (SELECT ItemKey FROM Cust_BulkLotPicked WHERE RunNo = @P2 AND RowNum = @P3 AND LineId = @P4 AND LotNo = @P1),
                'TFC1', -- LocationKey
                9,      -- TransactionType (Issue for bulk picking)
                @P5,    -- DocumentNumber (BT-XXXXXXXX)
                1,      -- DocumentLineNumber  
                GETDATE(), -- TransactionDate
                @P6,    -- TransactionQty (negative for issue)
                0.0,    -- TransactionAmount (no cost impact for internal transfers)
                @P7,    -- TransactionReference (Run-RowNum-LineId)
                @P8,    -- BinNo
                @P9,    -- RecUserid
                GETDATE(),    -- RecDate
                @P10,   -- ModifiedBy
                GETDATE()     -- ModifiedDate
            )
        "#;

        let mut query = TiberiusQuery::new(insert_query);
        query.bind(lot_no);
        query.bind(run_no);
        query.bind(row_num);
        query.bind(line_id);
        query.bind(&doc_no);
        query.bind(-picked_qty); // Negative for issue transaction
        let transaction_reference = format!("RUN{}-{}-{}", run_no, row_num, line_id);
        query.bind(&transaction_reference);
        query.bind(bin_no);
        query.bind(user_id);     // P9 - RecUserid
        query.bind(user_id);     // P10 - ModifiedBy

        query
            .execute(client)
            .await
            .context("Failed to execute LotTransaction replica insert")?;

        Ok(())
    }


    /// Replicate full run data to TFCMOBILE (for initial sync)
    pub async fn replicate_full_run_to_mobile(&self, run_no: i32) -> Result<()> {
        match self.try_replicate_full_run_to_mobile(run_no).await {
            Ok(()) => {
                info!("Successfully replicated full run {} to TFCMOBILE", run_no);
                Ok(())
            }
            Err(e) => {
                error!("Failed to replicate full run {} to TFCMOBILE: {}", run_no, e);
                // Best-effort operation, don't fail
                Ok(())
            }
        }
    }

    /// Internal method for full run replication
    async fn try_replicate_full_run_to_mobile(&self, run_no: i32) -> Result<()> {
        // Get all run data from primary database
        let mut primary_client = self
            .get_primary_client()
            .await
            .context("Failed to get primary database client")?;

        let query = r#"
            SELECT RunNo, RowNum, BatchNo, LineId, ItemKey, 
                   ToPickedBulkQty, PickedBulkQty, PickedQty, 
                   StandardQty, PackSize
            FROM cust_BulkPicked 
            WHERE RunNo = @P1
        "#;

        let mut select = TiberiusQuery::new(query);
        select.bind(run_no);

        let stream = select
            .query(&mut primary_client)
            .await
            .context("Failed to query run data from primary")?;

        let rows: Vec<tiberius::Row> = stream
            .into_first_result()
            .await
            .context("Failed to get run data from primary")?;

        if rows.is_empty() {
            warn!("No data found for run {} in primary database", run_no);
            return Ok(());
        }

        // Replicate to TFCMOBILE
        let mut replica_client = match self.get_replica_client().await? {
            Some(client) => client,
            None => {
                warn!("No replica database configured, skipping replication");
                return Ok(());
            }
        };

        // Execute operations directly on replica client

        for row in &rows {
            // Extract row data
            let row_num: i32 = row.get("RowNum").unwrap_or(0);
            let line_id: i32 = row.get("LineId").unwrap_or(0);
            let item_key: Option<&str> = row.get("ItemKey");
            let picked_bulk_qty: Option<f64> = row.get("PickedBulkQty");
            let picked_qty: Option<f64> = row.get("PickedQty");

            if let (Some(_item_key), Some(picked_bulk_qty), Some(picked_qty)) = 
                (item_key, picked_bulk_qty, picked_qty) {
                if picked_bulk_qty > 0.0 && picked_qty > 0.0 {
                    // Only replicate records that have been picked
                    self.replicate_bulk_picked_update(
                        &mut replica_client,
                        run_no,
                        row_num,
                        line_id,
                        picked_bulk_qty,
                        picked_qty,
                        "SYSTEM",
                    )
                    .await?;
                }
            }
        }

        Ok(())
    }

    /// Check replication health between primary and replica
    pub async fn check_replication_health(&self, run_no: i32) -> Result<ReplicationHealthReport> {
        let primary_count = self.get_bulk_picked_count_primary(run_no).await?;
        let replica_count = self.get_bulk_picked_count_replica(run_no).await?;
        
        let is_healthy = primary_count == replica_count;
        let lag = if primary_count > replica_count { 
            primary_count - replica_count 
        } else { 0 };

        Ok(ReplicationHealthReport {
            run_no,
            primary_count,
            replica_count,
            is_healthy,
            lag,
        })
    }

    async fn get_bulk_picked_count_primary(&self, run_no: i32) -> Result<i32> {
        let mut client = self.get_primary_client().await?;
        let query = "SELECT COUNT(*) as RecordCount FROM cust_BulkPicked WHERE RunNo = @P1 AND PickedBulkQty > 0";
        
        let mut select = TiberiusQuery::new(query);
        select.bind(run_no);
        
        let stream = select.query(&mut client).await?;
        let rows: Vec<tiberius::Row> = stream.into_first_result().await?;
        
        Ok(rows.first().and_then(|row| row.get::<i32, _>("RecordCount")).unwrap_or(0))
    }

    async fn get_bulk_picked_count_replica(&self, run_no: i32) -> Result<i32> {
        let mut client = match self.get_replica_client().await? {
            Some(client) => client,
            None => return Ok(0),
        };
        let query = "SELECT COUNT(*) as RecordCount FROM cust_BulkPicked WHERE RunNo = @P1 AND PickedBulkQty > 0";
        
        let mut select = TiberiusQuery::new(query);
        select.bind(run_no);
        
        let stream = select.query(&mut client).await?;
        let rows: Vec<tiberius::Row> = stream.into_first_result().await?;
        
        Ok(rows.first().and_then(|row| row.get::<i32, _>("RecordCount")).unwrap_or(0))
    }

    /// Replicate run completion status update to TFCMOBILE
    /// Best-effort replication for Cust_BulkRun status change from NEW → PRINT
    pub async fn replicate_run_completion_status(
        &self,
        run_no: i32,
        user_id: &str,
        bangkok_now: &str,
    ) -> Result<()> {
        info!("🔄 Replicating run completion status to TFCMOBILE for run {}", run_no);
        
        let mut replica_client = match self.get_replica_client().await? {
            Some(client) => client,
            None => {
                warn!("No replica database configured, skipping replication");
                return Ok(());
            }
        };
        
        // Update Cust_BulkRun status in TFCMOBILE to match TFCPILOT3
        let update_query = r#"
            UPDATE Cust_BulkRun 
            SET Status = 'PRINT', 
                ModifiedDate = @P1,
                ModifiedBy = @P2
            WHERE RunNo = @P3
        "#;
        
        let mut update_stmt = TiberiusQuery::new(update_query);
        update_stmt.bind(bangkok_now);
        update_stmt.bind(user_id);
        update_stmt.bind(run_no);
        
        let result = update_stmt
            .execute(&mut replica_client)
            .await
            .context("Failed to replicate run completion status to TFCMOBILE")?;
            
        let affected_rows = result.rows_affected().iter().sum::<u64>();
        
        if affected_rows > 0 {
            info!("✅ Successfully replicated run completion status to TFCMOBILE - Run: {}, Rows affected: {}", run_no, affected_rows);
        } else {
            warn!("⚠️ No rows affected in TFCMOBILE run completion replication - Run: {} may not exist in replica database", run_no);
        }
        
        Ok(())
    }

    /// Replicate run status revert to TFCMOBILE
    /// Best-effort replication for Cust_BulkRun status change from PRINT → NEW
    pub async fn replicate_run_status_revert(
        &self,
        run_no: i32,
        user_id: &str,
        modified_date: &str,
    ) -> Result<()> {
        // Skip replication if no replica configuration is available
        let Some(_replica_config) = &self.replica_config else {
            info!("⚠️ TFCMOBILE replica configuration not available - skipping status revert replication for run {}", run_no);
            return Ok(());
        };

        // Update Cust_BulkRun status in TFCMOBILE to match TFCPILOT3
        let update_query = r#"
            UPDATE Cust_BulkRun
            SET Status = 'NEW',
                ModifiedBy = @P1,
                ModifiedDate = @P2
            WHERE RunNo = @P3
              AND Status = 'PRINT'
        "#;

        let mut client = match self.get_replica_client().await? {
            Some(client) => client,
            None => {
                info!("⚠️ No replica database configured, skipping status revert replication");
                return Ok(());
            }
        };

        // Truncate user_id to fit database field constraints (ModifiedBy is limited to 8 characters)
        let user_id_truncated = if user_id.len() > 8 {
            &user_id[..8]
        } else {
            user_id
        };

        let mut update_stmt = tiberius::Query::new(update_query);
        update_stmt.bind(user_id_truncated);
        update_stmt.bind(modified_date);
        update_stmt.bind(run_no);

        let result = update_stmt.execute(&mut client)
            .await
            .context("Failed to replicate status revert to TFCMOBILE")?;

        let affected_rows = result.rows_affected().iter().sum::<u64>();

        if affected_rows > 0 {
            info!("✅ Successfully replicated run status revert to TFCMOBILE - Run: {}, Rows affected: {}", run_no, affected_rows);
        } else {
            warn!("⚠️ No rows affected in TFCMOBILE status revert replication - Run: {} may not exist in replica database or not in PRINT status", run_no);
        }

        Ok(())
    }
}

/// Health report for replication monitoring
#[derive(Debug)]
pub struct ReplicationHealthReport {
    pub run_no: i32,
    pub primary_count: i32,
    pub replica_count: i32,
    pub is_healthy: bool,
    pub lag: i32,
}