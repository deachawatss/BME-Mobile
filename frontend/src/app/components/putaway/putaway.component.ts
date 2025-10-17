import { Component, signal, computed, effect, inject, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

// Services
import { PutawayService, LotSearchResponse, BinValidationResponse, BinTransferRequest, TransactionResponse, LotSearchItem, BinSearchItem } from '../../services/putaway.service';
import { AuthService } from '../../services/auth.service';

// Components
import { LotSelectionModalComponent } from '../lot-selection-modal/lot-selection-modal.component';
import { BinSelectionModalComponent } from '../bin-selection-modal/bin-selection-modal.component';

// Models
interface LotDetails {
  lotNumber: string;
  binNumber: string;
  itemKey: string;
  location: string;
  uom: string;
  qtyOnHand: number;
  qtyAvail: number;
  expDate: string;
  lotStatus: string;
}

interface BinValidation {
  binNo: string;
  location: string;
  isValid: boolean;
  message: string;
}

interface PutawayRequest {
  lot_no: string;
  item_key: string;
  location: string;
  bin_from: string;
  bin_to: string;
  transfer_qty: number;
  user_id: string;
}

@Component({
  selector: 'app-putaway',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LotSelectionModalComponent,
    BinSelectionModalComponent
  ],
  template: `
    <!-- NWFTH Putaway Interface - Pure Tailwind v4 Implementation -->
    <div class="tw-min-h-screen tw-bg-gradient-to-br tw-from-gray-50 tw-to-gray-100 tw-flex tw-items-center tw-justify-center tw-p-3 sm:tw-p-4 lg:tw-p-6">
      <div class="tw-w-full tw-max-w-5xl tw-mx-auto">
        
        <!-- Main Dialog Card -->
        <div class="nwfth-card tw-overflow-hidden tw-bg-white">
          
          <!-- Dialog Header -->
          <div class="nwfth-button-primary tw-border-b tw-border-gray-200 tw-p-4 sm:tw-p-6">
            <div class="tw-flex tw-items-center tw-justify-between">
              <h2 class="tw-text-xl sm:tw-text-2xl tw-font-bold tw-text-white tw-flex tw-items-center tw-gap-3">
                <span class="tw-text-2xl sm:tw-text-3xl">📦</span>
                <span class="tw-tracking-wide">Putaways</span>
              </h2>
              <button 
                type="button"
                (click)="goBack()"
                class="tw-bg-white/20 hover:tw-bg-white/30 tw-text-white tw-p-2 tw-rounded-lg tw-transition-all tw-duration-200 hover:tw-scale-105"
                aria-label="Close putaway dialog">
                ✕
              </button>
            </div>
          </div>

          <!-- Dialog Content -->
          <div class="tw-p-4 sm:tw-p-6">
            <form [formGroup]="putawayForm" (ngSubmit)="onSubmit()">
              
              <div class="tw-space-y-6">
                
                <!-- Item Information Header -->
                <div class="tw-space-y-2">
                  <h3 class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-tracking-wide tw-uppercase">Item Information</h3>
                  <div class="tw-h-px tw-bg-gray-200"></div>
                </div>
                
                <!-- Responsive Grid Layout -->
                <div class="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-4">
                
                  <!-- Lot # -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="lotNumber" class="tw-text-sm tw-font-semibold tw-text-gray-700">Lot #</label>
                    <div class="tw-relative">
                      <input
                        #lotNumberInput
                        id="lotNumber"
                        type="text"
                        formControlName="lotNumber"
                        placeholder="Enter lot number"
                        class="nwfth-input tw-w-full tw-pr-14 tw-px-3 tw-py-2 tw-text-sm"
                        [class.tw-animate-pulse]="isSearching()"
                        [class.tw-border-blue-300]="isSearching()"
                        (keydown.enter)="onSearchLot()"
                      />
                      <button
                        type="button"
                        (click)="onSearchLot()"
                        [disabled]="isSearching() || isProcessing()"
                        class="nwfth-button-primary tw-absolute tw-right-0 tw-inset-y-0 tw-w-12 tw-border-l tw-border-gray-300 tw-rounded-r-lg tw-flex tw-items-center tw-justify-center tw-text-white tw-text-sm hover:tw-bg-opacity-90 tw-transition-all tw-duration-200 tw-disabled:opacity-60"
                        aria-label="Search lot number">
                        <span *ngIf="isSearching(); else searchIcon" class="tw-w-3 tw-h-3 tw-border tw-border-current tw-border-t-transparent tw-rounded-full tw-animate-spin"></span>
                        <ng-template #searchIcon>🔍</ng-template>
                      </button>
                    </div>
                  </div>

                  <!-- Bin # -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="binNumber" class="tw-text-sm tw-font-semibold tw-text-gray-700">Bin #</label>
                    <input
                      id="binNumber"
                      type="text"
                      formControlName="binNumber"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- ItemKey -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="itemKey" class="tw-text-sm tw-font-semibold tw-text-gray-700">ItemKey</label>
                    <input
                      id="itemKey"
                      type="text"
                      formControlName="itemKey"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- Location -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="location" class="tw-text-sm tw-font-semibold tw-text-gray-700">Location</label>
                    <input
                      id="location"
                      type="text"
                      formControlName="location"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- UOM -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="uom" class="tw-text-sm tw-font-semibold tw-text-gray-700">UOM</label>
                    <input
                      id="uom"
                      type="text"
                      formControlName="uom"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- QtyOnHand -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="qtyOnHand" class="tw-text-sm tw-font-semibold tw-text-gray-700">QtyOnHand</label>
                    <input
                      id="qtyOnHand"
                      type="text"
                      formControlName="qtyOnHand"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- Qty Avail -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="qtyAvail" class="tw-text-sm tw-font-semibold tw-text-gray-700">Qty Avail</label>
                    <input
                      id="qtyAvail"
                      type="text"
                      formControlName="qtyAvail"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- Exp Date -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="expDate" class="tw-text-sm tw-font-semibold tw-text-gray-700">Exp Date</label>
                    <input
                      id="expDate"
                      type="text"
                      formControlName="expDate"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>
                </div>

                <!-- Process Details Section -->
                <div class="tw-space-y-2">
                  <h3 class="tw-text-sm tw-font-semibold tw-text-gray-700 tw-tracking-wide tw-uppercase">Process Details</h3>
                  <div class="tw-h-px tw-bg-gray-200"></div>
                </div>
                
                <!-- Process Details Grid -->
                <div class="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-4">
                  <!-- Putaway Qty -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="putawayQty" class="tw-text-sm tw-font-semibold tw-text-gray-700">Putaway Qty</label>
                    <input
                      id="putawayQty"
                      type="number"
                      formControlName="putawayQty"
                      placeholder="0.000"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>
                  
                  <!-- Print Report Checkbox -->
                  <div class="tw-flex tw-flex-col tw-gap-2 tw-justify-end">
                    <div class="tw-flex tw-items-center tw-gap-3 tw-h-10">
                      <input 
                        type="checkbox" 
                        id="printReport" 
                        formControlName="printReport" 
                        class="tw-w-5 tw-h-5 tw-border-2 tw-border-gray-300 tw-rounded tw-bg-white tw-cursor-pointer tw-transition-all tw-duration-200 checked:tw-bg-blue-600 checked:tw-border-blue-600 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-amber-500 focus-visible:tw-ring-offset-2" />
                      <label for="printReport" class="tw-text-sm tw-font-medium tw-text-gray-700 tw-cursor-pointer tw-select-none">Print Report</label>
                    </div>
                  </div>
                </div>

                <!-- To Bin # - Full Width -->
                <div class="tw-flex tw-flex-col tw-gap-2">
                  <label for="toBinNumber" class="tw-text-sm tw-font-semibold tw-text-gray-700">To Bin #</label>
                  <div class="tw-relative tw-max-w-md">
                    <input
                      id="toBinNumber"
                      type="text"
                      formControlName="toBinNumber"
                      placeholder="Enter destination bin"
                      class="nwfth-input tw-w-full tw-pr-14 tw-px-3 tw-py-2 tw-text-sm"
                      (blur)="validateDestinationBin()"
                      (keydown.enter)="onSearchToBin()"
                    />
                    <button 
                      type="button" 
                      (click)="onSearchToBin()" 
                      [disabled]="isValidatingBin() || isProcessing()"
                      class="nwfth-button-primary tw-absolute tw-right-0 tw-inset-y-0 tw-w-12 tw-border-l tw-border-gray-300 tw-rounded-r-lg tw-flex tw-items-center tw-justify-center tw-text-white tw-text-sm hover:tw-bg-opacity-90 tw-transition-all tw-duration-200 tw-disabled:opacity-60" 
                      aria-label="Search destination bin">
                      <span *ngIf="isValidatingBin(); else binSearchIcon" class="tw-w-3 tw-h-3 tw-border tw-border-current tw-border-t-transparent tw-rounded-full tw-animate-spin"></span>
                      <ng-template #binSearchIcon>🔍</ng-template>
                    </button>
                  </div>
                </div>

                <!-- Remarks and Referenced Fields - Two Column Grid -->
                <div class="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-4">
                  <!-- Remarks -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="remarks" class="tw-text-sm tw-font-semibold tw-text-gray-700">Remarks (Optional)</label>
                    <input
                      id="remarks"
                      type="text"
                      formControlName="remarks"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>

                  <!-- Referenced -->
                  <div class="tw-flex tw-flex-col tw-gap-2">
                    <label for="referenced" class="tw-text-sm tw-font-semibold tw-text-gray-700">Reference Number (Optional)</label>
                    <input
                      id="referenced"
                      type="text"
                      formControlName="referenced"
                      class="nwfth-input tw-w-full tw-px-3 tw-py-2 tw-text-sm"
                    />
                  </div>
                </div>

              </div>

              <!-- Processing Progress Indicator -->
              <div *ngIf="isProcessing()" class="tw-my-4 tw-p-4 tw-bg-blue-50 tw-border tw-border-blue-200 tw-rounded-lg">
                <div class="tw-flex tw-items-center tw-gap-3 tw-mb-3">
                  <div class="tw-w-6 tw-h-6 tw-border-2 tw-border-blue-600 tw-border-t-transparent tw-rounded-full tw-animate-spin"></div>
                  <div>
                    <h4 class="tw-text-sm tw-font-medium tw-text-blue-800">Processing Transfer</h4>
                    <p class="tw-text-xs tw-text-blue-600">{{ processingStep() || 'Initializing transfer...' }}</p>
                  </div>
                </div>
                
                <!-- Progress Bar -->
                <div class="tw-w-full tw-bg-blue-100 tw-rounded-full tw-h-2 tw-mb-2">
                  <div 
                    class="tw-bg-blue-600 tw-h-2 tw-rounded-full tw-transition-all tw-duration-300 tw-ease-out"
                    [style.width.%]="processingProgress()">
                  </div>
                </div>
                <div class="tw-text-xs tw-text-blue-600 tw-text-center">{{ processingProgress() }}% complete</div>
              </div>

              <!-- Enhanced Error/Success Messages -->
              <div class="tw-my-4 tw-min-h-[1.5rem] tw-flex tw-flex-col tw-gap-2">
                <!-- Enhanced Error Message with Categorization -->
                <div *ngIf="errorMessage()" class="tw-p-4 tw-bg-red-50 tw-border tw-border-red-200 tw-rounded-lg tw-flex tw-items-start tw-gap-3">
                  <div class="tw-flex-shrink-0">
                    <svg class="tw-w-5 tw-h-5 tw-text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="tw-flex-grow">
                    <h4 class="tw-text-sm tw-font-medium tw-text-red-800 tw-mb-2">{{ getErrorTitle() }}</h4>
                    <p class="tw-text-sm tw-text-red-700 tw-mb-2">{{ errorMessage() }}</p>
                    
                    <!-- Error Details Breakdown -->
                    <div *ngIf="errorDetails()" class="tw-text-xs tw-text-red-600 tw-bg-red-25 tw-p-2 tw-rounded tw-border tw-border-red-100">
                      <div class="tw-font-medium tw-mb-1">Details:</div>
                      <div class="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-1">
                        <div *ngIf="errorDetails().requested"><span class="tw-font-medium">Requested:</span> {{ errorDetails().requested }} {{ selectedLot()?.uom || 'units' }}</div>
                        <div *ngIf="errorDetails().available"><span class="tw-font-medium">Available:</span> {{ errorDetails().available }} {{ selectedLot()?.uom || 'units' }}</div>
                        <div *ngIf="errorDetails().lot_no"><span class="tw-font-medium">Lot #:</span> {{ errorDetails().lot_no }}</div>
                        <div *ngIf="errorDetails().bin_no"><span class="tw-font-medium">Bin:</span> {{ errorDetails().bin_no }}</div>
                        <div *ngIf="errorDetails().location"><span class="tw-font-medium">Location:</span> {{ errorDetails().location }}</div>
                      </div>
                    </div>
                    
                    <!-- User Guidance -->
                    <div class="tw-mt-2 tw-text-xs tw-text-red-600">
                      <span class="tw-font-medium">💡 Suggestion:</span> {{ getErrorGuidance() }}
                    </div>
                  </div>
                </div>

                <!-- Simple Success Message -->
                <div *ngIf="showSimpleSuccess()" 
                     class="tw-p-4 tw-bg-green-50 tw-border tw-border-green-200 tw-rounded-lg tw-flex tw-items-center tw-gap-3 tw-transition-all tw-duration-300">
                  <div class="tw-flex-shrink-0">
                    <div class="tw-w-8 tw-h-8 tw-bg-green-400 tw-rounded-full tw-flex tw-items-center tw-justify-center">
                      <svg class="tw-w-5 tw-h-5 tw-text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L8.53 10.53a.75.75 0 00-1.06 1.061l2.03 2.03a.75.75 0 001.137-.089l3.857-5.401z" clip-rule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div class="tw-flex-grow">
                    <h4 class="tw-text-lg tw-font-bold tw-text-green-800">{{ successMessage() }}</h4>
                    <p class="tw-text-sm tw-text-green-600">Form will clear automatically in 2 seconds...</p>
                  </div>
                </div>
              </div>

              <!-- Dialog Footer Buttons -->
              <div class="tw-flex tw-justify-end tw-items-center tw-gap-4 tw-pt-4 tw-border-t tw-border-gray-200">
                <button
                  type="button"
                  (click)="onCancel()"
                  [disabled]="isProcessing()"
                  class="nwfth-button-secondary tw-px-8 tw-py-3 tw-min-h-[44px] tw-disabled:opacity-60 tw-disabled:cursor-not-allowed">
                  Cancel
                </button>
                
                <button
                  type="submit"
                  [disabled]="!isFormValid() || isProcessing()"
                  [class]="buttonClass() + ' tw-px-12 tw-py-3 tw-min-h-[44px] tw-flex tw-items-center tw-gap-2'">
                  <span *ngIf="isProcessing()" class="tw-w-4 tw-h-4 tw-border-2 tw-border-current tw-border-t-transparent tw-rounded-full tw-animate-spin"></span>
                  <span>{{ getProcessingButtonText() }}</span>
                </button>
              </div>

            </form>
          </div>
        </div>

      </div>
    </div>

    <!-- Lot Selection Modal -->
    <app-lot-selection-modal
      [isOpen]="isLotModalOpen"
      [initialFilter]="initialSearchFilter()"
      (lotSelected)="onLotSelected($event)"
      (modalClosed)="onLotModalClosed()">
    </app-lot-selection-modal>

    <!-- Bin Selection Modal -->
    <app-bin-selection-modal
      [isOpen]="isBinModalOpen"
      [initialFilter]="initialBinSearchFilter()"
      (binSelected)="onBinSelected($event)"
      (modalClosed)="onBinModalClosed()">
    </app-bin-selection-modal>
  `
})
export class PutawayComponent implements AfterViewInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private putawayService = inject(PutawayService);
  private authService = inject(AuthService);

  // ViewChild reference to lot number input for auto focus
  @ViewChild('lotNumberInput', { static: false }) lotNumberInput!: ElementRef<HTMLInputElement>;

  // Reactive signals for state management
  selectedLot = signal<LotDetails | null>(null);
  isSearching = signal(false);
  isValidatingBin = signal(false);
  isProcessing = signal(false);
  processingStep = signal<string>('');
  processingProgress = signal<number>(0);
  errorMessage = signal<string>('');
  errorDetails = signal<any>(null);
  successMessage = signal<string>('');
  isLotModalOpen = signal(false);
  initialSearchFilter = signal<string>('');
  isBinModalOpen = signal(false);
  initialBinSearchFilter = signal<string>('');
  
  // Simple success notification
  showSimpleSuccess = signal(false);

  // Form groups
  putawayForm: FormGroup;

  // Computed values
  maxQuantity = computed(() => this.selectedLot()?.qtyAvail ?? 0);
  isFormValid = computed(() => {
    const lot = this.selectedLot();
    const form = this.putawayForm;
    const putawayQtyValid = form.get('putawayQty')?.valid;
    const putawayQtyValue = form.get('putawayQty')?.value ?? 0;
    const maxQty = this.maxQuantity();
    
    // Simplified validation - only check essential fields
    // toBinNumber will be validated at submit time to avoid Angular computed signal reactivity issues
    return lot !== null && 
           putawayQtyValid && 
           putawayQtyValue > 0 &&
           putawayQtyValue <= maxQty;
  });

  // Computed button class based on form validity and processing state
  buttonClass = computed(() => {
    const isDisabled = !this.isFormValid() || this.isProcessing();
    return isDisabled ? 'nwfth-button-disabled' : 'nwfth-button-primary';
  });

  constructor() {
    this.putawayForm = this.fb.group({
      // Row 1: Lot # (editable), Bin # (readonly), ItemKey (readonly), Location (readonly)
      lotNumber: ['', [Validators.required]],
      binNumber: [{ value: '', disabled: true }],
      itemKey: [{ value: '', disabled: true }],
      location: [{ value: '', disabled: true }],
      
      // Row 2: UOM (readonly), blank, QtyOnHand (readonly), Qty Avail (readonly)
      uom: [{ value: '', disabled: true }],
      qtyOnHand: [{ value: '', disabled: true }],
      qtyAvail: [{ value: '', disabled: true }],
      
      // Row 3: Exp Date (readonly)
      expDate: [{ value: '', disabled: true }],
      
      // Row 4: Putaway Qty (editable), Print Report (checkbox)
      putawayQty: ['', [Validators.required, Validators.min(0.001)]],
      printReport: [false],
      
      // Row 5: To Bin # (editable)
      toBinNumber: ['', [Validators.required]],
      
      // Additional Information: Remarks and Referenced (optional)
      remarks: [''],
      referenced: ['']
    });

    // Auto-search effect when lot number changes (disabled to prevent conflicts with manual search)
    // effect(() => {
    //   const lotNumber = this.putawayForm.get('lotNumber')?.value;
    //   if (lotNumber && lotNumber.length >= 1) {
    //     this.searchLot(lotNumber);
    //   }
    // });
  }

  ngAfterViewInit(): void {
    // Auto focus on Lot# input field when page loads
    setTimeout(() => {
      if (this.lotNumberInput?.nativeElement) {
        this.lotNumberInput.nativeElement.focus();
      }
    }, 100); // Small delay to ensure DOM is ready
  }

  // Search for lot details
  async searchLot(lotNumber: string) {
    if (!lotNumber || lotNumber.trim().length === 0) return;

    this.isSearching.set(true);
    this.clearMessages();

    try {
      const lotDetails = await this.putawayService.searchLot(lotNumber).toPromise();
      
      if (lotDetails) {
        this.selectedLot.set({
          lotNumber: lotDetails.lot_no,
          binNumber: lotDetails.current_bin,
          itemKey: lotDetails.item_key,
          location: lotDetails.location,
          uom: lotDetails.uom,
          qtyOnHand: lotDetails.qty_on_hand,
          qtyAvail: lotDetails.qty_available,
          expDate: lotDetails.expiry_date || '',
          lotStatus: lotDetails.lot_status || ''
        });
        
        this.populateReadonlyFields(this.selectedLot()!);
      } else {
        this.setError(`Lot '${lotNumber}' not found`, 'lot', { lot_no: lotNumber });
        this.clearForm();
      }
    } catch (error: any) {
      if (error?.error?.error === 'Lot not found') {
        this.setError(error.error.message, 'lot', { lot_no: error.error.lot_no || lotNumber });
      } else {
        this.setError(`Error searching lot: ${error}`, 'system');
      }
      this.clearForm();
    } finally {
      this.isSearching.set(false);
    }
  }

  // Populate readonly fields from lot data
  private populateReadonlyFields(lot: LotDetails) {
    // Update readonly fields (no event needed for disabled fields)
    this.putawayForm.patchValue({
      binNumber: lot.binNumber,
      itemKey: lot.itemKey,
      location: lot.location,
      uom: lot.uom,
      qtyOnHand: lot.qtyOnHand.toString(),
      qtyAvail: lot.qtyAvail.toString(),
      expDate: lot.expDate
    }, { emitEvent: false });
    
    // Update the editable putaway quantity field with precision-safe rounding
    // Fix for decimal precision issues: round to 3 decimal places to prevent floating-point errors
    const precisionSafeQuantity = this.roundToDecimalPlaces(lot.qtyAvail, 3);
    this.putawayForm.patchValue({
      putawayQty: precisionSafeQuantity.toString()
    });
  }

  // Utility function to handle decimal precision consistently
  private roundToDecimalPlaces(value: number, decimalPlaces: number): number {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  // Validate destination bin
  async validateDestinationBin() {
    const toBin = this.putawayForm.get('toBinNumber')?.value;
    const location = this.selectedLot()?.location;

    if (!toBin || !location) return;

    this.isValidatingBin.set(true);

    try {
      const validation = await this.putawayService.validateBin(location, toBin).toPromise();
      
      if (!validation?.is_valid) {
        this.setError(`Invalid destination bin: ${validation?.message || 'Bin not found'}`, 'bin', {
          bin_no: toBin,
          location: location
        });
      } else {
        this.clearMessages();
      }
    } catch (error: any) {
      this.setError(`Error validating bin: ${error}`, 'system');
    } finally {
      this.isValidatingBin.set(false);
    }
  }

  // Execute putaway transfer with progress tracking
  async onSubmit() {
    if (!this.isFormValid() || !this.selectedLot()) return;

    // Validate destination bin at submit time
    const toBinNumber = this.putawayForm.get('toBinNumber')?.value?.trim();
    if (!toBinNumber) {
      this.setError('Please select a destination bin (To Bin #)', 'validation', {
        field: 'toBinNumber',
        message: 'Destination bin is required'
      });
      return;
    }

    // Check if user is authenticated
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.setError('User not authenticated. Please login again.', 'authentication');
      return;
    }

    this.isProcessing.set(true);
    // Disable the lot number input during processing
    this.putawayForm.get('lotNumber')?.disable();
    this.clearMessages();

    const lot = this.selectedLot()!;
    const formValues = this.putawayForm.value;
    const transferQty = parseFloat(formValues.putawayQty);

    const userId = currentUser.username;

    const request: BinTransferRequest = {
      lot_no: lot.lotNumber,
      item_key: lot.itemKey,
      location: lot.location,
      bin_from: lot.binNumber,
      bin_to: formValues.toBinNumber,
      transfer_qty: transferQty,
      user_id: userId,
      remarks: formValues.remarks || '',
      referenced: formValues.referenced || ''
    };

    try {
      // Step 1: Validate request
      await this.updateProgress(10, 'Validating transfer request...');
      await this.delay(200);

      // Step 2: Begin transfer
      await this.updateProgress(25, 'Initiating transfer operation...');
      await this.delay(300);

      // Step 3: Execute database transaction
      await this.updateProgress(50, 'Executing database transaction...');
      const result = await this.putawayService.executeBinTransfer(request).toPromise();
      
      // Step 4: Process result
      await this.updateProgress(75, 'Processing transfer result...');
      await this.delay(200);
      
      if (result?.success) {
        // Step 5: Finalize
        await this.updateProgress(90, 'Finalizing transfer...');
        await this.delay(200);

        // Determine operation type based on transfer quantity and available quantity
        let opType: 'consolidation' | 'new_bin' | 'full_transfer' = 'new_bin';
        if (transferQty >= lot.qtyAvail) {
          opType = 'full_transfer';
        } else {
          // Could be consolidation - we'd need to check if destination bin already has this lot
          opType = 'consolidation'; // Assume consolidation for partial transfers
        }

        // Capture transaction details for enhanced display
        const transactionDetails = {
          document_no: result.document_no,
          lot_no: lot.lotNumber,
          transfer_qty: formValues.putawayQty,
          uom: lot.uom,
          bin_from: lot.binNumber,
          bin_to: formValues.toBinNumber,
          timestamp: new Date().toISOString(),
          should_print: formValues.printReport || false
        };
        
        // Step 6: Complete
        await this.updateProgress(100, 'Transfer completed successfully!');
        await this.delay(300);
        
        // Set simple success message and clear form immediately
        this.successMessage.set('Transfer Successful');
        this.showSimpleSuccess.set(true);
        
        // Auto-print if print report was selected
        if (formValues.printReport) {
          // Print with current form data before clearing
          this.printTransferReceipt(transactionDetails, lot, formValues);
        }
        
        // Clear form immediately to prevent duplicate transfers
        setTimeout(() => {
          this.clearForm();
          this.successMessage.set('');
          this.showSimpleSuccess.set(false);
        }, 2000); // 2 second delay for user to see success message
      } else {
        this.setError(result?.message || 'Transfer failed', 'operation', result);
      }
    } catch (error: any) {
      this.parseErrorResponse(error);
    } finally {
      this.isProcessing.set(false);
      // Re-enable the lot number input after processing
      this.putawayForm.get('lotNumber')?.enable();
    }
  }

  // Clear form and reset state
  onCancel() {
    this.clearForm();
  }

  private clearForm() {
    this.selectedLot.set(null);
    this.putawayForm.reset();
    this.clearMessages();
  }

  private clearMessages() {
    this.errorMessage.set('');
    this.errorDetails.set(null);
    this.successMessage.set('');
    this.showSimpleSuccess.set(false);
    this.processingStep.set('');
    this.processingProgress.set(0);
  }

  private setError(message: string, category: string = 'general', details: any = null) {
    this.errorMessage.set(message);
    this.errorDetails.set(details);
    this.successMessage.set('');
  }

  private parseErrorResponse(error: any) {
    if (error?.error) {
      const errorResponse = error.error;
      
      // Handle specific error types
      switch (errorResponse.error) {
        case 'Insufficient quantity':
          this.setError(errorResponse.message, 'quantity', {
            requested: errorResponse.requested,
            available: errorResponse.available
          });
          break;
          
        case 'Invalid bin':
          this.setError(errorResponse.message, 'bin', {
            bin_no: errorResponse.bin_no || this.putawayForm.get('toBinNumber')?.value,
            location: errorResponse.location || this.selectedLot()?.location
          });
          break;
          
        case 'Lot not found':
          this.setError(errorResponse.message, 'lot', {
            lot_no: errorResponse.lot_no || this.selectedLot()?.lotNumber
          });
          break;
          
        case 'Validation error':
          this.setError(errorResponse.message, 'validation');
          break;
          
        case 'Transaction error':
        case 'Database error':
          this.setError('System error occurred. Please try again or contact support.', 'system');
          break;
          
        default:
          this.setError(errorResponse.message || 'An unexpected error occurred', 'general');
      }
    } else {
      this.setError(`Transfer failed: ${error}`, 'general');
    }
  }

  // Navigate back to dashboard
  goBack() {
    this.router.navigate(['/dashboard']);
  }

  // Search button handlers
  onSearchLot() {
    const lotNumber = this.putawayForm.get('lotNumber')?.value?.trim();
    
    // Set initial filter for the modal (empty string if no lot number entered)
    this.initialSearchFilter.set(lotNumber || '');
    
    // Open lot selection modal with filter
    this.isLotModalOpen.set(true);
  }


  onSearchItem() {
    // Could implement item search dialog in the future  
    this.errorMessage.set('Item search dialog not yet implemented');
  }

  onSearchToBin() {
    const toBinNumber = this.putawayForm.get('toBinNumber')?.value?.trim();
    
    // Set initial filter for the modal (empty string if no bin number entered)
    this.initialBinSearchFilter.set(toBinNumber || '');
    
    // Open bin selection modal with filter
    this.isBinModalOpen.set(true);
  }

  // Modal event handlers
  onLotSelected(lotItem: LotSearchItem) {
    // Convert LotSearchItem to LotDetails format
    const lotDetails: LotDetails = {
      lotNumber: lotItem.lot_no,
      binNumber: lotItem.current_bin,
      itemKey: lotItem.item_key,
      location: lotItem.location,
      uom: lotItem.uom,
      qtyOnHand: lotItem.qty_on_hand,
      qtyAvail: lotItem.qty_available,
      expDate: lotItem.expiry_date || '',
      lotStatus: lotItem.lot_status || ''
    };

    // Set the selected lot and populate form
    this.selectedLot.set(lotDetails);
    this.populateReadonlyFields(lotDetails);
    
    // Update the lot number input field
    this.putawayForm.patchValue({
      lotNumber: lotItem.lot_no
    }); // Remove { emitEvent: false } to allow form validation updates

    // Close modal
    this.isLotModalOpen.set(false);
    this.errorMessage.set('');
  }

  onLotModalClosed() {
    this.isLotModalOpen.set(false);
  }

  // Bin Modal event handlers
  onBinSelected(binItem: BinSearchItem) {
    // Update the To Bin # input field with selected bin
    this.putawayForm.patchValue({
      toBinNumber: binItem.bin_no
    });

    // Close modal and clear any existing error messages
    this.isBinModalOpen.set(false);
    this.errorMessage.set('');

    // Automatically validate the selected bin
    this.validateDestinationBin();
  }

  onBinModalClosed() {
    this.isBinModalOpen.set(false);
  }

  // Format timestamp for display
  formatTimestamp(timestamp: string): string {
    if (!timestamp) return 'N/A';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'N/A';
    }
  }

  // Get error title based on error message content
  getErrorTitle(): string {
    const message = this.errorMessage().toLowerCase();
    
    if (message.includes('insufficient') || message.includes('only')) {
      return '⚠️ Insufficient Quantity';
    } else if (message.includes('invalid') && message.includes('bin')) {
      return '🚫 Invalid Bin';
    } else if (message.includes('not found') || message.includes('lot')) {
      return '❓ Lot Not Found';
    } else if (message.includes('authentication') || message.includes('login')) {
      return '🔐 Authentication Required';
    } else if (message.includes('validation')) {
      return '📋 Validation Error';
    } else if (message.includes('system') || message.includes('database') || message.includes('transaction')) {
      return '💾 System Error';
    } else if (message.includes('network') || message.includes('connection')) {
      return '🌐 Connection Error';
    } else {
      return '❌ Operation Failed';
    }
  }

  // Get user guidance based on error type
  getErrorGuidance(): string {
    const message = this.errorMessage().toLowerCase();
    
    if (message.includes('insufficient') || message.includes('only')) {
      return 'Reduce the transfer quantity to match available inventory or check if lot has been moved.';
    } else if (message.includes('invalid') && message.includes('bin')) {
      return 'Verify the destination bin number exists in this location and try again.';
    } else if (message.includes('not found') || message.includes('lot')) {
      return 'Double-check the lot number or use the search button to find available lots.';
    } else if (message.includes('authentication') || message.includes('login')) {
      return 'Please log in again to continue with the transfer operation.';
    } else if (message.includes('validation')) {
      return 'Check all required fields are filled correctly and quantities are valid.';
    } else if (message.includes('system') || message.includes('database') || message.includes('transaction')) {
      return 'Wait a moment and try again. Contact IT support if the problem persists.';
    } else if (message.includes('network') || message.includes('connection')) {
      return 'Check your network connection and try again.';
    } else {
      return 'Review the transfer details and try again or contact support for assistance.';
    }
  }


  // Get processing button text based on current state
  getProcessingButtonText(): string {
    if (!this.isProcessing()) {
      return 'OK';
    }

    const step = this.processingStep();
    if (step.includes('Validating')) {
      return 'Validating...';
    } else if (step.includes('Initiating')) {
      return 'Starting...';
    } else if (step.includes('Executing')) {
      return 'Processing...';
    } else if (step.includes('Processing')) {
      return 'Updating...';
    } else if (step.includes('Finalizing')) {
      return 'Finishing...';
    } else if (step.includes('completed')) {
      return 'Completed!';
    } else {
      return 'Processing...';
    }
  }

  // Update progress and step message
  private async updateProgress(progress: number, step: string): Promise<void> {
    this.processingProgress.set(progress);
    this.processingStep.set(step);
  }

  // Helper method for delays in progress simulation
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }



  private printDirectly(content: string, docNo: string) {
    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.visibility = 'hidden';
    
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(`
        <html>
          <head>
            <title>Bin Transfer Report - ${docNo}</title>
            <style>
              @page {
                margin: 0.5in;
                size: auto;
              }
              body {
                font-family: 'Courier New', Courier, monospace;
                font-size: 10pt;
                line-height: 1.2;
                margin: 0;
                padding: 0;
                white-space: pre;
              }
              @media print {
                body {
                  -webkit-print-color-adjust: exact;
                  color-adjust: exact;
                }
              }
            </style>
          </head>
          <body>${content}</body>
        </html>
      `);
      iframeDoc.close();
      
      // Wait for content to load then print
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          
          // Clean up iframe after printing
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        } catch (error) {
          console.error('Printing failed:', error);
          // Fallback: show alert with the report content
          alert(`Printing failed. Report content:\n\n${content}`);
          document.body.removeChild(iframe);
        }
      }, 500);
    }
  }

  printTransferReceipt(transactionDetails: any, lot: LotDetails, formValues: any) {
    if (!transactionDetails || !lot) return;

    // Format date as DD-MM-YY
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(2)}`;
    
    // Format quantities with 3 decimal places
    const qtyOnHand = parseFloat(lot.qtyOnHand.toString()).toFixed(3);
    const qtyTransfer = parseFloat(transactionDetails.transfer_qty.toString()).toFixed(3);
    
    // Pad strings to fixed widths for alignment
    const padEnd = (str: string, length: number) => str.padEnd(length);
    const padStart = (str: string, length: number) => str.padStart(length);
    
    // Create warehouse-style report with 86-character width
    const reportLines = [
      `Bin Transfer Report                    Date:${formattedDate}`,
      '======================================================================================',
      'Doc No         Item Key          Location Remarks     Reference No  Result',
      '======================================================================================',
      `${padEnd(transactionDetails.document_no, 15)}${padEnd(lot.itemKey, 18)}${padEnd(lot.location, 9)}${padEnd(formValues.remarks || '', 12)}${padEnd(formValues.referenced || '', 14)}Success`,
      '======================================================================================',
      'Bins/Lots from where material is transferred:',
      'LotNo           BinFrom          BinTo           Qtyonhand    QtyTransfer  Status',
      '======================================================================================',
      `${padEnd(transactionDetails.lot_no, 16)}${padEnd(transactionDetails.bin_from, 17)}${padEnd(transactionDetails.bin_to, 16)}${padStart(qtyOnHand, 12)} ${padStart(qtyTransfer, 11)}  ${padEnd(lot.lotStatus, 6)}`
    ];
    
    const reportContent = reportLines.join('\n');
    
    // Print directly without preview using hidden iframe
    this.printDirectly(reportContent, transactionDetails.document_no);
  }
}