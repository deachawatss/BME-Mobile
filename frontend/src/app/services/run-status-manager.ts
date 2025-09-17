import { Injectable, signal } from '@angular/core';
import { BulkRunsService } from './bulk-runs.service';

/**
 * Centralized Run Status Manager
 *
 * Handles ALL run status transitions and completion logic in one place.
 * Eliminates race conditions and provides consistent behavior across the application.
 */

export enum StatusTrigger {
  AFTER_PICK = 'after_pick',
  PALLET_COMPLETED = 'pallet_completed',
  INGREDIENT_COMPLETED = 'ingredient_completed',
  RUN_COMPLETED = 'run_completed',
  MANUAL_CHECK = 'manual_check'
}

export interface RunStatusState {
  runNumber: number;
  status: string;
  lastUpdated: Date;
}

@Injectable({
  providedIn: 'root'
})
export class RunStatusManager {
  // Race condition protection
  private completionCheckInProgress = false;
  private lastCompletionCheckTimestamp = 0;
  private completionCheckTimeout: any = null;
  private readonly COMPLETION_DEBOUNCE_MS = 1000;

  // Status state management
  private currentRunStatus = signal<RunStatusState | null>(null);

  constructor(private bulkRunsService: BulkRunsService) {}

  /**
   * Single entry point for all completion checks
   * Replaces all scattered checkAndUpdateRunCompletion() calls
   */
  public triggerCompletionCheck(runNumber: number, trigger: StatusTrigger): void {
    console.log(`🎯 STATUS_MANAGER: Completion check triggered by ${trigger} for run ${runNumber}`);

    // **STATUS GUARD**: Skip if status is already PRINT
    const currentStatus = this.currentRunStatus()?.status;
    if (currentStatus === 'PRINT') {
      console.log(`✅ STATUS_GUARD: Run ${runNumber} is already PRINT - skipping completion check`);
      return;
    }

    // **RACE CONDITION PROTECTION**: Implement debouncing and mutex
    const currentTime = Date.now();

    // Clear existing timeout if present
    if (this.completionCheckTimeout) {
      clearTimeout(this.completionCheckTimeout);
      this.completionCheckTimeout = null;
    }

    // Check debounce period
    if (currentTime - this.lastCompletionCheckTimestamp < this.COMPLETION_DEBOUNCE_MS) {
      console.log(`🔒 DEBOUNCE: Skipping completion check - within ${this.COMPLETION_DEBOUNCE_MS}ms debounce period`);
      return;
    }

    // Check mutex
    if (this.completionCheckInProgress) {
      console.log(`🔒 MUTEX: Completion check already in progress for run ${runNumber} - skipping duplicate`);
      return;
    }

    // Execute with debounce delay
    this.completionCheckTimeout = setTimeout(() => {
      this.executeCompletionCheck(runNumber, trigger);
    }, 100); // Minimal delay for UI consistency
  }

  /**
   * Execute the actual completion check - Protected by mutex
   */
  private executeCompletionCheck(runNumber: number, trigger: StatusTrigger): void {
    // **DOUBLE STATUS GUARD**: Verify status before execution
    const currentStatus = this.currentRunStatus()?.status;
    if (currentStatus === 'PRINT') {
      console.log(`✅ DOUBLE_GUARD: Run ${runNumber} status is PRINT - aborting completion check`);
      return;
    }

    // **MUTEX CHECK**: Ensure no concurrent execution
    if (this.completionCheckInProgress) {
      console.log(`🔒 DOUBLE_MUTEX: Completion check already in progress - aborting`);
      return;
    }

    // Set mutex and update timestamp
    this.completionCheckInProgress = true;
    this.lastCompletionCheckTimestamp = Date.now();

    console.log(`🔍 EXECUTING_CHECK: Checking run ${runNumber} completion (trigger: ${trigger})`);

    // Call backend to check completion
    this.bulkRunsService.checkDetailedRunCompletion(runNumber).subscribe({
      next: (response: any) => {
        try {
          if (response.success && response.data) {
            const { is_complete, incomplete_count, completed_count, total_ingredients } = response.data;

            console.log(`📊 COMPLETION_STATUS: ${completed_count}/${total_ingredients} ingredients complete, ${incomplete_count} remaining`);

            if (is_complete) {
              console.log(`🎉 RUN_COMPLETE: All ingredients finished for run ${runNumber} - updating to PRINT`);
              this.updateRunStatusToPrint(runNumber);
            } else {
              console.log(`⏳ RUN_PROGRESS: Run ${runNumber} still in progress: ${incomplete_count} ingredients remaining`);
            }
          }
        } finally {
          // Always release mutex
          this.completionCheckInProgress = false;
        }
      },
      error: (error: any) => {
        console.error(`❌ COMPLETION_CHECK_ERROR: Failed to check run ${runNumber} completion:`, error);
        // Always release mutex on error
        this.completionCheckInProgress = false;
      }
    });
  }

