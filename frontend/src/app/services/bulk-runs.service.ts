import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, throwError, tap, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// API Response models
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message: string;
}

// Bulk Run models
export interface BulkRun {
  run_no: number;
  batch_no: string;
  formula_id: string;
  formula_desc: string;
  no_of_batches: number;
  pallets_per_batch?: number;
  status: string;
  created_date?: string;
  picking_date?: string;
}

export interface BulkPickedItem {
  run_no: number;
  row_num: number;
  line_id: number;
  item_key: string;
  description?: string;
  location?: string;
  standard_qty: string;
  pack_size: string;
  uom: string;
  to_picked_std_qty: string;
  to_picked_bulk_qty: string;  // Total required across all batches
  picked_bulk_qty?: string;    // Total picked across all batches
  picked_qty?: number;         // Picked quantity (for print labels)
  picking_date?: string;
  status?: string;
  // Print-related database fields
  batch_no?: string;           // Batch number for grouping
  lot_no?: string;             // Lot number from database
  bin_no?: string;             // Bin location
  unit?: string;               // Unit of measure (KG)
  modified_by?: string;        // User who modified
  modified_date?: string;      // Last modified date
  rec_user_id?: string;        // Record user ID
  // NEW: Batch tracking fields for accurate completion detection
  total_batches?: number;
  completed_batches?: number;
  remaining_qty?: string;
  completion_status?: string;  // 'COMPLETE', 'IN_PROGRESS', 'PENDING', 'NOT_REQUIRED'
}

export interface BulkRunSearchResponse {
  run: BulkRun;
  ingredients: BulkPickedItem[];
  total_ingredients: number;
  completed_ingredients: number;
}

export interface InventoryInfo {
  item_key: string;
  soh_value: string;
  soh_uom: string;
  bulk_pack_size_value: string;
  bulk_pack_size_uom: string;
  available_lots: LotInfo[];
}

export interface LotInfo {
  lot_no: string;
  expiry_date?: string;
  available_qty: string;
  location: string;
  bin?: string;
}

export interface IngredientCalculation {
  total_needed: string;
  remaining_to_pick: string;
  completion_percentage: number;
}

// Enhanced inventory models for Story 1.2
export interface InventoryAlert {
  alert_type: string;
  item_key: string;
  message: string;
  severity: 'Critical' | 'Warning' | 'Info';
  recommended_action?: string;
}

export interface InventoryStatus {
  item_key: string;
  has_alerts: boolean;
  alert_count: number;
  stock_status: 'Normal' | 'Low' | 'OutOfStock' | 'Expired' | 'Unknown';
  alerts: InventoryAlert[];
}

export interface IngredientView {
  ingredient: BulkPickedItem;
  inventory: InventoryInfo;
  calculations: IngredientCalculation;
  // Print-related fields for compatibility
  line_id?: number;
  item_key?: string;
  picked_bulk_qty?: string;
  picked_qty?: number;
  unit?: string;
  bulk_pack_size?: string;
}

export interface FormFields {
  fg_item_key: string;
  st_picking_date: string;
  item_key: string;
  soh_value: string;
  soh_uom: string;
  bulk_pack_size_value: string;
  bulk_pack_size_uom: string;
  // Total needed fields - 4-field layout (Field1 Field2 Field3 Field4)
  total_needed_bags: string;          // Field 1: "3.0000" (readonly from SQL)
  total_needed_bags_uom: string;      // Field 2: "BAGS" (readonly from SQL)
  user_input_bags: number;            // Field 3: user input via numpad (starts at 0)
  total_needed_weight_uom: string;    // Field 4: "KG" (readonly from database UOM)
  // Calculated weight field for display
  total_needed_kg: string;            // Calculated: user_input_bags * pack_size
  // Remaining to pick fields - dual display (bags and weight)
  remaining_bags: string;
  remaining_bags_uom: string;       // "BAGS"
  remaining_kg: string;
  remaining_kg_uom: string;         // "KG"
  ingredient_index: number;
  total_ingredients: number;
  // Print-related form fields
  suggestedLotNumber?: string;        // Suggested lot number for print labels
  suggestedBinNumber?: string;        // Suggested bin number for print labels
}

export interface BulkRunFormData {
  run: BulkRun;
  current_ingredient: IngredientView;
  form_data: FormFields;
}

// New interfaces for modal selection (Story 1.1.1)
export interface BulkRunSummary {
  run_no: number;
  formula_id: string;
  formula_desc: string;
  status: string;
  batch_count: number;
}

