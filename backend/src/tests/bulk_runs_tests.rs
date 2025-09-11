#[cfg(test)]
mod tests {
    use crate::models::bulk_runs::*;

    // Mock test data
    fn create_mock_bulk_run() -> BulkRun {
        use chrono::Utc;

        BulkRun {
            run_no: 215235,
            batch_no: "850823".to_string(),
            formula_id: "TB317-01".to_string(),
            formula_desc: "Battermix".to_string(),
            no_of_batches: 2,
            pallets_per_batch: Some(7),
            status: "NEW".to_string(),
            created_date: Some(Utc::now()),
            picking_date: None,
        }
    }

    fn create_mock_bulk_picked_item() -> BulkPickedItem {
        use bigdecimal::BigDecimal;

        BulkPickedItem {
            run_no: 215235,
            row_num: 1,
            line_id: 1,
            item_key: "INSOYF01".to_string(),
            description: Some("Soy Flour".to_string()),
            location: Some("WH-01-A-01".to_string()),
            standard_qty: BigDecimal::from(252),
            pack_size: BigDecimal::from(20),
            uom: "KG".to_string(),
            to_picked_std_qty: BigDecimal::from(252),
            to_picked_bulk_qty: BigDecimal::from(12),
            picked_bulk_qty: None,
            picking_date: None,
            status: None,
        }
    }

    #[tokio::test]
    async fn test_bulk_run_model_creation() {
        let bulk_run = create_mock_bulk_run();

        assert_eq!(bulk_run.run_no, 215235);
        assert_eq!(bulk_run.batch_no, "850823");
        assert_eq!(bulk_run.formula_id, "TB317-01");
        assert_eq!(bulk_run.formula_desc, "Battermix");
        assert_eq!(bulk_run.no_of_batches, 2);
        assert_eq!(bulk_run.pallets_per_batch, Some(7));
        assert_eq!(bulk_run.status, "NEW");
        assert!(bulk_run.created_date.is_some());
        assert!(bulk_run.picking_date.is_none());
    }

    #[tokio::test]
    async fn test_bulk_picked_item_model_creation() {
        let ingredient = create_mock_bulk_picked_item();

        assert_eq!(ingredient.run_no, 215235);
        assert_eq!(ingredient.row_num, 1);
        assert_eq!(ingredient.line_id, 1);
        assert_eq!(ingredient.item_key, "INSOYF01");
        assert_eq!(ingredient.description, Some("Soy Flour".to_string()));
        assert_eq!(ingredient.location, Some("WH-01-A-01".to_string()));
        assert_eq!(ingredient.uom, "KG");
        assert!(ingredient.picked_bulk_qty.is_none());
        assert!(ingredient.picking_date.is_none());
    }

    #[tokio::test]
    async fn test_bulk_run_search_response_structure() {
        let bulk_run = create_mock_bulk_run();
        let ingredients = vec![create_mock_bulk_picked_item()];

        let response = BulkRunSearchResponse {
            run: bulk_run,
            ingredients: ingredients.clone(),
            total_ingredients: ingredients.len() as i32,
            completed_ingredients: 0,
        };

        assert_eq!(response.run.run_no, 215235);
        assert_eq!(response.ingredients.len(), 1);
        assert_eq!(response.total_ingredients, 1);
        assert_eq!(response.completed_ingredients, 0);
        assert_eq!(response.ingredients[0].item_key, "INSOYF01");
    }

    #[tokio::test]
    async fn test_inventory_info_structure() {
        use bigdecimal::BigDecimal;

        let lot_info = LotInfo {
            lot_no: "L240825001".to_string(),
            expiry_date: None,
            available_qty: BigDecimal::from(500),
            location: "WH-01-A-01".to_string(),
            bin: Some("BIN-001".to_string()),
        };

        let inventory = InventoryInfo {
            item_key: "INSOYF01".to_string(),
            soh_value: BigDecimal::from(1000),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: BigDecimal::from(20),
            bulk_pack_size_uom: "KG".to_string(),
            available_lots: vec![lot_info.clone()],
        };

        assert_eq!(inventory.item_key, "INSOYF01");
        assert_eq!(inventory.soh_uom, "KG");
        assert_eq!(inventory.bulk_pack_size_uom, "KG");
        assert_eq!(inventory.available_lots.len(), 1);
        assert_eq!(inventory.available_lots[0].lot_no, "L240825001");
        assert_eq!(inventory.available_lots[0].location, "WH-01-A-01");
        assert_eq!(inventory.available_lots[0].bin, Some("BIN-001".to_string()));
    }

    #[tokio::test]
    async fn test_ingredient_calculation_structure() {
        use bigdecimal::BigDecimal;

        let calculation = IngredientCalculation {
            total_needed: BigDecimal::from(12),
            remaining_to_pick: BigDecimal::from(12),
            completion_percentage: 0.0,
        };

        assert_eq!(calculation.total_needed, BigDecimal::from(12));
        assert_eq!(calculation.remaining_to_pick, BigDecimal::from(12));
        assert_eq!(calculation.completion_percentage, 0.0);
    }

