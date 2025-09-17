import { Component, signal, computed, effect, inject, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BulkRunsService, BulkRunFormData, BulkRunSearchResponse, InventoryStatus, InventoryAlert, BulkRunSummary, BulkRunListResponse, PaginationInfo, RunItemSearchResult, LotSearchResult, PalletBatch, PalletTrackingResponse, PickedLot, PickedLotsResponse, UnpickRequest, BatchWeightSummaryItem, BatchWeightSummaryResponse, BulkRunStatusResponse } from '../../services/bulk-runs.service';
import { BangkokTimezoneService } from '../../services/bangkok-timezone.service';
import { PrintDataService, PrintLabelData } from '../../services/print-data.service';
import { RunStatusManager, StatusTrigger } from '../../services/run-status-manager';
import { HttpClientModule } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, tap, catchError } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

// Models for Production Picking - using interfaces from BulkRunsService

interface CompleteRunData {
  runNo: number;
  allIngredients: RunItemSearchResult[];
  pickedLots: PickedLot[];
}

interface ProductionRun {
  runNumber: string;
  fgItemKey: string;
  stPickingDate: string;
  soh: number;
  itemKey: string;
  bulkPackSize: number;
  suggestedLot: string;
  binNumber: string;
  binNo: string;
  totalNeeded: number;
  remainingToPick: number;
}

