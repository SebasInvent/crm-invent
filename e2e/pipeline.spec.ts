import { test, expect } from '@playwright/test'

test.describe('Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/pipeline')
  })

  test('should display pipeline page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /pipeline de ventas/i })).toBeVisible()
  })

  test('should have pipeline columns', async ({ page }) => {
    await expect(page.getByText('Nuevo Lead').or(page.getByText('Prospecto'))).toBeVisible()
  })

  test('should open new deal dialog', async ({ page }) => {
    await page.getByRole('button', { name: /nuevo deal/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/projects')
  })

  test('should display projects page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /gestión de proyectos/i })).toBeVisible()
  })

  test('should have tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /lista/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /gantt/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /time tracking/i })).toBeVisible()
  })
})

test.describe('Mobile Responsive', () => {
  test('should show mobile menu on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/dashboard')
    
    // Check if mobile menu button exists
    const menuButton = page.locator('[data-testid="mobile-menu-button"]').or(page.locator('button[aria-label="menu"]'))
    await expect(menuButton).toBeVisible()
  })
})
