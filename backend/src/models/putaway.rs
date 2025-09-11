use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PutawayItem {
    pub lot_no: String,
    pub item_key: String,
    pub item_description: Option<String>,
    pub location_key: String,
    pub bin_no: Option<String>,
    pub qty_received: f64,
    pub qty_on_hand: f64,
    pub date_received: DateTime<Utc>,
    pub date_expiry: DateTime<Utc>,
    pub vendor_key: String,
    pub vendor_lot_no: String,
    pub document_no: String,
    pub lot_status: String,
    pub rec_user_id: String,
}

// Enhanced transaction models for database integration
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionHeader {
    pub in_trans_id: Option<i32>,
    pub item_key: String,
    pub location: String,
    pub to_location: String,
    pub sys_id: String,
    pub process_id: String,
    pub sys_doc_id: String,
    pub trn_typ: String,
    pub trn_sub_typ: String,
    pub doc_no: String,
    pub doc_date: DateTime<Utc>,
    pub trn_desc: String,
    pub trn_qty: f64,
    pub trn_amt: f64,
    pub rec_user_id: String,
    pub rec_date: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BinTransferRecord {
    pub bin_tran_id: Option<i32>,
    pub item_key: String,
    pub location: String,
    pub lot_no: String,
    pub bin_no_from: Option<String>,
    pub bin_no_to: Option<String>,
    pub lot_tran_no: i32,
    pub qty_on_hand: f64,
    pub transfer_qty: f64,
    pub in_trans_id: i32,
    pub rec_user_id: String,
    pub rec_date: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LotTransactionRecord {
    pub lot_tran_no: Option<i32>,
    pub lot_no: String,
    pub item_key: String,
    pub location_key: String,
    pub transaction_type: u8, // 8=receipt, 9=issue
    pub qty_received: f64,
    pub qty_issued: f64,
    pub issue_doc_no: Option<String>,
    pub receipt_doc_no: Option<String>,
    pub bin_no: Option<String>,
    pub processed: char,
    pub rec_user_id: String,
    pub rec_date: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutawayRequest {
    pub lot_no: String,
    pub item_key: String,
    pub from_location: String,
    pub to_location: String,
    pub bin_no: String,
    pub qty_to_putaway: f64,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutawayTransactionRequest {
    pub lot_no: String,
    pub item_key: String,
    pub from_location: String,
    pub to_location: String,
    pub from_bin: Option<String>,
    pub to_bin: String,
    pub qty_to_putaway: f64,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutawayConfirmation {
    pub success: bool,
    pub message: String,
    pub transaction_id: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutawayTransactionResponse {
    pub success: bool,
    pub message: String,
    pub transaction_id: Option<i32>,
    pub doc_no: Option<String>,
    pub error_details: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanRequest {
    pub barcode: String,
    pub scan_type: ScanType,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ScanType {
    Item,
    Location,
    Lot,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResponse {
    pub valid: bool,
    pub scan_type: ScanType,
    pub data: Option<ScanData>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ScanData {
    Item {
        item_key: String,
        description: String,
        unit: String,
    },
    Location {
        location_key: String,
        description: String,
        location_type: String,
    },
    Lot {
        lot_no: String,
        item_key: String,
        qty_on_hand: f64,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PutawayHistory {
    pub transaction_id: i32,
    pub lot_no: String,
    pub item_key: String,
    pub from_location: String,
    pub to_location: String,
    pub bin_no: String,
    pub qty_moved: f64,
    pub transaction_date: DateTime<Utc>,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationInfo {
    pub location_key: String,
    pub description: String,
    pub location_type: String,
    pub capacity: Option<f64>,
    pub occupied: Option<f64>,
    pub available: Option<f64>,
}