export interface BulkRunListResponse {
  runs: BulkRunSummary[];
  total_count: number;
}

// Story 1.4: Pagination models
export interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_items: number;
  page_size: number;
  has_previous: boolean;
  has_next: boolean;
}

export interface PaginatedBulkRunResponse {
  runs: BulkRunSummary[];
  pagination: PaginationInfo;
}

// Paginated lot search response
export interface PaginatedLotSearchResponse {
  lots: LotSearchResult[];
  pagination: PaginationInfo;
}

// ItemKey search modal models
export interface RunItemSearchResult {
  item_key: string;
  description: string;
  location: string;
  line_id: number;
  pack_size: string;
  uom: string;
  to_picked_bulk_qty: string;  // Total required quantity
  picked_bulk_qty: string;     // Current picked quantity for auto-switching logic
}

// Lot search modal models
export interface LotSearchResult {
  lot_no: string;
  bin_no: string;
  qty_on_hand: number;
  date_exp: string;
  qty_issue: number;
  committed_qty: number;
  available_qty: number;  // calculated field
  available_bags: number; // NEW: calculated field for available bags
  pack_size: number;      // NEW: pack size for bag calculation
  item_key: string;
  location_key: string;
}

// Pallet tracking models for bulk picking
export interface PalletBatch {
  pallet_number: number;
  batch_number: string;
  row_num: number;
  no_of_bags_picked: number;
  quantity_picked: number;
  no_of_bags_remaining: number;
  quantity_remaining: number;
}

export interface PalletTrackingResponse {
  run_no: number;
  pallets: PalletBatch[];
  total_pallets: number;
  total_picked_quantity: number;
  total_remaining_quantity: number;
}

// Picked lot interfaces for unpicking functionality
export interface PickedLot {
  lot_tran_no: number;     // NEW: Primary key for precise deletion
  lot_no: string;
  bin_no: string;
  batch_no: string;        // NEW: Batch number for table display
  item_key: string;        // NEW: Item key for table display  
  location_key: string;    // NEW: Location key for table display
  row_num: number;         // NEW: RowNum for correct unpick targeting
  line_id: number;         // NEW: LineId for cross-ingredient unpick operations
  date_exp?: string;       // NEW: Expiry date
  qty_received: number;    // NEW: Quantity received
  alloc_lot_qty: number;
  pack_size: number;
  qty_on_hand: number;     // NEW: Current on-hand quantity
  rec_date: string;
  rec_userid: string;
}

// Pending batch requirement information for pending to picked tab
export interface PendingBatchRequirement {
  batch_no: string;
  item_key: string;
  to_picked_bulk_qty: number;
  pack_size: number;
  total_weight_needed: number;  // NEW: bags × pack_size (e.g., 5 × 20 = 100kg)
  picked_bulk_qty: number;
  total_weight_picked: number;  // NEW: picked_bags × pack_size
  remaining_qty: number;
  row_num: number;
  line_id: number;
}

export interface PickedLotsResponse {
  picked_lots: PickedLot[];
  available_lots: LotSearchResult[]; // NEW: Available lots for pending tab
  pending_batches: PendingBatchRequirement[]; // NEW: Pending batch requirements
  total_picked_qty: number;
  batch_no: string;
  item_key: string;
  item_description?: string;         // NEW: Item description for header
  run_no: number;                    // NEW: Run number for header
}

// Unpick request interface
export interface UnpickRequest {
  lot_no?: string; // None for batch unpick, Some(lot) for lot unpick
  lot_tran_no?: number; // NEW: For precise single-record unpick operations (highest priority)
}

// Batch weight summary interfaces for Pending to Picked modal
export interface BatchWeightSummaryItem {
  batch_no: string;
  item_key: string;
  item_description?: string;
  to_picked_bulk_qty: number;      // Number of bags needed
  picked_bulk_qty: number;         // Number of bags picked  
  pack_size: number;               // KG per bag
  total_weight_kg: number;         // Total weight needed (bags × pack_size)
  picked_weight_kg: number;        // Weight already picked
  remaining_weight_kg: number;     // Weight remaining to pick
  row_num: number;
  line_id: number;
}

export interface BatchWeightSummaryResponse {
  batch_items: BatchWeightSummaryItem[];
  run_no: number;
  total_items: number;
  total_remaining_weight: number;   // Sum of all remaining weights
}

