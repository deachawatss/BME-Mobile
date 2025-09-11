import { Component, OnInit, Input, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { BulkRun, BulkPickedItem } from '../../services/bulk-runs.service';

// Enhanced interface for print functionality that includes all needed fields
interface EnhancedBulkPickedItem extends BulkPickedItem {
  batch_no?: string;
  lot_no?: string;
  bin_no?: string;
  unit?: string;
  picked_qty?: number;
  modified_by?: string;
  modified_date?: string;
  rec_user_id?: string;
}

export interface PrintLabel {
  header: {
    title: string;
    productType: string;
    date: string;
  };
  productInfo: {
    productKey: string;
    description: string;
    runNo: number;
    batchNo: string;
    pageInfo: string;
  };
  items: PrintLabelItem[];
  footer: {
    pickedBy: string;
    verificationLine: string;
    datePrinted: string;
  };
}

export interface PrintLabelItem {
  itemNo: string;
  lotNo: string;
  binNo: string;
  bagQuantity: number;
  totalQuantity: number;
  unit: string;
  packSize: number;
  checkbox: boolean;
}

export interface PrintDialogData {
  runData: BulkRun;
  pickedItems: EnhancedBulkPickedItem[];
  completedBatches: string[];
}

// NOTE: This component is no longer used - printing is now handled directly by PrintDataService
@Component({
  selector: 'app-bulk-print-labels',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './bulk-print-labels.component.html',
  styleUrls: ['./bulk-print-labels.component.css']
})
export class BulkPrintLabelsComponent implements OnInit {
  
  labels: PrintLabel[] = [];
  
  constructor(
    public dialogRef: MatDialogRef<BulkPrintLabelsComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PrintDialogData
  ) {}
  
  ngOnInit() {
    this.generateLabels();
  }
  
  private generateLabels() {
    if (!this.data.runData || !this.data.pickedItems) {
      return;
    }
    
    // Group picked items by batch
    const batchGroups = this.groupItemsByBatch(this.data.pickedItems);
    
    // Generate label for each completed batch
    this.labels = this.data.completedBatches.map(batchNo => {
      const batchItems = batchGroups[batchNo] || [];
      return this.createLabel(this.data.runData, batchNo, batchItems);
    });
  }
  
  private groupItemsByBatch(items: EnhancedBulkPickedItem[]): { [batchNo: string]: EnhancedBulkPickedItem[] } {
    return items.reduce((groups, item) => {
      const batchNo = item.batch_no || '';
      if (!groups[batchNo]) {
        groups[batchNo] = [];
      }
      // Only include completed items (with picked_bulk_qty)
      if (item.picked_bulk_qty !== null && 
          item.picked_bulk_qty !== undefined && 
          this.parseQuantity(item.picked_bulk_qty) > 0) {
        groups[batchNo].push(item);
      }
      return groups;
    }, {} as { [batchNo: string]: EnhancedBulkPickedItem[] });
  }
  
  private createLabel(runData: BulkRun, batchNo: string, items: EnhancedBulkPickedItem[]): PrintLabel {
    const currentDate = new Date();
    const bangkokTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    }).format(currentDate);
    
    const bangkokDateTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(currentDate);
    
    // Get page number from batch sequence
    const batchIndex = this.data.completedBatches.indexOf(batchNo) + 1;
    const totalPages = runData.no_of_batches;
    
    // Get the user who last modified items in this batch
    const pickedByUser = this.getMostRecentUser(items);
    
    return {
      header: {
        title: 'BULK SUMMARY',
        productType: runData.formula_desc || '',
        date: bangkokTime
      },
      productInfo: {
        productKey: runData.formula_id,
        description: runData.formula_desc || '',
        runNo: runData.run_no,
        batchNo: batchNo,
        pageInfo: `Page ${batchIndex} of ${totalPages}`
      },
      items: items.map(item => ({
        itemNo: item.item_key,
        lotNo: item.lot_no || '', // Will be populated from lot picking data
        binNo: item.bin_no || '', // Will be populated from lot picking data  
        bagQuantity: this.parseQuantity(item.picked_bulk_qty) as number,
        totalQuantity: item.picked_qty || 0,
        unit: item.unit || 'KG',
        packSize: this.parseQuantity(item.pack_size) as number,
        checkbox: false // Always false for manual verification
      })),
      footer: {
        pickedBy: pickedByUser,
        verificationLine: 'Verified by: _______________',
        datePrinted: `Date Printed: ${bangkokDateTime}`
      }
    };
  }
  
  private getMostRecentUser(items: EnhancedBulkPickedItem[]): string {
    if (items.length === 0) return 'SYSTEM';
    
    // Find the most recently modified item
    const mostRecent = items.reduce((latest, item) => {
      const itemDate = new Date(item.picking_date || item.modified_date || '1970-01-01');
      const latestDate = new Date(latest.picking_date || latest.modified_date || '1970-01-01');
      return itemDate > latestDate ? item : latest;
    });
    
    return mostRecent.modified_by || mostRecent.rec_user_id || 'SYSTEM';
  }

  /**
   * Parse quantity string to number (handles string and number types)
   */
  private parseQuantity(quantity: string | number | undefined | null): number {
    if (quantity === null || quantity === undefined) return 0;
    if (typeof quantity === 'number') return quantity;
    if (typeof quantity === 'string') {
      const parsed = parseFloat(quantity);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
  
  printLabels() {
    window.print();
  }
  
  closeDialog() {
    this.dialogRef.close();
  }
}