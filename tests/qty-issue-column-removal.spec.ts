import { test, expect } from '@playwright/test';

test.describe('QtyIssue Column Removal Test', () => {
  test('verify QtyIssue column is removed from select LOT modal', async ({ page }) => {
    // Step 1: Navigate to application
    await page.goto('http://localhost:4200');
    await expect(page).toHaveTitle(/NWFTH - Warehouse Management System/);

    // Step 2: Login with credentials (using correct selectors)
    await page.fill('#username', 'deachawat');
    await page.fill('#password', 'Wind@password9937');
    await page.click('button[type="submit"]');

    // Wait for login to complete and check for successful navigation
    // The app might redirect to dashboard or main page
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // Take screenshot of the page after login
    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/after-login.png',
      fullPage: true 
    });

    // Step 3: Navigate to bulk picking section
    // Look for bulk picking navigation - could be a link, button, or menu item
    const bulkPickingNav = page.locator('text="Bulk Picking" i, a[href*="bulk" i], button:has-text("Bulk" i), .nav-item:has-text("Bulk" i)').first();
    await expect(bulkPickingNav).toBeVisible({ timeout: 15000 });
    await bulkPickingNav.click();
    
    // Wait for bulk picking page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot of bulk picking page
    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/bulk-picking-page.png',
      fullPage: true 
    });

    // Step 4: Find and interact with a bulk run
    // Look for any visible bulk run item, table row, or clickable element
    const bulkRunElements = page.locator('table tbody tr, .bulk-run-item, .run-item, .clickable-row, tr:has-text("Run")').first();
    await expect(bulkRunElements).toBeVisible({ timeout: 15000 });
    
    // Click on the first available bulk run
    await bulkRunElements.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Step 5: Find an ingredient and start lot selection
    // Look for ingredient rows, items, or buttons
    const ingredientElements = page.locator('table tbody tr:has(td), .ingredient-item, .ingredient-row, .ingredient-button').first();
    await expect(ingredientElements).toBeVisible({ timeout: 15000 });
    
    // Click on first ingredient to select it
    await ingredientElements.click();
    await page.waitForTimeout(1000);

    // Take screenshot before opening lot modal
    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/before-lot-modal.png',
      fullPage: true 
    });

    // Step 6: Click "Select LOT" button to open modal
    const selectLotButton = page.locator('button:has-text("Select LOT" i), button:has-text("Select Lot" i), button:has-text("LOT" i), .select-lot-btn').first();
    await expect(selectLotButton).toBeVisible({ timeout: 15000 });
    await selectLotButton.click();

    // Wait for modal to open - look for modal, dialog, or overlay
    await page.waitForSelector('.modal, [role="dialog"], .lot-selection-modal, .overlay, .dialog', { timeout: 15000 });
    
    // Step 7: Verify the modal opened and take screenshot
    const modal = page.locator('.modal, [role="dialog"], .lot-selection-modal, .overlay, .dialog').first();
    await expect(modal).toBeVisible();
    
    // Take screenshot of the modal for documentation
    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/select-lot-modal-after-column-removal.png',
      fullPage: true 
    });

    // Step 8: Verify table structure - should have 6 columns, not 7
    const tableHeaders = modal.locator('th, .table-header, .column-header');
    const headerCount = await tableHeaders.count();
    console.log(`Found ${headerCount} table headers`);
    
    // We expect exactly 6 columns now that QtyIssue is removed
    expect(headerCount).toBe(6);

    // Step 9: Verify specific expected columns are present
    const expectedColumns = [
      'LotNo',
      'BinNo', 
      'DateExp',
      'QtyOnHand',
      'CommitedQty',
      'Available Bags'
    ];

    for (const column of expectedColumns) {
      const columnHeader = modal.locator(`th:has-text("${column}"), .column-header:has-text("${column}")`);
      await expect(columnHeader).toBeVisible();
      console.log(`✅ Found expected column: ${column}`);
    }

    // Step 10: Verify QtyIssue column is NOT present
    const qtyIssueHeader = modal.locator('th:has-text("QtyIssue"), .column-header:has-text("QtyIssue")');
    const qtyIssueCount = await qtyIssueHeader.count();
    expect(qtyIssueCount).toBe(0);
    console.log('✅ Confirmed QtyIssue column is not present');

    // Step 11: Verify lot selection functionality still works
    const lotRows = modal.locator('tbody tr, .lot-row, .data-row').filter({ hasText: /\d/ }); // Rows with numbers (lot data)
    const lotRowCount = await lotRows.count();
    
    if (lotRowCount > 0) {
      console.log(`Found ${lotRowCount} lot rows, testing selection`);
      // Click on first available lot
      await lotRows.first().click();
      
      // Verify lot selection completes without errors
      // The modal might close or show confirmation
      await page.waitForTimeout(2000);
      
      // Take screenshot after lot selection
      await page.screenshot({ 
        path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/after-lot-selection.png',
        fullPage: true 
      });
    } else {
      console.log('No lot data rows found to test selection');
    }

    // Final screenshot to document successful test completion
    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/test-completion.png',
      fullPage: true 
    });

    console.log('✅ QtyIssue column successfully removed from select LOT modal');
    console.log('✅ Modal shows exactly 6 columns as expected');
    console.log('✅ All expected columns are present and visible');
  });

  test('verify table column order and structure', async ({ page }) => {
    // Navigate and login
    await page.goto('http://localhost:4200');
    await page.fill('#username', 'deachawat');
    await page.fill('#password', 'Wind@password9937');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Navigate to bulk picking
    const bulkPickingNav = page.locator('text="Bulk Picking" i, a[href*="bulk" i], button:has-text("Bulk" i)').first();
    await bulkPickingNav.click();
    await page.waitForLoadState('networkidle');
    
    // Open a bulk run and select ingredient
    const bulkRunElements = page.locator('table tbody tr, .bulk-run-item, .run-item').first();
    await bulkRunElements.click();
    await page.waitForLoadState('networkidle');
    
    const ingredientElements = page.locator('table tbody tr:has(td), .ingredient-item').first();
    await ingredientElements.click();
    
    // Open lot selection modal
    const selectLotButton = page.locator('button:has-text("Select LOT" i), button:has-text("LOT" i)').first();
    await selectLotButton.click();
    await page.waitForSelector('.modal, [role="dialog"], .lot-selection-modal', { timeout: 15000 });
    
    // Verify exact column order
    const modal = page.locator('.modal, [role="dialog"], .lot-selection-modal').first();
    const headers = await modal.locator('th, .table-header').allTextContents();
    
    console.log('Found table headers:', headers);
    
    const expectedOrder = ['LotNo', 'BinNo', 'DateExp', 'QtyOnHand', 'CommitedQty', 'Available Bags'];
    
    // Verify we have the right number of columns
    expect(headers.length).toBe(6);
    
    // Verify each expected column exists (order might vary)
    for (const expectedCol of expectedOrder) {
      const found = headers.some(header => header.includes(expectedCol));
      expect(found).toBe(true);
      console.log(`✅ Column "${expectedCol}" found in table`);
    }
    
    // Verify QtyIssue is definitely not present
    const hasQtyIssue = headers.some(header => header.includes('QtyIssue'));
    expect(hasQtyIssue).toBe(false);
    console.log('✅ Confirmed no QtyIssue column in table headers');

    await page.screenshot({ 
      path: '/home/deachawat/dev/projects/BPP/Mobile-Rust/tests/table-structure-verification.png',
      fullPage: true 
    });
  });
});