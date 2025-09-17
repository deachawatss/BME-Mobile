// BME4-Compatible Intelligence Systems Integration Example
// This demonstrates how to integrate the intelligent systems into the bulk picking component

import { Component, signal, computed, effect, inject, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil, switchMap, combineLatest } from 'rxjs';

import {
  IngredientIntelligenceService,
  IngredientBatchStatus,
  RunCoordinationState,
  BatchCompletionRequest,
  AutoSwitchResponse
} from '../../services/ingredient-intelligence.service';

import {
  WorkflowStateMachineService,
  WorkflowState,
  WorkflowEvent
} from '../../services/workflow-state-machine.service';

import { DebugService } from '../../services/debug.service';

@Component({
  selector: 'app-bulk-picking-intelligence',
  template: '<div><!-- Intelligence integration component --></div>',
  standalone: true
})
export class BulkPickingIntelligenceIntegration implements OnInit, OnDestroy {
  private readonly intelligenceService = inject(IngredientIntelligenceService);
  private readonly workflowService = inject(WorkflowStateMachineService);
  private readonly debug = inject(DebugService);
  private readonly destroy$ = new Subject<void>();

  // Intelligence system signals
  public ingredientStatuses = signal<IngredientBatchStatus[]>([]);
  public coordinationState = signal<RunCoordinationState | null>(null);
  public currentWorkflowState = signal<WorkflowState>('INITIALIZATION');
  
  // Computed properties for intelligent behavior
  public availableIngredientsCount = computed(() => 
    this.ingredientStatuses().filter(status => status.status !== 'AllCompleted').length
  );

  public completedIngredientsCount = computed(() => 
    this.ingredientStatuses().filter(status => status.status === 'AllCompleted').length
  );

  public shouldShowAutoSwitchNotification = computed(() => {
    const coordination = this.coordinationState();
    return coordination && 
           coordination.consecutive_completed_batches >= (coordination.switch_config.switch_threshold - 1);
  });

  public nextRecommendedIngredient = computed(() => {
    const coordination = this.coordinationState();
    if (!coordination) return null;
    
    const available = this.ingredientStatuses()
      .filter(status => status.status !== 'AllCompleted')
      .sort((a, b) => a.line_id - b.line_id);
    
    return available[0]?.item_key || null;
  });

  // Current run number (from component state)
  public currentRunNo = signal(215226);