@Component({
  selector: 'app-bulk-picking',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule
  ],
  styles: [`
    /* ☕ Ultra-Simple Coffee Theme - Zero Conflicts */
    .coffee-header {
      background: #523325;
      color: white;
      padding: 16px 12px;
      font-weight: bold;
      text-align: center;
      font-size: 13px;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
      transition: background-color 0.3s ease;
    }
    
    /* Dynamic Header Color System */
    .coffee-header.unpicked {
      background: #523325 !important; /* Brown for unpicked batches */
    }
    
    .coffee-header.in-progress {
      background: #F59E0B !important; /* Amber for partial batches */
      color: white;
    }
    
    .coffee-header.completed {
      background: #22C55E !important; /* Green for completed batches */
      color: white;
    }
    
    /* Data Cell Status Background Colors - Professional UX/UI Design */
    .data-cell-unpicked {
      background-color: #f8f9fa !important; /* Professional neutral gray background */
      color: #374151 !important; /* Dark gray text - easy on eyes */
    }
    
    .data-cell-in-progress {
      background-color: #fff3e0 !important; /* Warm amber background - indicates activity */
      color: #f57c00 !important; /* Dark amber text - professional visibility */
      font-weight: 900 !important; /* Extra bold text - maximum visibility on touchscreens */
    }
    
    .data-cell-completed {
      background-color: #e8f5e8 !important; /* Light green background - soft completion indicator */
      color: #1b5e20 !important; /* Dark green text - enhanced readability */
      font-weight: 900 !important; /* Extra bold text - maximum visibility on touchscreens */
    }

    .coffee-table {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #C7B299;
    }

    .coffee-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .cream-row {
      background: #FAF8F5;
      transition: background-color 200ms ease;
    }

    .cream-row:hover {
      background: #E8DDD4;
      cursor: pointer;
    }

    .latte-row {
      background: #F0EBE3;
      transition: background-color 200ms ease;
    }

    .latte-row:hover {
      background: #DDD0C0;
      cursor: pointer;
    }

    .table-cell {
      padding: 12px 8px;
      text-align: center;
      color: #4A3728;
      border-right: 1px solid rgba(199, 178, 153, 0.3);
      border-bottom: 1px solid rgba(199, 178, 153, 0.3);
    }

    .label-cell {
      background: #F5F2ED;
      font-weight: bold;
      text-align: left;
      padding-left: 16px;
      color: #3C2415;
      border-right: 2px solid #C7B299;
      min-width: 160px;
    }

    .search-btn {
      position: absolute;
      right: 2px;
      top: 2px;
      bottom: 2px;
      width: 36px;
      background: #F0B429;
      border: none;
      border-radius: 4px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .search-btn:hover {
      background: #d4a024;
    }
  `],
  template: `
    <!-- NWFTH Production Picking Pallet Assembly -->
    <div class="tw-min-h-screen tw-bg-gradient-to-br tw-from-gray-50 tw-to-gray-100 tw-flex tw-items-center tw-justify-center tw-p-3 sm:tw-p-4 lg:tw-p-6">
      <div class="tw-w-full tw-max-w-7xl tw-mx-auto">
        
        <!-- Main Dialog Card -->
        <div class="nwfth-card tw-overflow-hidden tw-bg-white">
          
          <!-- Dialog Header -->
          <div class="nwfth-button-primary tw-border-b tw-border-gray-200 tw-p-4 sm:tw-p-6">
            <div class="tw-flex tw-items-center tw-justify-between">
              <h2 class="tw-text-lg sm:tw-text-xl tw-font-bold tw-text-white tw-flex tw-items-center tw-gap-3">
                <span class="tw-text-2xl sm:tw-text-3xl">🏭</span>
                <div class="tw-flex tw-flex-col">
                  <span class="tw-tracking-wide">Bulk Picking</span>
                </div>
              </h2>
              <button 
                type="button"
                (click)="goBack()"
                class="tw-bg-white/20 tw-text-white tw-p-2 tw-rounded-lg"
                aria-label="Close production picking dialog">
                ✕
              </button>
            </div>
          </div>

          <!-- Dialog Content -->
          <div class="tw-p-4 sm:tw-p-6">
            <!-- Error Message Display with BME4 Validation Styling -->
            <div *ngIf="errorMessage()" class="tw-mb-4 tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg">
              <div class="tw-flex tw-items-center tw-gap-3">
                <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                <div class="tw-flex-1">
                  <div class="tw-text-red-800 tw-font-medium" [ngClass]="{ 
                    'tw-bg-red-100 tw-px-2 tw-py-1 tw-rounded': errorMessage()?.includes('more than Qty Required')
                  }">{{ errorMessage() }}</div>
                  <!-- NEW: Contextual actions for transaction rollback (no refresh needed) -->
                  <div *ngIf="errorMessage()?.includes('Transaction was safely rolled back')" class="tw-mt-2 tw-text-sm tw-text-green-700 tw-bg-green-50 tw-px-2 tw-py-1 tw-rounded">
                    <div class="tw-flex tw-items-center">
                      <svg class="tw-w-4 tw-h-4 tw-mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                      </svg>
                      <span class="tw-font-medium">Database is consistent</span> - you can try again safely.
                    </div>
                  </div>

                  <!-- CRITICAL: Warning for transaction failure with rollback failure -->
                  <div *ngIf="errorMessage()?.includes('Transaction failed and rollback also failed')" class="tw-mt-2 tw-text-sm tw-text-red-900 tw-bg-red-100 tw-px-2 tw-py-1 tw-rounded tw-border tw-border-red-300">
                    <div class="tw-flex tw-items-center">
                      <svg class="tw-w-4 tw-h-4 tw-mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                      </svg>
                      <span class="tw-font-bold">CRITICAL: Contact IT support immediately</span>
                    </div>
                  </div>

                  <!-- Legacy: Contextual action for completed batch -->
                  <div *ngIf="(errorMessage()?.includes('already completed') || errorMessage()?.includes('BATCH_ALREADY_COMPLETED')) && !errorMessage()?.includes('Transaction was')" class="tw-mt-2 tw-text-sm tw-text-red-700">
                    <button type="button" (click)="refreshCurrentIngredient()" class="tw-underline hover:tw-text-red-900">Refresh now</button>
                    <span class="tw-ml-1">to load the next available batch.</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Loading Indicator -->
            <div *ngIf="bulkRunsService.getIsLoading()" class="tw-mb-4 tw-p-4 tw-bg-blue-50 tw-border tw-border-blue-200 tw-rounded-lg">
              <div class="tw-flex tw-items-center tw-gap-3">
                <div class="tw-animate-spin tw-h-5 tw-w-5 tw-border-2 tw-border-blue-600 tw-border-t-transparent tw-rounded-full"></div>
                <span class="tw-text-blue-800 tw-font-medium">Loading run data...</span>
              </div>
            </div>
            
            <form [formGroup]="productionForm" (ngSubmit)="onSubmit()">
              
              <!-- Reference-based layout matching docs/Bulk-picking.png -->
              <div class="tw-space-y-3">
                
                <!-- Row 1: Run# [🔍] + FG Item Key -->
                <div class="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4 tw-py-2 tw-border-b tw-border-gray-100">
                  <!-- Run # -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label for="runNumber" class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Run #</label>
                    <div class="tw-relative tw-flex-1">
                      <input
                        #runNumberInput
                        id="runNumber"
                        type="text"
                        formControlName="runNumber"
                        class="nwfth-input tw-w-full tw-pr-10 tw-px-3 tw-py-2 tw-text-sm tw-font-mono"
                        placeholder="Enter run number"
                        (click)="onRunFieldClick()"
                        (blur)="onRunFieldBlur()"
                        (keydown.enter)="searchRun()"
                        autocomplete="off">
                      <button
                        type="button"
                        (mousedown)="onSearchButtonMouseDown()"
                        (click)="searchRun()"
                        class="search-btn"
                        [disabled]="isSearchingRun()"
                        aria-label="Search run number">
                        <span *ngIf="!isSearchingRun()">🔍</span>
                        <span *ngIf="isSearchingRun()">⏳</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- FG Item Key -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">FG Item Key</label>
                    <div class="tw-flex tw-items-center tw-gap-2 tw-flex-1">
                      <input
                        id="fgItemKeyId"
                        type="text"
                        formControlName="fgItemKeyId"
                        class="nwfth-input tw-w-24 tw-px-3 tw-py-2 tw-text-sm tw-font-mono tw-bg-gray-50"
                        placeholder="Item Key"
                        readonly>
                      <input
                        id="fgItemKeyDesc"
                        type="text"
                        formControlName="fgItemKeyDesc"
                        class="nwfth-input tw-flex-1 tw-px-3 tw-py-2 tw-text-sm tw-bg-gray-50"
                        placeholder="Description"
                        readonly>
                    </div>
                  </div>
                </div>

                <!-- Row 2: Item Key [🔍] + St. Picking Date (compact) + SOH -->
                <div class="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4 tw-py-2 tw-border-b tw-border-gray-100">
                  <!-- Item Key -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label for="itemKey" class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Item Key</label>
                    <div class="tw-relative tw-flex-1">
                      <input
                        id="itemKey"
                        type="text"
                        formControlName="itemKey"
                        class="nwfth-input tw-w-full tw-pr-10 tw-px-3 tw-py-2 tw-text-sm tw-font-mono"
                        placeholder="Enter item key"
                        (keydown.enter)="searchItem()"
                        autocomplete="off">
                      <button
                        type="button"
                        (click)="searchItem()"
                        class="search-btn"
                        [disabled]="isSearchingItem()"
                        aria-label="Search item key">
                        <span *ngIf="!isSearchingItem()">🔍</span>
                        <span *ngIf="isSearchingItem()">⏳</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- St. Picking Date (compact) + SOH (vertically aligned with FG Item Key column) -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label for="stPickingDate" class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">St. Picking Date</label>
                    <div class="tw-flex tw-items-center tw-gap-2 tw-flex-1">
                      <input
                        id="stPickingDate"
                        type="date"
                        formControlName="stPickingDate"
                        class="nwfth-input tw-w-40 tw-px-3 tw-py-2 tw-text-sm"
                        [value]="getCurrentDate()">
                      <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-ml-2">SOH</label>
                      <input
                        id="sohValue"
                        type="text"
                        formControlName="sohValue"
                        class="nwfth-input tw-w-28 tw-px-3 tw-py-2 tw-text-sm tw-font-mono tw-text-right tw-bg-gray-50"
                        placeholder=""
                        readonly>
                      <input
                        id="sohUom"
                        type="text"
                        formControlName="sohUom"
                        class="nwfth-input tw-w-12 tw-px-2 tw-py-2 tw-text-sm tw-font-semibold tw-text-center tw-bg-gray-50"
                        placeholder=""
                        readonly>
                    </div>
                  </div>
                </div>

                <!-- Row 3: Suggested Lot/Bin + Bulk Pack Size -->
                <div class="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4 tw-py-2 tw-border-b tw-border-gray-100">
                  <!-- Suggest Lot / Bin No -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Suggest Lot / Bin No</label>
                    <div class="tw-flex tw-items-center tw-gap-2 tw-flex-1">
                      <input
                        id="suggestedLotNumber"
                        type="text"
                        formControlName="suggestedLotNumber"
                        class="nwfth-input tw-flex-1 tw-px-3 tw-py-2 tw-text-sm tw-font-mono tw-bg-gray-50"
                        placeholder=""
                        readonly>
                      <input
                        id="suggestedBinNumber"
                        type="text"
                        formControlName="suggestedBinNumber"
                        class="nwfth-input tw-flex-1 tw-px-3 tw-py-2 tw-text-sm tw-font-mono tw-bg-gray-50"
                        placeholder=""
                        readonly>
                    </div>
                  </div>
                  
                  <!-- Bulk Pack Size -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Bulk Pack Size</label>
                    <div class="tw-flex tw-items-center tw-gap-2 tw-flex-1">
                      <input
                        id="bulkPackSizeValue"
                        type="text"
                        formControlName="bulkPackSizeValue"
                        class="nwfth-input tw-w-28 tw-px-3 tw-py-2 tw-text-sm tw-font-mono tw-text-right tw-bg-gray-50"
                        placeholder=""
                        readonly>
                      <input
                        id="bulkPackSizeUom"
                        type="text"
                        formControlName="bulkPackSizeUom"
                        class="nwfth-input tw-w-12 tw-px-2 tw-py-2 tw-text-sm tw-font-semibold tw-text-center tw-bg-gray-50"
                        placeholder=""
                        readonly>
                    </div>
                  </div>
                </div>


                <!-- Row 4: Lot# [🔍] + Bin# [🔍] -->
                <div class="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4 tw-py-2 tw-border-b tw-border-gray-100">
                  <!-- Lot # -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Lot #</label>
                    <div class="tw-relative tw-flex-1">
                      <input
                        #lotNumberInput
                        id="lotNumber"
                        type="text"
                        formControlName="lotNumber"
                        class="nwfth-input tw-w-full tw-pr-10 tw-px-3 tw-py-2 tw-text-sm tw-font-mono"
                        placeholder="Enter lot number"
                        (keydown.enter)="onLotNumberInput()"
                        (input)="onLotNumberChange($event)"
                        autocomplete="off">
                      <button
                        type="button"
                        (click)="searchLot()"
                        class="search-btn"
                        [disabled]="isSearchingLot()"
                        aria-label="Search lot number">
                        <span *ngIf="!isSearchingLot()">🔍</span>
                        <span *ngIf="isSearchingLot()">⏳</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- Bin # -->
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Bin #</label>
                    <div class="tw-relative tw-flex-1">
                      <input
                        #binNumberInput
                        id="binNumber"
                        type="text"
                        formControlName="binNumber"
                        class="nwfth-input tw-w-full tw-pr-10 tw-px-3 tw-py-2 tw-text-sm tw-font-mono"
                        placeholder="Enter bin location"
                        (keydown.enter)="searchBin()"
                        autocomplete="off">
                      <button
                        type="button"
                        (click)="searchBin()"
                        class="search-btn"
                        [disabled]="isSearchingBin()"
                        aria-label="Search bin number">
                        <span *ngIf="!isSearchingBin()">🔍</span>
                        <span *ngIf="isSearchingBin()">⏳</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Row 5: Total Needed [📱] -->
                <div class="tw-py-2 tw-border-b tw-border-gray-100">
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-w-24 tw-flex-shrink-0">Total Needed</label>
                    <div class="tw-flex tw-items-center tw-gap-8 tw-flex-1">
                      <!-- Left side: Total needed quantity + BAGS -->
                      <div class="tw-flex tw-items-center tw-gap-1">
                        <input
                          id="totalNeededBags"
                          type="text"
                          formControlName="totalNeededBags"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center tw-bg-gray-50"
                          placeholder=""
                          readonly>
                        <input
                          id="totalNeededBagsUom"
                          type="text"
                          formControlName="totalNeededBagsUom"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center tw-bg-gray-50"
                          placeholder=""
                          readonly>
                      </div>
                      <!-- Right side: Numpad input + BAGS -->
                      <div class="tw-flex tw-items-center tw-gap-1">
                        <input
                          id="userInputBags"
                          type="text"
                          formControlName="userInputBags"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center tw-bg-white tw-border-2 tw-border-blue-200"
                          placeholder="0"
                          (focus)="onUserInputFocus()"
                          readonly>
                        <button
                          type="button"
                          (click)="openKeyboardForUserInput()"
                          class="tw-w-8 tw-h-8 tw-bg-amber-500 hover:tw-bg-amber-600 tw-text-white tw-rounded tw-flex tw-items-center tw-justify-center tw-text-sm tw-transition-colors tw-flex-shrink-0"
                          title="Enter number of bags">
                          ⌨️
                        </button>
                        <input
                          id="totalNeededWeightUom"
                          type="text"
                          formControlName="totalNeededWeightUom"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center tw-bg-gray-50"
                          placeholder=""
                          readonly>
                      </div>
                      <!-- Status Controls - Right side of Total Needed row -->
                      <div class="tw-ml-auto tw-flex-shrink-0 tw-flex tw-items-center tw-gap-2">
                        <!-- REVERT Button - Only show when status is PRINT -->
                        <button
                          *ngIf="currentRunStatus()?.status === 'PRINT' && !isRevertingStatus()"
                          (click)="confirmAndRevertStatus()"
                          class="tw-px-2 tw-py-1 tw-text-xs tw-font-semibold tw-rounded tw-border tw-bg-amber-500 tw-text-white tw-border-amber-600 hover:tw-bg-amber-600 tw-transition-colors tw-duration-200"
                          title="Revert run status from PRINT back to NEW"
                          type="button">
                          REVERT to NEW
                        </button>

                        <!-- Loading state for revert -->
                        <div
                          *ngIf="isRevertingStatus()"
                          class="tw-px-2 tw-py-1 tw-text-xs tw-font-semibold tw-rounded tw-border tw-bg-amber-500 tw-text-white tw-border-amber-600 tw-animate-pulse">
                          REVERTING...
                        </div>

                        <!-- Status Flag -->
                        <div
                          class="tw-px-2 tw-py-1 tw-text-xs tw-font-semibold tw-rounded tw-border"
                          [class]="getStatusFlagColor()"
                          [title]="getStatusFlagTooltip()">
                          <span *ngIf="!isLoadingStatus()">{{ getStatusText() }}</span>
                          <span *ngIf="isLoadingStatus()" class="tw-animate-pulse">LOADING...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Row 6: Remaining to Pick with completion status -->
                <div class="tw-py-2 tw-border-b tw-border-gray-100"
                     [ngClass]="{'tw-bg-green-50 tw-border-green-200': isCurrentIngredientCompleted()}">
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <label class="tw-text-sm tw-font-semibold tw-w-24 tw-flex-shrink-0"
                           [ngClass]="{'tw-text-green-700': isCurrentIngredientCompleted(), 'tw-text-gray-700': !isCurrentIngredientCompleted()}">
                      Remaining to Pick
                    </label>
                    <div class="tw-flex tw-items-center tw-gap-8 tw-flex-1">
                      <!-- Left side: Remaining bags + BAGS -->
                      <div class="tw-flex tw-items-center tw-gap-1">
                        <input
                          id="remainingToPickBags"
                          type="text"
                          formControlName="remainingToPickBags"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center"
                          [ngClass]="{'tw-bg-green-100 tw-text-green-800 tw-border-green-300': isCurrentIngredientCompleted(), 'tw-bg-gray-50': !isCurrentIngredientCompleted()}"
                          placeholder=""
                          readonly>
                        <input
                          id="remainingBagsUom"
                          type="text"
                          formControlName="remainingBagsUom"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center"
                          [ngClass]="{'tw-bg-green-100 tw-text-green-800 tw-border-green-300': isCurrentIngredientCompleted(), 'tw-bg-gray-50': !isCurrentIngredientCompleted()}"
                          placeholder=""
                          readonly>
                      </div>
                      <!-- Right side: Remaining KG + KG -->
                      <div class="tw-flex tw-items-center tw-gap-1">
                        <input
                          id="remainingKg"
                          type="text"
                          formControlName="remainingKg"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center"
                          [ngClass]="{'tw-bg-green-100 tw-text-green-800 tw-border-green-300': isCurrentIngredientCompleted(), 'tw-bg-gray-50': !isCurrentIngredientCompleted()}"
                          placeholder=""
                          readonly>
                        <input
                          id="remainingKgUom"
                          type="text"
                          formControlName="remainingKgUom"
                          class="nwfth-input tw-w-16 tw-px-2 tw-py-2 tw-text-sm tw-font-mono tw-text-center"
                          [ngClass]="{'tw-bg-green-100 tw-text-green-800 tw-border-green-300': isCurrentIngredientCompleted(), 'tw-bg-gray-50': !isCurrentIngredientCompleted()}"
                          placeholder=""
                          readonly>
                        <span *ngIf="isCurrentIngredientCompleted()" class="tw-text-xs tw-bg-green-600 tw-text-white tw-px-1 tw-py-0.5 tw-rounded tw-font-bold tw-ml-2">✅ COMPLETED</span>
                      </div>
                    </div>
                    <!-- Action Buttons -->
                    <div class="tw-ml-auto tw-flex-shrink-0 tw-flex tw-gap-2">
                      <!-- View Picked Lots Button - Always visible -->
                      <button 
                        type="button" 
                        (click)="openViewPickedLotsModal()"
                        class="nwfth-button-secondary tw-px-3 tw-py-1.5 tw-text-xs tw-rounded tw-flex tw-items-center tw-gap-1" 
                        title="View picked lots">
                        👁️ View picked lots
                      </button>
                      <!-- Print Button -->
                      <button 
                        type="button" 
                        (click)="printLabelsDirectly()"
                        [disabled]="!hasPrintableData()"
                        class="nwfth-button-secondary tw-px-3 tw-py-1.5 tw-text-xs tw-rounded tw-flex tw-items-center tw-gap-1" 
                        [title]="getPrintButtonTitle()">
                        🖨️ {{ getPrintButtonText() }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Ingredient Switch Notification -->
                <div *ngIf="showSwitchNotification()" class="tw-mb-4 tw-p-4 tw-bg-blue-50 tw-border tw-border-blue-200 tw-rounded-lg">
                  <div class="tw-flex tw-items-center tw-gap-3">
                    <span class="tw-text-blue-600 tw-text-lg">🔄</span>
                    <div class="tw-flex-1">
                      <div class="tw-text-blue-800 tw-font-medium">{{ switchNotificationMessage() }}</div>
                    </div>
                    <button 
                      type="button"
                      (click)="dismissSwitchNotification()"
                      class="tw-text-blue-400 hover:tw-text-blue-600 tw-text-xl tw-leading-none">
                      ×
                    </button>
                  </div>
                </div>

                <!-- Pick Confirmation Section -->
                <div class="tw-py-4 tw-border-b tw-border-gray-100" *ngIf="productionForm.get('pendingPickBags')?.value > 0">
                  <div class="tw-flex tw-items-center tw-justify-between tw-gap-4">
                    <!-- Pending Pick Display -->
                    <div class="tw-flex tw-items-center tw-gap-2">
                      <span class="tw-text-sm tw-font-semibold tw-text-amber-700">Ready to Pick:</span>
                      <span class="tw-font-mono tw-text-sm tw-bg-amber-50 tw-px-2 tw-py-1 tw-rounded">
                        {{ productionForm.get('pendingPickBags')?.value }} BAGS
                      </span>
                      <span class="tw-font-mono tw-text-sm tw-bg-amber-50 tw-px-2 tw-py-1 tw-rounded">
                        {{ productionForm.get('pendingPickKg')?.value }} KG
                      </span>
                    </div>
                    
                    <!-- Confirm Pick Button -->
                    <button 
                      type="button"
                      (click)="confirmPickOperation()"
                      [disabled]="!isPickConfirmationReady()"
                      class="tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-rounded tw-transition-all tw-duration-200"
                      [ngClass]="{
                        'tw-bg-green-500 hover:tw-bg-green-600 tw-text-white tw-cursor-pointer': isPickConfirmationReady(),
                        'tw-bg-gray-300 tw-text-gray-500 tw-cursor-not-allowed': !isPickConfirmationReady()
                      }"
                      title="Confirm pick operation and update remaining quantities">
                      <span class="tw-flex tw-items-center tw-gap-1">
                        ✓ Confirm Pick
                      </span>
                    </button>
                  </div>
                  
                  <!-- Help Text -->
                  <div class="tw-mt-2 tw-text-xs" *ngIf="!isPickConfirmationReady()">
                    <!-- Completion Status Message (Priority) -->
                    <div *ngIf="isCurrentIngredientCompleted()" class="tw-text-green-700 tw-font-semibold tw-p-2 tw-bg-green-50 tw-rounded tw-border tw-border-green-200">
                      ✅ This ingredient is already completed. Please switch to another ingredient or use the search to find unpicked ingredients.
                    </div>
                    
                    <!-- Regular Validation Help Text -->
                    <div *ngIf="!isCurrentIngredientCompleted()" class="tw-text-gray-600">
                      <span *ngIf="productionForm.get('pendingPickBags')?.value === 0">Select quantity first, </span>
                      <span *ngIf="!productionForm.get('lotNumber')?.value">select lot number, </span>
                      <span *ngIf="!productionForm.get('binNumber')?.value && !productionForm.get('binNo')?.value">select bin number</span>
                    </div>
                  </div>
                </div>

                <!-- Separator -->
                <div class="tw-h-px tw-bg-gray-200 tw-my-6"></div>


                <!-- Pallet Data Loading Indicator -->
                <div *ngIf="isLoadingPalletData()" class="tw-mb-4 tw-p-4 tw-bg-blue-50 tw-border tw-border-blue-200 tw-rounded-lg">
                  <div class="tw-flex tw-items-center tw-gap-3">
                    <div class="tw-animate-spin tw-h-5 tw-w-5 tw-border-2 tw-border-blue-600 tw-border-t-transparent tw-rounded-full"></div>
                    <span class="tw-text-blue-800 tw-font-medium">Loading pallet tracking data...</span>
                  </div>
                </div>

                <!-- Pallet Data Error Message -->
                <div *ngIf="palletDataError()" class="tw-mb-4 tw-p-4 tw-bg-orange-50 tw-border tw-border-orange-200 tw-rounded-lg">
                  <div class="tw-flex tw-items-center tw-gap-2">
                    <span class="tw-text-orange-600 tw-text-lg">⚠️</span>
                    <span class="tw-text-orange-800 tw-font-medium">{{ palletDataError() }}</span>
                    <span class="tw-text-orange-600 tw-text-sm tw-ml-2">(Using default values)</span>
                  </div>
                </div>

                <!-- Clean Coffee Tables -->
                <div class="tw-space-y-6">
                  
                  <!-- First Pallet Table -->
                  <div class="coffee-table">
                    <div class="tw-overflow-x-auto">
                      <table class="tw-min-w-[700px]">
                        <thead>
                          <tr>
                            <th class="coffee-header tw-min-w-[160px]"></th>
                            <th *ngFor="let pallet of firstPalletGroup(); trackBy: trackByPalletId" 
                                class="coffee-header tw-min-w-[100px]">
                              PALLET /{{ pallet.batch_number }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr class="cream-row">
                            <td class="table-cell label-cell">No. of Bags Picked</td>
                            <td *ngFor="let pallet of firstPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.no_of_bags_picked }}</td>
                          </tr>
                          <tr class="latte-row">
                            <td class="table-cell label-cell">Quantity Picked</td>
                            <td *ngFor="let pallet of firstPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.quantity_picked | number:'1.4-4' }}</td>
                          </tr>
                          <tr class="cream-row">
                            <td class="table-cell label-cell">No. of Bags Remaining</td>
                            <td *ngFor="let pallet of firstPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.no_of_bags_remaining }}</td>
                          </tr>
                          <tr class="latte-row">
                            <td class="table-cell label-cell">Quantity Remaining</td>
                            <td *ngFor="let pallet of firstPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.quantity_remaining | number:'1.4-4' }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Second Pallet Table -->
                  <div class="coffee-table" *ngIf="secondPalletGroup().length > 0">
                    <div class="tw-overflow-x-auto">
                      <table class="tw-min-w-[700px]">
                        <thead>
                          <tr>
                            <th class="coffee-header tw-min-w-[160px]"></th>
                            <th *ngFor="let pallet of secondPalletGroup(); trackBy: trackByPalletId" 
                                class="coffee-header tw-min-w-[100px]">
                              PALLET# /{{ pallet.batch_number }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr class="cream-row">
                            <td class="table-cell label-cell">No. of Bags Picked</td>
                            <td *ngFor="let pallet of secondPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.no_of_bags_picked }}</td>
                          </tr>
                          <tr class="latte-row">
                            <td class="table-cell label-cell">Quantity Picked</td>
                            <td *ngFor="let pallet of secondPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.quantity_picked | number:'1.4-4' }}</td>
                          </tr>
                          <tr class="cream-row">
                            <td class="table-cell label-cell">No. of Bags Remaining</td>
                            <td *ngFor="let pallet of secondPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.no_of_bags_remaining }}</td>
                          </tr>
                          <tr class="latte-row">
                            <td class="table-cell label-cell">Quantity Remaining</td>
                            <td *ngFor="let pallet of secondPalletGroup(); trackBy: trackByPalletId" 
                                class="table-cell" [ngClass]="getDataCellClass(pallet)">{{ pallet.quantity_remaining | number:'1.4-4' }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

              </div>
            </form>

            <!-- On-Screen Keyboard Modal -->
            <div *ngIf="showKeyboard()" 
                 class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
                 (click)="closeKeyboard()">
              
              <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-sm tw-mx-auto"
                   (click)="$event.stopPropagation()">
                
                <!-- Keyboard Header -->
                <div class="nwfth-button-primary tw-p-4 tw-rounded-t-lg">
                  <div class="tw-flex tw-items-center tw-justify-between">
                    <h3 class="tw-text-lg tw-font-bold tw-text-white">Enter Number of Bags</h3>
                    <button 
                      type="button"
                      (click)="closeKeyboard()"
                      class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                      ✕
                    </button>
                  </div>
                </div>

                <!-- Input Display -->
                <div class="tw-p-4 tw-bg-gray-50">
                  <input 
                    type="text" 
                    [value]="keyboardInput()"
                    class="nwfth-input tw-w-full tw-px-4 tw-py-3 tw-text-2xl tw-font-mono tw-text-right tw-bg-white tw-border-2 tw-border-gray-200"
                    placeholder="0"
                    readonly>
                </div>

                <!-- Number Pad -->
                <div class="tw-p-4 tw-grid tw-grid-cols-3 tw-gap-3">
                  
                  <!-- Row 1: 1, 2, 3 -->
                  <button 
                    *ngFor="let num of [1, 2, 3]" 
                    type="button"
                    (click)="addNumber(num)"
                    class="tw-h-14 tw-bg-amber-50 hover:tw-bg-amber-100 tw-border-2 tw-border-amber-200 hover:tw-border-amber-300 tw-rounded-lg tw-text-2xl tw-font-bold tw-text-amber-900 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    {{ num }}
                  </button>

                  <!-- Row 2: 4, 5, 6 -->
                  <button 
                    *ngFor="let num of [4, 5, 6]" 
                    type="button"
                    (click)="addNumber(num)"
                    class="tw-h-14 tw-bg-amber-50 hover:tw-bg-amber-100 tw-border-2 tw-border-amber-200 hover:tw-border-amber-300 tw-rounded-lg tw-text-2xl tw-font-bold tw-text-amber-900 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    {{ num }}
                  </button>

                  <!-- Row 3: 7, 8, 9 -->
                  <button 
                    *ngFor="let num of [7, 8, 9]" 
                    type="button"
                    (click)="addNumber(num)"
                    class="tw-h-14 tw-bg-amber-50 hover:tw-bg-amber-100 tw-border-2 tw-border-amber-200 hover:tw-border-amber-300 tw-rounded-lg tw-text-2xl tw-font-bold tw-text-amber-900 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    {{ num }}
                  </button>

                  <!-- Row 4: Clear, 0, Backspace -->
                  <button 
                    type="button"
                    (click)="clearInput()"
                    class="tw-h-14 tw-bg-red-50 hover:tw-bg-red-100 tw-border-2 tw-border-red-200 hover:tw-border-red-300 tw-rounded-lg tw-text-lg tw-font-bold tw-text-red-700 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    Clear
                  </button>
                  
                  <button 
                    type="button"
                    (click)="addNumber(0)"
                    class="tw-h-14 tw-bg-amber-50 hover:tw-bg-amber-100 tw-border-2 tw-border-amber-200 hover:tw-border-amber-300 tw-rounded-lg tw-text-2xl tw-font-bold tw-text-amber-900 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    0
                  </button>
                  
                  <button 
                    type="button"
                    (click)="backspace()"
                    class="tw-h-14 tw-bg-orange-50 hover:tw-bg-orange-100 tw-border-2 tw-border-orange-200 hover:tw-border-orange-300 tw-rounded-lg tw-text-xl tw-font-bold tw-text-orange-700 tw-transition-all tw-shadow-sm hover:tw-shadow-md">
                    ⌫
                  </button>
                </div>

                <!-- Action Buttons -->
                <div class="tw-p-4 tw-flex tw-gap-3">
                  <button 
                    type="button"
                    (click)="closeKeyboard()"
                    class="tw-flex-1 tw-py-3 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-bold tw-rounded-lg tw-transition-colors">
                    Cancel
                  </button>
                  <button 
                    type="button"
                    (click)="confirmInput()"
                    class="nwfth-button-primary tw-flex-1 tw-py-3 tw-font-bold tw-rounded-lg">
                    Confirm
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- Bulk Run Selection Modal (Story 1.1.1) -->
        <div *ngIf="showRunModal()" 
             class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
             (click)="closeRunSelectionModal()">
          
          <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-sm sm:tw-max-w-md md:tw-max-w-2xl lg:tw-max-w-4xl xl:tw-max-w-5xl tw-mx-2 sm:tw-mx-4 tw-max-h-[95vh] tw-flex tw-flex-col tw-overflow-hidden"
               (click)="$event.stopPropagation()">
            
            <!-- Modal Header -->
            <div class="nwfth-button-primary tw-p-3 md:tw-p-4 tw-rounded-t-lg tw-flex-shrink-0">
              <div class="tw-flex tw-items-center tw-justify-between">
                <h3 class="tw-text-lg tw-font-bold tw-text-white">Select Bulk Run</h3>
                <button 
                  type="button"
                  (click)="closeRunSelectionModal()"
                  class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                  ✕
                </button>
              </div>
            </div>

            <!-- Scrollable Content Area -->
            <div class="tw-flex-1 tw-overflow-auto tw-min-h-0">
              <!-- Search Section -->
              <div class="tw-p-3 md:tw-p-4 tw-border-b tw-border-gray-200">
              <div class="tw-relative">
                <input
                  type="text"
                  [formControl]="searchControl"
                  placeholder="Search runs by number, formula ID, or description..."
                  class="nwfth-input tw-w-full tw-pr-12 tw-px-3 tw-py-2"
                />
                <div class="tw-absolute tw-right-3 tw-top-1/2 tw-transform tw--translate-y-1/2">
                  <div *ngIf="isSearchingRuns()" class="tw-w-5 tw-h-5 tw-border-2 tw-border-amber-500 tw-border-t-transparent tw-rounded-full tw-animate-spin"></div>
                  <span *ngIf="!isSearchingRuns()" class="tw-text-gray-400">🔍</span>
                </div>
                </div>
              </div>

              <!-- Modal Content -->
              <div class="tw-p-3 md:tw-p-4">
                <!-- Loading Indicator -->
                <div *ngIf="isLoadingModalData()" class="tw-flex tw-items-center tw-justify-center tw-py-8">
                <div class="nwfth-loading-spinner"></div>
                <span class="tw-text-gray-700">Loading available runs...</span>
              </div>

              <!-- Error Message -->
              <div *ngIf="modalError()" class="tw-mb-4 tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg">
                <div class="tw-flex tw-items-center tw-gap-2">
                  <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                  <span class="tw-text-red-800 tw-font-medium">{{ modalError() }}</span>
                </div>
              </div>

              <!-- Runs Table -->
              <div *ngIf="!isLoadingModalData() && !isSearchingRuns() && !modalError() && getDisplayRuns().length > 0" class="tw-overflow-x-auto">
                <div class="coffee-table">
                  <table class="tw-min-w-full">
                    <thead>
                      <tr>
                        <th class="coffee-header tw-min-w-[100px]">Run No</th>
                        <th class="coffee-header tw-min-w-[120px]">Formula ID</th>
                        <th class="coffee-header tw-min-w-[200px]">Formula Desc</th>
                        <th class="coffee-header tw-min-w-[80px]">Status</th>
                        <th class="coffee-header tw-min-w-[100px]">Batch Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let run of getDisplayRuns(); let i = index" 
                          [class]="i % 2 === 0 ? 'cream-row' : 'latte-row'"
                          (click)="selectRunFromModal(run)">
                        <td class="table-cell tw-font-mono tw-font-bold">{{ run.run_no }}</td>
                        <td class="table-cell tw-font-mono">{{ run.formula_id }}</td>
                        <td class="table-cell tw-text-left tw-pl-4">{{ run.formula_desc }}</td>
                        <td class="table-cell tw-font-semibold">{{ run.status }}</td>
                        <td class="table-cell">{{ run.batch_count }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Search Loading -->
              <div *ngIf="isSearchingRuns()" class="tw-text-center tw-py-8">
                <div class="tw-w-8 tw-h-8 tw-border-4 tw-border-amber-500 tw-border-t-transparent tw-rounded-full tw-animate-spin tw-mx-auto tw-mb-4"></div>
                <p class="tw-text-gray-600">Searching runs...</p>
              </div>

              <!-- No Results -->
              <div *ngIf="!isLoadingModalData() && !isSearchingRuns() && !modalError() && getDisplayRuns().length === 0" class="tw-text-center tw-py-8">
                <span class="tw-text-gray-500 tw-text-lg">🔍</span>
                <p class="tw-text-gray-600 tw-mt-2" *ngIf="!hasSearchedRuns()">No active bulk runs found</p>
                <p class="tw-text-gray-600 tw-mt-2" *ngIf="hasSearchedRuns()">No runs found for your search</p>
                <p class="tw-text-gray-500 tw-text-sm tw-mt-1" *ngIf="!hasSearchedRuns()">Please check with your supervisor</p>
                <p class="tw-text-gray-500 tw-text-sm tw-mt-1" *ngIf="hasSearchedRuns()">Try a different search term</p>
              </div>
            </div>

            <!-- Story 1.4: Pagination Controls -->
            <div *ngIf="showAllRuns() && paginationInfo() && paginationInfo()!.total_pages > 1" 
                 class="tw-p-4 tw-bg-white tw-border-t tw-border-gray-200">
              <div class="tw-flex tw-items-center tw-justify-between">
                <!-- Pagination Info -->
                <div class="tw-text-sm tw-text-gray-600">
                  Showing {{ (paginationInfo()!.current_page - 1) * paginationInfo()!.page_size + 1 }} 
                  to {{ Math.min(paginationInfo()!.current_page * paginationInfo()!.page_size, paginationInfo()!.total_items) }} 
                  of {{ paginationInfo()!.total_items }} runs
                </div>
                
                <!-- Pagination Controls -->
                <div class="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-justify-center">
                  <!-- First/Previous -->
                  <button
                    type="button"
                    (click)="goToFirstPage()"
                    class="nwfth-pagination-button"
                    [disabled]="!paginationInfo()!.has_previous">
                    First
                  </button>
                  <button
                    type="button"
                    (click)="goToPreviousPage()"
                    class="nwfth-pagination-button"
                    [disabled]="!paginationInfo()!.has_previous">
                    ← Prev
                  </button>
                  
                  <!-- Page Numbers -->
                  <button
                    type="button"
                    *ngFor="let page of getPaginationPages()"
                    (click)="goToPage(page)"
                    class="nwfth-pagination-button"
                    [class.nwfth-pagination-active]="page === paginationInfo()!.current_page">
                    {{ page }}
                  </button>
                  
                  <!-- Next/Last -->
                  <button
                    type="button"
                    (click)="goToNextPage()"
                    class="nwfth-pagination-button"
                    [disabled]="!paginationInfo()!.has_next">
                    Next →
                  </button>
                  <button
                    type="button"
                    (click)="goToLastPage()"
                    class="nwfth-pagination-button"
                    [disabled]="!paginationInfo()!.has_next">
                    Last
                  </button>
                </div>
              </div>
            </div>

            <!-- End Scrollable Content Area -->
            </div>

            <!-- Modal Footer -->
            <div class="tw-p-3 md:tw-p-4 tw-bg-gray-50 tw-border-t tw-border-gray-200 tw-flex-shrink-0">
              <div class="tw-flex tw-flex-col sm:tw-flex-row tw-gap-3 sm:tw-justify-end">
                <button 
                  type="button"
                  (click)="closeRunSelectionModal()"
                  class="tw-px-4 sm:tw-px-6 tw-py-2 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-semibold tw-rounded-lg tw-transition-colors tw-w-full sm:tw-w-auto">
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- ItemKey Search Modal -->
        <div *ngIf="showItemSearchModal()" 
             class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
             (click)="closeItemSearchModal()">
          
          <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-sm sm:tw-max-w-md md:tw-max-w-2xl lg:tw-max-w-4xl xl:tw-max-w-5xl tw-mx-2 sm:tw-mx-4 tw-max-h-[95vh] tw-flex tw-flex-col tw-overflow-hidden"
               (click)="$event.stopPropagation()">
            
            <!-- Modal Header (Fixed) -->
            <div class="nwfth-button-primary tw-p-3 md:tw-p-4 tw-rounded-t-lg tw-flex-shrink-0">
              <div class="tw-flex tw-items-center tw-justify-between">
                <h3 class="tw-text-base md:tw-text-lg tw-font-bold tw-text-white">Select Ingredient</h3>
                <button 
                  type="button"
                  (click)="closeItemSearchModal()"
                  class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                  ✕
                </button>
              </div>
            </div>

            <!-- Modal Content (Scrollable) -->
            <div class="tw-flex-1 tw-overflow-y-auto tw-p-3 md:tw-p-4">
              <!-- Loading Indicator -->
              <div *ngIf="isLoadingItemSearch()" class="tw-flex tw-items-center tw-justify-center tw-py-8">
                <div class="nwfth-loading-spinner"></div>
                <span class="tw-text-gray-700">Loading ingredients...</span>
              </div>

              <!-- Error Message -->
              <div *ngIf="itemSearchError()" class="tw-mb-4 tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg">
                <div class="tw-flex tw-items-center tw-gap-2">
                  <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                  <span class="tw-text-red-800 tw-font-medium">{{ itemSearchError() }}</span>
                </div>
              </div>

              <!-- Items Table -->
              <div *ngIf="!isLoadingItemSearch() && !itemSearchError() && itemSearchResults().length > 0" class="tw-overflow-x-auto">
                <div class="coffee-table">
                  <table class="tw-min-w-full">
                    <thead>
                      <tr>
                        <th class="coffee-header tw-min-w-[120px]">ItemKey</th>
                        <th class="coffee-header tw-min-w-[80px] tw-hidden">Location</th>
                        <th class="coffee-header tw-min-w-[80px]">LineID</th>
                        <th class="coffee-header tw-min-w-[200px]">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let item of itemSearchResults(); let i = index" 
                          [class]="i % 2 === 0 ? 'cream-row' : 'latte-row'"
                          (click)="selectItemFromModal(item)">
                        <td class="table-cell tw-font-mono tw-font-bold">{{ item.item_key }}</td>
                        <td class="table-cell tw-font-mono tw-hidden">{{ item.location }}</td>
                        <td class="table-cell tw-font-mono tw-font-semibold">{{ item.line_id }}</td>
                        <td class="table-cell tw-text-left tw-pl-4">{{ item.description }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- No Results -->
              <div *ngIf="!isLoadingItemSearch() && !itemSearchError() && itemSearchResults().length === 0" class="tw-text-center tw-py-8">
                <span class="tw-text-gray-500 tw-text-lg">🔍</span>
                <p class="tw-text-gray-600 tw-mt-2">No ingredients found for this run</p>
                <p class="tw-text-gray-500 tw-text-sm tw-mt-1">Please check the run number</p>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="tw-p-4 tw-bg-gray-50 tw-border-t tw-border-gray-200">
              <div class="tw-flex tw-flex-col sm:tw-flex-row tw-gap-3 sm:tw-justify-end">
                <button 
                  type="button"
                  (click)="closeItemSearchModal()"
                  class="tw-px-4 sm:tw-px-6 tw-py-2 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-semibold tw-rounded-lg tw-transition-colors tw-w-full sm:tw-w-auto">
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Lot Search Modal -->
        <div *ngIf="showLotSearchModal()" 
             class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
             (click)="closeLotSearchModal()">
          
          <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-sm sm:tw-max-w-md md:tw-max-w-2xl lg:tw-max-w-4xl xl:tw-max-w-5xl tw-mx-2 sm:tw-mx-4 tw-max-h-[95vh] tw-flex tw-flex-col tw-overflow-hidden"
               (click)="$event.stopPropagation()">
            
            <!-- Modal Header (Fixed) -->
            <div class="nwfth-button-primary tw-p-3 md:tw-p-4 tw-rounded-t-lg tw-flex-shrink-0">
              <div class="tw-flex tw-items-center tw-justify-between">
                <h3 class="tw-text-base md:tw-text-lg tw-font-bold tw-text-white">Select Lot</h3>
                <button 
                  type="button"
                  (click)="closeLotSearchModal()"
                  class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                  ✕
                </button>
              </div>
            </div>

            <!-- Modal Content (Scrollable) -->
            <div class="tw-flex-1 tw-overflow-y-auto tw-p-3 md:tw-p-4">
              <!-- Loading Indicator -->
              <div *ngIf="isLoadingLotSearch()" class="tw-flex tw-items-center tw-justify-center tw-py-8">
                <div class="nwfth-loading-spinner"></div>
                <span class="tw-text-gray-700">Loading lots...</span>
              </div>

              <!-- Error Message -->
              <div *ngIf="lotSearchError()" class="tw-mb-4 tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg">
                <div class="tw-flex tw-items-center tw-gap-2">
                  <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                  <span class="tw-text-red-800 tw-font-medium">{{ lotSearchError() }}</span>
                </div>
              </div>

              <!-- Lots Table with 6 columns as specified -->
              <div *ngIf="!isLoadingLotSearch() && !lotSearchError() && lotSearchResults().length > 0" class="tw-overflow-x-auto">
                <div class="coffee-table">
                  <table class="tw-min-w-full">
                    <thead class="tw-sticky tw-top-0">
                      <tr>
                        <th class="coffee-header tw-min-w-[100px] tw-text-xs md:tw-text-sm">LotNo</th>
                        <th class="coffee-header tw-min-w-[100px] tw-text-xs md:tw-text-sm">BinNo</th>
                        <th class="coffee-header tw-min-w-[100px] tw-text-xs md:tw-text-sm">DateExp</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">QtyOnHand</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">CommittedQty</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">QtyAvailable</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">BagsAvailable</th>
                        <th class="coffee-header tw-min-w-[80px] tw-text-xs md:tw-text-sm">PackSize</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let lot of lotSearchResults(); let i = index" 
                          [class]="i % 2 === 0 ? 'cream-row' : 'latte-row'"
                          (click)="selectLotFromModal(lot)">
                        <td class="table-cell tw-font-mono tw-font-bold tw-text-xs md:tw-text-sm">{{ lot.lot_no }}</td>
                        <td class="table-cell tw-font-mono tw-font-semibold tw-text-xs md:tw-text-sm">{{ lot.bin_no }}</td>
                        <td class="table-cell tw-font-mono tw-text-center tw-text-xs md:tw-text-sm">{{ lot.date_exp | date:'dd/MM/yyyy' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-text-xs md:tw-text-sm">{{ lot.qty_on_hand | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-text-xs md:tw-text-sm">{{ lot.committed_qty | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-text-xs md:tw-text-sm">{{ lot.available_qty | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-text-xs md:tw-text-sm tw-font-bold tw-text-green-700">{{ lot.available_bags }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-text-xs md:tw-text-sm tw-font-semibold tw-text-blue-700">{{ lot.pack_size | number:'1.2-2' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- No Results -->
              <div *ngIf="!isLoadingLotSearch() && !lotSearchError() && lotSearchResults().length === 0" class="tw-text-center tw-py-8">
                <span class="tw-text-gray-500 tw-text-lg">🔍</span>
                <p class="tw-text-gray-600 tw-mt-2">No lots found for this item</p>
                <p class="tw-text-gray-500 tw-text-sm tw-mt-1">Please check the item availability</p>
              </div>
            </div>

            <!-- Pagination Controls (between content and footer) -->
            <div *ngIf="!isLoadingLotSearch() && lotPaginationInfo() && lotPaginationInfo()!.total_pages > 1" 
                 class="tw-px-3 md:tw-px-4 tw-py-2 tw-bg-white tw-border-t tw-border-gray-200 tw-flex-shrink-0">
              <div class="tw-flex tw-flex-col sm:tw-flex-row tw-items-center tw-justify-between tw-gap-2">
                <!-- Pagination Info -->
                <div class="tw-text-xs md:tw-text-sm tw-text-gray-600 tw-text-center sm:tw-text-left">
                  Showing {{ (lotPaginationInfo()!.current_page - 1) * lotPaginationInfo()!.page_size + 1 }} 
                  to {{ Math.min(lotPaginationInfo()!.current_page * lotPaginationInfo()!.page_size, lotPaginationInfo()!.total_items) }} 
                  of {{ lotPaginationInfo()!.total_items }} lots
                </div>
                
                <!-- Pagination Controls -->
                <div class="tw-flex tw-items-center tw-gap-2 tw-flex-wrap tw-justify-center">
                  <!-- First/Previous -->
                  <button
                    type="button"
                    (click)="goToFirstLotPage()"
                    class="nwfth-pagination-button-small"
                    [disabled]="!lotPaginationInfo()!.has_previous">
                    First
                  </button>
                  <button
                    type="button"
                    (click)="goToPreviousLotPage()"
                    class="nwfth-pagination-button-small"
                    [disabled]="!lotPaginationInfo()!.has_previous">
                    ← Prev
                  </button>
                  
                  <!-- Page Numbers -->
                  <button
                    *ngFor="let page of getLotPaginationPages()"
                    type="button"
                    (click)="goToLotPage(page)"
                    class="nwfth-pagination-button-small"
                    [class.nwfth-pagination-active]="page === lotPaginationInfo()!.current_page">
                    {{ page }}
                  </button>
                  
                  <!-- Next/Last -->
                  <button
                    type="button"
                    (click)="goToNextLotPage()"
                    class="nwfth-pagination-button-small"
                    [disabled]="!lotPaginationInfo()!.has_next">
                    Next →
                  </button>
                  <button
                    type="button"
                    (click)="goToLastLotPage()"
                    class="nwfth-pagination-button-small"
                    [disabled]="!lotPaginationInfo()!.has_next">
                    Last
                  </button>
                </div>
              </div>
            </div>

            <!-- Modal Footer (Fixed) -->
            <div class="tw-p-3 md:tw-p-4 tw-bg-gray-50 tw-border-t tw-border-gray-200 tw-flex-shrink-0">
              <div class="tw-flex tw-justify-end">
                <button 
                  type="button"
                  (click)="closeLotSearchModal()"
                  class="tw-px-4 md:tw-px-6 tw-py-2 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-semibold tw-rounded-lg tw-transition-colors tw-text-sm">
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Bin Search Modal -->
        <div *ngIf="showBinSearchModal()" 
             class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
             (click)="closeBinSearchModal()">
          
          <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-sm sm:tw-max-w-md md:tw-max-w-2xl lg:tw-max-w-4xl tw-mx-2 sm:tw-mx-4 tw-max-h-[90vh] tw-overflow-hidden"
               (click)="$event.stopPropagation()">
            
            <!-- Modal Header -->
            <div class="nwfth-button-primary tw-p-4 tw-rounded-t-lg">
              <div class="tw-flex tw-items-center tw-justify-between">
                <h3 class="tw-text-lg tw-font-bold tw-text-white">Select Bin</h3>
                <button 
                  type="button"
                  (click)="closeBinSearchModal()"
                  class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                  ✕
                </button>
              </div>
            </div>

            <!-- Modal Content -->
            <div class="tw-p-4">
              <!-- Loading Indicator -->
              <div *ngIf="isLoadingBinSearch()" class="tw-flex tw-items-center tw-justify-center tw-py-8">
                <div class="nwfth-loading-spinner"></div>
                <span class="tw-text-gray-700">Loading bins...</span>
              </div>

              <!-- Error Message -->
              <div *ngIf="binSearchError()" class="tw-mb-4 tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg">
                <div class="tw-flex tw-items-center tw-gap-2">
                  <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                  <span class="tw-text-red-800 tw-font-medium">{{ binSearchError() }}</span>
                </div>
              </div>

              <!-- Bins Table with QtyOnHand, QtyCommitSales, AND Available Bags -->
              <div *ngIf="!isLoadingBinSearch() && !binSearchError() && availableBinsForLot().length > 0" class="tw-overflow-x-auto">
                <div class="coffee-table">
                  <table class="tw-min-w-full">
                    <thead>
                      <tr>
                        <th class="coffee-header tw-min-w-[100px] tw-text-xs md:tw-text-sm">BinNo</th>
                        <th class="coffee-header tw-min-w-[100px] tw-text-xs md:tw-text-sm">DateExp</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">QtyOnHand</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">CommittedQty</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">QtyAvailable</th>
                        <th class="coffee-header tw-min-w-[90px] tw-text-xs md:tw-text-sm">BagsAvailable</th>
                        <th class="coffee-header tw-min-w-[80px] tw-text-xs md:tw-text-sm">PackSize</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let bin of availableBinsForLot(); let i = index"
                          [class]="i % 2 === 0 ? 'cream-row' : 'latte-row'"
                          (click)="selectBinFromModal(bin)">
                        <td class="table-cell tw-font-mono tw-font-bold">{{ bin.bin_no }}</td>
                        <td class="table-cell tw-font-mono tw-text-center">{{ bin.date_exp | date:'MM/dd/yyyy' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right">{{ bin.qty_on_hand | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right">{{ bin.committed_qty | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right">{{ bin.available_qty | number:'1.2-2' }}</td>
                        <td class="table-cell tw-font-mono tw-text-right tw-font-bold tw-text-green-700">{{ bin.available_bags }}</td>
                        <td class="table-cell tw-font-mono tw-text-right">{{ bin.pack_size | number:'1.2-2' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- No Results -->
              <div *ngIf="!isLoadingBinSearch() && !binSearchError() && availableBinsForLot().length === 0" class="tw-text-center tw-py-8">
                <span class="tw-text-gray-500 tw-text-lg">🔍</span>
                <p class="tw-text-gray-600 tw-mt-2">No bins available for this lot</p>
                <p class="tw-text-gray-500 tw-text-sm tw-mt-1">Please validate a lot number first</p>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="tw-p-4 tw-bg-gray-50 tw-border-t tw-border-gray-200">
              <div class="tw-flex tw-flex-col sm:tw-flex-row tw-gap-3 sm:tw-justify-end">
                <button 
                  type="button"
                  (click)="closeBinSearchModal()"
                  class="tw-px-4 sm:tw-px-6 tw-py-2 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-semibold tw-rounded-lg tw-transition-colors tw-w-full sm:tw-w-auto">
                  Cancel
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Picked Lots Modal -->
        <div *ngIf="showPickedLotsModal()" 
             class="tw-fixed tw-inset-0 tw-bg-black tw-bg-opacity-50 tw-flex tw-items-center tw-justify-center tw-z-50 tw-p-4"
             (click)="closePickedLotsModal()">
          
          <div class="tw-bg-white tw-rounded-lg tw-shadow-xl tw-w-full tw-max-w-4xl lg:tw-max-w-5xl tw-mx-2 sm:tw-mx-4 tw-max-h-[90vh] tw-flex tw-flex-col tw-overflow-hidden"
               (click)="$event.stopPropagation()">
            
            <!-- Modal Header -->
            <div class="nwfth-button-primary tw-p-4 tw-rounded-t-lg tw-flex-shrink-0">
              <div class="tw-flex tw-items-center tw-justify-end">
                <button 
                  type="button"
                  (click)="closePickedLotsModal()"
                  class="tw-text-white tw-text-xl tw-w-8 tw-h-8 tw-flex tw-items-center tw-justify-center tw-rounded tw-bg-white/20 hover:tw-bg-white/30">
                  ✕
                </button>
              </div>
              <!-- Enhanced Header Information -->
              <div *ngIf="currentFormData()" class="tw-text-white tw-space-y-1">
                <div class="tw-text-lg tw-font-bold">Run# {{currentFormData()?.run?.run_no}}</div>
                <div>FG ItemKey: {{currentFormData()?.form_data?.fg_item_key}} 
                  <span *ngIf="currentFormData()?.run?.formula_desc"> - {{currentFormData()?.run?.formula_desc}}</span>
                </div>
              </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tw-border-b tw-border-gray-200 tw-px-4 tw-pt-2">
              <nav class="tw-flex tw-space-x-1" role="tablist">
                <button 
                  (click)="setActivePickedLotsTab('picked')"
                  [class]="activePickedLotsTab() === 'picked' ? 
                    'tw-bg-amber-100 tw-text-amber-700 tw-border-amber-500' : 
                    'tw-text-gray-500 hover:tw-text-gray-700 hover:tw-bg-gray-50'"
                  class="tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-border-b-2 tw-transition-colors tw-cursor-pointer"
                  type="button">
                  Picked lot details
                  <span *ngIf="pickedLotsData()?.picked_lots?.length" 
                        class="tw-ml-2 tw-bg-amber-500 tw-text-white tw-text-xs tw-px-2 tw-py-0.5 tw-rounded-full">
                    {{pickedLotsData()?.picked_lots?.length}}
                  </span>
                </button>
                <button 
                  (click)="setActivePickedLotsTab('pending')"
                  [class]="activePickedLotsTab() === 'pending' ? 
                    'tw-bg-amber-100 tw-text-amber-700 tw-border-amber-500' : 
                    'tw-text-gray-500 hover:tw-text-gray-700 hover:tw-bg-gray-50'"
                  class="tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-border-b-2 tw-transition-colors tw-cursor-pointer"
                  type="button">
                  Pending to Picked
                  <span *ngIf="filteredBatchItems().length"
                        class="tw-ml-2 tw-bg-blue-500 tw-text-white tw-text-xs tw-px-2 tw-py-0.5 tw-rounded-full">
                    {{filteredBatchItems().length}}
                  </span>
                </button>
              </nav>
            </div>

            <!-- Scrollable Content Area -->
            <div class="tw-flex-1 tw-overflow-auto tw-min-h-0">
              <!-- Loading State -->
              <div *ngIf="isLoadingPickedLots()" class="tw-flex tw-items-center tw-justify-center tw-py-8">
                <div class="tw-flex tw-items-center tw-gap-3">
                  <div class="tw-w-6 tw-h-6 tw-border-2 tw-border-amber-500 tw-border-t-transparent tw-rounded-full tw-animate-spin"></div>
                  <span class="tw-text-gray-600">Loading picked lots...</span>
                </div>
              </div>

              <!-- Error State -->
              <div *ngIf="pickedLotsError()" class="tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg tw-m-4">
                <div class="tw-flex tw-items-center tw-gap-2">
                  <span class="tw-text-red-600 tw-text-lg">⚠️</span>
                  <span class="tw-text-red-800 tw-font-medium">{{ pickedLotsError() }}</span>
                </div>
              </div>

              <!-- Tab Content -->
              <div *ngIf="pickedLotsData() && !isLoadingPickedLots()" class="tw-p-4">
                
                <!-- Picked Lots Tab -->
                <div *ngIf="activePickedLotsTab() === 'picked'">
                  <div class="tw-overflow-x-auto">
                    <table class="tw-min-w-full tw-divide-y tw-divide-gray-200">
                      <thead class="tw-bg-gray-50">
                        <tr>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Batch No</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Lot No.</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">ItemKey</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider tw-hidden">Location</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Expiry Date</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Qty Picked</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">BinNo</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Pack Size</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Bags</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody class="tw-bg-white tw-divide-y tw-divide-gray-200">
                        <tr *ngFor="let lot of pickedLotsData()!.picked_lots" class="hover:tw-bg-gray-50">
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{lot.batch_no}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{lot.lot_no}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{lot.item_key}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900 tw-hidden">{{lot.location_key}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">
                            {{lot.date_exp ? (lot.date_exp | date:'dd/MM/yyyy') : 'N/A'}}
                          </td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">
                            {{lot.alloc_lot_qty | number:'1.2-2'}} KG
                          </td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{lot.bin_no}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">
                            {{lot.pack_size | number:'1.2-2'}}
                          </td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">
                            {{getBagsCount(lot.alloc_lot_qty, lot.pack_size)}}
                          </td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm">
                            <button
                              type="button"
                              (click)="unpickLots(lot.lot_no, lot.row_num, lot.line_id, lot.lot_tran_no)"
                              [disabled]="isLoadingPickedLots() || currentRunStatus()?.status === 'PRINT'"
                              [title]="currentRunStatus()?.status === 'PRINT' ? 'Cannot delete when status is PRINT.' : 'Delete this picked lot'"
                              class="tw-px-2 tw-py-1 tw-text-xs tw-bg-red-500 hover:tw-bg-red-600 tw-text-white tw-rounded tw-transition-colors disabled:tw-opacity-50 disabled:tw-cursor-not-allowed">
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                        <tr *ngIf="!pickedLotsData()?.picked_lots?.length">
                          <td colspan="10" class="tw-px-3 tw-py-8 tw-text-center tw-text-gray-500">
                            No picked lots found
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Pending to Picked Tab -->
                <div *ngIf="activePickedLotsTab() === 'pending'">
                  <div class="tw-overflow-x-auto">
                    <table class="tw-min-w-full tw-divide-y tw-divide-gray-200">
                      <thead class="tw-bg-gray-50">
                        <tr>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Batch No</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">Item Key</th>
                          <th class="tw-px-3 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-uppercase tw-tracking-wider">To Picked Bulk Qty</th>
                        </tr>
                      </thead>
                      <tbody class="tw-bg-white tw-divide-y tw-divide-gray-200">
                        <tr *ngFor="let batch of filteredBatchItems()" class="hover:tw-bg-gray-50">
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{batch.batch_no}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">{{batch.item_key}}</td>
                          <td class="tw-px-3 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900">
                            {{batch.remaining_weight_kg | number:'1.2-2'}}
                          </td>
                        </tr>
                        <tr *ngIf="!filteredBatchItems().length">
                          <td colspan="3" class="tw-px-3 tw-py-8 tw-text-center tw-text-gray-500">
                            No pending batch requirements found
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="tw-p-4 tw-bg-gray-50 tw-border-t tw-border-gray-200 tw-flex-shrink-0">
              <div class="tw-flex tw-justify-between tw-gap-3">
                <!-- Unpick All Button -->
                <button
                  type="button"
                  *ngIf="pickedLotsData() && pickedLotsData()!.picked_lots.length > 0"
                  (click)="unpickLots()"
                  [disabled]="isLoadingPickedLots() || currentRunStatus()?.status === 'PRINT'"
                  [title]="currentRunStatus()?.status === 'PRINT' ? 'Cannot delete when status is PRINT.' : 'Delete all picked lots'"
                  class="tw-px-4 tw-py-2 tw-bg-red-600 hover:tw-bg-red-700 tw-text-white tw-font-semibold tw-rounded-lg tw-transition-colors disabled:tw-opacity-50 disabled:tw-cursor-not-allowed tw-text-sm">
                  🗑️ Delete All Lots
                </button>
                
                <!-- OK Button -->
                <button 
                  type="button"
                  (click)="closePickedLotsModal()"
                  class="tw-px-4 tw-py-2 tw-bg-gray-200 hover:tw-bg-gray-300 tw-text-gray-700 tw-font-semibold tw-rounded-lg tw-transition-colors tw-text-sm tw-ml-auto">
                  OK
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  `
})
export class BulkPickingComponent implements AfterViewInit {
  @ViewChild('runNumberInput') runNumberInput!: ElementRef<HTMLInputElement>;
  @ViewChild('lotNumberInput') lotNumberInput!: ElementRef<HTMLInputElement>;
  @ViewChild('binNumberInput') binNumberInput!: ElementRef<HTMLInputElement>;
  
