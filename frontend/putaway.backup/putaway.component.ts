import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

import { PutawayService, EnhancedLotSearchResponse, EnhancedBinValidationResponse, EnhancedBinTransferRequest, EnhancedTransactionResponse } from '../../services/putaway.service';

// shadcn/ui components
import { CardComponent } from '../../../lib/ui/card.component';
import { ButtonComponent } from '../../../lib/ui/button.component';
import { InputComponent } from '../../../lib/ui/input.component';
import { LabelComponent } from '../../../lib/ui/label.component';
import { BadgeComponent } from '../../../lib/ui/badge.component';
import { AlertComponent } from '../../../lib/ui/alert.component';
import { ProgressComponent } from '../../../lib/ui/progress.component';

@Component({
  selector: 'app-putaway',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent,
    ButtonComponent,
    InputComponent,
    LabelComponent,
    AlertComponent,
  ],
  template: `
    <div class="container mx-auto p-4 max-w-md">
      <!-- Header -->
      <div class="mb-4">
        <h1 class="text-xl font-bold text-primary mb-1">Putaways</h1>
      </div>

      <!-- Compact Form Card matching official app -->
      <app-card class="w-full max-w-2xl mx-auto">
        <app-card-header>
          <app-card-title class="text-lg">Putaway Transfer</app-card-title>
          <app-card-description>Enter lot details and destination bin information</app-card-description>
        </app-card-header>
        <app-card-content class="space-y-4">
          <form [formGroup]="putawayForm" (ngSubmit)="executeTransfer()" class="space-y-4">
            
            <!-- Lot # -->
            <div class="grid grid-cols-5 gap-3 items-center">
              <app-label class="text-sm font-medium">Lot #</app-label>
              <div class="col-span-3">
                <app-input
                  type="text"
                  formControlName="lotNo"
                  placeholder="Enter lot number"
                  class="font-mono text-sm"
                />
              </div>
              <app-button 
                type="button" 
                variant="outline"
                size="sm"
                (click)="searchLot()"
                [disabled]="isSearching()"
                class="flex items-center justify-center"
              >
                {{ isSearching() ? '⏳' : '🔍' }}
              </app-button>
            </div>

            <!-- Bin # (readonly when lot is loaded) -->
            <div class="grid grid-cols-5 gap-3 items-center">
              <app-label class="text-sm font-medium">Bin #</app-label>
              <div class="col-span-3">
                <app-input
                  type="text"
                  [value]="lotDetails()?.current_bin || ''"
                  readonly
                  placeholder="Current bin location"
                  class="font-mono text-sm bg-muted"
                />
              </div>
              <div></div> <!-- Empty space to maintain grid alignment -->
            </div>

            <!-- ItemKey (readonly when lot is loaded) -->
            <div class="grid grid-cols-5 gap-3 items-center">
              <app-label class="text-sm font-medium">ItemKey</app-label>
              <div class="col-span-3">
                <app-input
                  type="text"
                  [value]="lotDetails()?.item_key || ''"
                  readonly
                  placeholder="Item identifier"
                  class="font-mono text-sm bg-muted"
                />
              </div>
              <div></div> <!-- Empty space to maintain grid alignment -->
            </div>

            <!-- Location & UOM Row -->
            <div class="grid grid-cols-4 gap-3 items-center">
              <app-label class="text-sm font-medium">Location</app-label>
              <app-input
                type="text"
                [value]="lotDetails()?.location || ''"
                readonly
                placeholder="Location"
                class="text-sm bg-muted"
              />
              <app-label class="text-sm font-medium text-center">UOM</app-label>
              <app-input
                type="text"
                [value]="lotDetails()?.uom || ''"
                readonly
                placeholder="Unit"
                class="text-sm bg-muted"
              />
            </div>

            <!-- QtyOnHand & Qty Avail Row -->
            <div class="grid grid-cols-4 gap-3 items-center">
              <app-label class="text-sm font-medium">QtyOnHand</app-label>
              <app-input
                type="text"
                [value]="formatNumber(lotDetails()?.qty_on_hand || 0)"
                readonly
                class="text-sm bg-muted text-right font-mono"
              />
              <app-label class="text-sm font-medium">Qty Avail</app-label>
              <app-input
                type="text"
                [value]="formatNumber(lotDetails()?.qty_available || 0)"
                readonly
                class="text-sm bg-muted text-right font-mono"
              />
            </div>

            <!-- Exp. Date -->
            <div class="grid grid-cols-5 gap-3 items-center">
              <app-label class="text-sm font-medium">Exp. Date</app-label>
              <div class="col-span-3">
                <app-input
                  type="text"
                  [value]="lotDetails()?.expiry_date || ''"
                  readonly
                  placeholder="Expiration date"
                  class="text-sm bg-muted"
                />
              </div>
              <div></div> <!-- Empty space to maintain grid alignment -->
            </div>

            <app-separator class="my-4"></app-separator>

            <!-- Putaway Qty -->
            <div class="grid grid-cols-4 gap-3 items-center">
              <app-label class="text-sm font-medium">Putaway Qty</app-label>
              <div class="col-span-2">
                <app-input
                  type="number"
                  formControlName="putawayQty"
                  [max]="lotDetails()?.qty_available || 0"
                  step="0.0001"
                  placeholder="0.0000"
                  class="text-sm text-right font-mono"
                />
              </div>
              <div class="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  formControlName="printReport" 
                  id="printReport"
                  class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                >
                <app-label for="printReport" class="text-sm">Print Report</app-label>
              </div>
            </div>

            <!-- To Bin # -->
            <div class="grid grid-cols-5 gap-3 items-center">
              <app-label class="text-sm font-medium">To Bin #</app-label>
              <div class="col-span-3">
                <app-input
                  type="text"
                  formControlName="toBin"
                  placeholder="Destination bin"
                  class="font-mono text-sm"
                />
              </div>
              <app-button 
                type="button" 
                variant="outline"
                size="sm"
                class="flex items-center justify-center"
              >
                🔍
              </app-button>
            </div>

            <app-separator class="my-6"></app-separator>

            <!-- Action Buttons -->
            <div class="flex gap-3 justify-end">
              <app-button 
                type="button"
                variant="outline"
                (click)="resetForm()"
                class="min-w-20"
              >
                Cancel
              </app-button>
              <app-button 
                type="submit" 
                [disabled]="putawayForm.invalid || isProcessing() || !lotDetails()"
                class="min-w-20"
              >
                @if (isProcessing()) {
                  <span class="flex items-center gap-2">
                    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </span>
                } @else {
                  OK
                }
              </app-button>
            </div>
          </form>
        </app-card-content>
      </app-card>

      <!-- Status Messages -->
      @if (errorMessage()) {
        <app-alert variant="destructive" class="mt-2 text-sm">
          <p>{{ errorMessage() }}</p>
        </app-alert>
      }

      @if (transferSuccess()) {
        <app-alert variant="default" class="mt-2 text-sm border-green-200 bg-green-50">
          <p><strong>Transfer Successful!</strong></p>
          <p>Document: {{ transferResult()?.document_no }}</p>
        </app-alert>
      }
    </div>
  `,
  styles: []
})
export class PutawayComponent implements OnInit, OnDestroy {
  // Signals for reactive state
  lotDetails = signal<EnhancedLotSearchResponse | null>(null);
  isSearching = signal(false);
  isProcessing = signal(false);
  transferSuccess = signal(false);
  transferResult = signal<EnhancedTransactionResponse | null>(null);
  errorMessage = signal<string>('');