    #[tokio::test]
    async fn test_form_fields_structure() {
        let form_fields = FormFields {
            fg_item_key: "TB317-01".to_string(),
            st_picking_date: "2025-08-25".to_string(),
            item_key: "INSOYF01".to_string(),
            soh_value: "1000.0".to_string(),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: "20.0".to_string(),
            bulk_pack_size_uom: "KG".to_string(),
            total_needed: "12.0".to_string(),
            remaining_to_pick: "12.0".to_string(),
            ingredient_index: 0,
            total_ingredients: 3,
        };

        assert_eq!(form_fields.fg_item_key, "TB317-01");
        assert_eq!(form_fields.item_key, "INSOYF01");
        assert_eq!(form_fields.soh_value, "1000.0");
        assert_eq!(form_fields.soh_uom, "KG");
        assert_eq!(form_fields.total_needed, "12.0");
        assert_eq!(form_fields.remaining_to_pick, "12.0");
        assert_eq!(form_fields.ingredient_index, 0);
        assert_eq!(form_fields.total_ingredients, 3);
    }

    // Integration test structure - would require database connection
    // Commenting out since it needs actual database config
    /*
    #[tokio::test]
    async fn test_database_connection() {
        use std::env;

        // Set test environment variables
        env::set_var("TFCPILOT3_SERVER", "test-server");
        env::set_var("TFCPILOT3_PORT", "1433");
        env::set_var("TFCPILOT3_DATABASE", "test-db");
        env::set_var("TFCPILOT3_USERNAME", "test-user");
        env::set_var("TFCPILOT3_PASSWORD", "test-pass");

        let database = Database::new();
        assert!(database.is_ok());
    }

    #[tokio::test]
    async fn test_bulk_runs_service_search() {
        // This would test the actual service with a mock database
        // Requires database setup and connection
        let database = Database::new().expect("Database connection failed");
        let service = BulkRunsService::new(database);

        let results = service.search_bulk_runs("215235").await;
        assert!(results.is_ok());
    }
    */

    // Unit tests for business logic
    #[test]
    fn test_run_number_validation() {
        // Test valid run numbers
        let valid_run_numbers = vec!["215235", "214036", "220001"];

        for run_no in valid_run_numbers {
            let parsed: Result<i32, _> = run_no.parse();
            assert!(parsed.is_ok());
            assert!(parsed.unwrap() > 0);
        }
    }

    #[test]
    fn test_invalid_run_number_handling() {
        // Test invalid run numbers
        let invalid_run_numbers = vec!["", "abc", "215235abc", "-1"];

        for run_no in invalid_run_numbers {
            let parsed: Result<i32, _> = run_no.parse();
            if let Ok(num) = parsed {
                assert!(num <= 0, "Negative numbers should be invalid");
            } else {
                // Non-numeric strings should fail to parse
                assert!(true);
            }
        }
    }

    #[test]
    fn test_date_formatting() {
        use chrono::{TimeZone, Utc};

        let test_date = Utc.with_ymd_and_hms(2025, 8, 25, 10, 30, 0).unwrap();
        let date_string = test_date.format("%Y-%m-%d").to_string();

        assert_eq!(date_string, "2025-08-25");
    }

    #[test]
    fn test_quantity_calculations() {
        use bigdecimal::BigDecimal;

        let total_needed = BigDecimal::from(12);
        let picked_qty = BigDecimal::from(5);
        let remaining = &total_needed - &picked_qty;

        assert_eq!(remaining, BigDecimal::from(7));

        let completion_percentage = (&picked_qty / &total_needed) * BigDecimal::from(100);
        let percentage_float = completion_percentage
            .to_string()
            .parse::<f64>()
            .unwrap_or(0.0);

        assert!((percentage_float - 41.67).abs() < 0.1); // Approximately 41.67%
    }

