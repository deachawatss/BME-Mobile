use crate::database::Database;
use crate::models::putaway_models::{
    map_inclasskey_to_inacct, BinSearchItem, InlocRecord, ItemMasterRecord, LotMasterRecord,
    LotSearchItem, PutawayError,
};
use crate::utils::bangkok_now;
use anyhow::Result;
use chrono::{DateTime, NaiveDateTime, Utc};


pub struct PutawayDatabase {
    db: Database,
}

impl PutawayDatabase {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Search for lot details by lot number
    pub async fn find_lot_by_number(
        &self,
        lot_no: &str,
    ) -> Result<Option<(LotMasterRecord, ItemMasterRecord)>, PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let query = r#"
            SELECT 
                l.LotNo, l.ItemKey, l.LocationKey, l.BinNo, l.QtyOnHand, 
                l.QtyIssued, l.QtyCommitSales, l.DateExpiry, l.VendorKey, l.VendorLotNo,
                l.DocumentNo, l.DocumentLineNo, l.TransactionType, l.LotStatus,
                i.Desc1, i.Desc2, i.Stockuomcode, i.Purchaseuomcode, i.Salesuomcode
            FROM LotMaster l
            JOIN INMAST i ON l.ItemKey = i.Itemkey
            WHERE l.LotNo = @P1 AND l.QtyOnHand > 0
        "#;

        let result = client
            .query(query, &[&lot_no])
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            let lot_record = LotMasterRecord {
                lot_no: row.get::<&str, _>("LotNo").unwrap_or("").to_string(),
                item_key: row.get::<&str, _>("ItemKey").unwrap_or("").to_string(),
                location_key: row.get::<&str, _>("LocationKey").unwrap_or("").to_string(),
                bin_no: row.get::<&str, _>("BinNo").unwrap_or("").to_string(),
                qty_on_hand: row.get::<f64, _>("QtyOnHand").unwrap_or(0.0),
                qty_issued: row.get::<f64, _>("QtyIssued").unwrap_or(0.0),
                qty_commit_sales: row.get::<f64, _>("QtyCommitSales").unwrap_or(0.0),
                date_expiry: DateTime::from_naive_utc_and_offset(
                    row.get::<NaiveDateTime, _>("DateExpiry")
                        .unwrap_or_default(),
                    Utc,
                ),
                vendor_key: row.get::<&str, _>("VendorKey").unwrap_or("").to_string(),
                vendor_lot_no: row.get::<&str, _>("VendorLotNo").unwrap_or("").to_string(),
                document_no: row.get::<&str, _>("DocumentNo").unwrap_or("").to_string(),
                document_line_no: row.get::<i16, _>("DocumentLineNo").unwrap_or(0),
                transaction_type: row.get::<u8, _>("TransactionType").unwrap_or(0),
                lot_status: row.get::<&str, _>("LotStatus").unwrap_or("").to_string(),
            };

            let item_record = ItemMasterRecord {
                item_key: row.get::<&str, _>("ItemKey").unwrap_or("").to_string(),
                desc1: row.get::<&str, _>("Desc1").unwrap_or("").to_string(),
                desc2: row.get::<&str, _>("Desc2").unwrap_or("").to_string(),
                stock_uom_code: row.get::<&str, _>("Stockuomcode").unwrap_or("").to_string(),
                purchase_uom_code: row
                    .get::<&str, _>("Purchaseuomcode")
                    .unwrap_or("")
                    .to_string(),
                sales_uom_code: row.get::<&str, _>("Salesuomcode").unwrap_or("").to_string(),
            };