  // Form - matching official app fields
  putawayForm = new FormGroup({
    lotNo: new FormControl('', [Validators.required]),
    toBin: new FormControl('', [Validators.required]),
    putawayQty: new FormControl('', [
      Validators.required,
      Validators.min(0.0001)
    ]),
    printReport: new FormControl(false)
  });

  private subscriptions: Subscription[] = [];

  constructor(private putawayService: PutawayService) {}

  ngOnInit(): void {
    // Auto-search when lot number changes
    const lotNoSub = this.putawayForm.get('lotNo')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap(lotNo => {
          if (lotNo && lotNo.length >= 3) {
            return this.performLotSearch(lotNo);
          }
          return of(null);
        })
      )
      .subscribe({
        next: (response: EnhancedLotSearchResponse | null) => {
          this.isSearching.set(false);
          if (response) {
            this.lotDetails.set(response);
            // Update quantity validator with actual available quantity
            this.putawayForm.get('putawayQty')?.setValidators([
              Validators.required,
              Validators.min(0.01),
              Validators.max(response.qty_available)
            ]);
            this.putawayForm.get('putawayQty')?.updateValueAndValidity();
          }
        },
        error: () => {
          this.isSearching.set(false);
        }
      });

    if (lotNoSub) {
      this.subscriptions.push(lotNoSub);
    }