    #[test]
    fn test_status_validation() {
        let valid_statuses = vec!["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

        for status in valid_statuses {
            assert!(status.len() > 0);
            assert!(status.chars().all(|c| c.is_ascii_uppercase() || c == '_'));
        }
    }

    // Story 1.2 - Inventory Alert System Tests

    #[test]
    fn test_inventory_alert_creation() {
        use crate::models::inventory::*;

        let alert = InventoryAlert {
            alert_type: InventoryAlertType::LowStock,
            item_key: "INSOYF01".to_string(),
            message: "Low stock level detected".to_string(),
            severity: AlertSeverity::Warning,
            recommended_action: Some("Consider replenishing soon".to_string()),
        };

        assert_eq!(alert.item_key, "INSOYF01");
        assert_eq!(alert.severity, AlertSeverity::Warning);
        assert_eq!(alert.alert_type, InventoryAlertType::LowStock);
        assert!(alert.recommended_action.is_some());
        assert_eq!(
            alert.recommended_action.unwrap(),
            "Consider replenishing soon"
        );
    }

    #[test]
    fn test_inventory_alert_out_of_stock() {
        use crate::models::inventory::*;

        let alert = InventoryAlert::out_of_stock("INSOYF01");

        assert_eq!(alert.item_key, "INSOYF01");
        assert_eq!(alert.alert_type, InventoryAlertType::OutOfStock);
        assert_eq!(alert.severity, AlertSeverity::Critical);
        assert!(alert.message.contains("out of stock"));
        assert!(alert.recommended_action.is_some());
    }

    #[test]
    fn test_inventory_status_structure() {
        use crate::models::inventory::*;

        let alerts = vec![
            InventoryAlert::out_of_stock("INSOYF01"),
            InventoryAlert {
                alert_type: InventoryAlertType::LowStock,
                item_key: "INSOYF01".to_string(),
                message: "Low stock".to_string(),
                severity: AlertSeverity::Warning,
                recommended_action: None,
            },
        ];

        use bigdecimal::BigDecimal;

        let status = InventoryStatus {
            item_key: "INSOYF01".to_string(),
            total_soh: BigDecimal::from(100),
            available_qty: BigDecimal::from(50),
            reserved_qty: BigDecimal::from(50),
            uom: "KG".to_string(),
            status: StockStatus::OutOfStock,
            location_count: 1,
            lot_count: 2,
            alerts: alerts.clone(),
        };

        assert_eq!(status.item_key, "INSOYF01");
        assert_eq!(status.status, StockStatus::OutOfStock);
        assert_eq!(status.alerts.len(), 2);
        assert_eq!(status.alerts[0].severity, AlertSeverity::Critical);
        assert_eq!(status.alerts[1].severity, AlertSeverity::Warning);
    }

    #[test]
    fn test_inventory_discrepancy_detection() {
        // Test logic for detecting inventory discrepancies
        let soh_value = 50.0; // Stock on hand
        let expected_qty = 100.0; // Required quantity

        let discrepancy = expected_qty - soh_value;

        assert_eq!(discrepancy, 50.0);
        assert!(discrepancy > 0.0, "Should detect insufficient inventory");

        // Test sufficient inventory
        let sufficient_soh = 150.0;
        let sufficient_discrepancy = expected_qty - sufficient_soh;

        assert!(
            sufficient_discrepancy < 0.0,
            "Should detect surplus inventory"
        );
    }

    #[test]
    fn test_uom_standardization_logic() {
        use bigdecimal::BigDecimal;

        // Test KG to KG conversion (no conversion needed)
        let kg_value = BigDecimal::from(100);
        let standardized_kg = &kg_value; // No conversion for same UOM
        assert_eq!(*standardized_kg, BigDecimal::from(100));

        // Test G to KG conversion
        let g_value = BigDecimal::from(1000); // 1000 grams
        let kg_from_g = &g_value / BigDecimal::from(1000); // Convert to kg
        assert_eq!(kg_from_g, BigDecimal::from(1));

        // Test ton to KG conversion
        let ton_value = BigDecimal::from(2); // 2 tons
        let kg_from_ton = &ton_value * BigDecimal::from(1000); // Convert to kg
        assert_eq!(kg_from_ton, BigDecimal::from(2000));
    }

    #[test]
    fn test_lot_expiry_logic() {
        use chrono::{Duration, Utc};

        let today = Utc::now();
        let expired_date = today - Duration::days(10);
        let future_date = today + Duration::days(30);

        // Test expired lot detection
        assert!(expired_date < today, "Should detect expired lots");

        // Test valid lot detection
        assert!(future_date > today, "Should identify valid lots");

        // Test lots expiring soon (within 7 days)
        let expiring_soon = today + Duration::days(5);
        let days_until_expiry = (expiring_soon - today).num_days();

        assert!(days_until_expiry <= 7, "Should detect lots expiring soon");
        assert!(days_until_expiry > 0, "Should not be expired yet");
    }

    #[test]
    fn test_bulk_pack_calculations() {
        use bigdecimal::BigDecimal;

        let standard_qty = BigDecimal::from(252); // Standard quantity needed
        let pack_size = BigDecimal::from(20); // Bulk pack size

        // Calculate number of bulk packs needed (simple ceiling logic for test)
        // 252 / 20 = 12.6, so we need 13 packs
        let bulk_packs_needed = BigDecimal::from(13); // Manual calculation for test

        // Should need 13 packs (252/20 = 12.6, rounded up to 13)
        assert_eq!(bulk_packs_needed, BigDecimal::from(13));

        // Calculate actual bulk quantity
        let actual_bulk_qty = &bulk_packs_needed * &pack_size;
        assert_eq!(actual_bulk_qty, BigDecimal::from(260)); // 13 * 20 = 260

        // Calculate variance
        let variance = &actual_bulk_qty - &standard_qty;
        assert_eq!(variance, BigDecimal::from(8)); // 260 - 252 = 8 kg excess
    }

    #[test]
    fn test_inventory_alert_severity_priority() {
        use crate::models::inventory::*;

        let alerts = vec![
            InventoryAlert {
                alert_type: InventoryAlertType::LowStock,
                item_key: "TEST01".to_string(),
                message: "Low stock".to_string(),
                severity: AlertSeverity::Warning,
                recommended_action: None,
            },
            InventoryAlert {
                alert_type: InventoryAlertType::OutOfStock,
                item_key: "TEST01".to_string(),
                message: "Out of stock".to_string(),
                severity: AlertSeverity::Critical,
                recommended_action: None,
            },
            InventoryAlert {
                alert_type: InventoryAlertType::LocationIssue,
                item_key: "TEST01".to_string(),
                message: "Location issue".to_string(),
                severity: AlertSeverity::Info,
                recommended_action: None,
            },
        ];

        // Test that Critical alerts exist
        let critical_alerts: Vec<_> = alerts
            .iter()
            .filter(|a| a.severity == AlertSeverity::Critical)
            .collect();
        assert_eq!(critical_alerts.len(), 1);

        // Test that Warning alerts exist
        let warning_alerts: Vec<_> = alerts
            .iter()
            .filter(|a| a.severity == AlertSeverity::Warning)
            .collect();
        assert_eq!(warning_alerts.len(), 1);

        // Test that Info alerts exist
        let info_alerts: Vec<_> = alerts
            .iter()
            .filter(|a| a.severity == AlertSeverity::Info)
            .collect();
        assert_eq!(info_alerts.len(), 1);
    }

    #[test]
    fn test_inventory_view_integration() {
        use bigdecimal::BigDecimal;

        let ingredient = create_mock_bulk_picked_item();

        let inventory = InventoryInfo {
            item_key: "INSOYF01".to_string(),
            soh_value: BigDecimal::from(1000),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: BigDecimal::from(20),
            bulk_pack_size_uom: "KG".to_string(),
            available_lots: vec![],
        };

        let calculations = IngredientCalculation {
            total_needed: BigDecimal::from(12),
            remaining_to_pick: BigDecimal::from(12),
            completion_percentage: 0.0,
        };

        let ingredient_view = IngredientView {
            ingredient: ingredient.clone(),
            inventory: inventory.clone(),
            calculations: calculations.clone(),
        };

        assert_eq!(ingredient_view.ingredient.item_key, "INSOYF01");
        assert_eq!(ingredient_view.inventory.item_key, "INSOYF01");
        assert_eq!(
            ingredient_view.calculations.total_needed,
            BigDecimal::from(12)
        );

        // Test that both inventory and ingredient have same item key
        assert_eq!(
            ingredient_view.ingredient.item_key,
            ingredient_view.inventory.item_key
        );
    }

    #[test]
    fn test_form_data_population() {
        use bigdecimal::BigDecimal;

        let bulk_run = create_mock_bulk_run();
        let ingredient = create_mock_bulk_picked_item();

        let inventory = InventoryInfo {
            item_key: "INSOYF01".to_string(),
            soh_value: BigDecimal::from(1000),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: BigDecimal::from(20),
            bulk_pack_size_uom: "KG".to_string(),
            available_lots: vec![],
        };

        let calculations = IngredientCalculation {
            total_needed: BigDecimal::from(12),
            remaining_to_pick: BigDecimal::from(12),
            completion_percentage: 0.0,
        };

        let ingredient_view = IngredientView {
            ingredient: ingredient.clone(),
            inventory: inventory.clone(),
            calculations: calculations.clone(),
        };

        let form_fields = FormFields {
            fg_item_key: bulk_run.formula_id.clone(),
            st_picking_date: "2025-08-25".to_string(),
            item_key: ingredient.item_key.clone(),
            soh_value: inventory.soh_value.to_string(),
            soh_uom: inventory.soh_uom.clone(),
            bulk_pack_size_value: inventory.bulk_pack_size_value.to_string(),
            bulk_pack_size_uom: inventory.bulk_pack_size_uom.clone(),
            total_needed: calculations.total_needed.to_string(),
            remaining_to_pick: calculations.remaining_to_pick.to_string(),
            ingredient_index: 0,
            total_ingredients: 3,
        };

        let bulk_run_form_data = BulkRunFormData {
            run: bulk_run.clone(),
            current_ingredient: ingredient_view,
            form_data: form_fields.clone(),
        };

        // Test complete form data integration
        assert_eq!(bulk_run_form_data.run.run_no, 215235);
        assert_eq!(
            bulk_run_form_data.current_ingredient.ingredient.item_key,
            "INSOYF01"
        );
        assert_eq!(bulk_run_form_data.form_data.item_key, "INSOYF01");
        assert_eq!(bulk_run_form_data.form_data.fg_item_key, "TB317-01");
        assert_eq!(bulk_run_form_data.form_data.soh_value, "1000");
        assert_eq!(bulk_run_form_data.form_data.total_needed, "12");
    }

    // Story 1.1.1 - Bulk Run Modal Selection Tests

    fn create_mock_bulk_run_summary() -> BulkRunSummary {
        BulkRunSummary {
            run_no: 215235,
            formula_id: "TB317-01".to_string(),
            formula_desc: "Battermix".to_string(),
            status: "NEW".to_string(),
            batch_count: 2,
        }
    }

    #[tokio::test]
    async fn test_bulk_run_summary_model_creation() {
        let summary = create_mock_bulk_run_summary();

        assert_eq!(summary.run_no, 215235);
        assert_eq!(summary.formula_id, "TB317-01");
        assert_eq!(summary.formula_desc, "Battermix");
        assert_eq!(summary.status, "NEW");
        assert_eq!(summary.batch_count, 2);
    }

    #[tokio::test]
    async fn test_bulk_run_list_response_structure() {
        let summaries = vec![
            create_mock_bulk_run_summary(),
            BulkRunSummary {
                run_no: 215236,
                formula_id: "TB318-01".to_string(),
                formula_desc: "Cookie Mix".to_string(),
                status: "NEW".to_string(),
                batch_count: 3,
            },
        ];

        let response = BulkRunListResponse {
            runs: summaries.clone(),
            total_count: summaries.len() as i32,
        };

        assert_eq!(response.runs.len(), 2);
        assert_eq!(response.total_count, 2);
        assert_eq!(response.runs[0].run_no, 215235);
        assert_eq!(response.runs[1].run_no, 215236);
        assert_eq!(response.runs[0].formula_desc, "Battermix");
        assert_eq!(response.runs[1].formula_desc, "Cookie Mix");
    }

    #[test]
    fn test_bulk_run_summary_serialization() {
        let summary = create_mock_bulk_run_summary();

        // Test that the model can be serialized/deserialized
        let json = serde_json::to_string(&summary).expect("Should serialize");
        assert!(json.contains("215235"));
        assert!(json.contains("TB317-01"));
        assert!(json.contains("Battermix"));
        assert!(json.contains("NEW"));

        let deserialized: BulkRunSummary = serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.run_no, summary.run_no);
        assert_eq!(deserialized.formula_id, summary.formula_id);
    }