export interface BulkRunStatusResponse {
  run_no: number;
  status: string;
  formula_desc: string;
  last_modified?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BulkRunsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl}/bulk-runs`;
  
  /**
   * Get HTTP headers with authentication for API requests
   */
  private getAuthHeaders(): HttpHeaders {
    const currentUser = this.authService.getCurrentUser();
    const token = this.authService.getStoredToken();
    
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    
    // Add Authorization header if token exists
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Add user identification header
    if (currentUser?.username) {
      headers = headers.set('x-user-id', currentUser.username);
    }
    
    return headers;
  }

  // Service state signals
  private currentRun = signal<BulkRun | null>(null);
  private currentFormData = signal<BulkRunFormData | null>(null);
  private isLoading = signal(false);
  private errorMessage = signal<string | null>(null);
  private inventoryStatus = signal<InventoryStatus | null>(null);

  // RACE CONDITION FIX: Ingredient loading protection
  private ingredientLoadingMutex = new Map<string, boolean>();

  // Public accessors for reactive state
  getCurrentRun = this.currentRun.asReadonly();
  getCurrentFormData = this.currentFormData.asReadonly();
  getIsLoading = this.isLoading.asReadonly();
  getErrorMessage = this.errorMessage.asReadonly();
  getInventoryStatus = this.inventoryStatus.asReadonly();

  /**
   * List all active bulk runs for modal selection (Story 1.1.1)
   */
  listBulkRuns(): Observable<ApiResponse<BulkRunListResponse>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.get<ApiResponse<BulkRunListResponse>>(`${this.baseUrl}/list`)
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to load bulk runs list';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<BulkRunListResponse>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * List active bulk runs with pagination (Story 1.4)
   */
  listBulkRunsPaginated(page: number = 1, limit: number = 10): Observable<ApiResponse<PaginatedBulkRunResponse>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<ApiResponse<PaginatedBulkRunResponse>>(`${this.baseUrl}/list/paginated`, { params })
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to load paginated bulk runs list';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<PaginatedBulkRunResponse>) => {
          if (!response.success) {
            console.error('[BulkRunsService] API Response Error:', response);
            throw new Error(`Failed to retrieve paginated bulk runs: ${response.message || 'Unknown error'}`);
          }
        })
      );
  }

  /**
   * Search for bulk runs by query
   */
  searchBulkRuns(query: string, searchMode: string = 'partial'): Observable<ApiResponse<BulkRunSearchResponse[]>> {
    if (!query.trim()) {
      return throwError(() => new Error('Search query is required'));
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams()
      .set('query', query.trim())
      .set('search_mode', searchMode);

    return this.http.get<ApiResponse<BulkRunSearchResponse[]>>(`${this.baseUrl}/search`, { params })
      .pipe(
        tap(response => {
          if (response.success && response.data && response.data.length > 0) {
            // Store the first found run
            this.currentRun.set(response.data[0].run);
          }
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to search bulk runs';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        // Extract data from API response
        tap(() => {}),
        // Transform response
        catchError(error => {
          if (error.error?.success === false) {
            // Backend returned unsuccessful response
            return throwError(() => new Error(error.error.message));
          }
          return throwError(() => error);
        }),
        // Handle "no results found" vs actual errors
        tap((response: ApiResponse<BulkRunSearchResponse[]>) => {
          if (!response.success) {
            // Check if it's a "no results found" scenario (has data but success=false)
            if (response.data && Array.isArray(response.data)) {
              // This is a "no results found" case - don't throw error
              return;
            } else {
              // This is an actual error - throw it
              throw new Error(response.message);
            }
          }
        })
      );
  }

  /**
   * Get bulk run form data for frontend population
   */
  getBulkRunFormData(runNo: number, ingredientIndex?: number): Observable<ApiResponse<BulkRunFormData>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let params = new HttpParams();
    if (ingredientIndex !== undefined) {
      params = params.set('ingredient_index', ingredientIndex.toString());
    }

    return this.http.get<ApiResponse<BulkRunFormData>>(`${this.baseUrl}/${runNo}/form-data`, { params })
      .pipe(
        // First check response and handle API errors with proper error messages
        map((response: ApiResponse<BulkRunFormData>) => {
          if (!response.success) {
            // Use the backend's specific error message
            const errorMsg = response.message || `Run ${runNo} not found or has no ingredients`;
            this.errorMessage.set(errorMsg);
            this.isLoading.set(false);
            throw new Error(errorMsg);
          }
          if (!response.data) {
            // Distinguish between post-unpick scenarios and real errors
            const isPostUnpickScenario = response.message && (
              response.message.includes('Form data retrieved') || 
              response.message.includes('run')
            );
            
            if (isPostUnpickScenario) {
              // This is likely a post-unpick scenario where backend returns success but no data
              const errorMsg = 'No form data available - likely all lots have been unpicked';
              this.errorMessage.set(errorMsg);
              this.isLoading.set(false);
              throw new Error('Failed to retrieve form data');
            } else {
              const errorMsg = 'No form data found in response';
              this.errorMessage.set(errorMsg);
              this.isLoading.set(false);
              throw new Error(errorMsg);
            }
          }
          return response;
        }),
        // Then update state on successful response
        tap(response => {
          if (response.success && response.data) {
            this.currentFormData.set(response.data);
            this.currentRun.set(response.data.run);
          }
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          // Check if it's an HTTP error or our custom error
          const errorMsg = error.message || error.error?.message || `Failed to get form data for run ${runNo}`;
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        })
      );
  }

  /**
   * Get bulk run status information
   */
  getBulkRunStatus(runNo: number): Observable<ApiResponse<BulkRunStatusResponse>> {
    return this.http.get<ApiResponse<BulkRunStatusResponse>>(`${this.baseUrl}/${runNo}/status`)
      .pipe(
        tap((response: ApiResponse<BulkRunStatusResponse>) => {
          if (response.success) {
          }
        }),
        catchError(error => {
          const errorMsg = error.error?.message || `Failed to get status for run ${runNo}`;
          console.error(`❌ Status fetch error for run ${runNo}:`, errorMsg);
          return throwError(() => new Error(errorMsg));
        })
      );
  }

  /**
   * Get available bulk runs (NEW or IN_PROGRESS status)
   */
  getAvailableRuns(): Observable<ApiResponse<BulkRun[]>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.get<ApiResponse<BulkRun[]>>(`${this.baseUrl}/available`)
      .pipe(
        tap((response: ApiResponse<BulkRun[]>) => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to get available runs';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<BulkRun[]>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Get next ingredient for auto-progression
   */
  getNextIngredient(runNo: number, currentIndex: number): Observable<ApiResponse<BulkRunFormData | null>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams().set('current_index', currentIndex.toString());

    return this.http.get<ApiResponse<BulkRunFormData | null>>(`${this.baseUrl}/${runNo}/next-ingredient`, { params })
      .pipe(
        tap(response => {
          if (response.success && response.data) {
            this.currentFormData.set(response.data);
          }
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          // Not finding next ingredient is not necessarily an error (run complete)
          if (error.status === 200 && error.error?.success === false) {
            // Run is complete
            const emptyResponse: ApiResponse<BulkRunFormData | null> = {
              success: true,
              data: null,
              message: 'Run complete'
            };
            return new Observable<ApiResponse<BulkRunFormData | null>>(observer => {
              observer.next(emptyResponse);
              observer.complete();
            });
          }
          const errorMsg = error.error?.message || 'Failed to get next ingredient';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<BulkRunFormData | null>) => {
          if (!response.success) {
            if (response.message.includes('complete')) {
              // Run is complete, return null
              return null;
            }
            throw new Error(response.message);
          }
          return response.data;
        })
      );
  }

  /**
   * Check if bulk run is complete
   */
  checkRunCompletion(runNo: number): Observable<ApiResponse<boolean>> {
    return this.http.get<ApiResponse<boolean>>(`${this.baseUrl}/${runNo}/completion`)
      .pipe(
        catchError(error => {
          const errorMsg = error.error?.message || 'Failed to check run completion';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<boolean>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Get inventory alerts for a specific item (Story 1.2)
   */
  getInventoryAlerts(itemKey: string, expectedQty?: number): Observable<ApiResponse<InventoryAlert[]>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let params = new HttpParams();
    if (expectedQty !== undefined) {
      params = params.set('expected_qty', expectedQty.toString());
    }

    return this.http.get<ApiResponse<InventoryAlert[]>>(`${this.baseUrl}/inventory/${itemKey}/alerts`, { params })
      .pipe(
        tap(response => {
          this.isLoading.set(false);
          if (response.success && response.data) {
            // Update inventory status based on alerts
            const alerts = response.data;
            const criticalAlerts = alerts.filter(a => a.severity === 'Critical');
            const warningAlerts = alerts.filter(a => a.severity === 'Warning');
            
            let stockStatus: InventoryStatus['stock_status'] = 'Normal';
            if (criticalAlerts.some(a => a.alert_type.includes('OutOfStock'))) {
              stockStatus = 'OutOfStock';
            } else if (alerts.some(a => a.alert_type.includes('LowStock'))) {
              stockStatus = 'Low';
            } else if (alerts.some(a => a.alert_type.includes('Expired'))) {
              stockStatus = 'Expired';
            }

            this.inventoryStatus.set({
              item_key: itemKey,
              has_alerts: alerts.length > 0,
              alert_count: alerts.length,
              stock_status: stockStatus,
              alerts: alerts
            });
          }
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to get inventory alerts';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<InventoryAlert[]>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Check inventory status and refresh data for current ingredient
   */
  refreshInventoryStatus(itemKey: string, expectedQty?: number): void {
    this.getInventoryAlerts(itemKey, expectedQty).subscribe({
      next: (response) => {
      },
      error: (error) => {
        console.warn('Failed to refresh inventory status:', error);
      }
    });
  }

  /**
   * Clear current state
   */
  clearState(): void {
    this.currentRun.set(null);
    this.currentFormData.set(null);
    this.errorMessage.set(null);
    this.isLoading.set(false);
    this.inventoryStatus.set(null);
  }

  /**
   * Search for items in a bulk run for ItemKey selection modal
   */
  searchRunItems(runNo: number): Observable<ApiResponse<RunItemSearchResult[]>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // Add cache-busting timestamp to ensure fresh data for auto-switching
    const timestamp = Date.now();
    return this.http.get<ApiResponse<RunItemSearchResult[]>>(`${this.baseUrl}/${runNo}/search-items?t=${timestamp}`)
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to search run items';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<RunItemSearchResult[]>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Load form data for a specific ingredient by ItemKey within a run - RACE CONDITION PROTECTED
   */
  loadIngredientByItemKey(runNo: number, itemKey: string): Observable<ApiResponse<BulkRunFormData>> {
    const mutexKey = `${runNo}-${itemKey}`;

    // RACE CONDITION FIX: Check if loading is already in progress for this ingredient
    if (this.ingredientLoadingMutex.get(mutexKey)) {

      // Return current form data if available, otherwise throw error
      const currentData = this.currentFormData();
      if (currentData && currentData.form_data.item_key === itemKey) {
        return of({
          success: true,
          data: currentData,
          message: 'Using cached ingredient data'
        });
      } else {
        return throwError(() => new Error(`Ingredient loading in progress for ${itemKey}`));
      }
    }

    // Set mutex
    this.ingredientLoadingMutex.set(mutexKey, true);
    this.isLoading.set(true);
    this.errorMessage.set(null);


    // Get the correct ingredient index using the dedicated endpoint
    return this.http.get<ApiResponse<number>>(`${this.baseUrl}/${runNo}/ingredient-index?item_key=${itemKey}`).pipe(
      switchMap((indexResponse: ApiResponse<number>) => {
        if (!indexResponse.success || indexResponse.data === null || indexResponse.data === undefined) {
          throw new Error(`Failed to find ingredient index for ${itemKey} in run ${runNo}`);
        }

        const ingredientIndex = indexResponse.data;

        // Get the form data for the resolved ingredient index
        return this.getBulkRunFormData(runNo, ingredientIndex);
      }),
      tap(response => {
        try {
          this.isLoading.set(false);
          if (response.success && response.data) {
            this.currentFormData.set(response.data);
          }
        } finally {
          // Always release the mutex
          this.ingredientLoadingMutex.delete(mutexKey);
        }
      }),
      catchError(error => {
        this.isLoading.set(false);
        const errorMsg = error.message || 'Failed to load ingredient data';
        this.errorMessage.set(errorMsg);

        // Always release the mutex on error
        this.ingredientLoadingMutex.delete(mutexKey);

        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Load ingredient data by ItemKey and specific coordinates (RowNum, LineId)
   * Used for pallet transitions within the same ingredient
   */
  loadIngredientByItemKeyAndCoordinates(runNo: number, itemKey: string, rowNum: number, lineId: number): Observable<ApiResponse<BulkRunFormData>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    // Use the coordinate-specific endpoint to load exact pallet data
    const url = `${this.baseUrl}/${runNo}/ingredient-by-coordinates?item_key=${itemKey}&row_num=${rowNum}&line_id=${lineId}`;
    
    return this.http.get<ApiResponse<BulkRunFormData>>(url).pipe(
      tap((response: ApiResponse<BulkRunFormData>) => {
        this.isLoading.set(false);
        if (response.success && response.data) {
          this.currentFormData.set(response.data);
        }
      }),
      catchError(error => {
        this.isLoading.set(false);
        const errorMsg = error.message || `Failed to load ingredient data for coordinates (RowNum: ${rowNum}, LineId: ${lineId})`;
        this.errorMessage.set(errorMsg);
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Health check for bulk runs API
   */
  healthCheck(): Observable<ApiResponse<string>> {
    return this.http.get<ApiResponse<string>>(`${this.baseUrl}/health`)
      .pipe(
        catchError(error => {
          return throwError(() => new Error('Bulk Runs API health check failed'));
        }),
        tap((response: ApiResponse<string>) => {
          if (!response.success) {
            throw new Error('Bulk Runs API is not healthy');
          }
        })
      );
  }

  /**
   * Search lots for a specific run and item key for lot selection modal
   */
  searchRunLots(runNo: number, itemKey: string): Observable<ApiResponse<LotSearchResult[]>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams().set('item_key', itemKey);

    return this.http.get<ApiResponse<LotSearchResult[]>>(`${this.baseUrl}/${runNo}/lots/search`, { params })
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to search run lots';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<LotSearchResult[]>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Search lots for a specific run and item key with pagination support
   */
  searchRunLotsPaginated(runNo: number, itemKey: string, page: number = 1, pageSize: number = 10): Observable<ApiResponse<PaginatedLotSearchResponse>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams()
      .set('item_key', itemKey)
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<ApiResponse<PaginatedLotSearchResponse>>(`${this.baseUrl}/${runNo}/lots/search`, { params })
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || 'Failed to search run lots';
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<PaginatedLotSearchResponse>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Get suggested lot/bin for an ingredient using same filtering logic as lot search
   * This ensures consistency between suggest feature and lot search modal
   */
  getSuggestedLot(runNo: number, itemKey: string): Observable<{ lot_no: string; bin_no: string } | null> {
    // Use the paginated search to get first lot with size 1 (most efficient)
    return this.searchRunLotsPaginated(runNo, itemKey, 1, 1).pipe(
      map((response: ApiResponse<PaginatedLotSearchResponse>) => {
        if (response.success && response.data && response.data.lots.length > 0) {
          const firstLot = response.data.lots[0];
          return {
            lot_no: firstLot.lot_no,
            bin_no: firstLot.bin_no || ''
          };
        }
        return null;
      }),
      catchError(error => {
        // If lot search fails, return null instead of throwing error
        // This prevents suggest feature from breaking the form loading
        console.warn(`Failed to get suggested lot for item ${itemKey}:`, error);
        return of(null);
      })
    );
  }

  /**
   * Get available bins for a specific lot number within a run
   * Used for barcode scanning workflow
   */
  getLotBins(runNo: number, lotNo: string, itemKey: string): Observable<ApiResponse<LotSearchResult[]>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params = new HttpParams().set('item_key', itemKey);
    return this.http.get<ApiResponse<LotSearchResult[]>>(`${this.baseUrl}/${runNo}/lots/${lotNo}/bins`, { params })
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || `Failed to get lot bins - HTTP ${error.status}: ${error.statusText}`;
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<LotSearchResult[]>) => {
          if (!response.success) {
            const errorMsg = response.message || 'Unknown API error';
            throw new Error(`API Error: ${errorMsg}`);
          }
        })
      );
  }

  /**
   * Validate that a lot number exists and is available for the specified run and item
   * Used for barcode scanning validation workflow
   */
  validateLotForRun(runNo: number, lotNo: string, itemKey: string): Observable<ApiResponse<LotSearchResult[]>> {
    // Reuse the lot bins endpoint - if it returns results, the lot is valid
    return this.getLotBins(runNo, lotNo, itemKey);
  }

  /**
   * Utility method to parse numeric string values safely
   */
  parseNumericValue(value: string | undefined): number {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Format Bangkok date string for form display
   */
  formatDateForDisplay(dateString?: string): string {
    if (!dateString) return this.getCurrentDateString();
    
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return this.getCurrentDateString();
    }
  }

  /**
   * Get pallet tracking data for a specific bulk run
   * Used by bulk picking interface to show real production tracking data
   */
  getPalletTrackingData(runNo: number, itemKey?: string): Observable<ApiResponse<PalletTrackingResponse>> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    // Build URL with optional item_key parameter
    let url = `${this.baseUrl}/${runNo}/pallets`;
    if (itemKey) {
      url += `?item_key=${encodeURIComponent(itemKey)}`;
    }

    return this.http.get<ApiResponse<PalletTrackingResponse>>(url)
      .pipe(
        tap(response => {
          this.isLoading.set(false);
        }),
        catchError(error => {
          this.isLoading.set(false);
          const errorMsg = error.error?.message || `Failed to get pallet tracking data for run ${runNo}`;
          this.errorMessage.set(errorMsg);
          return throwError(() => new Error(errorMsg));
        }),
        tap((response: ApiResponse<PalletTrackingResponse>) => {
          if (!response.success) {
            console.warn(`Pallet tracking API returned success: false for run ${runNo}. Message: ${response.message}`);
            // Don't throw error - let the component handle this gracefully
            // throw new Error(response.message);
          }
        })
      );
  }

  /**
   * Get current date string in YYYY-MM-DD format
   */
  private getCurrentDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Confirm pick operation with backend API (BME4 Compatible)
   * Implements the 4-table atomic transaction pattern
   */
  confirmPick(pickData: {
    runNo: string;
    rowNum: number;
    lineId: number;
    pickedBulkQty: number;
    lotNo: string;
    binNo: string;
  }): Observable<ApiResponse<any>> {
    const url = `${this.baseUrl}/${pickData.runNo}/confirm-pick`;

    const currentUser = this.authService.getCurrentUser();
    const requestBody = {
      row_num: pickData.rowNum,
      line_id: pickData.lineId,
      picked_bulk_qty: pickData.pickedBulkQty,
      lot_no: pickData.lotNo,
      bin_no: pickData.binNo,
      user_id: currentUser?.username || undefined // Add user_id to request body
    };

    const httpOptions = {
      headers: this.getAuthHeaders()
    };
    

    return this.http.post<ApiResponse<any>>(url, requestBody, httpOptions)
      .pipe(
        catchError(error => {
          const propagated = {
            message: error?.error?.message || 'Failed to confirm pick operation',
            code: error?.error?.code || null,
            status: error?.status,
          };
          return throwError(() => propagated);
        }),
        tap((response: ApiResponse<any>) => {
          if (!response.success) {
            // Preserve API message for caller
            throw { message: response.message } as any;
          }
        })
      );
  }

  /**
   * Validate pick request with backend for data synchronization checks
   * Used to detect data synchronization issues before actual pick confirmation
   */
  validatePickRequest(runNo: number, pickData: {
    picked_bulk_qty: number;
    lot_no: string;
    bin_no: string;
    row_num: number;
    line_id: number;
    user_id: string;
  }): Observable<ApiResponse<any>> {
    const url = `${this.baseUrl}/${runNo}/validate-pick`;

    const requestBody = {
      row_num: pickData.row_num,
      line_id: pickData.line_id,
      picked_bulk_qty: pickData.picked_bulk_qty,
      lot_no: pickData.lot_no,
      bin_no: pickData.bin_no,
      user_id: pickData.user_id
    };

    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.post<ApiResponse<any>>(url, requestBody, httpOptions)
      .pipe(
        catchError(error => {
          console.warn('🔍 Pick validation failed:', error);
          // Return error information for sync checking
          return of({
            success: false,
            data: { error_message: error.error?.message || error.message || 'Validation failed' },
            message: 'Validation failed'
          });
        })
      );
  }

  // Get picked lots for an ingredient
  getPickedLots(runNo: number, rowNum: number, lineId: number): Observable<ApiResponse<PickedLotsResponse>> {
    const url = `${this.baseUrl}/${runNo}/${rowNum}/${lineId}/picked-lots`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.get<ApiResponse<PickedLotsResponse>>(url, httpOptions)
      .pipe(
        catchError(error => {
          console.error('Failed to fetch picked lots:', error);
          return throwError(error);
        })
      );
  }

  // Get ALL picked lots for an entire run (across all ingredients)
  getAllPickedLotsForRun(runNo: number): Observable<ApiResponse<PickedLotsResponse>> {
    const url = `${this.baseUrl}/${runNo}/all-picked-lots`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.get<ApiResponse<PickedLotsResponse>>(url, httpOptions)
      .pipe(
        catchError(error => {
          console.error('Failed to fetch all picked lots for run:', error);
          return throwError(error);
        })
      );
  }

  // Unpick ingredient (batch or specific lot)
  unpickIngredient(runNo: number, rowNum: number, lineId: number, request: UnpickRequest): Observable<ApiResponse<any>> {
    const url = `${this.baseUrl}/${runNo}/${rowNum}/${lineId}/unpick`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.post<ApiResponse<any>>(url, request, httpOptions)
      .pipe(
        catchError(error => {
          console.error('Failed to unpick ingredient:', error);
          return throwError(error);
        })
      );
  }

  // Unpick all lots from entire run (all ingredients)
  unpickAllRunLots(runNo: number): Observable<ApiResponse<any>> {
    const url = `${this.baseUrl}/${runNo}/unpick-all`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.post<ApiResponse<any>>(url, {}, httpOptions)
      .pipe(
        catchError(error => {
          console.error('Failed to unpick all run lots:', error);
          return throwError(error);
        })
      );
  }

  // Get batch weight summary for Pending to Picked modal
  getBatchWeightSummary(runNo: number): Observable<ApiResponse<BatchWeightSummaryResponse>> {
    const url = `${this.baseUrl}/${runNo}/batch-weight-summary`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };

    return this.http.get<ApiResponse<BatchWeightSummaryResponse>>(url, httpOptions)
      .pipe(
        catchError(error => {
          console.error('Failed to fetch batch weight summary:', error);
          return throwError(error);
        }),
        tap((response: ApiResponse<BatchWeightSummaryResponse>) => {
          if (!response.success) {
            throw new Error(response.message);
          }
        })
      );
  }

  /**
   * **REVERT STATUS SERVICE** - Revert bulk run status from PRINT back to NEW
   * Used when user wants to make changes after run completion
   */
  revertRunStatus(runNo: number): Observable<ApiResponse<BulkRunStatusResponse>> {
    const url = `${this.baseUrl}/${runNo}/revert-status`;
    const httpOptions = {
      headers: this.getAuthHeaders()
    };


    return this.http.post<ApiResponse<BulkRunStatusResponse>>(url, {}, httpOptions)
      .pipe(
        tap((response: ApiResponse<BulkRunStatusResponse>) => {
          if (response.success) {
            // Update the current run status signal if the response contains updated status
            if (response.data) {
              // Note: We don't have access to currentRunStatus signal from the component here,
              // so the component will need to refresh the status after calling this method
            }
          } else {
            console.warn(`⚠️ SERVICE: Failed to revert run ${runNo} status: ${response.message}`);
          }
        }),
        catchError(error => {
          console.error(`❌ SERVICE: Error reverting run ${runNo} status:`, error);
          const errorMsg = error.error?.message || error.message || 'Failed to revert run status';
          return throwError(() => new Error(errorMsg));
        })
      );
  }

  /**
   * Check if run is complete (all required ingredients picked) - Universal completion detection
   * Used to trigger automatic status update from NEW → PRINT
   */
  checkDetailedRunCompletion(runNo: number): Observable<ApiResponse<{
    is_complete: boolean;
    incomplete_count: number;
    completed_count: number;
    total_ingredients: number;
  }>> {

    return this.http.get<ApiResponse<{
      is_complete: boolean;
      incomplete_count: number;
      completed_count: number;
      total_ingredients: number;
    }>>(`${this.baseUrl}/${runNo}/completion-status`, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(response => {
        if (response.success && response.data) {
          const { is_complete, incomplete_count, completed_count, total_ingredients } = response.data;

          if (is_complete) {
          }
        }
      }),
      catchError(error => {
        console.error(`❌ SERVICE: Error checking run ${runNo} completion:`, error);
        const errorMsg = error.error?.message || error.message || 'Failed to check run completion';
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Update run status from NEW to PRINT when all ingredients are complete
   * Final step in automatic run completion workflow
   */
  updateRunStatusToPrint(runNo: number): Observable<ApiResponse<{ oldStatus: string; newStatus: string }>> {

    return this.http.put<ApiResponse<{ oldStatus: string; newStatus: string }>>(
      `${this.baseUrl}/${runNo}/complete`,
      {}, // Empty body - run number is in URL
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(response => {
        if (response.success) {
        } else {
          console.warn(`⚠️ SERVICE: Failed to update run ${runNo} status: ${response.message}`);
        }
      }),
      catchError(error => {
        console.error(`❌ SERVICE: Error updating run ${runNo} status to PRINT:`, error);
        const errorMsg = error.error?.message || error.message || 'Failed to update run status';
        return throwError(() => new Error(errorMsg));
      })
    );
  }
}