    // Update max quantity validator when lot details change
    this.putawayForm.get('putawayQty')?.setValidators([
      Validators.required,
      Validators.min(0.0001),
      Validators.max(this.lotDetails()?.qty_available || 1000000)
    ]);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  searchLot(): void {
    const lotNo = this.putawayForm.get('lotNo')?.value;
    if (lotNo) {
      this.performLotSearch(lotNo).subscribe({
        next: (response: EnhancedLotSearchResponse | null) => {
          this.isSearching.set(false);
          if (response) {
            this.lotDetails.set(response);
            // Update quantity validator with actual available quantity
            this.putawayForm.get('putawayQty')?.setValidators([
              Validators.required,
              Validators.min(0.01),
              Validators.max(response.qty_available)
            ]);
            this.putawayForm.get('putawayQty')?.updateValueAndValidity();
          }
        },
        error: () => {
          this.isSearching.set(false);
        }
      });
    }
  }

  private performLotSearch(lotNo: string) {
    this.isSearching.set(true);
    this.errorMessage.set('');
    
    return this.putawayService.searchLot(lotNo)
      .pipe(
        catchError(error => {
          this.errorMessage.set(error.error?.message || 'Failed to search lot');
          this.lotDetails.set(null);
          this.isSearching.set(false);
          return of(null);
        })
      );
  }

  executeTransfer(): void {
    if (this.putawayForm.valid && this.lotDetails()) {
      this.isProcessing.set(true);
      this.errorMessage.set('');

      const request: EnhancedBinTransferRequest = {
        lot_no: this.putawayForm.value.lotNo!,
        item_key: this.lotDetails()!.item_key,
        location: this.lotDetails()!.location,
        bin_from: this.lotDetails()!.current_bin,
        bin_to: this.putawayForm.value.toBin!,
        transfer_qty: Number(this.putawayForm.value.putawayQty!),
        user_id: 'current_user' // This should come from auth service
      };

      this.putawayService.executeBinTransfer(request)
        .pipe(
          catchError(error => {
            this.errorMessage.set(error.error?.message || 'Transfer failed');
            this.isProcessing.set(false);
            return of(null);
          })
        )
        .subscribe({
          next: (response: EnhancedTransactionResponse | null) => {
            this.isProcessing.set(false);
            if (response && response.success) {
              this.transferSuccess.set(true);
              this.transferResult.set(response);
            } else {
              this.errorMessage.set(response?.message || 'Transfer failed');
            }
          },
          error: () => {
            this.isProcessing.set(false);
          }
        });
    }
  }

  resetForm(): void {
    this.putawayForm.reset();
    this.lotDetails.set(null);
    this.transferSuccess.set(false);
    this.transferResult.set(null);
    this.errorMessage.set('');
    this.isSearching.set(false);
    this.isProcessing.set(false);
  }

  formatNumber(value: number): string {
    return value.toFixed(4);
  }
}