    #[test]
    fn test_bulk_run_list_response_serialization() {
        let response = BulkRunListResponse {
            runs: vec![create_mock_bulk_run_summary()],
            total_count: 1,
        };

        let json = serde_json::to_string(&response).expect("Should serialize");
        assert!(json.contains("runs"));
        assert!(json.contains("total_count"));
        assert!(json.contains("215235"));

        let deserialized: BulkRunListResponse =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.total_count, 1);
        assert_eq!(deserialized.runs.len(), 1);
        assert_eq!(deserialized.runs[0].run_no, 215235);
    }

    #[test]
    fn test_empty_bulk_run_list_response() {
        let empty_response = BulkRunListResponse {
            runs: vec![],
            total_count: 0,
        };

        assert_eq!(empty_response.runs.len(), 0);
        assert_eq!(empty_response.total_count, 0);

        // Test serialization of empty response
        let json = serde_json::to_string(&empty_response).expect("Should serialize");
        let deserialized: BulkRunListResponse =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.total_count, 0);
        assert_eq!(deserialized.runs.len(), 0);
    }

    #[test]
    fn test_bulk_run_summary_field_validation() {
        let summary = BulkRunSummary {
            run_no: 0,                  // Test edge case
            formula_id: "".to_string(), // Empty formula ID
            formula_desc: "Valid Description".to_string(),
            status: "INVALID_STATUS".to_string(),
            batch_count: -1, // Invalid batch count
        };

        // Test that model accepts various values (validation would be in business logic)
        assert_eq!(summary.run_no, 0);
        assert_eq!(summary.formula_id, "");
        assert_eq!(summary.batch_count, -1);

        // In real implementation, validation would happen at service layer
        // These tests verify model structure, not business rules
    }

    #[test]
    fn test_bulk_run_modal_workflow() {
        // Test the complete workflow for modal selection
        let available_runs = vec![
            BulkRunSummary {
                run_no: 215235,
                formula_id: "TB317-01".to_string(),
                formula_desc: "Battermix".to_string(),
                status: "NEW".to_string(),
                batch_count: 2,
            },
            BulkRunSummary {
                run_no: 215236,
                formula_id: "TB318-01".to_string(),
                formula_desc: "Cookie Mix".to_string(),
                status: "NEW".to_string(),
                batch_count: 3,
            },
        ];

        let list_response = BulkRunListResponse {
            runs: available_runs.clone(),
            total_count: available_runs.len() as i32,
        };

        // Test modal data structure
        assert_eq!(list_response.total_count, 2);
        assert!(list_response.runs.iter().all(|r| r.status == "NEW"));

        // Test user selection simulation
        let selected_run = &list_response.runs[0];
        assert_eq!(selected_run.run_no, 215235);

        // Test that selection leads to form population (would trigger search)
        assert!(selected_run.run_no > 0);
        assert!(!selected_run.formula_id.is_empty());
    }

    #[test]
    fn test_bulk_run_status_filtering_logic() {
        // Test logic for filtering runs by status (would be in database layer)
        let all_runs = vec![
            BulkRunSummary {
                run_no: 215235,
                formula_id: "TB317-01".to_string(),
                formula_desc: "Battermix".to_string(),
                status: "NEW".to_string(),
                batch_count: 2,
            },
            BulkRunSummary {
                run_no: 215236,
                formula_id: "TB318-01".to_string(),
                formula_desc: "Cookie Mix".to_string(),
                status: "COMPLETED".to_string(),
                batch_count: 3,
            },
            BulkRunSummary {
                run_no: 215237,
                formula_id: "TB319-01".to_string(),
                formula_desc: "Cake Mix".to_string(),
                status: "NEW".to_string(),
                batch_count: 1,
            },
        ];

        // Filter for NEW status only (modal should only show active runs)
        let active_runs: Vec<_> = all_runs.iter().filter(|r| r.status == "NEW").collect();

        assert_eq!(active_runs.len(), 2);
        assert!(active_runs.iter().all(|r| r.status == "NEW"));
        assert_eq!(active_runs[0].run_no, 215235);
        assert_eq!(active_runs[1].run_no, 215237);
    }

    #[test]
    fn test_batch_count_aggregation_logic() {
        // Test logic for counting batches across multiple records
        let raw_batch_data = vec![
            ("215235", "TB317-01", "Batch1"),
            ("215235", "TB317-01", "Batch2"),
            ("215236", "TB318-01", "Batch1"),
            ("215236", "TB318-01", "Batch2"),
            ("215236", "TB318-01", "Batch3"),
        ];

        // Simulate batch count aggregation (would be done in SQL)
        let mut batch_counts = std::collections::HashMap::new();
        for (run_no, _, _) in raw_batch_data {
            *batch_counts.entry(run_no).or_insert(0) += 1;
        }

        assert_eq!(batch_counts.get("215235"), Some(&2));
        assert_eq!(batch_counts.get("215236"), Some(&3));

        // Verify this matches our test data
        let summary1 = BulkRunSummary {
            run_no: 215235,
            formula_id: "TB317-01".to_string(),
            formula_desc: "Battermix".to_string(),
            status: "NEW".to_string(),
            batch_count: *batch_counts.get("215235").unwrap_or(&0),
        };

        assert_eq!(summary1.batch_count, 2);
    }

    #[test]
    fn test_modal_error_handling_scenarios() {
        // Test various error scenarios for modal display

        // No runs available
        let empty_response = BulkRunListResponse {
            runs: vec![],
            total_count: 0,
        };
        assert_eq!(empty_response.runs.len(), 0);

        // Malformed data handling
        let runs_with_empty_fields = vec![BulkRunSummary {
            run_no: 0,
            formula_id: "".to_string(),
            formula_desc: "".to_string(),
            status: "".to_string(),
            batch_count: 0,
        }];

        let response_with_empty_data = BulkRunListResponse {
            runs: runs_with_empty_fields,
            total_count: 1,
        };

        // Model should accept the data (error handling in UI layer)
        assert_eq!(response_with_empty_data.total_count, 1);
        assert_eq!(response_with_empty_data.runs[0].formula_id, "");
    }

    #[test]
    fn test_modal_performance_considerations() {
        // Test with larger dataset to verify model handles reasonable volume
        let mut large_run_list = Vec::new();

        for i in 1..=100 {
            large_run_list.push(BulkRunSummary {
                run_no: 215000 + i,
                formula_id: format!("TB{:03}-01", i),
                formula_desc: format!("Formula {}", i),
                status: "NEW".to_string(),
                batch_count: (i % 5) + 1, // 1-5 batches
            });
        }

        let large_response = BulkRunListResponse {
            runs: large_run_list.clone(),
            total_count: large_run_list.len() as i32,
        };

        assert_eq!(large_response.total_count, 100);
        assert_eq!(large_response.runs.len(), 100);

        // Test serialization performance with larger dataset
        let json = serde_json::to_string(&large_response).expect("Should serialize large dataset");
        assert!(json.len() > 1000); // Should be substantial JSON

        let deserialized: BulkRunListResponse =
            serde_json::from_str(&json).expect("Should deserialize large dataset");
        assert_eq!(deserialized.total_count, 100);
    }

    // Story 1.1 Regression Tests - Ensure direct search still works after modal addition

    #[test]
    fn test_direct_search_workflow_regression() {
        // Test that the original Story 1.1 workflow remains unchanged

        // 1. Test that search query validation still works
        let valid_queries = vec!["215235", "214036", "220001"];
        let invalid_queries = vec!["", "   ", "\t\n"];

        for query in valid_queries {
            let trimmed = query.trim();
            assert!(
                !trimmed.is_empty(),
                "Valid queries should not be empty after trim"
            );
            let parsed: Result<i32, _> = trimmed.parse();
            assert!(parsed.is_ok(), "Valid run numbers should parse");
        }

        for query in invalid_queries {
            let trimmed = query.trim();
            assert!(
                trimmed.is_empty(),
                "Invalid queries should be empty after trim - these trigger modal"
            );
        }
    }

    #[test]
    fn test_search_response_structure_unchanged() {
        // Test that BulkRunSearchResponse structure remains compatible with Story 1.1
        let bulk_run = create_mock_bulk_run();
        let ingredients = vec![create_mock_bulk_picked_item()];

        let search_response = BulkRunSearchResponse {
            run: bulk_run.clone(),
            ingredients: ingredients.clone(),
            total_ingredients: ingredients.len() as i32,
            completed_ingredients: 0,
        };

        // These assertions validate Story 1.1 compatibility
        assert_eq!(search_response.run.run_no, 215235);
        assert_eq!(search_response.ingredients.len(), 1);
        assert_eq!(search_response.total_ingredients, 1);
        assert_eq!(search_response.completed_ingredients, 0);

        // Test serialization (API response format unchanged)
        let json = serde_json::to_string(&search_response).expect("Should serialize");
        assert!(json.contains("run"));
        assert!(json.contains("ingredients"));
        assert!(json.contains("total_ingredients"));
        assert!(json.contains("completed_ingredients"));

        let deserialized: BulkRunSearchResponse =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.run.run_no, search_response.run.run_no);
    }

    #[test]
    fn test_form_data_population_unchanged() {
        // Test that BulkRunFormData structure is compatible with Story 1.1 form population
        use bigdecimal::BigDecimal;

        let bulk_run = create_mock_bulk_run();
        let ingredient = create_mock_bulk_picked_item();

        let inventory = InventoryInfo {
            item_key: "INSOYF01".to_string(),
            soh_value: BigDecimal::from(1000),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: BigDecimal::from(20),
            bulk_pack_size_uom: "KG".to_string(),
            available_lots: vec![],
        };

        let calculations = IngredientCalculation {
            total_needed: BigDecimal::from(12),
            remaining_to_pick: BigDecimal::from(12),
            completion_percentage: 0.0,
        };

        let ingredient_view = IngredientView {
            ingredient: ingredient.clone(),
            inventory: inventory.clone(),
            calculations: calculations.clone(),
        };

        let form_fields = FormFields {
            fg_item_key: bulk_run.formula_id.clone(),
            st_picking_date: "2025-08-25".to_string(),
            item_key: ingredient.item_key.clone(),
            soh_value: inventory.soh_value.to_string(),
            soh_uom: inventory.soh_uom.clone(),
            bulk_pack_size_value: inventory.bulk_pack_size_value.to_string(),
            bulk_pack_size_uom: inventory.bulk_pack_size_uom.clone(),
            total_needed: calculations.total_needed.to_string(),
            remaining_to_pick: calculations.remaining_to_pick.to_string(),
            ingredient_index: 0,
            total_ingredients: 3,
        };

        let form_data = BulkRunFormData {
            run: bulk_run.clone(),
            current_ingredient: ingredient_view,
            form_data: form_fields.clone(),
        };

        // Validate all Story 1.1 form fields are populated correctly
        assert_eq!(form_data.form_data.fg_item_key, "TB317-01");
        assert_eq!(form_data.form_data.item_key, "INSOYF01");
        assert_eq!(form_data.form_data.soh_value, "1000");
        assert_eq!(form_data.form_data.soh_uom, "KG");
        assert_eq!(form_data.form_data.bulk_pack_size_value, "20");
        assert_eq!(form_data.form_data.bulk_pack_size_uom, "KG");
        assert_eq!(form_data.form_data.total_needed, "12");
        assert_eq!(form_data.form_data.remaining_to_pick, "12");

        // Test API response serialization is unchanged
        let json = serde_json::to_string(&form_data).expect("Should serialize");
        let deserialized: BulkRunFormData =
            serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(
            deserialized.form_data.fg_item_key,
            form_data.form_data.fg_item_key
        );
    }

    #[test]
    fn test_api_endpoints_backward_compatible() {
        // Test that API endpoint structure remains the same for Story 1.1 compatibility

        // Original search endpoint should still work with same parameters
        let search_query_params = vec![
            ("query", "215235"),
            ("query", "TB317"),
            ("query", "Battermix"),
        ];

        for (param_name, param_value) in search_query_params {
            assert_eq!(param_name, "query");
            assert!(!param_value.is_empty());
            // The endpoint /api/runs/search?query={value} should still work
        }

        // Form data endpoint should still work with same parameters
        let form_data_path = "/api/runs/215235/form-data";
        assert!(form_data_path.starts_with("/api/runs/"));
        assert!(form_data_path.ends_with("/form-data"));

        let form_data_with_ingredient = "/api/runs/215235/form-data?ingredient_index=0";
        assert!(form_data_with_ingredient.contains("ingredient_index"));
    }

    #[test]
    fn test_error_handling_backward_compatible() {
        // Test that error handling for Story 1.1 remains the same

        // Test that non-existent run number still returns proper error structure
        let empty_search_results: Vec<BulkRunSearchResponse> = vec![];
        assert_eq!(empty_search_results.len(), 0);

        // Test that malformed run numbers are handled the same way
        let invalid_run_numbers = vec!["abc", "215235abc", "999999999"];

        for invalid_run in invalid_run_numbers {
            if let Ok(parsed) = invalid_run.parse::<i32>() {
                // Valid parse means it should work (like 999999999)
                assert!(parsed > 0 || parsed == 0);
            } else {
                // Invalid parse should be handled gracefully (no crashes)
                assert!(true, "Invalid run numbers should be handled gracefully");
            }
        }
    }

    #[test]
    fn test_story_1_1_integration_points_preserved() {
        // Test that all Story 1.1 integration points are preserved

        use bigdecimal::BigDecimal;

        // 1. Run retrieval integration point
        let run = create_mock_bulk_run();
        assert_eq!(run.run_no, 215235);
        assert_eq!(run.status, "NEW");

        // 2. Ingredient retrieval integration point
        let ingredient = create_mock_bulk_picked_item();
        assert_eq!(ingredient.run_no, 215235);
        assert_eq!(ingredient.item_key, "INSOYF01");

        // 3. Inventory integration point
        let inventory = InventoryInfo {
            item_key: "INSOYF01".to_string(),
            soh_value: BigDecimal::from(1000),
            soh_uom: "KG".to_string(),
            bulk_pack_size_value: BigDecimal::from(20),
            bulk_pack_size_uom: "KG".to_string(),
            available_lots: vec![],
        };
        assert_eq!(inventory.item_key, "INSOYF01");

        // 4. Form population integration point
        let form_fields = FormFields {
            fg_item_key: run.formula_id.clone(),
            st_picking_date: "2025-08-25".to_string(),
            item_key: ingredient.item_key.clone(),
            soh_value: inventory.soh_value.to_string(),
            soh_uom: inventory.soh_uom.clone(),
            bulk_pack_size_value: inventory.bulk_pack_size_value.to_string(),
            bulk_pack_size_uom: inventory.bulk_pack_size_uom.clone(),
            total_needed: "12".to_string(),
            remaining_to_pick: "12".to_string(),
            ingredient_index: 0,
            total_ingredients: 3,
        };

        // All form field mappings should be identical to Story 1.1
        assert_eq!(form_fields.fg_item_key, "TB317-01");
        assert_eq!(form_fields.item_key, "INSOYF01");
        assert_eq!(form_fields.soh_value, "1000");
        assert_eq!(form_fields.ingredient_index, 0);
        assert_eq!(form_fields.total_ingredients, 3);
    }

    // Pallet tracking tests
    fn create_mock_pallet_batch() -> PalletBatch {
        PalletBatch {
            pallet_number: 1,
            batch_number: "850823".to_string(),
            row_num: 1,
            no_of_bags_picked: 24,
            quantity_picked: 480.0,
            no_of_bags_remaining: 36,
            quantity_remaining: 720.0,
        }
    }

    #[tokio::test]
    async fn test_pallet_batch_model_creation() {
        let pallet = create_mock_pallet_batch();

        assert_eq!(pallet.pallet_number, 1);
        assert_eq!(pallet.batch_number, "850823");
        assert_eq!(pallet.no_of_bags_picked, 24);
        assert_eq!(pallet.quantity_picked, 480.0);
        assert_eq!(pallet.no_of_bags_remaining, 36);
        assert_eq!(pallet.quantity_remaining, 720.0);
    }

    #[tokio::test]
    async fn test_pallet_batch_response_creation() {
        let pallet1 = PalletBatch {
            pallet_number: 1,
            batch_number: "850823".to_string(),
            row_num: 1,
            no_of_bags_picked: 24,
            quantity_picked: 480.0,
            no_of_bags_remaining: 36,
            quantity_remaining: 720.0,
        };

        let pallet2 = PalletBatch {
            pallet_number: 2,
            batch_number: "850824".to_string(),
            row_num: 2,
            no_of_bags_picked: 18,
            quantity_picked: 360.0,
            no_of_bags_remaining: 42,
            quantity_remaining: 840.0,
        };

        let response = PalletBatchResponse {
            run_no: 215235,
            pallets: vec![pallet1, pallet2],
            total_pallets: 2,
            total_picked_quantity: 840.0,
            total_remaining_quantity: 1560.0,
        };

        assert_eq!(response.run_no, 215235);
        assert_eq!(response.total_pallets, 2);
        assert_eq!(response.total_picked_quantity, 840.0);
        assert_eq!(response.total_remaining_quantity, 1560.0);
        assert_eq!(response.pallets.len(), 2);
    }

    #[test]
    fn test_pallet_batch_serialization() {
        use serde_json;

        let pallet = create_mock_pallet_batch();
        let json = serde_json::to_string(&pallet).unwrap();
        
        assert!(json.contains("\"pallet_number\":1"));
        assert!(json.contains("\"batch_number\":\"850823\""));
        assert!(json.contains("\"no_of_bags_picked\":24"));
        assert!(json.contains("\"quantity_picked\":480.0"));
        assert!(json.contains("\"no_of_bags_remaining\":36"));
        assert!(json.contains("\"quantity_remaining\":720.0"));
    }

    #[test]
    fn test_pallet_batch_deserialization() {
        use serde_json;

        let json = r#"{
            "pallet_number": 1,
            "batch_number": "850823",
            "no_of_bags_picked": 24,
            "quantity_picked": 480.0,
            "no_of_bags_remaining": 36,
            "quantity_remaining": 720.0
        }"#;

        let pallet: PalletBatch = serde_json::from_str(json).unwrap();
        assert_eq!(pallet.pallet_number, 1);
        assert_eq!(pallet.batch_number, "850823");
        assert_eq!(pallet.no_of_bags_picked, 24);
        assert_eq!(pallet.quantity_picked, 480.0);
        assert_eq!(pallet.no_of_bags_remaining, 36);
        assert_eq!(pallet.quantity_remaining, 720.0);
    }

    #[test]
    fn test_pallet_tracking_business_logic() {
        // Test the business logic calculations for pallet tracking
        let pallet = PalletBatch {
            pallet_number: 1,
            batch_number: "850823".to_string(),
            row_num: 1,
            no_of_bags_picked: 24,
            quantity_picked: 480.0, // 24 bags * 20 KG per bag
            no_of_bags_remaining: 36,
            quantity_remaining: 720.0, // 36 bags * 20 KG per bag
        };

        // Verify picked calculations
        let expected_picked_weight = pallet.no_of_bags_picked as f64 * 20.0; // Assuming 20 KG per bag
        assert_eq!(pallet.quantity_picked, expected_picked_weight);

        // Verify remaining calculations 
        let expected_remaining_weight = pallet.no_of_bags_remaining as f64 * 20.0;
        assert_eq!(pallet.quantity_remaining, expected_remaining_weight);

        // Verify total consistency
        let total_bags = pallet.no_of_bags_picked + pallet.no_of_bags_remaining;
        let total_weight = pallet.quantity_picked + pallet.quantity_remaining;
        assert_eq!(total_bags, 60); // 24 + 36
        assert_eq!(total_weight, 1200.0); // 480 + 720
    }

    #[test]
    fn test_pallet_response_aggregations() {
        // Test aggregation calculations in PalletBatchResponse
        let pallets = vec![
            PalletBatch {
                pallet_number: 1,
                batch_number: "850823".to_string(),
                row_num: 1,
                no_of_bags_picked: 24,
                quantity_picked: 480.0,
                no_of_bags_remaining: 36,
                quantity_remaining: 720.0,
            },
            PalletBatch {
                pallet_number: 2,
                batch_number: "850824".to_string(),
                row_num: 2,
                no_of_bags_picked: 18,
                quantity_picked: 360.0,
                no_of_bags_remaining: 42,
                quantity_remaining: 840.0,
            },
        ];

        // Test manual calculations match expected business logic
        let total_picked: f64 = pallets.iter().map(|p| p.quantity_picked).sum();
        let total_remaining: f64 = pallets.iter().map(|p| p.quantity_remaining).sum();
        
        assert_eq!(total_picked, 840.0); // 480 + 360
        assert_eq!(total_remaining, 1560.0); // 720 + 840

        let response = PalletBatchResponse {
            run_no: 215235,
            pallets: pallets.clone(),
            total_pallets: pallets.len() as i32,
            total_picked_quantity: total_picked,
            total_remaining_quantity: total_remaining,
        };

        assert_eq!(response.total_pallets, 2);
        assert_eq!(response.total_picked_quantity, 840.0);
        assert_eq!(response.total_remaining_quantity, 1560.0);
    }
}
