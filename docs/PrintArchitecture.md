# Bulk Picking Print Labels Architecture

## Overview

This document defines the complete architecture for implementing 4x4 inch print labels in the bulk picking system, based on actual database analysis of Run 198031 and the provided reference image.

## Requirements Summary

### Label Specifications
- **Size**: 4x4 inch physical labels
- **Format**: "BULK SUMMARY" with specific field layout
- **Logic**: 1 Batch = 1 Label (Run 198031 has 4 batches = 4 labels)
- **Content**: Each label shows ALL ingredients for that specific batch
- **Timing**: Print completed batches anytime during picking process

### Business Logic
- **Batch-Based**: Group all ingredients by BatchNo for each label
- **Completion Filter**: Only show ingredients with `PickedBulkQty IS NOT NULL`
- **Page Numbering**: Page X of Y where Y = total batches in run (`NoOfBatches` from `Cust_BulkRun`)
- **Dynamic Printing**: Print 1 label if 1 batch completed, all labels if all completed

## Database Analysis

### Key Tables and Relationships

#### 1. Cust_BulkRun (Run Header)
```sql
RunNo: 198031
FormulaId: "TC26520A"  -- Product line
FormulaDesc: "Breader"  -- Used as product description
NoOfBatches: 4  -- Total pages for pagination
Status: "PRINT"
```

#### 2. cust_BulkPicked (Ingredient Status)
```sql
-- Example: Batch 788210 (Page 2 from image)
RunNo: 198031
BatchNo: "788210"
LineId: 1-9  -- Different ingredients
ItemKey: "WFLOWGV2", "MF335N05", "INYELC01", "INWSTA02"...
PickedBulkQty: 25, 20, 3, 2  -- Bag quantities (NULL = not picked)
PickedQty: 625.0, 200.0, 75.0, 50.0  -- KG quantities
PackSize: 25, 10, 25, 25  -- Pack sizes
Unit: "KG"
ModifiedBy: "WACHIRAS", "METHASIT"  -- User who picked
```

#### 3. Cust_BulkLotPicked (Lot Details)
```sql
-- Lot numbers and bin locations per ingredient
RunNo: 198031
BatchNo: "788210"
LotNo: "2502976-2", "788465-01", "2501862-2", "2502979"
BinNo: "K0900-1A", "D0119-1A", "A0501-1B", "K0900-1A"
QtyReceived: 625, 200, 75, 50  -- Matches PickedQty
RecUserid: "WACHIRAS", "METHASIT"
```

### Data Flow Mapping

#### Label Header Section
```typescript
interface LabelHeader {
  title: "BULK SUMMARY";
  productType: Cust_BulkRun.FormulaDesc;  // "Breader"
  date: string;  // DD/MM/YY format from current date
}
```

#### Product Information Section  
```typescript
interface ProductInfo {
  productKey: Cust_BulkRun.FormulaId;  // "TC26520A"
  description: string;  // Additional description if available
  runNo: Cust_BulkRun.RunNo;  // 198031
  batchNo: string;  // "788210"
  pageInfo: string;  // "Page 2 of 4"
}
```

#### Items Table Section
```typescript
interface LabelItem {
  itemNo: cust_BulkPicked.ItemKey;  // "WFLOWGV2"
  lotNo: Cust_BulkLotPicked.LotNo;  // "2502976-2"
  binNo: Cust_BulkLotPicked.BinNo;  // "K0900-1A" (below lot number)
  bagQuantity: cust_BulkPicked.PickedBulkQty;  // 25
  totalQuantity: cust_BulkPicked.PickedQty;  // 625.0
  unit: cust_BulkPicked.Unit;  // "KG"
  packSize: cust_BulkPicked.PackSize;  // 25 (small font)
  checkbox: boolean;  // Always false (manual verification)
}
```

#### Footer Section
```typescript
interface LabelFooter {
  pickedBy: string;  // From ModifiedBy field or current user
  verificationLine: string;  // "Verified by: ________"
  datePrinted: string;  // Current timestamp in Bangkok timezone
}
```

## Technical Architecture

### Frontend Components