            Ok(Some((lot_record, item_record)))
        } else {
            Ok(None)
        }
    }

    /// Validate if a bin exists and is valid for the location
    pub async fn validate_bin_location(
        &self,
        location: &str,
        bin_no: &str,
    ) -> Result<bool, PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        // Check if bin exists in BINMaster table
        let query = r#"
            SELECT COUNT(*) as count
            FROM BINMaster 
            WHERE Location = @P1 AND BinNo = @P2
        "#;

        let result = client
            .query(query, &[&location, &bin_no])
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            let count: i32 = row.get("count").unwrap_or(0);
            Ok(count > 0)
        } else {
            Ok(false)
        }
    }

    /// Get next sequence number for BT documents
    /// This method handles atomic sequence increment with proper transaction safety
    pub async fn get_next_bt_sequence(&self) -> Result<i32, PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        // Use atomic increment with OUTPUT to get the new sequence number
        let query = r#"
            UPDATE Seqnum 
            SET SeqNum = SeqNum + 1 
            OUTPUT INSERTED.SeqNum 
            WHERE SeqName = 'BT'
        "#;

        let result = client.query(query, &[]).await.map_err(|e| {
            PutawayError::TransactionError(format!("Failed to increment BT sequence: {e}"))
        })?;

        if let Some(row) = result
            .into_row()
            .await
            .map_err(|e| PutawayError::TransactionError(e.to_string()))?
        {
            let next_seq: i32 = row.get("SeqNum").unwrap_or(0);
            Ok(next_seq)
        } else {
            Err(PutawayError::DatabaseError(
                "BT sequence not found or update failed".to_string(),
            ))
        }
    }

    /// Get INLOC record for GL account mapping
    pub async fn get_inloc_record(
        &self,
        item_key: &str,
        location: &str,
    ) -> Result<InlocRecord, PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let query = r#"
            SELECT ItemKey, Location, Inclasskey, Revacct, Cogsacct, Stdcost
            FROM INLOC
            WHERE ItemKey = @P1 AND Location = @P2
        "#;

        let result = client
            .query(query, &[&item_key, &location])
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            Ok(InlocRecord {
                item_key: row.get::<&str, _>("ItemKey").unwrap_or("").to_string(),
                location: row.get::<&str, _>("Location").unwrap_or("").to_string(),
                inclasskey: row.get::<&str, _>("Inclasskey").unwrap_or("").to_string(),
                revacct: row.get::<&str, _>("Revacct").unwrap_or("").to_string(),
                cogsacct: row.get::<&str, _>("Cogsacct").unwrap_or("").to_string(),
                stdcost: {
                    // Handle SQL Server NUMERIC type conversion
                    // SQL Server NUMERIC types need special handling in tiberius
                    use tiberius::numeric::Numeric;

                    if let Ok(Some(numeric_val)) = row.try_get::<Numeric, _>("Stdcost") {
                        // Convert Numeric to f64
                        numeric_val.value() as f64 / 10_f64.powi(numeric_val.scale() as i32)
                    } else {
                        // Fallback: try as string
                        match row.try_get::<&str, _>("Stdcost") {
                            Ok(Some(val_str)) => val_str.parse::<f64>().unwrap_or(0.0),
                            _ => 0.0,
                        }
                    }
                },
            })
        } else {
            Err(PutawayError::DatabaseError(format!(
                "INLOC record not found for item {item_key} in location {location}"
            )))
        }
    }

    /// Execute complete bin transfer transaction with lot consolidation
    #[allow(clippy::too_many_arguments)]
    pub async fn execute_bin_transfer_transaction(
        &self,
        lot_no: &str,
        item_key: &str,
        location: &str,
        bin_from: &str,
        bin_to: &str,
        transfer_qty: f64,
        user_id: &str,
        remarks: &str,
        referenced: &str,
    ) -> Result<String, PutawayError> {
        // Get database client (TFCPILOT3 primary)
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        // 1. Get next BT document number
        let bt_number = self.get_next_bt_sequence().await?;
        let document_no = format!("BT-{bt_number:08}");
        let now = bangkok_now().naive_local();

        // Truncate user ID to 8 characters for database field compatibility
        let user_id_truncated = if user_id.len() > 8 {
            &user_id[0..8]
        } else {
            user_id
        };

        // 2. Create Mintxdh record for audit trail
        let inloc_record = self.get_inloc_record(item_key, location).await?;
        let in_acct = map_inclasskey_to_inacct(&inloc_record.inclasskey);
        let std_cost = inloc_record.stdcost;
        let trn_desc = "Bin Transfer";

        let mintxdh_query = r#"
            INSERT INTO Mintxdh (
                ItemKey, Location, ToLocation, SysID, ProcessID, SysDocID, SysLinSq,
                TrnTyp, TrnSubTyp, DocNo, DocDate, AplDate, TrnDesc, TrnQty, TrnAmt,
                NLAcct, INAcct, CreatedSerlot, RecUserID, RecDate, Updated_FinTable,
                SortField, JrnlBtchNo, StdCost, Stdcostupdated, GLtrnAmt
            ) VALUES (
                @P1, @P2, '', '7', 'M', @P3, 1, 'A', '', @P4, @P5, @P5, @P6, 0, 0.000000,
                '1100', @P7, 'Y', @P8, @P9, 0, '', '', @P10, 0, 0.000000
            )
        "#;

        client
            .execute(
                mintxdh_query,
                &[
                    &item_key,
                    &location,
                    &document_no,
                    &document_no,
                    &now,
                    &trn_desc,
                    &in_acct,
                    &user_id_truncated,
                    &now,
                    &std_cost,
                ],
            )
            .await
            .map_err(|e| {
                PutawayError::TransactionError(format!("Failed to create Mintxdh record: {e}"))
            })?;

        // Get current source bin quantity for QtyOnHand field in BinTransfer
        let source_qty_result = client.query(
            "SELECT QtyOnHand FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
            &[&lot_no, &item_key, &location, &bin_from]
        ).await.map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let source_qty_on_hand: f64 = if let Some(row) = source_qty_result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            row.get("QtyOnHand").unwrap_or(0.0)
        } else {
            return Err(PutawayError::ValidationError(
                "Source bin record not found".to_string(),
            ));
        };

        // 3. Create Issue Transaction (Type 9 - Remove from source bin)
        let issue_transaction_query = r#"
            INSERT INTO LotTransaction (
                LotNo, ItemKey, LocationKey, TransactionType, 
                IssueDocNo, IssueDocLineNo, IssueDate, QtyIssued,
                BinNo, RecUserid, RecDate, Processed,
                DateReceived, DateExpiry, Vendorkey, VendorlotNo,
                CustomerKey, TempQty, QtyForLotAssignment, QtyUsed
            ) OUTPUT INSERTED.LotTranNo
            VALUES (@P1, @P2, @P3, 9, @P4, 1, @P5, @P6, @P7, @P8, @P9, 'Y',
                    @P10, @P11, @P12, @P13, '', 0, 0, 0)
        "#;

        // Get lot details including vendor info for transaction
        let lot_details_result = client
            .query("SELECT DateReceived, DateExpiry, VendorKey, VendorLotNo FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
                   &[&lot_no, &item_key, &location, &bin_from]).await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let (date_received, date_expiry, vendor_key, vendor_lot_no) = if let Some(row) =
            lot_details_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            (
                row.get::<NaiveDateTime, _>("DateReceived")
                    .unwrap_or(now),
                row.get::<NaiveDateTime, _>("DateExpiry")
                    .unwrap_or(now),
                row.get::<&str, _>("VendorKey").unwrap_or("").to_string(),
                row.get::<&str, _>("VendorLotNo").unwrap_or("").to_string(),
            )
        } else {
            return Err(PutawayError::ValidationError(
                "Cannot get lot details for transaction".to_string(),
            ));
        };

        let issue_result = client
            .query(
                issue_transaction_query,
                &[
                    &lot_no,
                    &item_key,
                    &location,
                    &document_no,
                    &now,
                    &transfer_qty,
                    &bin_from,
                    &user_id_truncated,
                    &now,
                    &date_received,
                    &date_expiry,
                    &vendor_key,
                    &vendor_lot_no,
                ],
            )
            .await
            .map_err(|e| {
                PutawayError::TransactionError(format!("Failed to create issue transaction: {e}"))
            })?;

        let issue_lot_tran_no: i32 = if let Some(row) = issue_result
            .into_row()
            .await
            .map_err(|e| PutawayError::TransactionError(e.to_string()))?
        {
            row.get("LotTranNo").unwrap_or(0)
        } else {
            return Err(PutawayError::TransactionError(
                "Failed to get issue LotTranNo".to_string(),
            ));
        };

        // 4. Create Receipt Transaction (Type 8 - Add to destination bin)
        let receipt_transaction_query = r#"
            INSERT INTO LotTransaction (
                LotNo, ItemKey, LocationKey, TransactionType,
                ReceiptDocNo, ReceiptDocLineNo, QtyReceived,
                BinNo, RecUserid, RecDate, Processed,
                DateReceived, DateExpiry, Vendorkey, VendorlotNo,
                CustomerKey, TempQty, QtyForLotAssignment, QtyUsed
            ) VALUES (@P1, @P2, @P3, 8, @P4, 1, @P5, @P6, @P7, @P8, 'Y',
                     @P9, @P10, @P11, @P12, '', 0, 0, 0)
        "#;

        client
            .execute(
                receipt_transaction_query,
                &[
                    &lot_no,
                    &item_key,
                    &location,
                    &document_no,
                    &transfer_qty,
                    &bin_to,
                    &user_id_truncated,
                    &now,
                    &date_received,
                    &date_expiry,
                    &vendor_key,
                    &vendor_lot_no,
                ],
            )
            .await
            .map_err(|e| {
                PutawayError::TransactionError(format!(
                    "Failed to create receipt transaction: {e}"
                ))
            })?;

        // 5. Create BinTransfer record (with issue LotTranNo reference)
        let bin_transfer_query = r#"
            INSERT INTO BinTransfer (
                ItemKey, Location, LotNo, BinNoFrom, BinNoTo, 
                LotTranNo, QtyOnHand, TransferQty, InTransID, 
                RecUserID, RecDate, ContainerNo, User1, User5
            ) VALUES (@P1, @P2, @P3, @P4, @P5, @P6, @P7, @P8, 0, @P9, @P10, '0', @P11, @P12)
        "#;

        // Use truncated user_id for BinTransfer.RecUserID field

        client
            .execute(
                bin_transfer_query,
                &[
                    &item_key,
                    &location,
                    &lot_no,
                    &bin_from,
                    &bin_to,
                    &issue_lot_tran_no,
                    &source_qty_on_hand,
                    &transfer_qty,
                    &user_id_truncated,
                    &now,
                    &remarks,
                    &referenced,
                ],
            )
            .await
            .map_err(|e| {
                PutawayError::TransactionError(format!(
                    "Failed to create bin transfer record: {e}"
                ))
            })?;

        // 6. Handle LotMaster lot consolidation logic
        self.handle_lot_consolidation(
            &mut client,
            lot_no,
            item_key,
            location,
            bin_from,
            bin_to,
            transfer_qty,
            &document_no,
            user_id,
            &now,
        )
        .await?;

        Ok(document_no)
    }

    /// Handle lot consolidation logic for LotMaster records
    #[allow(clippy::too_many_arguments)]
    async fn handle_lot_consolidation(
        &self,
        client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
        lot_no: &str,
        item_key: &str,
        location: &str,
        bin_from: &str,
        bin_to: &str,
        transfer_qty: f64,
        document_no: &str,
        user_id: &str,
        now: &NaiveDateTime,
    ) -> Result<(), PutawayError> {
        // Truncate user ID to 8 characters for database field compatibility
        let user_id_truncated = if user_id.len() > 8 {
            &user_id[0..8]
        } else {
            user_id
        };

        // Step 1: Update source bin - reduce QtyOnHand or delete if becomes 0
        let source_update_result = client.query(
            "SELECT QtyOnHand FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
            &[&lot_no, &item_key, &location, &bin_from]
        ).await.map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = source_update_result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            let current_qty: f64 = row.get("QtyOnHand").unwrap_or(0.0);
            let remaining_qty = current_qty - transfer_qty;

            if remaining_qty <= 0.0 {
                // Delete source record if quantity becomes 0
                client.execute(
                    "DELETE FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
                    &[&lot_no, &item_key, &location, &bin_from]
                ).await.map_err(|e| PutawayError::TransactionError(format!("Failed to delete source record: {e}")))?;
            } else {
                // Update source bin with reduced quantity
                client.execute(
                    "UPDATE LotMaster SET QtyOnHand = @P1, DocumentNo = @P2, TransactionType = 9, RecUserId = @P3, Recdate = @P4 WHERE LotNo = @P5 AND ItemKey = @P6 AND LocationKey = @P7 AND BinNo = @P8",
                    &[&remaining_qty, &document_no, &user_id_truncated, now, &lot_no, &item_key, &location, &bin_from]
                ).await.map_err(|e| PutawayError::TransactionError(format!("Failed to update source bin: {e}")))?;
            }
        }

        // Step 2: Handle destination bin - add to existing or create new record
        let dest_check_result = client.query(
            "SELECT QtyOnHand, QtyCommitSales, DateReceived, DateExpiry, VendorKey, VendorLotNo FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
            &[&lot_no, &item_key, &location, &bin_to]
        ).await.map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = dest_check_result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            // Destination bin already has this lot - add quantities (lot consolidation)
            let current_qty: f64 = row.get("QtyOnHand").unwrap_or(0.0);
            let new_qty = current_qty + transfer_qty;

            client.execute(
                "UPDATE LotMaster SET QtyOnHand = @P1, DocumentNo = @P2, TransactionType = 8, RecUserId = @P3, Recdate = @P4 WHERE LotNo = @P5 AND ItemKey = @P6 AND LocationKey = @P7 AND BinNo = @P8",
                &[&new_qty, &document_no, &user_id_truncated, now, &lot_no, &item_key, &location, &bin_to]
            ).await.map_err(|e| PutawayError::TransactionError(format!("Failed to update destination bin: {e}")))?;
        } else {
            // Destination bin doesn't have this lot - create new record
            // Get lot details from source bin for the new record (must match exact source bin)
            let source_details_result = client.query(
                "SELECT TOP 1 DateReceived, DateExpiry, VendorKey, VendorLotNo, QtyCommitSales, LotStatus FROM LotMaster WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4",
                &[&lot_no, &item_key, &location, &bin_from]
            ).await.map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

            if let Some(source_row) = source_details_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
            {
                let date_received: NaiveDateTime =
                    source_row.get("DateReceived").unwrap_or(*now);
                let date_expiry: NaiveDateTime =
                    source_row.get("DateExpiry").unwrap_or(*now);
                let vendor_key: &str = source_row.get("VendorKey").unwrap_or("");
                let vendor_lot_no: &str = source_row.get("VendorLotNo").unwrap_or("");
                // Preserve NULL status - do not default to "P"
                let lot_status: Option<&str> = source_row.get("LotStatus");

                // Create new LotMaster record for destination bin
                let insert_query = r#"
                    INSERT INTO LotMaster (
                        LotNo, ItemKey, LocationKey, DateReceived, DateExpiry, 
                        QtyReceived, QtyIssued, QtyCommitSales, QtyOnHand,
                        DocumentNo, DocumentLineNo, TransactionType, VendorKey, VendorLotNo,
                        QtyOnOrder, RecUserId, Recdate, BinNo, LotStatus
                    ) VALUES (
                        @P1, @P2, @P3, @P4, @P5, @P6, 0, 0, @P6, @P7, 1, 8, @P8, @P9,
                        0, @P10, @P11, @P12, @P13
                    )
                "#;

                client
                    .execute(
                        insert_query,
                        &[
                            &lot_no,
                            &item_key,
                            &location,
                            &date_received,
                            &date_expiry,
                            &transfer_qty,
                            &document_no,
                            &vendor_key,
                            &vendor_lot_no,
                            &user_id_truncated,
                            now,
                            &bin_to,
                            &lot_status,
                        ],
                    )
                    .await
                    .map_err(|e| {
                        PutawayError::TransactionError(format!(
                            "Failed to create destination record: {e}"
                        ))
                    })?;
            }
        }

        Ok(())
    }

    /// Validate transfer request - checks specific bin quantities for lot consolidation
    pub async fn validate_transfer_request(
        &self,
        lot_no: &str,
        item_key: &str,
        location: &str,
        bin_from: &str,
        bin_to: &str,
        transfer_qty: f64,
    ) -> Result<(f64, bool), PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        // Check specific bin record (not general lot record)
        let source_bin_query = r#"
            SELECT QtyOnHand, QtyCommitSales, ItemKey, LocationKey
            FROM LotMaster 
            WHERE LotNo = @P1 AND ItemKey = @P2 AND LocationKey = @P3 AND BinNo = @P4
        "#;

        let result = client
            .query(
                source_bin_query,
                &[&lot_no, &item_key, &location, &bin_from],
            )
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        if let Some(row) = result
            .into_row()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
        {
            // Verify item key matches
            let record_item_key: &str = row.get("ItemKey").unwrap_or("");
            if record_item_key != item_key {
                return Err(PutawayError::ValidationError(format!(
                    "Item key mismatch: expected {record_item_key}, got {item_key}"
                )));
            }

            // Verify location matches
            let record_location: &str = row.get("LocationKey").unwrap_or("");
            if record_location != location {
                return Err(PutawayError::ValidationError(format!(
                    "Location mismatch: expected {record_location}, got {location}"
                )));
            }

            // Calculate available quantity in THIS SPECIFIC BIN (QtyOnHand - QtyCommitSales)
            let qty_on_hand: f64 = row.get("QtyOnHand").unwrap_or(0.0);
            let qty_commit_sales: f64 = row.get("QtyCommitSales").unwrap_or(0.0);
            let available_qty = qty_on_hand - qty_commit_sales;

            // Add tolerance for floating-point precision errors (0.001 = 1 milligram tolerance)
            // This prevents false validation errors from JavaScript decimal precision issues
            const QUANTITY_TOLERANCE: f64 = 0.001;

            if transfer_qty > (available_qty + QUANTITY_TOLERANCE) {
                return Err(PutawayError::InsufficientQuantity {
                    requested: transfer_qty,
                    available: available_qty,
                });
            }

            if transfer_qty <= 0.0 {
                return Err(PutawayError::ValidationError(
                    "Transfer quantity must be greater than 0".to_string(),
                ));
            }

            // Detect full transfer: when requested quantity is within tolerance of available quantity
            // This prevents microscopic residuals that block source record deletion
            let is_full_transfer = (transfer_qty + QUANTITY_TOLERANCE) >= available_qty;
            let actual_transfer_qty = if is_full_transfer {
                // Use exact available quantity for full transfers to prevent floating-point residuals
                available_qty
            } else {
                transfer_qty
            };

            // Validate destination bin exists
            if !self.validate_bin_location(location, bin_to).await? {
                return Err(PutawayError::InvalidBin {
                    bin_no: bin_to.to_string(),
                    location: location.to_string(),
                });
            }

            // Validate source and destination bins are different
            if bin_from == bin_to {
                return Err(PutawayError::ValidationError(
                    "Source and destination bins cannot be the same".to_string(),
                ));
            }

            // Return actual transfer quantity and full transfer flag
            Ok((actual_transfer_qty, is_full_transfer))
        } else {
            Err(PutawayError::ValidationError(format!(
                "Lot {lot_no} not found in bin {bin_from} or insufficient quantity available"
            )))
        }
    }


    /// Search for lots with pagination (READ operation - uses TFCPILOT3)
    pub async fn search_lots_paginated(
        &self,
        query: Option<&str>,
        page: i32,
        limit: i32,
    ) -> Result<(Vec<LotSearchItem>, i32), PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let offset = (page - 1) * limit;

        // First, get total count
        let count_query = if let Some(_search_term) = query {
            r#"
                SELECT COUNT(*) as total_count
                FROM LotMaster l
                JOIN INMAST i ON l.ItemKey = i.Itemkey
                WHERE l.QtyOnHand > 0 
                AND (l.LotNo LIKE @P1 OR i.Desc1 LIKE @P1 OR l.ItemKey LIKE @P1)
            "#
        } else {
            r#"
                SELECT COUNT(*) as total_count
                FROM LotMaster l
                WHERE l.QtyOnHand > 0
            "#
        };

        let total_count = if let Some(search_term) = query {
            let search_pattern = format!("%{search_term}%");
            let count_result = client
                .query(count_query, &[&search_pattern])
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;
            if let Some(row) = count_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
            {
                row.get::<i32, _>("total_count").unwrap_or(0)
            } else {
                0
            }
        } else {
            let count_result = client
                .query(count_query, &[])
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;
            if let Some(row) = count_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
            {
                row.get::<i32, _>("total_count").unwrap_or(0)
            } else {
                0
            }
        };

        // Then get paginated results
        let sql_query = if let Some(_search_term) = query {
            r#"
                SELECT 
                    l.LotNo, l.ItemKey, l.LocationKey, l.BinNo, l.QtyOnHand, 
                    l.QtyCommitSales, l.DateExpiry, l.LotStatus,
                    i.Desc1, i.Stockuomcode
                FROM LotMaster l
                JOIN INMAST i ON l.ItemKey = i.Itemkey
                WHERE l.QtyOnHand > 0 
                AND (l.LotNo LIKE @P1 OR i.Desc1 LIKE @P1 OR l.ItemKey LIKE @P1)
                ORDER BY l.LotNo
                OFFSET @P2 ROWS FETCH NEXT @P3 ROWS ONLY
            "#
        } else {
            r#"
                SELECT 
                    l.LotNo, l.ItemKey, l.LocationKey, l.BinNo, l.QtyOnHand, 
                    l.QtyCommitSales, l.DateExpiry, l.LotStatus,
                    i.Desc1, i.Stockuomcode
                FROM LotMaster l
                JOIN INMAST i ON l.ItemKey = i.Itemkey
                WHERE l.QtyOnHand > 0
                ORDER BY l.LotNo DESC
                OFFSET @P1 ROWS FETCH NEXT @P2 ROWS ONLY
            "#
        };

        let results = if let Some(search_term) = query {
            let search_pattern = format!("%{search_term}%");
            client
                .query(sql_query, &[&search_pattern, &offset, &limit])
                .await
        } else {
            client.query(sql_query, &[&offset, &limit]).await
        };

        match results {
            Ok(stream) => {
                let mut lots = Vec::new();
                let rows = stream
                    .into_first_result()
                    .await
                    .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

                for row in rows {
                    let qty_on_hand: f64 = row.get("QtyOnHand").unwrap_or(0.0);
                    let qty_commit_sales: f64 = row.get("QtyCommitSales").unwrap_or(0.0);
                    let qty_available = qty_on_hand - qty_commit_sales;

                    let expiry_date = row
                        .get::<NaiveDateTime, _>("DateExpiry")
                        .map(|dt| dt.format("%Y-%m-%d").to_string());

                    lots.push(LotSearchItem {
                        lot_no: row.get::<&str, _>("LotNo").unwrap_or("").to_string(),
                        item_key: row.get::<&str, _>("ItemKey").unwrap_or("").to_string(),
                        item_description: row.get::<&str, _>("Desc1").unwrap_or("").to_string(),
                        location: row.get::<&str, _>("LocationKey").unwrap_or("").to_string(),
                        current_bin: row.get::<&str, _>("BinNo").unwrap_or("").to_string(),
                        qty_on_hand,
                        qty_available,
                        expiry_date,
                        uom: row.get::<&str, _>("Stockuomcode").unwrap_or("").to_string(),
                        lot_status: row.get::<&str, _>("LotStatus").unwrap_or("").to_string(),
                    });
                }

                Ok((lots, total_count))
            }
            Err(e) => Err(PutawayError::DatabaseError(e.to_string())),
        }
    }

    /// Search for bins with optional query filter and pagination (READ operation - uses TFCPILOT3)
    pub async fn search_bins_paginated(
        &self,
        query: Option<&str>,
        page: i32,
        limit: i32,
    ) -> Result<(Vec<BinSearchItem>, i32), PutawayError> {
        let mut client = self
            .db
            .get_client()
            .await
            .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

        let offset = (page - 1) * limit;

        // First, get total count
        let count_query = if let Some(_search_term) = query {
            r#"
                SELECT COUNT(*) as total_count
                FROM BINMaster
                WHERE BinNo LIKE @P1 OR Location LIKE @P1 OR Description LIKE @P1
            "#
        } else {
            r#"
                SELECT COUNT(*) as total_count
                FROM BINMaster
            "#
        };

        let total_count = if let Some(search_term) = query {
            let search_pattern = format!("%{search_term}%");
            let count_result = client
                .query(count_query, &[&search_pattern])
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;
            if let Some(row) = count_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
            {
                row.get::<i32, _>("total_count").unwrap_or(0)
            } else {
                0
            }
        } else {
            let count_result = client
                .query(count_query, &[])
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;
            if let Some(row) = count_result
                .into_row()
                .await
                .map_err(|e| PutawayError::DatabaseError(e.to_string()))?
            {
                row.get::<i32, _>("total_count").unwrap_or(0)
            } else {
                0
            }
        };

        // Then get paginated results
        let sql_query = if let Some(_search_term) = query {
            r#"
                SELECT 
                    Location, BinNo, Description, aisle, row, rack, RecDate
                FROM BINMaster
                WHERE BinNo LIKE @P1 OR Location LIKE @P1 OR Description LIKE @P1
                ORDER BY RecDate DESC
                OFFSET @P2 ROWS FETCH NEXT @P3 ROWS ONLY
            "#
        } else {
            r#"
                SELECT 
                    Location, BinNo, Description, aisle, row, rack, RecDate
                FROM BINMaster
                ORDER BY RecDate DESC
                OFFSET @P1 ROWS FETCH NEXT @P2 ROWS ONLY
            "#
        };

        let results = if let Some(search_term) = query {
            let search_pattern = format!("%{search_term}%");
            client
                .query(sql_query, &[&search_pattern, &offset, &limit])
                .await
        } else {
            client.query(sql_query, &[&offset, &limit]).await
        };

        match results {
            Ok(stream) => {
                let mut bins = Vec::new();
                let rows = stream
                    .into_first_result()
                    .await
                    .map_err(|e| PutawayError::DatabaseError(e.to_string()))?;

                for row in rows {
                    bins.push(BinSearchItem {
                        bin_no: row.get::<&str, _>("BinNo").unwrap_or("").to_string(),
                        location: row.get::<&str, _>("Location").unwrap_or("").to_string(),
                        description: row.get::<&str, _>("Description").unwrap_or("").to_string(),
                        aisle: row.get::<&str, _>("aisle").unwrap_or("").to_string(),
                        row: row.get::<&str, _>("row").unwrap_or("").to_string(),
                        rack: row.get::<&str, _>("rack").unwrap_or("").to_string(),
                    });
                }

                Ok((bins, total_count))
            }
            Err(e) => Err(PutawayError::DatabaseError(e.to_string())),
        }
    }
}