  /**
   * Update run status from NEW to PRINT
   * Centralized status update with consistent error handling
   */
  private updateRunStatusToPrint(runNumber: number): void {
    // **FINAL STATUS GUARD**: Last check before API call
    const currentStatus = this.currentRunStatus()?.status;
    if (currentStatus === 'PRINT') {
      console.log(`✅ FINAL_GUARD: Run ${runNumber} is already PRINT - skipping duplicate update`);
      this.showCompletionMessage(runNumber, 'Status is already PRINT');
      return;
    }

    console.log(`🔄 STATUS_UPDATE: Updating run ${runNumber} status to PRINT (current: ${currentStatus})`);

    this.bulkRunsService.updateRunStatusToPrint(runNumber).subscribe({
      next: (response: any) => {
        if (response.success) {
          console.log(`✅ STATUS_UPDATED: Run ${runNumber} status changed from NEW to PRINT`);

          // Update local status state
          this.updateLocalStatus(runNumber, 'PRINT');

          // Show success message
          this.showCompletionMessage(runNumber, 'Status successfully updated to PRINT');
        } else {
          console.warn(`⚠️ STATUS_UPDATE_FAILED: ${response.message}`);
        }
      },
      error: (error: any) => {
        // **SMART ERROR HANDLING**: Check if error is "already PRINT"
        const errorMessage = error?.error?.message || error?.message || error.toString();

        if (errorMessage.includes('already') && errorMessage.includes('PRINT')) {
          console.log(`✅ ALREADY_PRINT: Run ${runNumber} was already PRINT - treating as success`);

          // Update local status to sync
          this.updateLocalStatus(runNumber, 'PRINT');

          // Show completion message
          this.showCompletionMessage(runNumber, 'Status was already PRINT');
        } else {
          console.error(`❌ STATUS_UPDATE_ERROR: Failed to update run ${runNumber} status:`, error);
        }
      }
    });
  }

  /**
   * Update local status state
   */
  private updateLocalStatus(runNumber: number, status: string): void {
    this.currentRunStatus.set({
      runNumber,
      status,
      lastUpdated: new Date()
    });
  }

  /**
   * Show completion message to user
   */
  private showCompletionMessage(runNumber: number, details: string): void {
    const message = `🎉 Congratulations! Run ${runNumber} is complete!\n\n${details}. All ingredients have been successfully picked.`;
    alert(message);
  }

  /**
   * Public method to refresh run status (called from component)
   * Component should call this after getting fresh status from backend
   */
  public refreshRunStatus(runNumber?: number, newStatus?: string): void {
    if (runNumber) {
      console.log(`🔄 REFRESH_STATUS: Refreshing status for run ${runNumber}`);
      if (newStatus) {
        this.updateLocalStatus(runNumber, newStatus);
      }
      // Let component handle the actual backend call
    }
  }

  /**
   * Get current run status (for component access)
   */
  public getCurrentStatus(): RunStatusState | null {
    return this.currentRunStatus();
  }

  /**
   * Set current run status (called when component loads run data)
   */
  public setCurrentStatus(runNumber: number, status: string): void {
    this.updateLocalStatus(runNumber, status);
  }

  /**
   * Reset manager state (for testing or component cleanup)
   */
  public reset(): void {
    this.completionCheckInProgress = false;
    this.lastCompletionCheckTimestamp = 0;
    if (this.completionCheckTimeout) {
      clearTimeout(this.completionCheckTimeout);
      this.completionCheckTimeout = null;
    }
    this.currentRunStatus.set(null);
  }
}