#### 1. BulkPrintLabelsComponent
```typescript
@Component({
  selector: 'app-bulk-print-labels',
  template: './bulk-print-labels.component.html',
  styleUrl: './bulk-print-labels.component.css'
})
export class BulkPrintLabelsComponent {
  @Input() runData: BulkRun;
  @Input() completedBatches: string[];
  
  labels: PrintLabel[] = [];
  
  ngOnInit() {
    this.generateLabels();
  }
  
  generateLabels() {
    // Transform run data into print labels
  }
  
  printLabels() {
    window.print();
  }
}
```

#### 2. CSS Layout (4x4 Inch)
```css
@media print {
  .label-container {
    width: 4in;
    height: 4in;
    page-break-after: always;
    border: 1px solid #000;
    font-family: Arial, sans-serif;
    padding: 8px;
  }
  
  .label-header {
    text-align: center;
    font-weight: bold;
    font-size: 14pt;
    border-bottom: 2px solid #000;
  }
  
  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  
  .checkbox {
    width: 12px;
    height: 12px;
    border: 1px solid #000;
  }
}
```

### Data Services

#### 1. PrintDataService
```typescript
@Injectable({ providedIn: 'root' })
export class PrintDataService {
  
  generatePrintLabels(runData: BulkRun, pickedItems: BulkPickedItem[]): PrintLabel[] {
    // Group items by batch
    const batchGroups = this.groupByBatch(pickedItems);
    
    // Generate label for each completed batch
    return batchGroups.map(batch => this.createLabel(runData, batch));
  }
  
  private groupByBatch(items: BulkPickedItem[]): BatchGroup[] {
    // Group ingredients by BatchNo
    // Filter only completed items (PickedBulkQty !== null)
  }
  
  private createLabel(runData: BulkRun, batch: BatchGroup): PrintLabel {
    // Transform batch data into label format
    // Include lot numbers and bin locations
    // Calculate page numbering
  }
}
```

#### 2. Integration with Existing Services
```typescript
// In BulkRunsService, add:
async getLotPickingDetails(runNo: number, batchNo: string): Promise<LotPickingDetail[]> {
  // Query Cust_BulkLotPicked for lot numbers and bin locations
}

async getPrintLabelData(runNo: number): Promise<PrintLabelData> {
  // Combine run data, picked items, and lot details
  // Return complete dataset for label generation
}
```

### Backend API Endpoints (if needed)

#### Print Data Endpoint
```rust
// GET /api/bulk-runs/{run_no}/print-data
pub async fn get_print_label_data(
    Path(run_no): Path<i32>,
    State(app_state): State<AppState>,
) -> Result<Json<PrintLabelData>, AppError> {
    // Query all required tables
    // Join cust_BulkPicked with Cust_BulkLotPicked
    // Return structured data for frontend
}
```

### Print Workflow Integration

#### 1. Print Button Enhancement
```typescript
// In bulk-picking.component.ts (line 542)
<button 
  type="button" 
  (click)="openPrintDialog()"
  class="nwfth-button-secondary tw-px-3 tw-py-1.5 tw-text-xs tw-rounded" 
  title="Print Labels">
  🖨️ Print {{ getCompletedBatchCount() }} Labels
</button>
```

#### 2. Print Dialog Logic
```typescript
openPrintDialog() {
  const completedBatches = this.getCompletedBatches();
  if (completedBatches.length === 0) {
    this.showMessage('No completed batches to print');
    return;
  }
  
  // Open print dialog with completed batch data
  const dialogRef = this.dialog.open(BulkPrintLabelsComponent, {
    data: { runData: this.runData, completedBatches },
    width: '90vw',
    height: '90vh'
  });
}
```

## Label Format Specification