  ngOnInit() {
    this.initializeIntelligentWorkflow();
    this.setupWorkflowReactions();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize the intelligent workflow system for the current run
   */
  private initializeIntelligentWorkflow(): void {
    const runNo = this.currentRunNo();
    this.debug.stateChange('IntelligenceIntegration', `Initializing intelligent workflow for run ${runNo}`);

    // Initialize workflow state machine
    this.workflowService.initializeWorkflow(runNo);

    // Load ingredient statuses
    this.intelligenceService.getIngredientStatuses(runNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (statuses) => {
          this.ingredientStatuses.set(statuses);
          this.debug.debug('IntelligenceIntegration', `Loaded ${statuses.length} ingredient statuses`);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to load ingredient statuses', error);
        }
      });

    // Initialize run coordination
    this.intelligenceService.initializeRunCoordination(runNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (coordination) => {
          this.coordinationState.set(coordination);
          this.debug.stateChange('IntelligenceIntegration', `Run coordination initialized for ${coordination.total_ingredients} ingredients`);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to initialize run coordination', error);
        }
      });
  }

  /**
   * Setup reactive workflow state management
   */
  private setupWorkflowReactions(): void {
    // React to workflow state changes
    this.workflowService.currentState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.currentWorkflowState.set(state);
        this.debug.stateChange('IntelligenceIntegration', `Workflow state changed to: ${state}`);
      });

    // React to coordination state changes for auto-switching
    this.intelligenceService.coordinationState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(coordination => {
        if (coordination) {
          this.coordinationState.set(coordination);
          this.checkAutoSwitchConditions(coordination);
        }
      });
  }

  /**
   * Handle batch completion with intelligent auto-switching
   */
  async handleBatchCompletion(
    batchNumber: string, 
    ingredient: string, 
    lineId: number, 
    pickedQuantity: number,
    userId: string
  ): Promise<void> {
    this.debug.info('IntelligenceIntegration', `Processing batch completion: ${batchNumber}, ${ingredient}, ${pickedQuantity}`);

    // Create batch completion request
    const completionRequest: BatchCompletionRequest = {
      batch_number: batchNumber,
      ingredient,
      line_id: lineId,
      picked_quantity: pickedQuantity.toString(),
      user_id: userId
    };

    try {
      // Evaluate auto-switching
      const switchResponse = await this.intelligenceService
        .evaluateAutoSwitch(this.currentRunNo(), completionRequest)
        .toPromise();

      if (switchResponse?.switch_decision.should_switch) {
        await this.handleAutoSwitch(switchResponse);
      } else {
        // Continue with current ingredient
        this.debug.stateChange('IntelligenceIntegration', `Continuing with current ingredient: ${ingredient}`);
        this.workflowService.completeBatch(batchNumber)
          .pipe(takeUntil(this.destroy$))
          .subscribe(success => {
            if (success) {
              // Reset form for next pick
              this.resetFormForNextPick();
            }
          });
      }

      // Update ingredient statuses
      this.refreshIngredientStatuses();
      
    } catch (error) {
      this.debug.error('IntelligenceIntegration', 'Error processing batch completion', error);
      this.workflowService.handleError('Batch completion failed');
    }
  }

  /**
   * Handle automatic ingredient switching
   */
  private async handleAutoSwitch(switchResponse: AutoSwitchResponse): Promise<void> {
    const { switch_decision, coordination_state } = switchResponse;
    
    if (!switch_decision.next_ingredient) {
      this.debug.info('IntelligenceIntegration', 'All ingredients completed!');
      this.workflowService.transitionToState('RUN_COMPLETION', 'COMPLETE_RUN');
      return;
    }

    this.debug.stateChange('IntelligenceIntegration', `Auto-switching from ${switch_decision.current_ingredient} to ${switch_decision.next_ingredient}`);
    
    // Show switching notification
    this.showAutoSwitchNotification(
      switch_decision.current_ingredient,
      switch_decision.next_ingredient,
      switch_decision.consecutive_completed
    );

    // Update coordination state
    this.coordinationState.set(coordination_state);

    // Transition workflow to new ingredient
    this.workflowService.switchToIngredient(switch_decision.next_ingredient);

    // Load form data for new ingredient
    await this.loadIngredientFormData(switch_decision.next_ingredient);
  }

  /**
   * Show auto-switch notification to user
   */
  private showAutoSwitchNotification(
    currentIngredient: string, 
    nextIngredient: string, 
    consecutiveCompleted: number
  ): void {
    // This would integrate with your existing notification system
    this.debug.info('IntelligenceIntegration', `Auto-Switch Notification: Completed ${consecutiveCompleted} consecutive batches for ${currentIngredient}, switching to ${nextIngredient}. Continue with new ingredient workflow.`);
    
    // Example: Show toast notification
    // this.toastService.show({
    //   type: 'info',
    //   title: 'Auto-Switching Ingredient',
    //   message: `Switched from ${currentIngredient} to ${nextIngredient}`,
    //   duration: 5000
    // });
  }

  /**
   * Load form data for new ingredient after switching
   */
  private async loadIngredientFormData(itemKey: string): Promise<void> {
    try {
      // This would call your existing form data loading logic
      // const formData = await this.bulkRunsService.getFormDataForIngredient(this.currentRunNo(), itemKey);
      // this.populateFormWithIngredientData(formData);
      
      this.debug.debug('IntelligenceIntegration', `Loading form data for new ingredient: ${itemKey}`);
      
      // Reset workflow to ingredient selection with new ingredient
      this.workflowService.selectIngredient(itemKey);
      
    } catch (error) {
      this.debug.error('IntelligenceIntegration', 'Failed to load new ingredient data', error);
      this.workflowService.handleError('Failed to load new ingredient data');
    }
  }

  /**
   * Check auto-switch conditions and provide UI feedback
   */
  private checkAutoSwitchConditions(coordination: RunCoordinationState): void {
    const threshold = coordination.switch_config.switch_threshold;
    const completed = coordination.consecutive_completed_batches;
    
    if (completed >= threshold - 1) {
      this.debug.warn('IntelligenceIntegration', `Auto-switch approaching: ${completed}/${threshold} batches completed`);
      
      // Update UI to show auto-switch is imminent
      // this.showAutoSwitchWarning = true;
    }
  }

  /**
   * Manual ingredient switching (user override)
   */
  async manualSwitchIngredient(newIngredient: string): Promise<void> {
    this.debug.stateChange('IntelligenceIntegration', `Manual ingredient switch to: ${newIngredient}`);
    
    try {
      // Reset coordination consecutive count
      const coordination = this.coordinationState();
      if (coordination) {
        coordination.consecutive_completed_batches = 0;
        coordination.current_ingredient = newIngredient;
        this.coordinationState.set(coordination);
      }

      // Transition workflow
      this.workflowService.switchToIngredient(newIngredient);
      
      // Load new ingredient data
      await this.loadIngredientFormData(newIngredient);
      
    } catch (error) {
      this.debug.error('IntelligenceIntegration', 'Manual ingredient switch failed', error);
      this.workflowService.handleError('Manual ingredient switch failed');
    }
  }

  /**
   * Get filtered ingredients for ItemKey search modal
   * This replaces the existing search logic with intelligent filtering
   */
  getAvailableIngredientsForSearch(): void {
    const runNo = this.currentRunNo();
    
    this.intelligenceService.getAvailableIngredientsForSearch(runNo, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ingredients) => {
          this.debug.debug('IntelligenceIntegration', `Available ingredients for search: ${ingredients.length} (completed ingredients hidden)`);
          
          // Update your existing ingredient search modal data
          // this.itemSearchResults.set(ingredients);
          // this.showItemSearchModal.set(true);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to load available ingredients', error);
        }
      });
  }

  /**
   * Refresh ingredient statuses after pick operations
   */
  private refreshIngredientStatuses(): void {
    const runNo = this.currentRunNo();
    
    this.intelligenceService.getIngredientStatuses(runNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (statuses) => {
          this.ingredientStatuses.set(statuses);
          this.debug.stateChange('IntelligenceIntegration', `Refreshed ingredient statuses: ${statuses.length} ingredients`);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to refresh ingredient statuses', error);
        }
      });
  }

  /**
   * Reset form for next pick operation
   */
  private resetFormForNextPick(): void {
    // Reset your form fields while preserving ingredient selection
    this.debug.stateChange('IntelligenceIntegration', 'Resetting form for next pick operation');
    
    // Example form reset logic
    // this.selectedLot.set('');
    // this.selectedBin.set('');
    // this.inputQuantity.set(0);
    // this.focusLotNumberField();
  }

  /**
   * Get completion metrics for dashboard display
   */
  getRunCompletionMetrics(): void {
    const runNo = this.currentRunNo();
    
    this.intelligenceService.getRunCompletionMetrics(runNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (metrics) => {
          this.debug.debug('IntelligenceIntegration', `Run completion metrics: Overall: ${metrics.overall_completion_percentage.toFixed(1)}%, Ingredients: ${metrics.completed_ingredients}/${metrics.total_ingredients}, Batches: ${metrics.completed_batches}/${metrics.total_batches}`);
          
          // Update dashboard UI
          // this.completionMetrics.set(metrics);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to load completion metrics', error);
        }
      });
  }

  /**
   * Get cross-ingredient lot optimization recommendations
   */
  getLotOptimizationRecommendations(): void {
    const runNo = this.currentRunNo();
    
    this.intelligenceService.getLotOptimization(runNo)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (optimization) => {
          this.debug.debug('IntelligenceIntegration', `Lot optimization recommendations: Ingredient assignments: ${Object.keys(optimization.ingredient_lot_assignments).length}, Unique lots: ${Object.keys(optimization.lot_ingredient_usage).length}, Zone preferences: ${Object.entries(optimization.lot_zone_preferences).map(([ing, zone]) => `${ing}→${zone}`).join(', ')}`);
          
          // Apply optimization to ingredient suggestions
          // this.applyLotOptimization(optimization);
        },
        error: (error) => {
          this.debug.error('IntelligenceIntegration', 'Failed to load lot optimization', error);
        }
      });
  }
}

// Example usage in template:
/*
<div class="intelligence-status-panel" *ngIf="coordinationState()">
  <!-- Auto-switch notification -->
  <div class="auto-switch-notification" *ngIf="shouldShowAutoSwitchNotification()">
    <h3>🔄 Auto-Switch Ready</h3>
    <p>Completed {{ coordinationState()?.consecutive_completed_batches }} consecutive batches</p>
    <p>Next ingredient: {{ nextRecommendedIngredient() }}</p>
  </div>

  <!-- Ingredient completion overview -->
  <div class="completion-overview">
    <h3>📊 Run Progress</h3>
    <p>Completed: {{ completedIngredientsCount() }}</p>
    <p>Remaining: {{ availableIngredientsCount() }}</p>
  </div>

  <!-- Workflow state indicator -->
  <div class="workflow-state">
    <h3>🔄 Current State</h3>
    <p>{{ currentWorkflowState() }}</p>
  </div>
</div>
*/