  // Make Math available in template
  Math = Math;
  
  private fb = inject(FormBuilder);
  private router = inject(Router);
  bulkRunsService = inject(BulkRunsService);
  private bangkokTimezone = inject(BangkokTimezoneService);
  private printDataService = inject(PrintDataService);
  private runStatusManager = inject(RunStatusManager);
  private cdr = inject(ChangeDetectorRef);

  // Reactive signals for state management
  isSearchingRun = signal(false);
  isSearchingFGItem = signal(false);
  isSearchingItem = signal(false);
  isSearchingLot = signal(false);
  isSearchingBin = signal(false);
  isProcessing = signal(false);
  
  // ItemKey search modal state signals
  showItemSearchModal = signal(false);
  itemSearchResults = signal<RunItemSearchResult[]>([]);
  isLoadingItemSearch = signal(false);
  itemSearchError = signal<string | null>(null);
  
  // Manual ingredient selection state - prevents auto-switching when user manually selects ingredient
  manualIngredientSelection = signal(false);

  // INFINITE LOOP FIX: Loading state guards and debounce mechanism
  private palletLoadingStates = new Map<string, boolean>();
  private staleDataDetectionCooldowns = new Map<string, number>();
  private readonly STALE_DATA_COOLDOWN_MS = 2000; // 2-second cooldown for stale data detection

  // INGREDIENT LOADING PROTECTION: Simple mutex for ingredient loading operations
  private ingredientLoadingInProgress = false;
  
  // Lot search modal state signals
  showLotSearchModal = signal(false);
  lotSearchResults = signal<LotSearchResult[]>([]);
  isLoadingLotSearch = signal(false);
  lotSearchError = signal<string | null>(null);
  
  // Lot search pagination state
  lotCurrentPage = signal(1);
  lotPageSize = signal(10);
  lotPaginationInfo = signal<PaginationInfo | null>(null);
  
  // Bin search modal state signals
  showBinSearchModal = signal(false);
  availableBinsForLot = signal<LotSearchResult[]>([]);
  isLoadingBinSearch = signal(false);
  binSearchError = signal<string | null>(null);
  
  // Current form data from API
  currentFormData = signal<BulkRunFormData | null>(null);

  // Run field interaction state for click-to-clear functionality
  private previousRunValue: string = '';
  private runFieldClicked: boolean = false;
  private searchButtonClicked: boolean = false;
  searchResults = signal<BulkRunSearchResponse[]>([]);
  errorMessage = signal<string | null>(null);
  
  // Inventory status for current ingredient (Story 1.2)
  currentInventoryStatus = signal<InventoryStatus | null>(null);
  showInventoryAlerts = signal(false);
  
  // On-screen keyboard state
  showKeyboard = signal(false);
  keyboardInput = signal('');
  
  // Ingredient switch notification state
  switchNotification = signal<{show: boolean, message: string}>({ show: false, message: '' });
  
  // Auto-switching and notification signals for BME4 compliance
  consecutiveCompletedCount = signal(0);
  switchInProgress = signal(false);
  
  // Modal state for bulk run selection (Story 1.1.1)
  showRunModal = signal(false);
  modalRuns = signal<BulkRunSummary[]>([]);
  isLoadingModalData = signal(false);
  modalError = signal<string | null>(null);
  
  // Story 1.4: Pagination state for bulk runs modal
  currentPage = signal(1);
  pageSize = signal(10);
  paginationInfo = signal<PaginationInfo | null>(null);
  
  // Run status tracking for print status flag
  currentRunStatus = signal<BulkRunStatusResponse | null>(null);
  isLoadingStatus = signal(false);

  // Revert status state
  isRevertingStatus = signal(false);
  
  // Search functionality for modal
  searchControl = new FormControl('');
  isSearchingRuns = signal(false);
  hasSearchedRuns = signal(false);
  searchResultRuns = signal<BulkRunSummary[]>([]);

  // Picked lots modal state
  showPickedLotsModal = signal(false);
  pickedLotsData = signal<PickedLotsResponse | null>(null);
  batchWeightSummary = signal<BatchWeightSummaryResponse | null>(null);
  // Filtered batch items excluding zero remaining weight lines
  filteredBatchItems = computed(() => {
    const summary = this.batchWeightSummary();
    if (!summary?.batch_items) return [];
    return summary.batch_items.filter(item => Number(item.remaining_weight_kg) > 0);
  });
  isLoadingPickedLots = signal(false);
  pickedLotsError = signal<string | null>(null);
  selectedUnpickLot = signal<string | null>(null);
  showAllRuns = signal(true); // Flag to toggle between all runs and search results
  
  // Tab state for picked lots modal
  activePickedLotsTab = signal<'picked' | 'pending'>('picked');
  
  // Pallet data - fetched from API for real production tracking
  palletData = signal<PalletBatch[]>([]);
  palletBatches = signal<PalletBatch[]>([]);
  palletTrackingData = signal<PalletTrackingResponse | null>(null);
  isLoadingPalletData = signal(false);
  palletDataError = signal<string | null>(null);

  // Form definition
  productionForm: FormGroup;

  // Computed values
  firstPalletGroup = computed(() => {
    const pallets = this.palletData();
    // Validate pallet data structure
    const validPallets = pallets.filter(pallet => 
      pallet.hasOwnProperty('row_num') && 
      pallet.hasOwnProperty('pallet_number') && 
      pallet.hasOwnProperty('batch_number')
    );
    return validPallets.slice(0, 6);
  });

  secondPalletGroup = computed(() => {
    const pallets = this.palletData();
    // Validate pallet data structure
    const validPallets = pallets.filter(pallet => 
      pallet.hasOwnProperty('row_num') && 
      pallet.hasOwnProperty('pallet_number') && 
      pallet.hasOwnProperty('batch_number')
    );
    return validPallets.slice(6, 12);
  });

  // Removed computed signals - using API values directly from backend
  
  isFormValid = computed(() => {
    const form = this.productionForm;
    if (!form) return false;
    
    const hasRunNumber = form.get('runNumber')?.value?.trim();
    const hasItemKey = form.get('itemKey')?.value?.trim();
    
    return !!(hasRunNumber && hasItemKey);
  });