### Physical Layout (4x4 inch)
```
┌─────────────────────────────────────┐
│           BULK SUMMARY              │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Product: TC26520A    [Description]  │
│ Run: 198031      Date: 10/30/24     │
│ Batch: 788210    Page 2 of 4        │
├─────────────────────────────────────┤
│Item No. │Lot-No    │Bag│QTY  │UM    │
├─────────┼──────────┼───┼─────┼──────┤
│WFLOWGV2 │2502976-2 │□25│625.0│ KG   │
│         │K0900-1A  │   │25.00│      │
├─────────┼──────────┼───┼─────┼──────┤
│MF335N05 │788465-01 │□20│200.0│ KG   │
│         │D0119-1A  │   │25.00│      │
├─────────┼──────────┼───┼─────┼──────┤
│INYELC01 │2501862-2 │□ 3│ 75.0│ KG   │
│         │A0501-1B  │   │25.00│      │
├─────────┼──────────┼───┼─────┼──────┤
│INWSTA02 │2502979   │□ 2│ 50.0│ KG   │
│         │K0900-1A  │   │25.00│      │
├─────────┴──────────┴───┴─────┴──────┤
│ Picked/Printed by: WACHIRAS         │
│ Verified by: _______________        │
│ Date: 30/10/2024, 9:59:20AM         │
└─────────────────────────────────────┘
```

### Field Mappings

| Label Field | Database Source | Example |
|-------------|----------------|---------|
| Product | `Cust_BulkRun.FormulaId` | "TC26520A" |
| Description | `Cust_BulkRun.FormulaDesc` | "Breader" |
| Run | `Cust_BulkRun.RunNo` | 198031 |
| Batch | `cust_BulkPicked.BatchNo` | "788210" |
| Page | "Page {RowNum} of {NoOfBatches}" | "Page 2 of 4" |
| Item No. | `cust_BulkPicked.ItemKey` | "WFLOWGV2" |
| Lot-No | `Cust_BulkLotPicked.LotNo` | "2502976-2" |
| Bin | `Cust_BulkLotPicked.BinNo` | "K0900-1A" |
| Bag | `cust_BulkPicked.PickedBulkQty` | 25 |
| QTY | `cust_BulkPicked.PickedQty` | 625.0 |
| Pack Size | `cust_BulkPicked.PackSize` | 25.00 |
| UM | `cust_BulkPicked.Unit` | "KG" |
| Picked By | `cust_BulkPicked.ModifiedBy` | "WACHIRAS" |
| Date Printed | Current timestamp (Bangkok) | "30/10/2024, 9:59:20AM" |

## Implementation Priority

### Phase 1: Core Functionality
1. ✅ Architecture documentation (this document)
2. Create `BulkPrintLabelsComponent` with exact 4x4 layout
3. Create `PrintDataService` for data transformation
4. Wire print button to bulk-picking component

### Phase 2: Data Integration  
1. Query lot picking details for bin locations
2. Implement batch grouping logic
3. Add completion filtering (PickedBulkQty IS NOT NULL)
4. Test with Run 198031 data

### Phase 3: Polish & Testing
1. CSS media queries for perfect 4x4 printing
2. Bangkok timezone formatting
3. Dynamic label count display
4. User acceptance testing

## Testing Strategy

### Test Data: Run 198031
- **Total Batches**: 4 (788209, 788210, 788211, 788212)
- **Completed Items**: WFLOWGV2, INYELC01, MF335N05, INWSTA02 in some batches
- **Expected**: Labels only for batches with completed items
- **Page 2 Example**: Should match provided image exactly

### Validation Criteria
- ✅ 4x4 inch physical dimensions
- ✅ Exact field positioning as per reference image
- ✅ Correct data from database tables  
- ✅ Only completed batches generate labels
- ✅ Proper page numbering (Page X of Y)
- ✅ Bangkok timezone in footer
- ✅ Checkbox remains empty for manual verification

## Future Enhancements

### Potential Improvements
1. **PDF Generation**: Alternative to browser printing
2. **Label Templates**: Support different label formats
3. **Batch Selection**: Choose specific batches to print
4. **Print History**: Track what was printed when
5. **Barcode Support**: Add QR codes or barcodes to labels

## Security & Performance

### Considerations
- **Data Privacy**: No sensitive information on labels
- **Print Security**: Labels contain traceability data only
- **Performance**: Efficient database queries for large runs
- **Browser Compatibility**: CSS print support across browsers

---

This architecture provides the complete foundation for implementing the bulk picking print labels feature with exact database integration and business logic requirements.