  constructor() {
    this.productionForm = this.fb.group({
      runNumber: ['', [Validators.required]],
      fgItemKeyId: [{ value: '', disabled: true }],
      fgItemKeyDesc: [{ value: '', disabled: true }],
      stPickingDate: [this.getCurrentDate()],
      sohValue: [{ value: 0, disabled: true }],
      sohUom: [{ value: '', disabled: true }],
      itemKey: [''],
      suggestedLotNumber: [{ value: '', disabled: true }],
      suggestedBinNumber: [{ value: '', disabled: true }],
      bulkPackSizeValue: [{ value: 0, disabled: true }],
      bulkPackSizeUom: [{ value: '', disabled: true }],
      // Total needed fields - 4-field layout (Field1 Field2 Field3 Field4)
      totalNeededBags: [{ value: '', disabled: true }],           // Field 1: from SQL (readonly)
      totalNeededBagsUom: [{ value: '', disabled: true }],        // Field 2: from SQL (readonly)  
      userInputBags: [0, [Validators.required, Validators.min(0)]], // Field 3: user input (editable)
      totalNeededWeightUom: [{ value: '', disabled: true }],      // Field 4: database UOM (readonly)
      // Calculated display field
      totalNeededKg: [{ value: '', disabled: true }],             // Calculated weight
      // Pending pick quantities (user selected but not yet picked)
      pendingPickBags: [{ value: 0, disabled: true }],           // Shows user input bags
      pendingPickKg: [{ value: '', disabled: true }],            // Shows calculated weight from user input
      // Remaining to pick fields - dual display (bags and weight) 
      remainingToPickBags: [{ value: '', disabled: true }],
      remainingBagsUom: [{ value: '', disabled: true }],
      remainingKg: [{ value: '', disabled: true }],
      remainingKgUom: [{ value: '', disabled: true }],
      lotNumber: [''], // Enable for barcode scanning
      binNumber: [''],
      binNo: [{ value: '', disabled: true }]
    });

    // Setup search with debouncing for bulk run modal
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      this.performRunSearch(query || '');
    });
  }

  ngAfterViewInit(): void {
    if (this.runNumberInput) {
      setTimeout(() => {
        this.runNumberInput.nativeElement.focus();
      }, 100);
    }
  }

  // Focus methods for different workflow stages
  focusLotNumberField(): void {
    if (this.lotNumberInput) {
      this.lotNumberInput.nativeElement.focus();
      this.lotNumberInput.nativeElement.select(); // Select any existing text for easy replacement
    }
  }
  
  // Alias for auto-switching workflow
  focusOnLotField(): void {
    this.focusLotNumberField();
  }

  // TrackBy function for pallet performance optimization
  trackByPalletId(index: number, item: any): number {
    return item.id || item.palletNumber || index;
  }

  getCurrentDate(): string {
    // Story 1.3 T1.3.4: Use Bangkok timezone for date display
    return this.bangkokTimezone.getCurrentDateString();
  }

  // Run field interaction methods for click-to-clear functionality
  onRunFieldClick(): void {
    this.previousRunValue = this.productionForm.get('runNumber')?.value || '';
    this.runFieldClicked = true;
    this.productionForm.get('runNumber')?.setValue('');
  }

  onRunFieldBlur(): void {
    const currentValue = this.productionForm.get('runNumber')?.value?.trim();

    // Skip restoration if user is clicking search button
    if (this.searchButtonClicked) {
      this.runFieldClicked = false;
      this.previousRunValue = '';
      return;
    }

    if (this.runFieldClicked && !currentValue) {
      this.productionForm.get('runNumber')?.setValue(this.previousRunValue);
    }
    this.runFieldClicked = false;
    this.previousRunValue = '';
  }

  onSearchButtonMouseDown(): void {
    this.searchButtonClicked = true;
  }

  // Search functions
  searchRun(): void {
    const runNumber = this.productionForm.get('runNumber')?.value?.trim();

    // Reset all field interaction states since user is taking action
    this.searchButtonClicked = false;
    this.runFieldClicked = false;
    this.previousRunValue = '';

    // Story 1.1.1: Show modal if run number field is blank
    if (!runNumber) {
      this.openRunSelectionModal();
      return;
    }

    // Reset component state when switching to new run to prevent state leakage
    this.resetComponentState();

    this.isSearchingRun.set(true);
    
    this.bulkRunsService.searchBulkRuns(runNumber).subscribe({
      next: (response) => {
        this.isSearchingRun.set(false);
        
        if (response.success && response.data && response.data.length > 0) {
          this.searchResults.set(response.data);
          // Get detailed form data for the first result
          const firstRun = response.data[0];
          this.loadFormData(firstRun.run.run_no);
        } else {
          this.searchResults.set([]);
          this.errorMessage.set(response.message || `No runs found for: ${runNumber}`);
        }
      },
      error: (error) => {
        this.isSearchingRun.set(false);
        
        // Provide more user-friendly error messages
        let userMessage = 'Failed to search runs';
        
        if (error.message) {
          if (error.message.includes('Failed to search bulk runs')) {
            userMessage = 'Database connection issue. Please try again or contact support if the problem persists.';
          } else if (error.message.includes('Failed to get run ingredients')) {
            userMessage = 'Some runs have data issues. Showing available runs only.';
          } else {
            userMessage = error.message;
          }
        }
        
        this.errorMessage.set(userMessage);
        console.error('Run search error:', error);
      }
    });
  }
  
  private loadFormData(runNo: number, ingredientIndex?: number): void {
    console.log(`🔄 LOAD FORM DATA: Called for run ${runNo}, ingredient index: ${ingredientIndex}, manual selection active: ${this.manualIngredientSelection()}`);
    
    // Skip if manual ingredient selection is active
    if (this.manualIngredientSelection()) {
      console.log(`🚫 BLOCKING loadFormData: Manual ingredient selection is active`);
      return;
    }
    
    this.bulkRunsService.getBulkRunFormData(runNo, ingredientIndex).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          // Load pallet tracking data for this run with current ingredient
          const currentItemKey = response.data.current_ingredient?.ingredient.item_key;
          this.loadPalletTrackingData(runNo, currentItemKey);
          // Refresh run-level picked data for print button status
          this.refreshRunLevelPickedData();
          // Refresh run status for status flag
          this.refreshRunStatus();
        } else {
          this.errorMessage.set(response.message || 'Failed to load run data');
        }
      },
      error: (error) => {
        this.errorMessage.set(error.message || 'Failed to load run data');
        console.error('Form data error:', error);
      }
    });
  }

  /**
   * Load pallet tracking data for the current run - Observable version for chaining
   */
  private loadPalletTrackingDataObservable(runNo: number, itemKey?: string): Observable<any> {
    this.isLoadingPalletData.set(true);
    this.palletDataError.set(null);

    return this.bulkRunsService.getPalletTrackingData(runNo, itemKey).pipe(
      tap((response) => {
        this.isLoadingPalletData.set(false);
        
        if (response.success && response.data) {
          this.palletTrackingData.set(response.data);
          
          // Validate pallet data structure from API response
          const validPallets = response.data.pallets.filter((pallet: any) => {
            // Ensure pallets have required fields
            return pallet.hasOwnProperty('row_num') && 
                   pallet.hasOwnProperty('pallet_number') && 
                   pallet.hasOwnProperty('batch_number');
          });
          
          this.palletData.set(validPallets);
          console.log(`✅ PALLET DATA: Successfully loaded ${validPallets.length} pallets for run ${runNo}`);
          // Note: Don't update remaining calculations here as API provides correct per-ingredient values
          // this.updateRemainingCalculations();
        } else {
          // Log warning but don't treat as critical error
          console.warn(`⚠️ PALLET DATA: Backend returned success=false for run ${runNo}. Message: ${response.message}`);
          console.warn(`⚠️ PALLET DATA: Using default values and continuing with form loading`);
          this.palletDataError.set(`${response.message || 'Failed to load pallet data'}\n(Using default values)`);
          // Set empty data to clear any existing pallet information
          this.palletTrackingData.set(null);
          this.palletData.set([]);
        }
      }),
      catchError((error) => {
        this.isLoadingPalletData.set(false);
        this.palletDataError.set(error.message || 'Failed to load pallet tracking data');
        // Set empty data to clear any existing pallet information
        this.palletTrackingData.set(null);
        this.palletData.set([]);
        console.error('Pallet data loading error:', error);
        
        // Re-throw error so calling code can handle it
        return throwError(() => error);
      })
    );
  }

  /**
   * Load pallet tracking data for the current run - void version for fire-and-forget calls
   */
  private loadPalletTrackingData(runNo: number, itemKey?: string): void {
    const loadKey = `${runNo}-${itemKey || 'default'}`;

    // INFINITE LOOP FIX: Prevent multiple simultaneous loads for same ingredient
    if (this.palletLoadingStates.get(loadKey)) {
      console.log(`⏸️ LOAD BLOCKED: Already loading pallet data for ${itemKey || 'default'} - preventing duplicate request`);
      return;
    }

    // Set loading state
    this.palletLoadingStates.set(loadKey, true);

    // DEFENSIVE LOGGING: Track which ingredient's pallet data is being loaded
    console.log(`🔄 PALLET DATA LOAD: Loading pallet data for run ${runNo}, ingredient: ${itemKey || 'default/first'}`);

    this.loadPalletTrackingDataObservable(runNo, itemKey).subscribe({
      next: () => {
        console.log(`✅ PALLET DATA LOADED: Successfully loaded pallet data for ingredient: ${itemKey || 'default/first'}`);

        // CRITICAL FIX: Recalculate remaining quantities after fresh pallet data loads
        // This ensures "Remaining to Pick" field updates with correct pallet-based values
        const currentItemKey = this.productionForm.get('itemKey')?.value;
        if (currentItemKey === itemKey) {
          console.log(`🔄 FRESH DATA: Recalculating remaining quantities for ${itemKey}`);
          this.calculateRemainingQuantities();
        }

        // Clear loading state on success
        this.palletLoadingStates.set(loadKey, false);
      },
      error: (error: any) => {
        // Error already handled in the Observable
        console.error('Pallet tracking data load failed:', error);

        // Clear loading state on error
        this.palletLoadingStates.set(loadKey, false);
      }
    });
  }

  /**
   * Refresh pallet tracking data for the current run
   * Public method for external calls (e.g., after pick confirmation)
   */
  refreshPalletData(): void {
    const runNo = this.productionForm.get('runNumber')?.value;
    const itemKey = this.productionForm.get('itemKey')?.value;
    if (runNo) {
      this.loadPalletTrackingData(runNo, itemKey);
    }
  }

  // Removed updateRemainingCalculations method - using API values directly
  
  private populateForm(formData: BulkRunFormData): void {
    const fields = formData.form_data;
    
    console.log(`📝 POPULATE FORM: Loading ingredient ${fields.item_key}, manual selection active: ${this.manualIngredientSelection()}`);
    
    // Format decimal values to 4 decimal places
    const formatDecimal = (value: string | number): string => {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(numValue) ? '0.0000' : numValue.toFixed(4);
    };
    
    this.productionForm.patchValue({
      runNumber: formData.run.run_no.toString(),
      fgItemKeyId: fields.fg_item_key,
      fgItemKeyDesc: formData.run.formula_desc, // Add FG item description
      stPickingDate: fields.st_picking_date,
      itemKey: fields.item_key,
      sohValue: formatDecimal(fields.soh_value), // Format to 4 decimals
      sohUom: fields.soh_uom,
      bulkPackSizeValue: formatDecimal(fields.bulk_pack_size_value), // Format to 4 decimals
      bulkPackSizeUom: fields.bulk_pack_size_uom,
      // Total needed - 4-field layout (Field1 Field2 Field3 Field4)  
      totalNeededBags: fields.total_needed_bags,                    // Field 1: from SQL (readonly)
      totalNeededBagsUom: fields.total_needed_bags_uom || 'BAGS',   // Field 2: from SQL (readonly)
      userInputBags: 0, // Field 3: Clear numpad when switching ingredients
      totalNeededWeightUom: this.getDynamicBagsUOM(fields.item_key) || 'BAGS', // Field 4: from database (changed to BAGS)
      totalNeededKg: 0, // Will be calculated from user input
      // Clear pending pick values when switching ingredients to prevent state leakage
      pendingPickBags: 0,
      pendingPickKg: '0.0000',
      // Remaining to pick - dual units (use CURRENT active pallet, not total across all pallets)
      remainingToPickBags: this.calculateCurrentPalletRemaining(), // Use current active pallet only
      remainingBagsUom: this.getDynamicBagsUOM(fields.item_key) || fields.remaining_bags_uom || 'BAGS',
      remainingKg: this.calculateCurrentPalletRemainingKg(), // Use current active pallet only
      remainingKgUom: this.getDynamicWeightUOM(fields.item_key) || fields.remaining_kg_uom || 'KG',
      // Initialize suggested lot/bin as empty - will be populated asynchronously using lot search API
      suggestedLotNumber: '',
      suggestedBinNumber: '',
      // Keep Lot # and Bin # empty for scanning workflow
      lotNumber: '',
      binNumber: ''
    });

    // Load suggested lot/bin using same business logic as lot search modal
    // This ensures consistency between suggest feature and lot search results
    this.loadSuggestedLot(formData.run.run_no, fields.item_key);

    // Auto-focus on Lot # field for barcode scanning
    setTimeout(() => this.focusLotNumberField(), 100);

    // Refresh inventory status for current ingredient (Story 1.2)
    this.refreshInventoryData(fields.item_key, parseFloat(fields.total_needed_bags));
  }

  /**
   * Load suggested lot/bin using same business logic as lot search modal
   * This ensures consistency between suggest feature and lot search results
   */
  private loadSuggestedLot(runNo: number, itemKey: string): void {
    this.bulkRunsService.getSuggestedLot(runNo, itemKey).subscribe({
      next: (suggestedLot) => {
        if (suggestedLot) {
          // Update form with suggested lot/bin data
          this.productionForm.patchValue({
            suggestedLotNumber: suggestedLot.lot_no,
            suggestedBinNumber: suggestedLot.bin_no
          });
          console.log(`✅ SUGGEST LOT: Using lot search API - Lot: ${suggestedLot.lot_no}, Bin: ${suggestedLot.bin_no}`);
        } else {
          // No suitable lot found - same result as lot search modal would show
          console.log(`⚠️ SUGGEST LOT: No suitable lots found for item ${itemKey} (consistent with lot search)`);
        }
      },
      error: (error) => {
        console.warn(`❌ SUGGEST LOT: Failed to load suggested lot for item ${itemKey}:`, error);
        // Don't throw error - this shouldn't break form loading
      }
    });
  }

  /**
   * Calculate remaining bags for CURRENT active pallet only (not total across all pallets)
   * This ensures "Remaining to Pick" header shows current pallet context, not run totals
   */
  private calculateCurrentPalletRemaining(): string {
    const palletData = this.palletData();
    if (!palletData?.length) {
      // Fallback to backend total if no pallet data available
      const currentData = this.currentFormData();
      return currentData ? this.formatDecimal(currentData.form_data.remaining_bags) : '0.0000';
    }

    // Find current active pallet (first pallet with remaining quantity > 0)
    const activePallet = palletData.find(p => p.no_of_bags_remaining > 0);
    return activePallet ? this.formatDecimal(activePallet.no_of_bags_remaining) : '0.0000';
  }

  /**
   * Calculate remaining KG for CURRENT active pallet only (not total across all pallets)
   * Maintains consistency with bag calculation for current pallet context
   */
  private calculateCurrentPalletRemainingKg(): string {
    const palletData = this.palletData();
    if (!palletData?.length) {
      const currentData = this.currentFormData();
      return currentData ? this.formatDecimal(currentData.form_data.remaining_kg) : '0.0000';
    }

    const activePallet = palletData.find(p => p.no_of_bags_remaining > 0);
    return activePallet ? this.formatDecimal(activePallet.quantity_remaining) : '0.0000';
  }

  /**
   * Update "Remaining to Pick" display values with current pallet calculations
   * Called after state changes (picks, unpicks, pallet switches) to maintain accuracy
   */
  private updateRemainingDisplayValues(): void {
    this.productionForm.patchValue({
      remainingToPickBags: this.calculateCurrentPalletRemaining(),
      remainingKg: this.calculateCurrentPalletRemainingKg()
    });
  }

  /**
   * Format decimal values consistently for display
   */
  private formatDecimal(value: string | number): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(numValue) ? '0.0000' : numValue.toFixed(4);
  }

  // Story 1.2: Inventory management methods
  private refreshInventoryData(itemKey: string, expectedQty: number): void {
    if (!itemKey) return;
    
    this.bulkRunsService.getInventoryAlerts(itemKey, expectedQty).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const alerts = response.data;
          const status: InventoryStatus = {
            item_key: itemKey,
            has_alerts: alerts.length > 0,
            alert_count: alerts.length,
            stock_status: this.determineStockStatus(alerts),
            alerts: alerts
          };
          
          this.currentInventoryStatus.set(status);
          
          // Show alerts if there are critical issues
          if (alerts.some(a => a.severity === 'Critical')) {
            this.showInventoryAlerts.set(true);
          }
        }
      },
      error: (error) => {
        console.warn('Failed to refresh inventory data:', error);
      }
    });
  }

  private determineStockStatus(alerts: InventoryAlert[]): 'Normal' | 'Low' | 'OutOfStock' | 'Expired' | 'Unknown' {
    if (alerts.some(a => a.alert_type.includes('OutOfStock'))) return 'OutOfStock';
    if (alerts.some(a => a.alert_type.includes('LowStock'))) return 'Low';
    if (alerts.some(a => a.alert_type.includes('Expired'))) return 'Expired';
    if (alerts.length > 0) return 'Unknown';
    return 'Normal';
  }

  toggleInventoryAlerts(): void {
    this.showInventoryAlerts.update(show => !show);
  }

  getStockStatusIcon(): string {
    const status = this.currentInventoryStatus()?.stock_status;
    switch (status) {
      case 'Normal': return '✅';
      case 'Low': return '⚠️';
      case 'OutOfStock': return '❌';
      case 'Expired': return '⏰';
      default: return '❓';
    }
  }

  getStockStatusColor(): string {
    const status = this.currentInventoryStatus()?.stock_status;
    switch (status) {
      case 'Normal': return 'tw-text-green-600';
      case 'Low': return 'tw-text-yellow-600';
      case 'OutOfStock': return 'tw-text-red-600';
      case 'Expired': return 'tw-text-orange-600';
      default: return 'tw-text-gray-600';
    }
  }

  // Story 1.2 T1.2.5: Ingredient navigation with auto-refresh
  navigateToNextIngredient(): void {
    const formData = this.currentFormData();
    if (!formData) return;

    const currentIndex = formData.form_data.ingredient_index;
    const runNo = formData.run.run_no;

    // Loading state managed by service
    this.errorMessage.set('');

    this.bulkRunsService.getNextIngredient(runNo, currentIndex).subscribe({
      next: (response) => {
        // Loading state managed by service
        if (response.success && response.data) {
          // Update form data with new ingredient
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          
          // Auto-refresh inventory data for new ingredient
          const newItemKey = response.data.form_data.item_key;
          const expectedQty = parseFloat(response.data.form_data.total_needed_kg);
          this.refreshInventoryData(newItemKey, expectedQty);
          
          // Refresh pallet tracking data for the run
          this.loadPalletTrackingData(runNo, newItemKey);
          
          console.log('Navigated to next ingredient:', newItemKey);
        } else {
          // Run is complete or no next ingredient
          this.errorMessage.set('No more ingredients in this run');
        }
      },
      error: (error) => {
        // Loading state managed by service
        this.errorMessage.set(error.message || 'Failed to navigate to next ingredient');
        console.error('Next ingredient navigation error:', error);
      }
    });
  }

  navigateToPreviousIngredient(): void {
    const formData = this.currentFormData();
    if (!formData) return;

    const currentIndex = formData.form_data.ingredient_index;
    const runNo = formData.run.run_no;

    // Navigate to previous ingredient (currentIndex - 1)
    if (currentIndex > 0) {
      // Loading state managed by service
      this.errorMessage.set('');

      this.bulkRunsService.getBulkRunFormData(runNo, currentIndex - 1).subscribe({
        next: (response) => {
          // Loading state managed by service
          if (response.success && response.data) {
            // Update form data with previous ingredient
            this.currentFormData.set(response.data);
            this.populateForm(response.data);
            
            // Auto-refresh inventory data for previous ingredient
            const newItemKey = response.data.form_data.item_key;
            const expectedQty = parseFloat(response.data.form_data.total_needed_kg);
            this.refreshInventoryData(newItemKey, expectedQty);
            
            // Refresh pallet tracking data for the run
            this.loadPalletTrackingData(runNo, newItemKey);
            
            console.log('Navigated to previous ingredient:', newItemKey);
          } else {
            this.errorMessage.set(response.message || 'Failed to navigate to previous ingredient');
          }
        },
        error: (error) => {
          // Loading state managed by service
          this.errorMessage.set(error.message || 'Failed to navigate to previous ingredient');
          console.error('Previous ingredient navigation error:', error);
        }
      });
    }
  }

  canNavigatePrevious(): boolean {
    const formData = this.currentFormData();
    return formData ? formData.form_data.ingredient_index > 0 : false;
  }

  canNavigateNext(): boolean {
    const formData = this.currentFormData();
    return formData ? formData.form_data.ingredient_index < formData.form_data.total_ingredients - 1 : false;
  }

  getCurrentIngredientInfo(): string {
    const formData = this.currentFormData();
    if (!formData) return '';
    return `Ingredient ${formData.form_data.ingredient_index + 1} of ${formData.form_data.total_ingredients}`;
  }

  // ItemKey search modal methods
  openItemSearchModal(): void {
    const currentFormData = this.currentFormData();
    if (!currentFormData) {
      this.errorMessage.set('No run data available for item search');
      return;
    }

    const runNo = currentFormData.run.run_no;
    this.showItemSearchModal.set(true);
    this.itemSearchError.set(null);
    this.loadItemSearchResults(runNo);
  }

  closeItemSearchModal(): void {
    this.showItemSearchModal.set(false);
    this.itemSearchResults.set([]);
    this.itemSearchError.set(null);
    this.isLoadingItemSearch.set(false);
  }

  loadItemSearchResults(runNo: number): void {
    this.isLoadingItemSearch.set(true);
    this.itemSearchError.set(null);

    this.bulkRunsService.searchRunItems(runNo).subscribe({
      next: (response) => {
        this.isLoadingItemSearch.set(false);
        
        if (response.success && response.data) {
          // Show ALL ingredients (both complete and incomplete) for full visibility
          this.itemSearchResults.set(response.data);
          console.log(`All ingredients loaded: ${response.data.length} ingredients available`);
        } else {
          this.itemSearchResults.set([]);
          this.itemSearchError.set(response.message || 'No items found for this run');
        }
      },
      error: (error) => {
        this.isLoadingItemSearch.set(false);
        this.itemSearchError.set(error.message || 'Failed to search run items');
        console.error('ItemKey search error:', error);
      }
    });
  }

  selectItemFromModal(item: RunItemSearchResult): void {
    const currentFormData = this.currentFormData();
    if (!currentFormData) {
      this.itemSearchError.set('No run data available');
      return;
    }

    const runNo = currentFormData.run.run_no;
    
    // Close modal first
    this.closeItemSearchModal();
    
    // Set manual selection flag to prevent auto-switching
    this.manualIngredientSelection.set(true);
    // Clear any existing timeout since user is actively selecting
    this.clearManualSelectionTimeout();
    console.log(`🎯 MANUAL SELECTION: User manually selected ${item.item_key}, blocking auto-switching`);
    
    // Load form data for the selected ingredient
    this.bulkRunsService.loadIngredientByItemKey(runNo, item.item_key).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          
          // Load pallet tracking data for this run with selected ingredient
          this.loadPalletTrackingData(runNo, item.item_key);
          
          // Auto-focus on Lot # field for next step in workflow
          setTimeout(() => this.focusLotNumberField(), 100);
          
          console.log('Manually switched to ingredient:', item.item_key);
        } else {
          this.errorMessage.set(response.message || 'Failed to load ingredient data');
        }
      },
      error: (error) => {
        // Enhanced error handling for post-unpick scenarios
        const errorMessage = error.message || 'Failed to switch to ingredient';
        
        // Check if this is a "no suitable batches" scenario after unpick operations
        if (errorMessage.includes('Failed to retrieve form data') || errorMessage.includes('No form data found')) {
          console.warn('🔄 No suitable batches found after unpick - attempting graceful recovery');
          this.handlePostUnpickIngredientSwitch(runNo, item.item_key);
        } else {
          this.errorMessage.set(errorMessage);
          console.error('Ingredient switching error:', error);
        }
      }
    });
  }

  // Lot search modal methods
  openLotSearchModal(): void {
    const currentFormData = this.currentFormData();
    if (!currentFormData) {
      this.errorMessage.set('No run data available for lot search');
      return;
    }

    const runNo = currentFormData.run.run_no;
    const itemKey = currentFormData.form_data.item_key;

    if (!itemKey) {
      this.errorMessage.set('No item key available for lot search');
      return;
    }

    this.showLotSearchModal.set(true);
    this.lotSearchError.set(null);
    this.loadLotSearchResults(runNo, itemKey);
  }

  closeLotSearchModal(): void {
    this.showLotSearchModal.set(false);
    this.lotSearchResults.set([]);
    this.lotSearchError.set(null);
    this.isLoadingLotSearch.set(false);
    // Reset pagination state
    this.lotCurrentPage.set(1);
    this.lotPaginationInfo.set(null);
  }

  loadLotSearchResults(runNo: number, itemKey: string): void {
    // Reset pagination and load first page
    this.lotCurrentPage.set(1);
    this.loadLotSearchResultsPaginated(1, runNo, itemKey);
  }

  loadLotSearchResultsPaginated(page: number, runNo?: number, itemKey?: string): void {
    const currentFormData = this.currentFormData();
    if (!currentFormData && (!runNo || !itemKey)) {
      this.lotSearchError.set('No run data available for lot search');
      return;
    }

    const targetRunNo = runNo || currentFormData!.run.run_no;
    const targetItemKey = itemKey || currentFormData!.form_data.item_key;
    const pageSize = this.lotPageSize();

    this.isLoadingLotSearch.set(true);
    this.lotSearchError.set(null);

    this.bulkRunsService.searchRunLotsPaginated(targetRunNo, targetItemKey, page, pageSize).subscribe({
      next: (response) => {
        this.isLoadingLotSearch.set(false);
        
        if (response.success && response.data) {
          this.lotSearchResults.set(response.data.lots);
          this.lotPaginationInfo.set(response.data.pagination);
          this.lotCurrentPage.set(response.data.pagination.current_page);
        } else {
          this.lotSearchResults.set([]);
          this.lotPaginationInfo.set(null);
          this.lotSearchError.set(response.message || 'No lots found for this item');
        }
      },
      error: (error) => {
        this.isLoadingLotSearch.set(false);
        this.lotSearchResults.set([]);
        this.lotPaginationInfo.set(null);
        this.lotSearchError.set(error.message || 'Failed to search lots');
        console.error('Lot search error:', error);
      }
    });
  }

  selectLotFromModal(lot: LotSearchResult): void {
    // Get all search results before closing modal (modal clears the results)
    const allSearchResults = this.lotSearchResults();
    
    // Close modal first
    this.closeLotSearchModal();
    
    // Populate lot number field with selected lot
    this.productionForm.patchValue({
      lotNumber: lot.lot_no
    });
    
    // Auto-populate bin number if available
    if (lot.bin_no) {
      this.productionForm.patchValue({
        binNumber: lot.bin_no
      });
    }
    
    // CRITICAL FIX: Populate availableBinsForLot with all bins for this lot
    // This enables the bin search functionality after lot selection
    const binsForSelectedLot = allSearchResults.filter(result => result.lot_no === lot.lot_no);
    this.availableBinsForLot.set(binsForSelectedLot);
    
    console.log('Selected lot:', lot.lot_no, 'from bin:', lot.bin_no);
    console.log('Available bins for lot search:', binsForSelectedLot.map(b => b.bin_no));
  }

  // Bin Search Modal Methods
  openBinSearchModal(): void {
    const availableBins = this.availableBinsForLot();
    
    if (availableBins.length === 0) {
      this.errorMessage.set('No bins available for the current lot');
      return;
    }

    this.showBinSearchModal.set(true);
    this.binSearchError.set(null);
    this.isLoadingBinSearch.set(false);
    
    console.log(`Opening bin search modal with ${availableBins.length} available bins`);
  }

  closeBinSearchModal(): void {
    this.showBinSearchModal.set(false);
    this.binSearchError.set(null);
    this.isLoadingBinSearch.set(false);
  }

  selectBinFromModal(bin: any): void {
    console.log('Selected bin from modal:', bin.bin_no);
    
    // Close the modal
    this.closeBinSearchModal();
    
    // Update the form with selected bin
    this.productionForm.patchValue({
      binNumber: bin.bin_no
    });
    
    console.log('Updated form with selected bin:', bin.bin_no);
  }

  searchItem(): void {
    // Updated to open modal instead of placeholder behavior
    this.openItemSearchModal();
  }

  searchLot(): void {
    // Always open lot search modal when user clicks search
    // This allows user to browse all available lots even if one is already selected
    this.openLotSearchModal();
  }

  // Barcode scanning workflow methods
  onLotNumberInput(): void {
    const lotNumber = this.productionForm.get('lotNumber')?.value?.trim();
    if (lotNumber && lotNumber.length > 0) {
      this.validateAndProcessLotNumber(lotNumber);
    }
  }

  onLotNumberChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const lotNumber = input.value?.trim();
    
    // Auto-validate only when lot number is complete (7 digits minimum)
    // This prevents validation of partial lot numbers during typing
    if (lotNumber && lotNumber.length >= 7) {
      // Typical lot numbers are 7 digits, trigger validation when we have a complete number
      this.validateAndProcessLotNumber(lotNumber);
    }
  }

  validateAndProcessLotNumber(lotNumber: string): void {
    const runNo = parseInt(this.productionForm.get('runNumber')?.value || '0');
    const itemKey = this.productionForm.get('itemKey')?.value?.trim();

    if (!runNo || !itemKey) {
      this.errorMessage.set('Please select a run and ingredient first');
      return;
    }

    console.log(`Validating lot number: ${lotNumber} for run: ${runNo}, item: ${itemKey}`);
    
    // Show loading state
    this.isSearchingLot.set(true);
    this.errorMessage.set(null);

    // Validate lot using the new service method
    this.bulkRunsService.validateLotForRun(runNo, lotNumber, itemKey).subscribe({
      next: (response) => {
        this.isSearchingLot.set(false);
        
        if (response.success && response.data && response.data.length > 0) {
          // Lot is valid - store all available bins and auto-populate first bin
          this.availableBinsForLot.set(response.data); // Store all bins for modal
          
          const lotData = response.data[0]; // Take first result for auto-population
          this.populateLotData(lotData);
          
          // Auto-focus on bin field for user to continue or search bins
          this.focusBinNumberField();
          
          console.log(`Lot ${lotNumber} validated successfully. Available bins:`, response.data.length);
          console.log('Available bins stored for bin search modal:', response.data.map(b => b.bin_no));
        } else {
          // Lot not found or not available
          this.errorMessage.set(`Lot ${lotNumber} not found or not available for ${itemKey}`);
          this.clearLotAndBinFields();
        }
      },
      error: (error) => {
        this.isSearchingLot.set(false);
        console.error('Lot validation error:', error);
        this.errorMessage.set(error.message || `Failed to validate lot ${lotNumber}`);
        this.clearLotAndBinFields();
      }
    });
  }

  populateLotData(lotData: any): void {
    // Update the form with lot-specific data
    this.productionForm.patchValue({
      lotNumber: lotData.lot_no,
      binNumber: lotData.bin_no,
      // You might want to update other fields like SOH based on the lot data
    });

    console.log('Populated form with lot data:', lotData.lot_no, 'bin:', lotData.bin_no);
  }

  clearLotAndBinFields(): void {
    this.productionForm.patchValue({
      lotNumber: '',
      binNumber: ''
    });
    // Clear available bins for lot
    this.availableBinsForLot.set([]);
  }

  focusBinNumberField(): void {
    if (this.binNumberInput) {
      // Use requestAnimationFrame to ensure DOM is ready and avoid focus conflicts
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            // Check if element is still available and not already focused
            if (this.binNumberInput?.nativeElement && 
                document.activeElement !== this.binNumberInput.nativeElement) {
              this.binNumberInput.nativeElement.focus();
              this.binNumberInput.nativeElement.select(); // Select any existing text for easy replacement
            }
          } catch (error) {
            // Silently handle focus errors to prevent console spam
            console.debug('Focus attempt on bin number field failed:', error);
          }
        }, 150);
      });
    }
  }

  searchBin(): void {
    // Check if lot has been validated and bins are available
    const availableBins = this.availableBinsForLot();
    
    if (availableBins.length === 0) {
      this.errorMessage.set('Please scan lot number first to see available bins');
      return;
    }

    // Open bin search modal with lot-specific bins
    this.openBinSearchModal();
  }

  // On-screen keyboard methods
  openKeyboard(): void {
    // Generic keyboard opener - deprecated, use specific methods
    this.keyboardInput.set('0');
    this.showKeyboard.set(true);
  }
  
  openKeyboardForUserInput(): void {
    // Open keyboard specifically for userInputBags field (Field 3)
    const currentValue = this.productionForm.get('userInputBags')?.value || 0;
    this.keyboardInput.set(currentValue.toString());
    this.showKeyboard.set(true);
  }
  
  onUserInputFocus(): void {
    // Auto-open keyboard when userInputBags field is focused  
    this.openKeyboardForUserInput();
  }
  
  // Deprecated methods - kept for backward compatibility
  openKeyboardForBags(): void {
    this.openKeyboardForUserInput();
  }
  
  onTotalNeededFocus(): void {
    this.onUserInputFocus();
  }

  closeKeyboard(): void {
    this.showKeyboard.set(false);
    this.keyboardInput.set('');
  }

  addNumber(num: number): void {
    const currentInput = this.keyboardInput();
    if (currentInput === '0') {
      // Replace leading zero
      this.keyboardInput.set(num.toString());
    } else if (currentInput.length < 4) {
      // Limit to 4 digits (max 9999 bags)
      this.keyboardInput.set(currentInput + num.toString());
    }
  }

  backspace(): void {
    const currentInput = this.keyboardInput();
    if (currentInput.length > 0) {
      const newInput = currentInput.slice(0, -1);
      this.keyboardInput.set(newInput || '0');
    }
  }

  clearInput(): void {
    this.keyboardInput.set('0');
  }

  confirmInput(): void {
    const inputValue = parseInt(this.keyboardInput()) || 0;
    
    // Validate quantity against batch requirements
    if (!this.validatePickQuantity(inputValue)) {
      return; // Error message already set in validatePickQuantity
    }
    
    // Update userInputBags field (Field 3) with user input
    this.productionForm.patchValue({
      userInputBags: inputValue
    });
    
    // Calculate weight based on user input and pack size
    this.calculateUserInputWeight();
    
    // NOTE: Do NOT update remaining quantities here - wait for actual pick confirmation
    // this.calculateRemainingQuantities(); // Removed - deferred until pick confirmation
    
    this.closeKeyboard();
  }
  
  private calculateUserInputWeight(): void {
    const userBags = this.productionForm.get('userInputBags')?.value || 0;
    const bulkPackSize = parseFloat(this.productionForm.get('bulkPackSizeValue')?.value) || 0;
    
    const totalKg = userBags * bulkPackSize;
    
    // Update pending pick quantities instead of totalNeededKg
    this.productionForm.patchValue({
      pendingPickBags: userBags,
      pendingPickKg: totalKg.toFixed(4),
      totalNeededKg: totalKg.toFixed(4)  // Keep for display compatibility
    });
  }
  
  // Validate pick quantity against batch requirements (BME4 validation with exact error messages)
  private validatePickQuantity(inputBags: number): boolean {
    const currentBatchData = this.getCurrentBatchData();
    if (!currentBatchData) {
      this.errorMessage.set('No batch data available for validation');
      return false;
    }
    
    const requiredBags = currentBatchData.toPickedBulkQty || 0;
    const alreadyPicked = currentBatchData.pickedBulkQty || 0;
    const remainingBags = requiredBags - alreadyPicked;
    const bulkPackSize = parseFloat(this.productionForm.get('bulkPackSizeValue')?.value) || 0;
    
    if (inputBags <= 0) {
      this.errorMessage.set('Please enter a valid quantity greater than 0');
      return false;
    }
    
    // BME4 exact validation message for over-picking (no space between number and KG)
    if (inputBags > remainingBags) {
      const maxKg = remainingBags * bulkPackSize;
      this.errorMessage.set(`Quantity picked is more than Qty Required ${maxKg.toFixed(0)}KG`);
      return false;
    }
    
    // Additional validation for lot availability
    const lotNumber = this.productionForm.get('lotNumber')?.value;
    const binNumber = this.productionForm.get('binNumber')?.value || this.productionForm.get('binNo')?.value;
    
    if (lotNumber && binNumber) {
      const availableLots = this.availableBinsForLot();
      const selectedBin = availableLots.find(bin => bin.bin_no === binNumber);
      
      if (selectedBin) {
        const availableQty = selectedBin.qty_on_hand - selectedBin.committed_qty;
        const requiredQty = inputBags * bulkPackSize;
        
        if (requiredQty > availableQty) {
          this.errorMessage.set(`Not enough quantity available in bin ${binNumber}. Available: ${availableQty.toFixed(4)} KG`);
          return false;
        }
      }
    }
    
    this.errorMessage.set(null);
    return true;
  }
  
  // Get current batch data for validation (using real pallet data with sequential ordering)
  private getCurrentBatchData(): { toPickedBulkQty: number; pickedBulkQty: number; } | null {
    const currentFormData = this.currentFormData();
    if (!currentFormData?.current_ingredient?.ingredient) {
      console.warn('🔍 getCurrentBatchData: No current ingredient data available');
      return null;
    }
    
    const currentRowNum = currentFormData.current_ingredient.ingredient.row_num;
    const pallets = this.palletData();
    
    console.log(`🔍 getCurrentBatchData: Looking for pallet with RowNum ${currentRowNum} from ${pallets.length} pallets`);
    
    // Sort pallets by batch_number ascending to ensure sequential processing (850828→850829→850830...)
    const sortedPallets = [...pallets].sort((a: any, b: any) => {
      const aBatchNum = parseInt(a.batch_number?.toString() || '0');
      const bBatchNum = parseInt(b.batch_number?.toString() || '0');
      return aBatchNum - bBatchNum; // Ascending order for sequential processing by batch
    });
    
    // CRITICAL FIX: Find the pallet that matches current form coordinates (RowNum)
    // If not found, use the first incomplete pallet (fallback for timing issues)
    let currentPallet = sortedPallets.find(p => parseInt(p.row_num?.toString() || '0') === currentRowNum);
    
    // Fallback: If exact match not found, find first incomplete pallet
    if (!currentPallet || parseFloat(currentPallet.no_of_bags_remaining?.toString() || '0') <= 0) {
      console.warn(`⚠️ Pallet RowNum ${currentRowNum} not found or completed, finding first incomplete pallet`);
      currentPallet = sortedPallets.find(p => parseFloat(p.no_of_bags_remaining?.toString() || '0') > 0);
    }
    
    // Ultimate fallback: Use first pallet
    if (!currentPallet) {
      currentPallet = sortedPallets[0];
    }
    
    if (currentPallet) {
      // Use actual pallet data
      const remainingBags = parseFloat(currentPallet.no_of_bags_remaining?.toString() || '0');
      const pickedBags = parseFloat(currentPallet.no_of_bags_picked?.toString() || '0');
      
      console.log(`📊 getCurrentBatchData: Using pallet ${currentPallet.batch_number} (RowNum: ${currentPallet.row_num}) for validation - ${remainingBags} remaining, ${pickedBags} picked`);
      
      return {
        toPickedBulkQty: remainingBags + pickedBags, // Total capacity of this pallet  
        pickedBulkQty: pickedBags                     // How many bags already picked from this pallet
      };
    }
    
    // Fallback to form data if pallet not found
    console.warn(`🔍 getCurrentBatchData: Pallet not found for RowNum ${currentRowNum}, using form data fallback`);
    const remainingBags = parseFloat(currentFormData.form_data.remaining_bags || '0');
    const pickedBags = 0; // Cannot determine picked quantity from form data
    
    return {
      toPickedBulkQty: remainingBags,
      pickedBulkQty: pickedBags
    };
  }
  
  // Determine batch header class based on pick status
  getBatchHeaderClass(pallet: PalletBatch): string {
    const remainingBags = parseFloat(pallet.no_of_bags_remaining?.toString() || '0');
    const pickedBags = parseFloat(pallet.no_of_bags_picked?.toString() || '0');
    
    if (remainingBags === 0 && pickedBags > 0) {
      return 'completed';    // Green for completed batches
    } else if (pickedBags > 0 && remainingBags > 0) {
      return 'in-progress';  // Amber for partial batches
    } else {
      return 'unpicked';     // Brown for unpicked batches
    }
  }
  
  // Determine data cell background class based on pick status
  getDataCellClass(pallet: any): string {
    // Validate pallet data structure
    if (!pallet || !pallet.hasOwnProperty('no_of_bags_remaining') || !pallet.hasOwnProperty('no_of_bags_picked')) {
      return 'data-cell-unpicked';  // Default for invalid data
    }
    
    const remainingBags = parseFloat(pallet.no_of_bags_remaining?.toString() || '0');
    const pickedBags = parseFloat(pallet.no_of_bags_picked?.toString() || '0');
    
    if (remainingBags === 0 && pickedBags > 0) {
      return 'data-cell-completed';    // Light green for completed batches
    } else if (pickedBags > 0 && remainingBags > 0) {
      return 'data-cell-in-progress';  // Light amber for partial batches
    } else {
      return 'data-cell-unpicked';     // Light brown for unpicked batches
    }
  }
  
  private calculateRemainingQuantities(): void {
    // UNIFIED STATE MANAGEMENT: Use same data source as completion logic
    // This prevents state conflicts between display and completion calculations
    const formData = this.currentFormData();

    if (formData?.current_ingredient?.calculations) {
      // UNIFIED: Use calculations.remaining_to_pick (same as completion logic)
      const remainingBags = parseFloat(formData.current_ingredient.calculations.remaining_to_pick || '0');
      const packSize = parseFloat(formData.current_ingredient.ingredient.pack_size || '0');
      const remainingKg = remainingBags * packSize;

      // VALIDATION: Add debugging for unpick scenarios
      const totalNeeded = parseFloat(formData.current_ingredient.calculations.total_needed || '0');
      const pickedSoFar = totalNeeded - remainingBags;

      console.log(`🎯 UNIFIED_STATE: Using same data source as completion logic:`);
      console.log(`  - Total needed: ${totalNeeded} bags`);
      console.log(`  - Picked so far: ${pickedSoFar} bags`);
      console.log(`  - Remaining: ${remainingBags} bags`);
      console.log(`  - Remaining KG: ${remainingKg} kg`);

      // VALIDATION: Check for inconsistencies that could indicate backend calculation errors
      if (remainingBags < 0) {
        console.warn(`⚠️ VALIDATION: Negative remaining bags detected: ${remainingBags}`);
      }
      if (remainingBags > totalNeeded) {
        console.warn(`⚠️ VALIDATION: Remaining bags (${remainingBags}) exceeds total needed (${totalNeeded})`);
      }

      // CRITICAL: Use pallet-aware calculations instead of backend totals
      // This ensures "Remaining to Pick" shows current active pallet, not total across all pallets
      this.productionForm.patchValue({
        remainingToPickBags: this.calculateCurrentPalletRemaining(),
        remainingKg: this.calculateCurrentPalletRemainingKg()
      });
    } else if (formData?.form_data) {
      // FALLBACK: Use form_data if calculations not available
      const remainingBags = parseFloat(formData.form_data.remaining_bags || '0');
      const remainingKg = parseFloat(formData.form_data.remaining_kg || '0');

      console.warn(`⚠️ UNIFIED_STATE: Using fallback form_data source: ${remainingBags} bags, ${remainingKg} kg`);

      this.productionForm.patchValue({
        remainingToPickBags: this.calculateCurrentPalletRemaining(),
        remainingKg: this.calculateCurrentPalletRemainingKg()
      });
    } else {
      // EMERGENCY: Only when backend data is completely unavailable
      console.error(`🚨 UNIFIED_STATE: No backend data available, using emergency fallback`);

      this.productionForm.patchValue({
        remainingToPickBags: '0.0000',
        remainingKg: '0.0000'
      });

      // Log warning for debugging
      const currentItemKey = this.productionForm.get('itemKey')?.value;
      const runNumber = this.productionForm.get('runNumber')?.value;
      console.warn(`⚠️ Missing backend data for calculation: Run ${runNumber}, Ingredient ${currentItemKey}`);
    }
  }

  // Pick confirmation method - called when user confirms the actual pick operation
  confirmPickOperation(): void {
    // Clear manual selection timeout since user is actively picking
    if (this.manualIngredientSelection()) {
      this.clearManualSelectionTimeout();
    }
    
    const pendingBags = this.productionForm.get('pendingPickBags')?.value || 0;
    const lotNumber = this.productionForm.get('lotNumber')?.value;
    const binNumber = this.productionForm.get('binNumber')?.value || this.productionForm.get('binNo')?.value;
    const runNumber = this.productionForm.get('runNumber')?.value;
    const itemKey = this.productionForm.get('itemKey')?.value;
    
    // Validate that user has selected quantity, lot, and bin
    if (pendingBags === 0) {
      this.errorMessage.set('Please select quantity using numpad first');
      return;
    }
    
    if (!lotNumber || lotNumber.trim() === '') {
      this.errorMessage.set('Please select a lot number using the lot search button or enter manually');
      return;
    }
    
    if (!binNumber || binNumber.trim() === '') {
      this.errorMessage.set('Please select a bin number first');
      return;
    }

    if (!runNumber || runNumber.trim() === '') {
      this.errorMessage.set('Please select a run number first');
      return;
    }

    if (!itemKey || itemKey.trim() === '') {
      this.errorMessage.set('Please select an ingredient first');
      return;
    }

    // Extract row_num and line_id from current ingredient data
    const currentData = this.currentFormData();
    if (!currentData?.current_ingredient?.ingredient) {
      this.errorMessage.set('Current ingredient data not available');
      return;
    }
    
    const lineId = currentData.current_ingredient.ingredient.line_id;
    
    // CRITICAL FIX: Find the FIRST AVAILABLE pallet (one with remaining quantity > 0)
    // We need to use the first pallet that still needs picking, not the current ingredient's RowNum
    const pallets = this.palletData();
    if (!pallets || pallets.length === 0) {
      this.errorMessage.set('No pallet data available for pick operation');
      return;
    }
    
    // Sort pallets by batch_number ascending and find first one with remaining bags > 0
    const sortedPallets = [...pallets].sort((a: any, b: any) => {
      const aBatchNum = parseInt(a.batch_number?.toString() || '0');
      const bBatchNum = parseInt(b.batch_number?.toString() || '0');
      return aBatchNum - bBatchNum; // Ascending order for sequential processing by batch
    });
    
    // Find the first pallet with remaining bags > 0
    const availablePallet = sortedPallets.find(p => {
      const remainingBags = parseInt(p.no_of_bags_remaining?.toString() || '0');
      return remainingBags > 0;
    });
    
    if (!availablePallet) {
      this.errorMessage.set('No available pallets found for pick operation');
      return;
    }
    
    const rowNum = parseInt(availablePallet.row_num?.toString() || '0'); // Use FIRST AVAILABLE pallet's RowNum
    const palletNumber = availablePallet.batch_number;
    
    // DEFENSIVE VALIDATION: Ensure coordinates are valid before sending to backend
    if (!rowNum || !lineId || rowNum <= 0 || lineId <= 0) {
      console.error(`❌ COORDINATE VALIDATION: Invalid coordinates - RowNum: ${rowNum}, LineId: ${lineId}`);
      this.errorMessage.set(`Invalid pallet coordinates (Row: ${rowNum}, LineId: ${lineId}). Please refresh and try again.`);
      return;
    }
    
    // DEFENSIVE LOGGING: Log coordinates being sent to backend for debugging
    console.log(`🎯 PICK CONFIRMATION: Using FIRST AVAILABLE coordinates - RowNum: ${rowNum} (Pallet: ${palletNumber}), LineId: ${lineId}, ItemKey: ${itemKey}, RunNo: ${runNumber}`);
    
    // Call pick confirmation API - runNumber and itemKey are already validated above
    this.confirmPickWithBackend({
      runNo: runNumber,
      rowNum: rowNum,
      lineId: lineId,
      pickedBulkQty: pendingBags,
      lotNo: lotNumber,
      binNo: binNumber
    });
  }
  
  // Call backend API for pick confirmation
  private confirmPickWithBackend(pickData: any): void {
    console.log('🔄 Validating data synchronization before pick confirmation...');

    this.bulkRunsService.confirmPick(pickData).subscribe({
      next: (response) => {
        console.log('✅ Pick confirmation successful:', response);

        // RACE CONDITION FIX: Single atomic state refresh operation
        this.refreshAllStateAfterPick(pickData.pickedBulkQty, pickData.lotNo, pickData.binNo);
      },
      error: (error) => {
        console.error('Pick confirmation failed:', error);
        
        // Handle different error types with appropriate responses
        const msg = error?.message || '';
        
        // NEW: Handle transaction rollback errors (database is consistent, no refresh needed)
        if (msg.includes('TRANSACTION_ROLLED_BACK')) {
          console.info('🔒 Transaction was safely rolled back - database is consistent, no refresh needed');
          this.errorMessage.set(this.formatUserFriendlyError(error));
          // Service automatically manages loading states - no manual intervention needed
        }
        // CRITICAL: Handle complete transaction failure (requires IT support)
        else if (msg.includes('TRANSACTION_FAILED') && msg.includes('ROLLBACK_ALSO_FAILED')) {
          console.error('🚨 CRITICAL: Transaction failed AND rollback failed - database may be inconsistent!');
          this.errorMessage.set(this.formatUserFriendlyError(error));
          // Don't attempt any automatic recovery for critical failures
        }
        // Handle batch completion errors with auto-refresh (legacy behavior)
        else if (msg.includes('BATCH_ALREADY_COMPLETED') || msg.includes('This batch is already completed')) {
          console.warn('🔄 Batch already completed - loading next unpicked batch automatically...');
          this.handleBatchCompletionError(pickData, error);
        }
        // Handle pallet advancement validation errors (enhanced for systematic fixes)
        else if (msg.includes('Qty Required 0') || msg.includes('ToPickedBulkQty=0') || msg.includes('data synchronization issue')) {
          console.warn('🔄 Pallet advancement validation error - attempting intelligent recovery...');
          this.handlePalletAdvancementError(pickData, error);
        }
        // Handle other synchronization issues
        else if (msg.includes('DATABASE_RECORD_NOT_FOUND')) {
          console.warn('🔄 Database record synchronization issue detected - attempting to refresh and retry...');
          this.handleDataSyncError(pickData, error);
        } else {
          this.errorMessage.set(this.formatUserFriendlyError(error));
        }
      }
    });
  }
  
  // Handle batch completion errors by loading next unpicked batch or switching ingredients
  private handleBatchCompletionError(pickData: any, originalError: any): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentIngredient = this.productionForm.get('itemKey')?.value;
    
    if (!runNumber || !currentIngredient) {
      this.errorMessage.set('Batch completion error - missing run or ingredient information');
      return;
    }
    
    console.log('🔄 Checking if ingredient is complete or has more batches...', currentIngredient);
    
    // Show user-friendly message while checking
    this.errorMessage.set('This batch is already completed. Checking for next available batch or ingredient...');
    
    // First check if current ingredient is completely finished by getting fresh data
    this.bulkRunsService.loadIngredientByItemKey(parseInt(runNumber, 10), currentIngredient).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Check if this ingredient still has remaining quantity to pick
          const remainingToPick = parseFloat(response.data.current_ingredient?.calculations?.remaining_to_pick || '0');
          
          if (remainingToPick <= 0.001) {
            // Ingredient is completely finished - switch to next ingredient
            console.log('✅ Ingredient', currentIngredient, 'is completely finished. Switching to next ingredient...');
            this.errorMessage.set('Ingredient completed! Loading next ingredient...');
            this.autoSwitchToNextIngredient(currentIngredient);
          } else {
            // Ingredient still has remaining quantity - load next batch of same ingredient
            console.log('🔄 Ingredient', currentIngredient, 'still has', remainingToPick, 'remaining. Loading next batch...');
            this.currentFormData.set(response.data);
            this.populateForm(response.data);
            
            // Clear the error message
            this.errorMessage.set(null);
            
            // Show success notification
            setTimeout(() => {
              console.log('📢 Ready for picking next batch of', currentIngredient);
            }, 100);
          }
        } else {
          // No data returned - ingredient might be completely finished, try switching
          console.log('⚠️ No data returned for ingredient', currentIngredient, '- attempting to switch to next ingredient');
          this.autoSwitchToNextIngredient(currentIngredient);
        }
      },
      error: (refreshError) => {
        console.error('❌ Failed to load next batch:', refreshError);
        this.errorMessage.set(`Failed to load next batch: ${this.formatUserFriendlyError(refreshError)}`);
      }
    });
  }

  // Explicit refresh action for the error UI
  refreshCurrentIngredient(): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentIngredient = this.productionForm.get('itemKey')?.value;
    if (!runNumber || !currentIngredient) {
      return;
    }
    this.errorMessage.set('Refreshing… Loading the next available batch...');
    this.bulkRunsService.loadIngredientByItemKey(parseInt(runNumber, 10), currentIngredient).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          this.errorMessage.set(null);
        }
      },
      error: (err) => {
        this.errorMessage.set(this.formatUserFriendlyError(err));
      }
    });
  }
  
  // Handle pallet advancement validation errors with intelligent recovery
  private handlePalletAdvancementError(pickData: any, originalError: any): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentIngredient = this.productionForm.get('itemKey')?.value;
    
    if (!runNumber || !currentIngredient) {
      this.errorMessage.set('Pallet advancement failed - missing run or ingredient information');
      return;
    }
    
    console.log('🎯 Pallet advancement validation failed - investigating and recovering...', originalError);
    
    // Show user-friendly message while recovering
    this.errorMessage.set('Pallet data synchronization issue detected. Reloading current ingredient...');
    
    // Use coordinate-specific loading to ensure we get the right pallet state
    const currentRowNum = this.productionForm.get('rowNum')?.value;
    const currentLineId = this.productionForm.get('lineId')?.value;
    
    if (currentRowNum && currentLineId) {
      // Try coordinate-specific loading first (more precise)
      console.log(`🎯 Attempting coordinate-specific reload: ItemKey=${currentIngredient}, RowNum=${currentRowNum}, LineId=${currentLineId}`);
      
      this.bulkRunsService.loadIngredientByItemKeyAndCoordinates(runNumber, currentIngredient, currentRowNum, currentLineId).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            console.log('✅ Coordinate-specific reload successful');
            this.currentFormData.set(response.data);
            this.populateForm(response.data);
            this.errorMessage.set(null);
            
            // Show success notification
            setTimeout(() => {
              console.log('📢 Pallet data synchronized - ready for picking');
            }, 100);
          } else {
            console.log('⚠️ Coordinate-specific reload failed, falling back to general ingredient reload');
            this.fallbackToIngredientReload(runNumber, currentIngredient);
          }
        },
        error: (coordinateError) => {
          console.warn('❌ Coordinate-specific reload failed:', coordinateError);
          this.fallbackToIngredientReload(runNumber, currentIngredient);
        }
      });
    } else {
      // Fall back to general ingredient reload
      this.fallbackToIngredientReload(runNumber, currentIngredient);
    }
  }

  // Fallback method for pallet advancement recovery
  private fallbackToIngredientReload(runNumber: string, currentIngredient: string): void {
    console.log('🔄 Using fallback ingredient reload for pallet advancement recovery');
    
    this.bulkRunsService.loadIngredientByItemKey(parseInt(runNumber, 10), currentIngredient).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('✅ Fallback ingredient reload successful');
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          this.errorMessage.set(null);
        } else {
          console.log('❌ No more available batches found for ingredient:', currentIngredient);
          this.errorMessage.set('All available pallets for this ingredient appear to be completed. Please select a different ingredient or refresh the run.');
        }
      },
      error: (fallbackError) => {
        console.error('❌ Fallback reload also failed:', fallbackError);
        this.errorMessage.set(`Pallet advancement recovery failed: ${this.formatUserFriendlyError(fallbackError)}`);
      }
    });
  }

  // Handle data synchronization errors with retry mechanism
  private handleDataSyncError(pickData: any, originalError: any): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentIngredient = this.productionForm.get('itemKey')?.value;
    
    if (!runNumber || !currentIngredient) {
      this.errorMessage.set('Data synchronization failed - missing run or ingredient information');
      return;
    }
    
    console.log('🔄 Refreshing data and retrying pick confirmation...');
    
    // Refresh form data and retry once
    this.bulkRunsService.loadIngredientByItemKey(parseInt(runNumber, 10), currentIngredient).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('✅ Data refreshed, retrying pick confirmation...');
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          
          // Retry pick confirmation once
          this.bulkRunsService.confirmPick(pickData).subscribe({
            next: (retryResponse) => {
              console.log('✅ Retry successful:', retryResponse);
              // Use atomic refresh instead of multiple separate operations
              this.refreshAllStateAfterPick(pickData.pickedBulkQty, pickData.lotNo, pickData.binNo);
            },
            error: (retryError) => {
              console.error('❌ Retry failed:', retryError);
              this.errorMessage.set(`Pick confirmation failed after data refresh: ${this.formatUserFriendlyError(retryError)}`);
            }
          });
        }
      },
      error: (refreshError) => {
        console.error('❌ Data refresh failed:', refreshError);
        this.errorMessage.set(`Data synchronization failed: ${this.formatUserFriendlyError(originalError)}`);
      }
    });
  }
  
  // Format user-friendly error messages
  private formatUserFriendlyError(error: any): string {
    const message = (error && error.message) ? error.message : error?.toString?.() || '';
    
    // Transaction rollback errors (new atomic transaction system)
    if (message.includes('TRANSACTION_ROLLED_BACK')) {
      const cleanError = message.replace('TRANSACTION_ROLLED_BACK:', '').trim();
      if (cleanError.includes('type conversion') || cleanError.includes('sequence')) {
        return 'Transaction was safely rolled back due to a system error. The database is consistent. Please try again.';
      } else if (cleanError.includes('QUANTITY_VALIDATION_FAILED')) {
        return 'Transaction was rolled back: Invalid quantity specified. Please check your input and try again.';
      } else if (cleanError.includes('BATCH_ALREADY_COMPLETED')) {
        return 'Transaction was rolled back: This batch was already completed by another user. Please refresh to load the next batch.';
      } else {
        return `Transaction was safely rolled back: ${cleanError}. The database is consistent. Please try again.`;
      }
    }

    // Critical transaction failure errors
    if (message.includes('TRANSACTION_FAILED') && message.includes('ROLLBACK_ALSO_FAILED')) {
      return 'Critical system error: Transaction failed and rollback also failed. Please contact IT support immediately.';
    }

    // Batch completion errors (legacy handling for backward compatibility)
    if (message.includes('BATCH_ALREADY_COMPLETED') || message.includes('This batch is already completed')) {
      return 'This batch is already completed. Please refresh to load the next batch.';
    }
    
    if (message.includes('INSUFFICIENT_BATCH_QUANTITY') || message.includes('Only') && message.includes('bags remaining')) {
      return 'Not enough quantity remaining in this batch. Please reduce the quantity or refresh to load the next batch.';
    }
    
    if (message.includes('BATCH_NOT_FOUND') || message.includes('Batch not found')) {
      return 'The batch data could not be found. Please refresh the page to reload the current picking data.';
    }
    
    // Legacy error handling
    if (message.includes('Qty Required 0')) {
      return 'This ingredient may already be fully picked or has no bulk picking requirement. Please refresh the page and try again.';
    }
    
    if (message.includes('DATABASE_RECORD_NOT_FOUND')) {
      return 'Pick data not found in database. Please refresh the page and ensure the run is still active.';
    }
    
    if (message.includes('Insufficient lot availability')) {
      return 'Not enough inventory available in the selected lot. Please choose a different lot or reduce the quantity.';
    }
    
    if (message.includes('more than Qty Required')) {
      return 'The quantity entered exceeds what is required for this ingredient. Please reduce the quantity.';
    }
    
    return message;
  }
  
  // Handle successful pick confirmation with enhanced state management
  // **ATOMIC STATE REFRESH** - Single consolidated refresh operation after pick (RACE CONDITION FIX)
  private refreshAllStateAfterPick(pickedBags: number, lotNumber: string, binNumber: string): void {
    console.log('🔄 ATOMIC_REFRESH: Starting consolidated state refresh after pick...');

    // Clear form state first
    this.productionForm.patchValue({
      pendingPickBags: 0,
      pendingPickKg: '0.0000',
      userInputBags: 0,
      totalNeededKg: '0.0000'
    });

    this.errorMessage.set(null);

    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentItemKey = this.productionForm.get('itemKey')?.value;

    if (!runNumber || !currentItemKey) {
      console.warn('⚠️ ATOMIC_REFRESH: Missing run or ingredient data');
      return;
    }

    // Step 1: Reload ingredient data (backend-authoritative)
    this.bulkRunsService.loadIngredientByItemKey(runNumber, currentItemKey).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          // Update form with fresh backend data
          this.currentFormData.set(response.data);
          this.populateForm(response.data);

          // Step 2: Refresh pallet data
          this.loadPalletTrackingDataObservable(runNumber, currentItemKey).subscribe({
            next: () => {
              console.log('🔄 ATOMIC_REFRESH: Pallet data refreshed, updating UI components...');

              // Step 3: CRITICAL - Recalculate remaining quantities with fresh data
              this.calculateRemainingQuantities();

              // Step 4: Update UI components in sequence (now with correct quantities)
              this.checkPalletCompletionAndAdvance();
              this.checkIngredientCompletionAndSwitch();
              this.cdr.detectChanges();

              // Step 5: Refresh run-level data
              this.refreshRunLevelPickedData();
              this.refreshRunStatus();

              // Step 6: Check for run completion using centralized manager
              console.log('🔍 ATOMIC_REFRESH: Triggering completion check via RunStatusManager...');
              this.runStatusManager.triggerCompletionCheck(runNumber, StatusTrigger.AFTER_PICK);

              console.log(`✅ ATOMIC_REFRESH: Complete state refresh finished - ${pickedBags} bags from lot ${lotNumber} in bin ${binNumber}`);
            },
            error: (palletError: any) => {
              console.error('⚠️ ATOMIC_REFRESH: Failed to refresh pallet data:', palletError);
              // Fallback - still recalculate quantities and update UI components
              this.calculateRemainingQuantities();
              this.checkPalletCompletionAndAdvance();
              this.checkIngredientCompletionAndSwitch();
              this.cdr.detectChanges();

              // Still attempt completion check via manager
              this.runStatusManager.triggerCompletionCheck(runNumber, StatusTrigger.AFTER_PICK);
            }
          });
        } else {
          console.warn('⚠️ ATOMIC_REFRESH: No ingredient data returned');
        }
      },
      error: (error) => {
        console.error('❌ ATOMIC_REFRESH: Failed to refresh ingredient data:', error);
        this.errorMessage.set(`Failed to refresh data: ${this.formatUserFriendlyError(error)}`);
      }
    });
  }

  // DEPRECATED: Legacy method - replaced by refreshAllStateAfterPick
  private handlePickConfirmationSuccess(pickedBags: number, lotNumber: string, binNumber: string): void {
    // Clear form state first
    this.productionForm.patchValue({
      pendingPickBags: 0,
      pendingPickKg: '0.0000',
      userInputBags: 0,
      totalNeededKg: '0.0000'
    });
    
    this.errorMessage.set(null);
    
    // Refresh form data from backend to get updated remaining quantities
    const runNumber = this.productionForm.get('runNumber')?.value;
    const currentItemKey = this.productionForm.get('itemKey')?.value;
    
    if (runNumber && currentItemKey) {
      // Reload ingredient data to get updated PickedBulkQty and remaining quantities
      this.bulkRunsService.loadIngredientByItemKey(runNumber, currentItemKey).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            // Update form with fresh backend data
            this.currentFormData.set(response.data);
            this.populateForm(response.data);
            
            // CRITICAL FIX: Refresh pallet data FIRST, then update UI
            this.loadPalletTrackingDataObservable(runNumber, currentItemKey).subscribe({
              next: () => {
                console.log('🔄 Pallet data refreshed after pick, now updating UI...');
                
                // Check if current pallet is completed and advance to next pallet if needed
                this.checkPalletCompletionAndAdvance();
                
                // Check if ingredient is completed and auto-switch if needed
                this.checkIngredientCompletionAndSwitch();
                
                // Force Angular change detection to update UI immediately
                this.cdr.detectChanges();
                
                // Refresh run-level picked data for print button status
                this.refreshRunLevelPickedData();
                // Refresh run status for status flag
                this.refreshRunStatus();
                
                console.log(`✅ Pick confirmed and UI state updated: ${pickedBags} bags from lot ${lotNumber} in bin ${binNumber}`);
              },
              error: (palletError: any) => {
                console.error('⚠️ Failed to refresh pallet data after pick:', palletError);
                // Fallback - still update other components
                this.checkPalletCompletionAndAdvance();
                this.checkIngredientCompletionAndSwitch();
                this.cdr.detectChanges();
              }
            });
          }
        },
        error: (error) => {
          console.error('Failed to refresh data after pick:', error);
          // Fallback to old calculation method and local pallet update
          this.calculateRemainingQuantities();
          this.updatePalletTracking(pickedBags, lotNumber, binNumber);
          this.cdr.detectChanges(); // Force update even on fallback
        }
      });
    } else {
      // Fallback if run/item data is missing
      this.calculateRemainingQuantities();
      this.updatePalletTracking(pickedBags, lotNumber, binNumber);
      this.cdr.detectChanges(); // Force update on fallback
    }
  }
  
  // Centralized method to refresh all component state after data changes
  private refreshAllComponentState(): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    if (runNumber) {
      // Refresh pallet tracking data to update visual indicators
      const currentItemKey = this.productionForm.get('itemKey')?.value;
      this.loadPalletTrackingData(runNumber, currentItemKey);
      
      // Refresh search results to update ingredient status indicators
      this.bulkRunsService.searchBulkRuns(runNumber).subscribe({
        next: (response) => {
          if (response.success && response.data && response.data.length > 0) {
            this.searchResults.set(response.data);
          }
        },
        error: (error) => {
          console.warn('Failed to refresh search results:', error);
        }
      });
    }
  }
  
  // Update pallet tracking data after successful pick
  private updatePalletTracking(pickedBags: number, lotNumber: string, binNumber: string): void {
    // Find current batch and update picked quantities
    const currentPallets = this.palletData();
    if (currentPallets && currentPallets.length > 0) {
      // For demo: update first unpicked batch
      const firstUnpicked = currentPallets.find((p: PalletBatch) => 
        parseFloat(p.no_of_bags_remaining?.toString() || '0') > 0
      );
      
      if (firstUnpicked) {
        const currentPicked = parseFloat(firstUnpicked.no_of_bags_picked?.toString() || '0');
        const currentRemaining = parseFloat(firstUnpicked.no_of_bags_remaining?.toString() || '0');
        const bulkPackSize = parseFloat(this.productionForm.get('bulkPackSizeValue')?.value) || 25;
        
        // Update picked quantities
        firstUnpicked.no_of_bags_picked = (currentPicked + pickedBags);
        firstUnpicked.quantity_picked = ((currentPicked + pickedBags) * bulkPackSize);
        
        // Update remaining quantities
        const newRemaining = Math.max(0, currentRemaining - pickedBags);
        firstUnpicked.no_of_bags_remaining = newRemaining;
        firstUnpicked.quantity_remaining = (newRemaining * bulkPackSize);
        
        // Trigger reactivity
        this.palletData.set([...currentPallets]);
        
        // Check for ingredient auto-switching after batch completion
        this.checkForIngredientSwitching();
      }
    }
  }
  
  // Check if we should auto-switch to next ingredient
  private checkForIngredientSwitching(): void {
    const consecutiveComplete = this.getConsecutiveCompletedBatches();
    const switchThreshold = 3; // Switch after 3 consecutive batches
    
    if (consecutiveComplete >= switchThreshold) {
      const currentIngredient = this.productionForm.get('itemKey')?.value;
      this.autoSwitchToNextIngredient(currentIngredient);
    }
  }
  
  // Get number of consecutive completed batches for current ingredient
  private getConsecutiveCompletedBatches(): number {
    const currentPallets = this.palletData();
    if (!currentPallets) return 0;
    
    let consecutiveComplete = 0;
    for (const pallet of currentPallets) {
      const remaining = parseFloat(pallet.no_of_bags_remaining?.toString() || '0');
      const picked = parseFloat(pallet.no_of_bags_picked?.toString() || '0');
      
      if (remaining === 0 && picked > 0) {
        consecutiveComplete++;
      } else {
        break; // Stop counting when we hit non-completed batch
      }
    }
    
    return consecutiveComplete;
  }
  
  // Auto-switch to next ingredient after threshold completion
  private autoSwitchToNextIngredient(currentIngredient: string): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    
    if (!runNumber) {
      console.log('No run number available for ingredient switching');
      return;
    }
    
    // Prevent auto-switching if manual selection is active
    if (this.manualIngredientSelection()) {
      console.log(`🚫 Auto-switch blocked - manual selection is active`);
      return;
    }
    
    // Get next unpicked ingredient from run
    console.log(`🔄 AUTO_SWITCH: Calling searchRunItems for run ${runNumber} to find ingredients after completing ${currentIngredient}`);

    // Add a small delay to ensure database changes are committed before querying
    setTimeout(() => {
      this.bulkRunsService.searchRunItems(runNumber).subscribe({
      next: (ingredients) => {
        // Enhanced debug logging to verify API data
        console.log(`📡 AUTO_SWITCH_API_DATA: searchRunItems returned ${ingredients.data?.length || 0} ingredients:`,
          ingredients.data?.map(item => ({
            item_key: item.item_key,
            line_id: item.line_id,
            picked_bulk_qty: item.picked_bulk_qty,
            to_picked_bulk_qty: item.to_picked_bulk_qty,
            description: item.description
          }))
        );

        // Filter out current ingredient and find next unpicked one
        const availableIngredients = ingredients.data?.filter((item: any) =>
          item.item_key !== currentIngredient && this.isIngredientUnpicked(item)
        ) || [];
        
        if (availableIngredients.length > 0) {
          // Enhanced logging for debugging duplicate LineId issues
          console.log(`🔍 AUTO_SWITCH_DEBUG: Found ${availableIngredients.length} available ingredients:`,
            availableIngredients.map(item => ({
              item_key: item.item_key,
              line_id: item.line_id,
              description: item.description,
              isUnpicked: this.isIngredientUnpicked(item)
            }))
          );

          // Sort by LineId to follow BME4 order (22→21→1→2...) with secondary ItemKey sorting for tie-breaking
          availableIngredients.sort((a: any, b: any) => {
            const lineIdDiff = parseInt(b.line_id) - parseInt(a.line_id); // Primary: LineId DESC
            if (lineIdDiff !== 0) return lineIdDiff;
            return a.item_key.localeCompare(b.item_key); // Secondary: ItemKey ASC for deterministic duplicate LineId handling
          });
          
          const nextIngredient = availableIngredients[0];
          console.log(`🔄 Auto-switching from ${currentIngredient} to ${nextIngredient.item_key} (LineId: ${nextIngredient.line_id})`);
          this.performIngredientSwitch(currentIngredient, nextIngredient);
        } else {
          console.log('✅ All ingredients completed - no more ingredients to switch to');
          this.showCompletionMessage();
        }
      },
        error: (error) => {
          console.error('Failed to get ingredients for switching:', error);
        }
      });
    }, 200); // 200ms delay to ensure database changes are committed
  }
  
  // Check if current ingredient is completed and auto-switch if needed
  private checkIngredientCompletionAndSwitch(): void {
    const currentFormData = this.currentFormData();
    const currentIngredient = this.productionForm.get('itemKey')?.value;
    const runNumber = this.productionForm.get('runNumber')?.value;
    
    if (!currentFormData || !currentIngredient || !runNumber) {
      console.log('Insufficient data for completion check - skipping');
      return;
    }
    
    // Get accurate data from the current form data instead of form fields
    const totalNeeded = parseFloat(currentFormData.current_ingredient?.calculations?.total_needed || '0');
    const remainingToPick = parseFloat(currentFormData.current_ingredient?.calculations?.remaining_to_pick || '0');
    const currentPicked = totalNeeded - remainingToPick;
    
    console.log(`Completion check: Picked ${currentPicked} of ${totalNeeded} for ${currentIngredient} (remaining: ${remainingToPick})`);
    
    // Always check for completion, regardless of manual selection
    const isCompleted = remainingToPick <= 0.001 && totalNeeded > 0; // Use small threshold for float comparison
    
    if (isCompleted) {
      console.log(`✅ Ingredient ${currentIngredient} completed!`);
      
      // Clear manual selection flag when ANY ingredient is completed
      if (this.manualIngredientSelection()) {
        console.log(`Clearing manual selection flag - ingredient ${currentIngredient} is now complete`);
        this.manualIngredientSelection.set(false);
      }
      
      // Auto-switch to next ingredient if not manually selected
      if (!this.manualIngredientSelection()) {
        console.log(`Auto-switching from completed ingredient ${currentIngredient}...`);
        this.autoSwitchToNextIngredient(currentIngredient);
      }
    } else {
      console.log(`Ingredient ${currentIngredient} still needs ${remainingToPick.toFixed(4)} more bags`);
      
      // Optional: Clear manual selection flag after a timeout if ingredient is not progressing
      this.scheduleManualSelectionTimeout();
    }
  }
  
  // Check if current pallet is completed and advance to next pallet if needed
  private checkPalletCompletionAndAdvance(): void {
    const currentFormData = this.currentFormData();
    const pallets = this.palletData();

    if (!currentFormData?.current_ingredient?.ingredient || !pallets || pallets.length === 0) {
      console.log('🚫 Insufficient data for pallet completion check - skipping');
      return;
    }

    const currentLineId = currentFormData.current_ingredient.ingredient.line_id;
    const currentItemKey = currentFormData.current_ingredient.ingredient.item_key;

    // Sort pallets by batch_number ascending to ensure sequential processing (850828→850829→850830...)
    const sortedPallets = [...pallets].sort((a: any, b: any) => {
      const aBatchNum = parseInt(a.batch_number?.toString() || '0');
      const bBatchNum = parseInt(b.batch_number?.toString() || '0');
      return aBatchNum - bBatchNum; // Ascending order for sequential processing by batch
    });

    // CRITICAL FIX: Check all pallets for completion, not just the first one
    // This ensures we properly track completion of all pallets regardless of pick distribution
    let completedPallets = [];
    let activePallet = null;

    for (const pallet of sortedPallets) {
      const remainingBags = parseFloat(pallet.no_of_bags_remaining?.toString() || '0');
      console.log(`🎯 Checking pallet completion for ItemKey: ${currentItemKey}, RowNum: ${pallet.row_num}, LineId: ${currentLineId} - Pallet: ${pallet.batch_number} (${remainingBags} bags remaining)`);

      if (remainingBags <= 0.001) {
        console.log(`✅ Pallet ${pallet.batch_number} completed!`);
        completedPallets.push(pallet);
      } else if (!activePallet) {
        // First pallet with remaining inventory becomes the active pallet
        activePallet = pallet;
        console.log(`📦 Active pallet: ${pallet.batch_number} still has ${remainingBags} bags remaining`);
      }
    }

    // Log completed pallets for debugging
    if (completedPallets.length > 0) {
      console.log(`✅ Completed pallets: ${completedPallets.map(p => p.batch_number).join(', ')}`);
    }

    // Check if we have an active pallet to advance to
    if (activePallet) {
      // If current form is not pointing to the active pallet, advance to it
      const currentFormRowNum = currentFormData.current_ingredient.ingredient.row_num;
      if (currentFormRowNum !== activePallet.row_num) {
        console.log(`🔄 Advancing from completed pallets to next active pallet ${activePallet.batch_number} (RowNum: ${activePallet.row_num})`);
        this.advanceToNextPallet(currentItemKey, activePallet.row_num, currentLineId);
      } else {
        console.log(`📦 Current pallet ${activePallet.batch_number} is already active with ${parseFloat(activePallet.no_of_bags_remaining?.toString() || '0')} bags remaining`);
      }
    } else {
      // All pallets are completed for this ingredient
      console.log(`🎉 All pallets completed for ingredient ${currentItemKey}!`);

      // Trigger universal completion check when all pallets of an ingredient are done
      console.log('🔍 All pallets done for ingredient - checking if entire run should change to PRINT status...');
      const currentResults = this.searchResults();
      if (currentResults && currentResults.length > 0 && currentResults[0].run.run_no) {
        this.runStatusManager.triggerCompletionCheck(currentResults[0].run.run_no, StatusTrigger.PALLET_COMPLETED);
      }
    }
  }
  
  // Extract RowNum from pallet data using actual database RowNum field
  private extractRowNumFromBatch(batchNumber: string): number {
    const pallets = this.palletData();
    if (!pallets || pallets.length === 0) {
      console.warn('⚠️ Cannot extract RowNum: No pallet data available');
      return 0;
    }
    
    // Find the pallet with matching batch number and use its actual RowNum
    const matchingPallet = pallets.find((p: PalletBatch) => p.batch_number === batchNumber);
    
    if (matchingPallet && matchingPallet.row_num) {
      console.log(`🎯 Found RowNum ${matchingPallet.row_num} for batch ${batchNumber}`);
      return matchingPallet.row_num;
    }
    
    console.warn(`⚠️ Cannot find RowNum for batch ${batchNumber} in pallet data`);
    return 0;
  }
  
  // Advance to the next pallet by updating current ingredient coordinates
  private advanceToNextPallet(itemKey: string, nextRowNum: number, lineId: number): void {
    console.log(`🔄 Advancing to next pallet: ItemKey=${itemKey}, NextRowNum=${nextRowNum}, LineId=${lineId}`);
    
    const runNumber = this.productionForm.get('runNumber')?.value;
    
    if (!runNumber) {
      console.error('❌ Cannot advance to next pallet: Run number not available');
      return;
    }
    
    // Reload ingredient data with the new pallet coordinates
    this.bulkRunsService.loadIngredientByItemKeyAndCoordinates(runNumber, itemKey, nextRowNum, lineId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('✅ Successfully loaded next pallet data:', response.data);
          
          // CRITICAL FIX: Update currentFormData signal with new pallet coordinates
          // This ensures confirmPickOperation() gets the correct row_num/line_id
          this.currentFormData.set(response.data);
          console.log(`🔄 STATE UPDATE: currentFormData updated with new coordinates - RowNum: ${response.data.current_ingredient?.ingredient.row_num}, LineId: ${response.data.current_ingredient?.ingredient.line_id}`);
          
          // Update form with the new pallet data
          this.populateForm(response.data);
          
          // Show success message to user
          const oldPallet = this.palletData()?.find(p => this.extractRowNumFromBatch(p.batch_number) !== nextRowNum)?.batch_number;
          const newPallet = this.palletData()?.find(p => this.extractRowNumFromBatch(p.batch_number) === nextRowNum)?.batch_number;
          
          console.log(`🎯 Advanced from pallet ${oldPallet} to pallet ${newPallet} for ingredient ${itemKey}`);
        } else {
          console.error('❌ Failed to load next pallet data:', response);
          // Check if this means ingredient is completed
          this.handlePalletAdvanceFailure(itemKey, nextRowNum, lineId, response.message);
        }
      },
      error: (error) => {
        console.error('❌ Error loading next pallet data:', error);
        // Check if this means ingredient is completed
        this.handlePalletAdvanceFailure(itemKey, nextRowNum, lineId, error.message);
      }
    });
  }
  
  // Handle pallet advancement failure by checking ingredient completion using actual picked quantities
  private handlePalletAdvanceFailure(itemKey: string, failedRowNum: number, lineId: number, errorMessage: string): void {
    console.log(`🔍 Handling pallet advance failure: ${itemKey}, attempted RowNum: ${failedRowNum}`);

    const runNumber = this.productionForm.get('runNumber')?.value;
    if (!runNumber) {
      console.error('❌ Cannot handle pallet failure: Run number not available');
      return;
    }

    // **CRITICAL FIX**: Check ingredient completion using backend quantity-based logic instead of pallet availability
    // This aligns frontend completion logic with backend completion status calculation
    this.bulkRunsService.checkDetailedRunCompletion(runNumber).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          // Check if the specific ingredient is complete by checking its picked vs required quantities
          // If the run completion check shows this ingredient as complete, move to next ingredient
          // Otherwise, try to load another pallet for the same ingredient

          console.log(`🔍 INGREDIENT_COMPLETION_CHECK: Run ${runNumber} completion status for ${itemKey}`);

          // First, try to load any available pallet for this ingredient
          this.bulkRunsService.loadIngredientByItemKey(runNumber, itemKey).subscribe({
            next: (ingredientResponse) => {
              if (ingredientResponse.success && ingredientResponse.data) {
                // Ingredient still has available pallets - use it
                console.log('✅ Ingredient still has pallets available, using first available pallet');
                this.populateForm(ingredientResponse.data);
              } else {
                // No pallets available, but need to verify if ingredient is actually complete
                // based on picked quantities (not just pallet availability)
                console.log(`⚠️ No pallets available for ${itemKey} - checking if ingredient is quantity-complete`);

                // Check if run completion indicates this ingredient should be complete
                if (response.data.is_complete || this.isIngredientQuantityComplete(itemKey)) {
                  console.log(`🎉 Ingredient ${itemKey} is quantity-complete! Moving to next ingredient.`);
                  this.showIngredientCompletedMessage(itemKey);
                  this.loadNextAvailableIngredient(runNumber);
                } else {
                  console.log(`⚠️ Ingredient ${itemKey} is not quantity-complete but has no pallets - possible data issue`);
                  this.showIngredientCompletedMessage(itemKey, `No more pallets available for ${itemKey}. Please check if ingredient is complete.`);
                  this.loadNextAvailableIngredient(runNumber);
                }
              }
            },
            error: (ingredientError) => {
              console.error('❌ Failed to check ingredient pallet availability:', ingredientError);
              this.showIngredientCompletedMessage(itemKey, 'Unable to load next pallet. Please refresh and try again.');
            }
          });
        }
      },
      error: (error: any) => {
        console.error('❌ Failed to check run completion for ingredient evaluation:', error);
        // Fallback: try to load ingredient pallets anyway
        this.bulkRunsService.loadIngredientByItemKey(runNumber, itemKey).subscribe({
          next: (response) => {
            if (response.success && response.data) {
              console.log('✅ Fallback: Ingredient still has pallets available');
              this.populateForm(response.data);
            } else {
              console.log(`🎉 Fallback: Ingredient ${itemKey} appears completed`);
              this.showIngredientCompletedMessage(itemKey);
              this.loadNextAvailableIngredient(runNumber);
            }
          },
          error: (error) => {
            console.error('❌ Fallback failed:', error);
            this.showIngredientCompletedMessage(itemKey, 'Unable to load next pallet. Please refresh and try again.');
          }
        });
      }
    });
  }

  // Helper method to check if an ingredient is quantity-complete based on form data
  private isIngredientQuantityComplete(itemKey: string): boolean {
    // This could be enhanced to check actual picked vs required quantities
    // For now, we rely on the backend completion check
    const formData = this.currentFormData();
    if (formData?.current_ingredient?.ingredient?.item_key === itemKey) {
      // Check if remaining quantity is effectively zero using correct backend calculation data
      const remainingQty = parseFloat(formData.current_ingredient?.calculations?.remaining_to_pick || '0');
      return remainingQty <= 0;
    }
    return false;
  }
  
  // Show ingredient completion message to user
  private showIngredientCompletedMessage(itemKey: string, customMessage?: string): void {
    const message = customMessage || `Ingredient ${itemKey} has been fully picked! Great job! 🎉`;
    console.log(`🎉 ${message}`);
    // You could show a toast notification here if desired
    // this.toastr.success(message, 'Ingredient Completed');
  }

  // DEPRECATED: Status update methods moved to RunStatusManager
  // This ensures all status updates go through centralized management
  
  // Load the next available ingredient for picking
  private loadNextAvailableIngredient(runNumber: number): void {
    console.log('🔄 Looking for next available ingredient...');
    
    // Get current ingredients list and find next unpicked one
    const currentIngredients = this.searchResults()[0]?.ingredients || [];
    const nextIngredient = currentIngredients.find((ingredient: any) => this.isIngredientUnpicked(ingredient));
    
    if (nextIngredient) {
      console.log(`🎯 Found next ingredient: ${nextIngredient.item_key}`);
      this.bulkRunsService.loadIngredientByItemKey(runNumber, nextIngredient.item_key).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            console.log('✅ Loaded next ingredient data');
            this.populateForm(response.data);
          } else {
            console.error('❌ Failed to load next ingredient:', response);
          }
        },
        error: (error) => {
          console.error('❌ Error loading next ingredient:', error);
        }
      });
    } else {
      console.log('🎉 All ingredients completed! Run is finished!');

      // **CRITICAL FIX**: Trigger universal completion check to update status NEW → PRINT
      console.log('🔍 All ingredients done - checking if run should change to PRINT status...');
      this.runStatusManager.triggerCompletionCheck(runNumber, StatusTrigger.RUN_COMPLETED);
    }
  }
  
  // Check if ingredient is unpicked or partially picked (helper method for dynamic filtering)
  private isIngredientUnpicked(ingredient: any): boolean {
    const pickedQty = parseFloat(ingredient.picked_bulk_qty || '0');
    const totalQty = parseFloat(ingredient.to_picked_bulk_qty || '0');
    const isUnpicked = totalQty > 0 && pickedQty < totalQty;

    // Enhanced debug logging for pallet allocation investigation
    console.log(`🔍 INGREDIENT_FILTER_DEBUG: ${ingredient.item_key}:`, {
      picked_bulk_qty: pickedQty,
      to_picked_bulk_qty: totalQty,
      isUnpicked: isUnpicked,
      rawData: {
        picked_bulk_qty_raw: ingredient.picked_bulk_qty,
        to_picked_bulk_qty_raw: ingredient.to_picked_bulk_qty
      }
    });

    // Ingredient is available for picking if it has bulk picking requirement and is not fully picked
    return isUnpicked;
  }
  
  // Schedule a timeout to clear manual selection flag if no progress is made
  private manualSelectionTimeoutId?: number;
  
  private scheduleManualSelectionTimeout(): void {
    // Clear existing timeout if any
    if (this.manualSelectionTimeoutId) {
      clearTimeout(this.manualSelectionTimeoutId);
    }
    
    // Set timeout for 10 minutes - increased from 5 to give more time for manual operations
    this.manualSelectionTimeoutId = window.setTimeout(() => {
      if (this.manualIngredientSelection()) {
        console.log('⏰ Manual selection timeout after 10 minutes - re-enabling auto-switching');
        this.manualIngredientSelection.set(false);
      }
    }, 10 * 60 * 1000); // 10 minutes
  }
  
  // Clear manual selection timeout when user is actively working
  private clearManualSelectionTimeout(): void {
    if (this.manualSelectionTimeoutId) {
      clearTimeout(this.manualSelectionTimeoutId);
      this.manualSelectionTimeoutId = undefined;
      console.log('⏰ Cleared manual selection timeout - user is actively working');
    }
  }

  // Handle graceful ingredient switching after all lots are unpicked
  private handlePostUnpickIngredientSwitch(runNo: number, itemKey: string, retryCount = 0): void {
    const maxRetries = 2;
    console.log(`🔄 RECOVERY MODE: Attempting to recover from post-unpick ingredient switch (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    // Clear any existing error state
    this.errorMessage.set(null);
    
    // Try to load the run without specific ingredient to reset state
    this.bulkRunsService.getBulkRunFormData(runNo).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('✅ RECOVERY: Successfully loaded fresh run data');
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          
          // Show user-friendly message about the state
          this.errorMessage.set(`Ingredient ${itemKey} selected. All lots have been unpicked - ready to start fresh picks.`);
          
          // Load pallet data for the recovered state
          this.loadPalletTrackingData(runNo, response.data.form_data.item_key);
          
          // Focus lot field to encourage next action
          setTimeout(() => this.focusLotNumberField(), 100);
          
        } else {
          console.warn('⚠️ RECOVERY FAILED: Could not load fresh run data');
          this.errorMessage.set('Run data unavailable after unpick operation. Please refresh the run.');
        }
      },
      error: (error) => {
        console.error(`❌ RECOVERY ATTEMPT ${retryCount + 1} FAILED:`, error);
        
        // Retry with exponential backoff up to maxRetries
        if (retryCount < maxRetries) {
          const retryDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s delays
          console.log(`🔄 Retrying recovery in ${retryDelay}ms...`);
          this.errorMessage.set(`Recovery attempt ${retryCount + 1} failed. Retrying in ${retryDelay / 1000}s...`);
          
          setTimeout(() => {
            this.handlePostUnpickIngredientSwitch(runNo, itemKey, retryCount + 1);
          }, retryDelay);
        } else {
          console.error('❌ ALL RECOVERY ATTEMPTS EXHAUSTED');
          this.errorMessage.set('Unable to recover from unpick operation. Please refresh the run or try a different ingredient.');
        }
      }
    });
  }
  
  // Show completion message when all ingredients are done
  private showCompletionMessage(): void {
    console.log('🎉 All ingredients completed for this bulk run!');
    
    // Show completion notification
    alert('✅ Run Completed! All ingredients have been successfully picked for this bulk run.');
  }
  
  // Perform ingredient switch with user notification
  private performIngredientSwitch(fromIngredient: string, toIngredient: any): void {
    // Double-check: Skip if manual ingredient selection is active
    if (this.manualIngredientSelection()) {
      console.log(`🚫 Blocking auto-switch to ${toIngredient.item_key} - manual selection active`);
      return;
    }
    
    // Clear any pending manual selection timeout
    if (this.manualSelectionTimeoutId) {
      clearTimeout(this.manualSelectionTimeoutId);
      this.manualSelectionTimeoutId = undefined;
    }
    
    // Show switch notification
    this.displaySwitchNotification(fromIngredient, toIngredient.item_key);
    
    // Load new ingredient data
    this.switchToIngredient(toIngredient.item_key, toIngredient.line_id);
    
    // Reset pallet numbering for new ingredient
    this.resetPalletNumbering();
  }
  
  // Display ingredient switch notification with auto-hide
  private displaySwitchNotification(fromIngredient: string, toIngredient: string): void {
    const message = `✅ Completed ${fromIngredient}. Auto-switching to ${toIngredient}...`;
    this.switchNotification.set({ show: true, message });
    
    // Auto-hide notification after 3 seconds
    setTimeout(() => {
      this.switchNotification.set({ show: false, message: '' });
    }, 3000);
    
    console.log(message);
  }
  
  // Public accessors for template
  showSwitchNotification = computed(() => this.switchNotification().show);
  switchNotificationMessage = computed(() => this.switchNotification().message);
  
  // Ingredient completion status computed signal
  isCurrentIngredientCompleted = computed(() => {
    const formData = this.currentFormData();
    if (!formData) return false;
    
    // FIXED: Use backend completion_status from ingredient data instead of frontend calculation
    const ingredient = formData.current_ingredient?.ingredient;
    if (ingredient && (ingredient as any).completion_status) {
      return (ingredient as any).completion_status === 'COMPLETE';
    }
    
    // Fallback to remaining quantity logic for older data
    const remainingBags = parseFloat(formData.form_data.remaining_bags || '0');
    const remainingKg = parseFloat(formData.form_data.remaining_kg || '0');
    return remainingBags <= 0 && remainingKg <= 0;
  });

  // Check if current ingredient has picked quantities
  hasPickedQuantities = computed(() => {
    const formData = this.currentFormData();
    if (!formData) return false;
    
    const ingredient = formData.current_ingredient?.ingredient;
    if (!ingredient) return false;
    
    // Check if picked_bulk_qty is greater than 0
    const pickedBulkQty = parseFloat(ingredient.picked_bulk_qty?.toString() || '0');
    return pickedBulkQty > 0;
  });

  // Open the view picked lots modal
  openViewPickedLotsModal(): void {
    const currentData = this.currentFormData();
    if (!currentData) {
      this.switchNotification.set({
        show: true,
        message: 'No ingredient data available'
      });
      return;
    }

    const runNo = currentData.run.run_no;

    // Clear previous state and open modal
    this.pickedLotsError.set(null);
    this.pickedLotsData.set(null);
    this.selectedUnpickLot.set(null);
    this.showPickedLotsModal.set(true);
    this.isLoadingPickedLots.set(true);

    // Fetch ALL picked lots data for the entire run (across all ingredients)
    this.bulkRunsService.getAllPickedLotsForRun(runNo).subscribe({
      next: (response) => {
        this.isLoadingPickedLots.set(false);
        if (response.success && response.data) {
          this.pickedLotsData.set(response.data);
        } else {
          this.pickedLotsError.set(response.message || 'Failed to load picked lots');
        }
      },
      error: (error) => {
        this.isLoadingPickedLots.set(false);
        this.pickedLotsError.set('Error loading picked lots: ' + (error.error?.message || error.message));
        console.error('Error fetching picked lots:', error);
      }
    });
  }

  // Close picked lots modal
  closePickedLotsModal(): void {
    this.showPickedLotsModal.set(false);
    this.pickedLotsData.set(null);
    this.batchWeightSummary.set(null);
    this.pickedLotsError.set(null);
    this.selectedUnpickLot.set(null);
    this.isLoadingPickedLots.set(false);
    this.activePickedLotsTab.set('picked'); // Reset to default tab
  }

  // Set active tab in picked lots modal
  setActivePickedLotsTab(tab: 'picked' | 'pending'): void {
    this.activePickedLotsTab.set(tab);
    
    // Load batch weight summary when switching to pending tab
    if (tab === 'pending') {
      this.loadBatchWeightSummary();
    }
  }

  // Load batch weight summary for Pending to Picked tab
  private loadBatchWeightSummary(): void {
    const currentData = this.currentFormData();
    if (!currentData) {
      console.warn('No current form data available');
      return;
    }
    
    const runNo = currentData.run.run_no;
    this.isLoadingPickedLots.set(true);
    
    this.bulkRunsService.getBatchWeightSummary(runNo).subscribe({
      next: (response) => {
        this.isLoadingPickedLots.set(false);
        if (response.success && response.data) {
          this.batchWeightSummary.set(response.data);
          console.log('📊 Batch weight summary loaded:', response.data);
        } else {
          console.error('Failed to load batch weight summary:', response.message);
          this.pickedLotsError.set(response.message || 'Failed to load weight summary');
        }
      },
      error: (error) => {
        this.isLoadingPickedLots.set(false);
        console.error('Error loading batch weight summary:', error);
        this.pickedLotsError.set('Error loading weight summary: ' + (error.error?.message || error.message));
      }
    });
  }

  // Unpick specific lot, entire batch, or all run lots
  unpickLots(lotNo?: string, lotRowNum?: number, lotLineId?: number, lotTranNo?: number): void {
    const currentData = this.currentFormData();
    if (!currentData) return;

    const runNo = currentData.run.run_no;
    const ingredient = currentData.current_ingredient.ingredient;
    
    // Determine the operation type and confirmation message
    let actionDescription: string;
    let isRunWideDelete = false;
    
    if (lotNo) {
      // Individual lot delete
      actionDescription = `lot ${lotNo}`;
    } else if (lotRowNum !== undefined && lotLineId !== undefined) {
      // Specific ingredient batch delete  
      actionDescription = 'entire batch';
    } else {
      // Delete All button - run-wide delete
      actionDescription = 'ALL LOTS FROM ENTIRE RUN (all ingredients)';
      isRunWideDelete = true;
    }

    if (!confirm(`Are you sure you want to unpick ${actionDescription}? This action cannot be undone.`)) {
      return;
    }

    this.isLoadingPickedLots.set(true);

    // Choose the appropriate API call based on operation type
    const apiCall = isRunWideDelete 
      ? this.bulkRunsService.unpickAllRunLots(runNo)
      : this.bulkRunsService.unpickIngredient(
          runNo,
          lotRowNum !== undefined ? lotRowNum : ingredient.row_num,
          lotLineId !== undefined ? lotLineId : ingredient.line_id,
          // NEW: Priority handling for precise unpick using lot_tran_no
          lotTranNo 
            ? { lot_tran_no: lotTranNo }  // Use precise unpick if lot_tran_no provided
            : lotNo 
              ? { lot_no: lotNo }         // Fallback to lot-based unpick
              : {}                        // Batch unpick
        );

    apiCall.subscribe({
      next: (response) => {
        this.isLoadingPickedLots.set(false);
        
        // Check for different success scenarios including "already clean" responses
        const isNoAllocationsCase = response.message && (
          response.message.includes('No allocations found') ||
          response.message.includes('already unpicked')
        );
        const isAlreadyCleanCase = response.data && response.data.operation_type === 'unpick_already_clean';

        if (response.success || isNoAllocationsCase || isAlreadyCleanCase) {
          // Show temporary success notification for 1 second
          let successMessage: string;
          if (isNoAllocationsCase || isAlreadyCleanCase) {
            if (isRunWideDelete) {
              successMessage = '✅ All lots already removed - run is clean';
            } else {
              successMessage = '✅ All lots already removed - ingredient is clean';
            }
          } else if (isRunWideDelete) {
            successMessage = '🔄 Successfully unpicked ALL lots from entire run';
          } else if (actionDescription === 'entire batch') {
            successMessage = '🔄 Successfully unpicked entire batch';
          } else {
            successMessage = `Successfully unpicked ${actionDescription}`;
          }
          
          this.switchNotification.set({ show: true, message: successMessage });
          
          // Auto-hide notification after 1 second
          setTimeout(() => {
            this.switchNotification.set({ show: false, message: '' });
          }, 1000);
          
          // Enhanced state synchronization: Refresh all data sources
          // 1. Refresh the picked lots modal data (all run picked lots)
          this.refreshPickedLotsData(runNo);
          
          // 2. Refresh main form data to show updated quantities
          // No delay needed - using same fresh API data as pallet table
          this.bulkRunsService.loadIngredientByItemKey(runNo, ingredient.item_key).subscribe({
            next: (formResponse) => {
              if (formResponse.success && formResponse.data) {
                // Update form data signal and populate form
                this.currentFormData.set(formResponse.data);
                this.populateForm(formResponse.data);

                // 3. CRITICAL: Clear pallet data cache to prevent stale data
                this.palletData.set([]);
                console.log(`🔄 CACHE INVALIDATION: Cleared stale pallet data after unpick`);

                // 4. ATOMIC STATE UPDATE: Wait for pallet data to refresh before completion checks
                const currentItemKey = this.productionForm.get('itemKey')?.value;
                if (currentItemKey) {
                  this.loadPalletTrackingDataObservable(runNo, currentItemKey).subscribe({
                    next: () => {
                      console.log(`🔄 ATOMIC_STATE: Pallet data refreshed, now running completion checks`);

                      // 5. CRITICAL: Refresh batch weight summary for consistent pallet table
                      this.loadBatchWeightSummary();

                      // 6. CRITICAL: Recalculate remaining quantities with fresh pallet data
                      this.updateRemainingDisplayValues();

                      // 7. Only run completion checks after ALL state is updated
                      this.checkIngredientCompletionAndSwitch();

                      // 8. Force Angular change detection for immediate UI update
                      this.cdr.detectChanges();

                      console.log(`✅ ATOMIC_STATE: Complete state refresh finished after unpick ${actionDescription}`);
                    },
                    error: (error: any) => {
                      console.warn('Failed to load pallet data after unpick, running completion checks anyway:', error);
                      // Even if pallet data fails, refresh batch summary and recalculate
                      this.loadBatchWeightSummary();
                      this.updateRemainingDisplayValues();
                      this.checkIngredientCompletionAndSwitch();
                      this.cdr.detectChanges();
                    }
                  });
                } else {
                  // Fallback if no current item key
                  this.loadBatchWeightSummary();
                  this.updateRemainingDisplayValues();
                  this.checkIngredientCompletionAndSwitch();
                  this.cdr.detectChanges();
                }

                console.log(`✅ Modal unpick completed and state refresh initiated for ${actionDescription}`);
              }
            },
            error: (formError) => {
              console.warn('Failed to refresh form after unpick:', formError);
              // Fallback to basic refresh
              this.loadFormData(runNo);
              this.cdr.detectChanges();
            }
          });
        } else {
          // Only show actual errors
          this.pickedLotsError.set(response.message || 'Failed to unpick');
        }
      },
      error: (error) => {
        this.isLoadingPickedLots.set(false);
        this.pickedLotsError.set('Error unpicking: ' + (error.error?.message || error.message));
        console.error('Error unpicking:', error);
      }
    });
  }

  // Helper method to refresh picked lots modal data - now uses ALL run picked lots
  private refreshPickedLotsData(runNo: number): void {
    this.isLoadingPickedLots.set(true);
    this.pickedLotsError.set(null);

    this.bulkRunsService.getAllPickedLotsForRun(runNo).subscribe({
      next: (response) => {
        this.isLoadingPickedLots.set(false);
        if (response.success && response.data) {
          this.pickedLotsData.set(response.data);
        } else {
          // If no data, it means all lots were successfully deleted
          this.pickedLotsData.set(null);
        }
      },
      error: (error) => {
        this.isLoadingPickedLots.set(false);
        console.error('Error refreshing all picked lots data:', error);
        // Don't show error to user as this is just a refresh operation
      }
    });
  }
  
  // Calculate remaining bags from pallet data for specific ingredient (primary source) with fallback
  private calculateRemainingBagsFromPalletsForIngredient(itemKey: string, fallbackValue: string | number): number {
    const palletData = this.palletData();
    const runNo = this.productionForm.get('runNumber')?.value;

    // Check if current pallet data matches the requested ingredient
    const currentFormData = this.currentFormData();
    const currentIngredientInPalletData = currentFormData?.form_data.item_key;

    if (palletData.length > 0 && currentIngredientInPalletData === itemKey) {
      // Use accurate pallet data (same source as pallet table)
      // Note: API already filters by ingredient when itemKey is provided to getPalletTrackingData

      // ENHANCED DEBUGGING: Log complete pallet objects to identify structure issues
      const now = new Date().toLocaleTimeString();
      console.log(`🔍 FULL PALLET DEBUG for ingredient ${itemKey} at ${now}:`, palletData);
      console.log(`🔍 PALLET OBJECT KEYS:`, palletData.length > 0 ? Object.keys(palletData[0]) : 'No pallets');

      // CRITICAL: Force fresh data load if pallet data shows all zeros (indicates stale cache)
      const allZeros = palletData.every(p => (p.no_of_bags_remaining || 0) === 0);
      if (allZeros && palletData.length > 0) {
        // INFINITE LOOP FIX: Add debounce mechanism to prevent immediate re-triggering
        const cooldownKey = `${runNo}-${itemKey}`;
        const lastDetectionTime = this.staleDataDetectionCooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastDetectionTime < this.STALE_DATA_COOLDOWN_MS) {
          console.log(`🕒 COOLDOWN: Stale data detection for ${itemKey} is in cooldown (${this.STALE_DATA_COOLDOWN_MS}ms), skipping refresh`);
          return 0; // Still return 0 but don't trigger refresh
        }

        console.warn(`🚨 STALE DATA DETECTED: All pallets show 0 remaining - forcing refresh for ${itemKey}`);
        this.staleDataDetectionCooldowns.set(cooldownKey, now);

        if (runNo) {
          this.loadPalletTrackingData(runNo, itemKey);
        }
        // IMPORTANT: Return 0 to show "loading" state, don't use stale form data
        console.log(`⚠️ Using 0 (loading state) due to stale data for ingredient ${itemKey} - waiting for fresh data`);
        return 0;
      }

      // BATCH-SPECIFIC CALCULATION: Show remaining for current batch only, not sum of all batches
      const currentRowNum = currentFormData?.current_ingredient?.ingredient.row_num;

      // Sort pallets by batch_number ascending to ensure sequential processing
      const sortedPallets = [...palletData].sort((a: any, b: any) => {
        const aBatchNum = parseInt(a.batch_number?.toString() || '0');
        const bBatchNum = parseInt(b.batch_number?.toString() || '0');
        return aBatchNum - bBatchNum;
      });

      // Find the current pallet by RowNum, or fallback to first incomplete pallet
      let currentPallet = sortedPallets.find(p => p.row_num === currentRowNum);
      if (!currentPallet || parseFloat(currentPallet.no_of_bags_remaining?.toString() || '0') <= 0) {
        console.warn(`⚠️ Current pallet RowNum ${currentRowNum} not found or completed, finding first incomplete pallet`);
        currentPallet = sortedPallets.find(p => parseFloat(p.no_of_bags_remaining?.toString() || '0') > 0);
      }

      // Ultimate fallback: Use first pallet
      if (!currentPallet) {
        currentPallet = sortedPallets[0];
      }

      const currentBatchRemaining = currentPallet ? parseFloat(currentPallet.no_of_bags_remaining?.toString() || '0') : 0;

      console.log(`🔄 Using CURRENT BATCH calculation for ingredient ${itemKey}: ${currentBatchRemaining} bags from pallet ${currentPallet?.batch_number || 'unknown'} (RowNum: ${currentPallet?.row_num || 'unknown'})`);
      console.log(`📊 Current pallet details:`, currentPallet ? {
        batch_number: currentPallet.batch_number,
        row_num: currentPallet.row_num,
        remaining: currentPallet.no_of_bags_remaining,
        picked: currentPallet.no_of_bags_picked
      } : 'No pallet found');

      return currentBatchRemaining;
    } else if (palletData.length > 0 && currentIngredientInPalletData !== itemKey) {
      // Pallet data is for wrong ingredient - refresh it
      // INFINITE LOOP FIX: Check if already loading to prevent recursive calls
      const loadKey = `${runNo}-${itemKey}`;
      const isAlreadyLoading = this.palletLoadingStates.get(loadKey);

      if (!isAlreadyLoading) {
        console.log(`⚠️ Pallet data mismatch: have ${currentIngredientInPalletData}, need ${itemKey}. Refreshing...`);
        if (runNo) {
          this.loadPalletTrackingData(runNo, itemKey);
        }
      } else {
        console.log(`⏳ MISMATCH WAIT: Pallet data for ${itemKey} is already loading, skipping refresh`);
      }
    }

    // If no pallet data yet, trigger loading and return 0 (loading state) instead of stale form data
    if (palletData.length === 0) {
      // INFINITE LOOP FIX: Check if already loading to prevent recursive calls
      const loadKey = `${runNo}-${itemKey}`;
      const isAlreadyLoading = this.palletLoadingStates.get(loadKey);

      if (!isAlreadyLoading) {
        console.log(`🔄 No pallet data available for ${itemKey} - triggering load and showing loading state`);
        if (runNo) {
          this.loadPalletTrackingData(runNo, itemKey);
        }
      } else {
        console.log(`⏳ WAIT STATE: Pallet data for ${itemKey} is already loading, returning loading state`);
      }
      return 0; // Show loading state, not stale form data
    }

    // If we get here, use form data as last resort (should rarely happen)
    const fallbackNumber = typeof fallbackValue === 'string' ? parseFloat(fallbackValue) : fallbackValue;
    console.log(`⚠️ Using fallback calculation for ingredient ${itemKey}:`, fallbackNumber);
    return fallbackNumber || 0;
  }

  // Kept for backward compatibility
  private calculateRemainingBagsFromPallets(fallbackValue: string | number): number {
    const currentFormData = this.currentFormData();
    const itemKey = currentFormData?.form_data.item_key || '';
    return this.calculateRemainingBagsFromPalletsForIngredient(itemKey, fallbackValue);
  }

  // Dynamic header status computed signal with pallet data synchronization
  ingredientHeaderStatus = computed(() => {
    const formData = this.currentFormData();
    const palletData = this.palletData();

    if (!formData) return 'unpicked';

    // Primary calculation: Use accurate pallet data (API already filters by ingredient)
    const remainingBagsFromPallets = palletData.reduce((total, pallet) =>
      total + (pallet.no_of_bags_remaining || 0), 0
    );

    // Fallback calculation: Use formData if pallet data unavailable
    const remainingBagsFromForm = parseFloat(formData.form_data.remaining_bags || '0');

    // Use pallet data as primary source, formData as fallback
    const remainingBags = palletData.length > 0 ? remainingBagsFromPallets : remainingBagsFromForm;
    const totalNeededBags = parseFloat(formData.form_data.total_needed_bags || '0');
    const pickedBags = totalNeededBags - remainingBags;

    // Data source validation and logging
    if (palletData.length > 0 && Math.abs(remainingBagsFromPallets - remainingBagsFromForm) > 0.001) {
      console.warn('🔍 Data source discrepancy detected:', {
        palletBased: remainingBagsFromPallets,
        formBased: remainingBagsFromForm,
        usingPalletData: true
      });
    }

    // Data consistency validation
    if (remainingBags < 0) {
      console.warn('🚨 Data inconsistency detected: remaining_bags is negative:', remainingBags);
      return 'unpicked'; // Fallback to safe state
    }

    if (pickedBags < 0) {
      console.warn('🚨 Data inconsistency detected: picked_bags is negative:', pickedBags);
      return 'unpicked'; // Fallback to safe state
    }

    if (pickedBags <= 0) {
      return 'unpicked';    // Brown - no progress
    } else if (pickedBags >= totalNeededBags) {
      return 'completed';   // Green - fully completed
    } else {
      return 'in-progress'; // Amber - partially picked
    }
  });
  
  // Dismiss switch notification
  dismissSwitchNotification(): void {
    this.switchNotification.set({ show: false, message: '' });
  }
  
  // Switch to ingredient method with enhanced workflow
  private switchToIngredient(itemKey: string, lineId: number): void {
    const runNumber = this.productionForm.get('runNumber')?.value;
    
    if (!runNumber) {
      this.errorMessage.set('No run number available for ingredient switching');
      return;
    }
    
    console.log(`🔄 SWITCHING: Switching to ingredient ${itemKey}, manual selection active: ${this.manualIngredientSelection()}`);
    
    this.switchInProgress.set(true);
    
    this.bulkRunsService.loadIngredientByItemKey(runNumber, itemKey).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.currentFormData.set(response.data);
          this.populateForm(response.data);
          
          // Refresh inventory data for new ingredient
          const expectedQty = parseFloat(response.data.form_data.total_needed_bags);
          this.refreshInventoryData(itemKey, expectedQty);
          
          // Refresh pallet tracking data
          const currentItemKey = this.productionForm.get('itemKey')?.value;
          this.loadPalletTrackingData(runNumber, currentItemKey);
          
          // Refresh run-level picked data for print button status
          this.refreshRunLevelPickedData();
          // Refresh run status for status flag
          this.refreshRunStatus();
          
          // Auto-focus on lot number field for barcode scanning workflow
          setTimeout(() => {
            this.focusOnLotField();
          }, 100);
          
          // Reset consecutive completed count for new ingredient
          this.consecutiveCompletedCount.set(0);
          this.switchInProgress.set(false);
          
          console.log('Auto-switched to ingredient:', itemKey);
        }
      },
      error: (error) => {
        console.error('Failed to switch ingredient:', error);
        this.errorMessage.set(error.message || 'Failed to switch to ingredient');
        this.switchInProgress.set(false);
      }
    });
  }

  // Reset pallet numbering for new ingredient
  private resetPalletNumbering(): void {
    const currentPallets = this.palletData();
    if (currentPallets) {
      // Reset all to unpicked state for new ingredient
      const resetPallets = currentPallets.map((pallet: PalletBatch, index: number) => ({
        ...pallet,
        no_of_bags_picked: 0,
        quantity_picked: 0,
        no_of_bags_remaining: pallet.no_of_bags_remaining, // Keep original requirements
        quantity_remaining: pallet.quantity_remaining  // Keep original requirements
      }));
      
      this.palletBatches.set(resetPallets);
    }
  }
  
  // Helper method to check if pick confirmation is ready
  isPickConfirmationReady(): boolean {
    // Check if ingredient is already completed - block confirmation for completed ingredients
    if (this.isCurrentIngredientCompleted()) {
      return false;
    }

    const pendingBags = this.productionForm.get('pendingPickBags')?.value || 0;

    // Only check for quantity selection - allow users to click confirm even without lot/bin
    // The confirmPickOperation() function will show proper error messages for missing lot/bin
    return pendingBags > 0;
  }
  
  // Deprecated method - kept for backward compatibility
  private calculateTotalWeight(): void {
    this.calculateUserInputWeight();
  }
  
  // Dynamic UOM methods based on database lookup
  private getDynamicBagsUOM(itemKey: string): string {
    // For now, return standard UOM based on item analysis
    // This could be enhanced to query INMAST.Salesuomcode or conversion tables
    const formData = this.currentFormData();
    if (formData?.current_ingredient?.inventory?.bulk_pack_size_uom) {
      // Use the bulk pack UOM as the basis for bag counting
      const bulkUom = formData.current_ingredient.inventory.bulk_pack_size_uom;
      if (bulkUom.toUpperCase().includes('BAG')) {
        return 'BAGS';
      }
      if (bulkUom.toUpperCase().includes('SACK')) {
        return 'SACKS';
      }
      if (bulkUom.toUpperCase().includes('KG') || bulkUom.toUpperCase().includes('KILOGRAM')) {
        return 'BAGS'; // Default for KG-based items
      }
    }
    return 'BAGS'; // Default fallback
  }
  
  private getDynamicWeightUOM(itemKey: string): string {
    // Get weight UOM from item master (Stockuomcode) or SOH UOM
    const formData = this.currentFormData();
    
    // First priority: SOH UOM from current ingredient
    if (formData?.current_ingredient?.inventory?.soh_uom) {
      const sohUom = formData.current_ingredient.inventory.soh_uom.toUpperCase();
      if (sohUom === 'KG' || sohUom === 'KILOGRAM') return 'KG';
      if (sohUom === 'LB' || sohUom === 'POUND') return 'LB';  
      if (sohUom === 'G' || sohUom === 'GRAM') return 'G';
      if (sohUom === 'T' || sohUom === 'TON') return 'T';
    }
    
    // Second priority: Based on item key pattern analysis
    // This could be enhanced to query INMAST.Stockuomcode directly
    if (itemKey.toLowerCase().includes('kg')) return 'KG';
    if (itemKey.toLowerCase().includes('lb')) return 'LB';
    
    // Default based on database evidence (INSUGI01 uses KG)
    return 'KG';
  }

  // Story 1.1.1: Modal methods for bulk run selection
  openRunSelectionModal(): void {
    this.showRunModal.set(true);
    this.modalError.set(null);
    this.loadAvailableRuns();
  }

  closeRunSelectionModal(): void {
    this.showRunModal.set(false);
    this.modalRuns.set([]);
    this.modalError.set(null);
    this.isLoadingModalData.set(false);
  }

  loadAvailableRuns(page?: number): void {
    this.isLoadingModalData.set(true);
    this.modalError.set(null);

    const targetPage = page || this.currentPage();
    const limit = this.pageSize();

    // Story 1.4: Use paginated service method
    this.bulkRunsService.listBulkRunsPaginated(targetPage, limit).subscribe({
      next: (response) => {
        this.isLoadingModalData.set(false);
        
        if (response.success && response.data) {
          this.modalRuns.set(response.data.runs);
          this.paginationInfo.set(response.data.pagination);
          this.currentPage.set(response.data.pagination.current_page);
        } else {
          this.modalRuns.set([]);
          this.modalError.set(response.message || 'No active bulk runs found');
          this.paginationInfo.set(null);
        }
      },
      error: (error) => {
        this.isLoadingModalData.set(false);
        this.modalError.set(error.message || 'Failed to load bulk runs');
        this.paginationInfo.set(null);
        console.error('Modal data error:', error);
      }
    });
  }

  // Search functionality for bulk runs modal
  performRunSearch(query: string): void {
    if (!query.trim()) {
      // If empty query, show all runs and clear search state
      this.showAllRuns.set(true);
      this.hasSearchedRuns.set(false);
      this.searchResultRuns.set([]);
      this.loadAvailableRuns(); // Load paginated list
      return;
    }

    // Perform search
    this.isSearchingRuns.set(true);
    this.showAllRuns.set(false);
    this.hasSearchedRuns.set(true);

    this.bulkRunsService.searchBulkRuns(query).subscribe({
      next: (response) => {
        this.isSearchingRuns.set(false);
        if (response.success && response.data) {
          // Extract runs from search results
          const runs: BulkRunSummary[] = response.data.map(result => ({
            run_no: result.run.run_no,
            formula_id: result.run.formula_id,
            formula_desc: result.run.formula_desc,
            status: result.run.status,
            batch_count: result.run.no_of_batches
          }));
          this.searchResultRuns.set(runs);
        } else {
          this.searchResultRuns.set([]);
        }
      },
      error: (error) => {
        this.isSearchingRuns.set(false);
        this.searchResultRuns.set([]);
        console.error('Search error:', error);
      }
    });
  }

  // Get the current display runs (either search results or all runs)
  getDisplayRuns(): BulkRunSummary[] {
    return this.showAllRuns() ? this.modalRuns() : this.searchResultRuns();
  }

  // Story 1.4: Pagination navigation methods
  goToPage(page: number): void {
    if (page >= 1 && page <= (this.paginationInfo()?.total_pages || 1)) {
      this.loadAvailableRuns(page);
    }
  }

  goToPreviousPage(): void {
    const currentPage = this.currentPage();
    if (currentPage > 1) {
      this.goToPage(currentPage - 1);
    }
  }

  goToNextPage(): void {
    const currentPage = this.currentPage();
    const totalPages = this.paginationInfo()?.total_pages || 1;
    if (currentPage < totalPages) {
      this.goToPage(currentPage + 1);
    }
  }

  goToFirstPage(): void {
    this.goToPage(1);
  }

  goToLastPage(): void {
    const totalPages = this.paginationInfo()?.total_pages || 1;
    this.goToPage(totalPages);
  }

  getPaginationPages(): number[] {
    const pagination = this.paginationInfo();
    if (!pagination) return [];

    const totalPages = pagination.total_pages;
    const currentPage = pagination.current_page;
    const pages: number[] = [];

    // Show up to 5 pages centered around current page
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // Lot search pagination navigation methods
  goToLotPage(page: number): void {
    if (page >= 1 && page <= (this.lotPaginationInfo()?.total_pages || 1)) {
      this.loadLotSearchResultsPaginated(page);
    }
  }

  goToPreviousLotPage(): void {
    const currentPage = this.lotCurrentPage();
    if (currentPage > 1) {
      this.goToLotPage(currentPage - 1);
    }
  }

  goToNextLotPage(): void {
    const currentPage = this.lotCurrentPage();
    const totalPages = this.lotPaginationInfo()?.total_pages || 1;
    if (currentPage < totalPages) {
      this.goToLotPage(currentPage + 1);
    }
  }

  goToFirstLotPage(): void {
    this.goToLotPage(1);
  }

  goToLastLotPage(): void {
    const totalPages = this.lotPaginationInfo()?.total_pages || 1;
    this.goToLotPage(totalPages);
  }

  getLotPaginationPages(): number[] {
    const pagination = this.lotPaginationInfo();
    if (!pagination) return [];
    const totalPages = pagination.total_pages;
    const currentPage = pagination.current_page;
    const pages: number[] = [];

    // Show up to 5 pages centered around current page
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  selectRunFromModal(run: BulkRunSummary): void {
    // Set the run number in the form field
    this.productionForm.patchValue({
      runNumber: run.run_no.toString()
    });
    
    // Close modal
    this.closeRunSelectionModal();
    
    // Auto-trigger the search to populate form data
    this.loadFormData(run.run_no);
  }

  // Action handlers

  onSubmit(): void {
    if (!this.isFormValid()) {
      this.errorMessage.set('Please complete the required fields');
      return;
    }

    const formData = this.currentFormData();
    if (!formData) {
      this.errorMessage.set('No run data available');
      return;
    }

    this.isProcessing.set(true);
    this.errorMessage.set(null);

    console.log('Completing assembly...', {
      runNo: formData.run.run_no,
      form: this.productionForm.value,
      palletData: this.palletData()
    });

    // Assembly completion will be implemented in Story 1.7
    setTimeout(() => {
      this.isProcessing.set(false);
      alert('Assembly completed successfully!');
      this.goBack();
    }, 2000);
  }

  /**
   * Reset component state when switching between runs to prevent state leakage
   */
  private resetComponentState(): void {
    console.log('🔄 RESET STATE: Clearing component state for new run');
    
    // Clear manual ingredient selection flag that was blocking new run loads
    this.manualIngredientSelection.set(false);
    
    // Clear any existing error messages
    this.errorMessage.set(null);
    
    // Clear current form data to ensure fresh start
    this.currentFormData.set(null);
    
    // Clear search results from previous run
    this.searchResults.set([]);
    
    // Clear pallet data from previous run
    this.palletData.set([]);
    
    // Clear lot search data from previous ingredient selection
    this.lotSearchResults.set([]);
    
    // Clear bin search data from previous ingredient selection  
    this.availableBinsForLot.set([]);
    
    // Clear item search results modal state
    this.itemSearchResults.set([]);
    this.showItemSearchModal.set(false);
  }

  // Print functionality methods
  showMessage(message: string): void {
    console.log('[BulkPicking]', message);
    // TODO: Replace with proper toast/notification service
  }

  printLabelsDirectly(): void {
    const formData = this.currentFormData();
    if (!formData?.run) {
      this.showMessage('No run data available for printing');
      return;
    }

    console.log('🖨️ Starting print process for run:', formData.run.run_no);
    
    // Check if we have run-level picked data cached
    const runLevelPickedData = this.pickedLotsData();
    if (runLevelPickedData && runLevelPickedData.picked_lots && runLevelPickedData.picked_lots.length > 0) {
      console.log('✅ Using cached run-level picked data for printing:', runLevelPickedData.picked_lots.length, 'lots');
      
      // Use the run-level picked data directly for printing
      const pickedItems = this.transformPickedLotsToPickedItems(runLevelPickedData.picked_lots);
      const completedBatches = [...new Set(runLevelPickedData.picked_lots.map(lot => lot.batch_no))];
      
      // Call print service with run-level data
      this.printDataService.printLabelsFromComponentData(formData.run, pickedItems, completedBatches);
      return;
    }
    
    // Fallback: Fetch ALL ingredients and picked data for the entire run
    this.fetchCompleteRunDataForPrint(formData.run.run_no)
      .then(completeRunData => {
        console.log('✅ Complete run data fetched:', completeRunData);
        
        // Transform complete data into print format
        const pickedItems = this.transformCompleteRunDataToPickedItems(completeRunData);
        const completedBatches = this.getCompletedBatchesFromCompleteData(completeRunData);
        
        // Enhance run data with suggested lot/bin information
        const enhancedRunData = {
          ...formData.run,
          suggested_lot: this.productionForm?.get('suggestedLotNumber')?.value || '',
          suggested_bin: this.productionForm?.get('suggestedBinNumber')?.value || ''
        };
        
        console.log('🔍 PRINT DEBUG - Complete Run Data:', {
          runData: enhancedRunData,
          allIngredients: completeRunData.allIngredients?.length || 0,
          pickedLotsCount: completeRunData.pickedLots?.length || 0,
          pickedItemsCount: pickedItems.length,
          completedBatchesCount: completedBatches.length
        });
        
        // Print using comprehensive data
        this.printDataService.printLabelsFromComponentData(
          enhancedRunData, 
          pickedItems, 
          completedBatches
        );
        
        this.showMessage(`Printing ${completedBatches.length} label(s) with all ingredients...`);
      })
      .catch(error => {
        console.error('Failed to fetch complete run data:', error);
        this.showMessage('Failed to fetch run data for printing. Please try again.');
      });
  }

  hasPrintableData(): boolean {
    const formData = this.currentFormData();
    if (!formData?.run) return false;
    
    // Check if there are any picked items across ALL ingredients in the run
    return this.hasRunLevelPickedData();
  }

  // New run-level print status check
  private hasRunLevelPickedData(): boolean {
    const formData = this.currentFormData();
    if (!formData?.run) return false;
    
    // Use existing cached data if available
    const pickedLotsData = this.pickedLotsData();
    if (pickedLotsData && pickedLotsData.picked_lots && pickedLotsData.picked_lots.length > 0) {
      return true;
    }
    
    // Fallback to current ingredient's pallet data for immediate response
    return this.getCompletedBatchCount() > 0;
  }

  // Refresh run-level picked data for print button status
  private refreshRunLevelPickedData(): void {
    const formData = this.currentFormData();
    if (!formData?.run) return;
    
    const runNo = formData.run.run_no;
    this.bulkRunsService.getAllPickedLotsForRun(runNo).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.pickedLotsData.set(response.data);
          console.log(`🖨️ PRINT STATUS: Refreshed run-level picked data - ${response.data.picked_lots.length} picked lots found`);
        } else {
          this.pickedLotsData.set(null);
        }
      },
      error: (error) => {
        console.warn('Failed to refresh run-level picked data for print status:', error);
        this.pickedLotsData.set(null);
      }
    });
  }

  // Refresh run status for status flag display
  private refreshRunStatus(): void {
    const formData = this.currentFormData();
    if (!formData?.run) return;

    const runNo = formData.run.run_no;
    this.isLoadingStatus.set(true);

    this.bulkRunsService.getBulkRunStatus(runNo).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.currentRunStatus.set(response.data);
          // Also update the status manager's state
          this.runStatusManager.setCurrentStatus(runNo, response.data.status);
          console.log(`🏁 STATUS FLAG: Run ${runNo} status: ${response.data.status}`);
        } else {
          this.currentRunStatus.set(null);
          console.warn(`⚠️ STATUS FLAG: No status data for run ${runNo}`);
        }
        this.isLoadingStatus.set(false);
      },
      error: (error) => {
        console.warn('Failed to refresh run status:', error);
        this.currentRunStatus.set(null);
        this.isLoadingStatus.set(false);
      }
    });
  }

  // Get status flag color based on current run status
  getStatusFlagColor(): string {
    const status = this.currentRunStatus()?.status;
    switch (status) {
      case 'PRINT':
        return 'tw-bg-red-500 tw-text-white tw-border-red-600'; // RED for PRINT
      case 'NEW':
        return 'tw-bg-green-500 tw-text-white tw-border-green-600'; // GREEN for NEW
      default:
        return 'tw-bg-gray-500 tw-text-white tw-border-gray-600'; // Gray for unknown/other
    }
  }

  // Get status flag text for display
  getStatusText(): string {
    const status = this.currentRunStatus()?.status;
    switch (status) {
      case 'PRINT':
        return 'PRINT';
      case 'NEW':
        return 'NEW';
      default:
        return 'UNKNOWN';
    }
  }

  // Get status flag tooltip text
  getStatusFlagTooltip(): string {
    const status = this.currentRunStatus()?.status;
    const runNo = this.currentRunStatus()?.run_no;
    switch (status) {
      case 'PRINT':
        return `Run ${runNo}: Ready to print labels`;
      case 'NEW':
        return `Run ${runNo}: Picking in progress`;
      default:
        return `Run ${runNo}: Status ${status || 'Unknown'}`;
    }
  }

  /**
   * **REVERT STATUS FUNCTIONALITY** - Confirm and revert run status from PRINT to NEW
   * Shows confirmation dialog and executes revert operation
   */
  confirmAndRevertStatus(): void {
    const runNo = this.currentRunStatus()?.run_no;
    if (!runNo) {
      console.warn('⚠️ No run number available for status revert');
      return;
    }

    // Show confirmation dialog
    const confirmed = confirm(
      `Are you sure you want to revert Run ${runNo} status from PRINT back to NEW?\n\n` +
      `This will allow you to make changes and unpick ingredients if needed.\n\n` +
      `Click OK to proceed, or Cancel to abort.`
    );

    if (confirmed) {
      this.executeStatusRevert(runNo);
    }
  }

  /**
   * Execute the status revert operation
   */
  private executeStatusRevert(runNo: number): void {
    this.isRevertingStatus.set(true);
    console.log(`🔄 COMPONENT: Starting status revert for run ${runNo}`);

    this.bulkRunsService.revertRunStatus(runNo).subscribe({
      next: (response) => {
        this.isRevertingStatus.set(false);

        if (response.success) {
          console.log(`✅ COMPONENT: Successfully reverted run ${runNo} status to NEW`);

          // Update the current run status with the response data
          if (response.data) {
            this.currentRunStatus.set(response.data);
          }

          // Refresh the run status to ensure UI is up to date
          this.refreshRunStatus();

          // Show success message
          alert(`✅ Run ${runNo} status successfully reverted from PRINT to NEW!\n\nYou can now make changes and unpick ingredients if needed.`);

        } else {
          console.warn(`⚠️ COMPONENT: Failed to revert run ${runNo} status: ${response.message}`);
          alert(`⚠️ Failed to revert run status: ${response.message}`);
        }
      },
      error: (error) => {
        this.isRevertingStatus.set(false);
        console.error(`❌ COMPONENT: Error reverting run ${runNo} status:`, error);

        const errorMessage = error.message || 'Unknown error occurred';
        alert(`❌ Error reverting run status: ${errorMessage}\n\nPlease try again or contact support if the problem persists.`);
      }
    });
  }

  // Transform picked lots data to format expected by print service
  private transformPickedLotsToPickedItems(pickedLots: PickedLot[]): any[] {
    return pickedLots.map(lot => ({
      lot_no: lot.lot_no,
      batch_no: lot.batch_no,
      item_key: lot.item_key,
      item_desc: lot.item_key, // Use item_key as description fallback
      quantity_picked: lot.alloc_lot_qty, // Use allocated quantity as picked quantity
      bin_location: lot.bin_no,
      expiry_date: lot.date_exp || '',
      pack_size: lot.pack_size,
      ingredient_name: lot.item_key
    }));
  }

  getPrintButtonText(): string {
    const hasRunLevelPicks = this.hasRunLevelPickedData();
    if (!hasRunLevelPicks) return 'Print';
    return 'Print Label';
  }

  getPrintButtonTitle(): string {
    const hasRunLevelPicks = this.hasRunLevelPickedData();
    if (!hasRunLevelPicks) return 'No completed batches to print';
    
    const pickedLotsData = this.pickedLotsData();
    if (pickedLotsData && pickedLotsData.picked_lots) {
      const count = pickedLotsData.picked_lots.length;
      return `Print ${count} label${count === 1 ? '' : 's'} for picked lots`;
    }
    
    const count = this.getCompletedBatchCount();
    return `Print ${count} label${count === 1 ? '' : 's'} for completed batches`;
  }

  private getCompletedBatchCount(): number {
    const formData = this.currentFormData();
    if (!formData) return 0;
    
    // Check if there are any pallets with picked quantities
    const palletData = this.palletData();
    if (!palletData || palletData.length === 0) return 0;
    
    // Count batches (pallets) that have any picked quantity > 0
    let completedCount = 0;
    for (const pallet of palletData) {
      if (pallet.quantity_picked && this.parseQuantity(pallet.quantity_picked) > 0) {
        completedCount++;
      }
    }
    
    return completedCount;
  }

  private transformFormDataToPickedItems(formData: BulkRunFormData): any[] {
    // Get pallet data which contains all the picked information
    const palletData = this.palletData();
    if (!palletData || palletData.length === 0) {
      return [];
    }

    const pickedItems: any[] = [];
    const currentIngredient = formData.current_ingredient;

    // Create picked items from pallet data for current ingredient
    for (const pallet of palletData) {
      if (pallet.no_of_bags_picked && pallet.no_of_bags_picked > 0) {
        const pickedItem = {
          run_no: formData.run.run_no,
          batch_no: pallet.batch_number || `Batch-${pallet.row_num}`, // Use actual batch_number from pallet
          line_id: currentIngredient?.ingredient?.line_id || 1,
          item_key: currentIngredient?.ingredient?.item_key || '',
          picked_bulk_qty: pallet.no_of_bags_picked, // Use actual bag count instead of weight
          picked_qty: pallet.quantity_picked || 0, // Keep weight for total quantity display
          unit: currentIngredient?.ingredient?.uom || 'KG',
          pack_size: currentIngredient?.ingredient?.pack_size || 20,
          modified_by: this.getCurrentUser()?.username || 'SYSTEM',
          picking_date: new Date().toISOString(),
          // Add lot and bin info if available - will be enhanced in next step
          lot_no: this.productionForm?.get('suggestedLotNumber')?.value || '',
          bin_no: this.productionForm?.get('suggestedBinNumber')?.value || '',
          // Additional fields for print labels
          description: currentIngredient?.ingredient?.description || '',
          row_num: pallet.row_num,
          pallet_number: pallet.pallet_number
        };
        
        // Debug logging for picked item
        console.log('🔍 PICKED ITEM DEBUG:', {
          batchNo: pickedItem.batch_no,
          itemKey: pickedItem.item_key,
          lotNo: pickedItem.lot_no,
          binNo: pickedItem.bin_no,
          formSuggestedLot: formData.form_data?.suggestedLotNumber,
          formSuggestedBin: formData.form_data?.suggestedBinNumber
        });
        
        pickedItems.push(pickedItem);
      }
    }

    return pickedItems;
  }

  private getCurrentUser(): any {
    // This should get the current user from auth service
    // For now returning null to use fallback logic in print service
    return null;
  }

  /**
   * Fetch complete run data including ALL ingredients and picked lots
   */
  private async fetchCompleteRunDataForPrint(runNo: number): Promise<CompleteRunData> {
    try {
      // Fetch all ingredients in the run
      const ingredientsResponse = await this.bulkRunsService.searchRunItems(runNo).toPromise();
      const allIngredients = ingredientsResponse?.data || [];
      
      // Fetch all picked lots for the entire run
      const pickedLotsResponse = await this.bulkRunsService.getAllPickedLotsForRun(runNo).toPromise();
      const pickedLots = pickedLotsResponse?.data?.picked_lots || [];
      
      console.log('📊 Fetched run data:', {
        runNo: runNo,
        allIngredients: allIngredients.length,
        pickedLots: pickedLots.length,
        ingredientKeys: allIngredients.map(i => i.item_key),
        pickedBatches: [...new Set(pickedLots.map(lot => lot.batch_no))]
      });
      
      return {
        runNo: runNo,
        allIngredients: allIngredients,
        pickedLots: pickedLots
      };
    } catch (error) {
      console.error('Error fetching complete run data:', error);
      throw error;
    }
  }

  private getCompletedBatchesFromFormData(formData: BulkRunFormData): string[] {
    // Check if there are any pallets with picked bags
    const palletData = this.palletData();
    if (!palletData || palletData.length === 0) return [];
    
    const completedBatches: string[] = [];
    const uniqueBatches = new Set<string>();
    
    for (const pallet of palletData) {
      if (pallet.no_of_bags_picked && pallet.no_of_bags_picked > 0) {
        // Use actual batch_number from pallet data instead of pallet_number
        const batchNo = pallet.batch_number || `Batch-${pallet.row_num}`;
        if (!uniqueBatches.has(batchNo)) {
          uniqueBatches.add(batchNo);
          completedBatches.push(batchNo);
        }
      }
    }
    
    return completedBatches.sort();
  }

  /**
   * Transform complete run data (all ingredients + picked lots) into print format
   */
  private transformCompleteRunDataToPickedItems(completeRunData: CompleteRunData): any[] {
    const pickedItems: any[] = [];
    
    // Group picked lots by batch number and item key
    const batchItemMap = new Map<string, Map<string, PickedLot[]>>();
    
    for (const pickedLot of completeRunData.pickedLots) {
      const batchKey = pickedLot.batch_no;
      const itemKey = pickedLot.item_key;
      
      if (!batchItemMap.has(batchKey)) {
        batchItemMap.set(batchKey, new Map());
      }
      
      const itemMap = batchItemMap.get(batchKey)!;
      if (!itemMap.has(itemKey)) {
        itemMap.set(itemKey, []);
      }
      
      itemMap.get(itemKey)!.push(pickedLot);
    }
    
    console.log('🔍 Batch-Item mapping:', {
      totalBatches: batchItemMap.size,
      batchKeys: Array.from(batchItemMap.keys()),
      batchItemCounts: Array.from(batchItemMap.entries()).map(([batch, items]) => ({
        batch,
        itemCount: items.size,
        items: Array.from(items.keys())
      }))
    });
    
    // Create picked items for each batch-item combination
    for (const [batchNo, itemMap] of batchItemMap.entries()) {
      for (const [itemKey, lots] of itemMap.entries()) {
        // Find ingredient details
        const ingredient = completeRunData.allIngredients.find(ing => ing.item_key === itemKey);
        
        if (!ingredient) {
          console.warn(`No ingredient found for item_key: ${itemKey}`);
          continue;
        }
        
        // Calculate total quantities from all lots for this batch-item
        const totalQtyReceived = lots.reduce((sum, lot) => sum + lot.qty_received, 0);
        const totalAllocQty = lots.reduce((sum, lot) => sum + lot.alloc_lot_qty, 0);
        
        // Use first lot for lot/bin info (primary lot for this batch-item)
        const primaryLot = lots[0];
        
        const pickedItem = {
          run_no: completeRunData.runNo,
          batch_no: batchNo,
          line_id: ingredient.line_id,
          item_key: itemKey,
          description: ingredient.description,
          picked_bulk_qty: Math.ceil(totalQtyReceived / parseFloat(ingredient.pack_size)), // Calculate bags from weight
          picked_qty: totalQtyReceived, // Total weight
          unit: ingredient.uom,
          pack_size: parseFloat(ingredient.pack_size),
          // Use primary lot for lot/bin information
          lot_no: primaryLot.lot_no,
          bin_no: primaryLot.bin_no,
          modified_by: primaryLot.rec_userid || 'SYSTEM',
          picking_date: primaryLot.rec_date,
          // Additional fields for print labels
          row_num: primaryLot.row_num,
          location: ingredient.location
        };
        
        pickedItems.push(pickedItem);
        
        console.log('✅ Created picked item:', {
          batchNo: batchNo,
          itemKey: itemKey,
          description: ingredient.description,
          lotNo: primaryLot.lot_no,
          binNo: primaryLot.bin_no,
          bags: pickedItem.picked_bulk_qty,
          weight: pickedItem.picked_qty
        });
      }
    }
    
    console.log(`📦 Generated ${pickedItems.length} picked items from complete run data`);
    return pickedItems;
  }

  /**
   * Get completed batches from complete run data
   */
  private getCompletedBatchesFromCompleteData(completeRunData: CompleteRunData): string[] {
    const completedBatches = [...new Set(completeRunData.pickedLots.map(lot => lot.batch_no))];
    return completedBatches.sort();
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


  /**
   * Calculate number of bags from picked quantity and pack size
   */
  getBagsCount(allocQty: number, packSize: number): number {
    if (!packSize || packSize <= 0) return 0;
    return Math.round(allocQty / packSize);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
