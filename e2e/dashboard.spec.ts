import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
  })

  test('should display dashboard title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
  })

  test('should have navigation sidebar', async ({ page }) => {
    await expect(page.getByText('Contactos 360°')).toBeVisible()
    await expect(page.getByText('Pipeline')).toBeVisible()
    await expect(page.getByText('Proyectos')).toBeVisible()
  })

  test('should navigate to contacts page', async ({ page }) => {
    await page.getByText('Contactos 360°').click()
    await expect(page).toHaveURL(/.*contacts/)
    await expect(page.getByRole('heading', { name: /contactos/i })).toBeVisible()
  })

  test('should navigate to pipeline page', async ({ page }) => {
    await page.getByText('Pipeline').click()
    await expect(page).toHaveURL(/.*pipeline/)
    await expect(page.getByRole('heading', { name: /pipeline/i })).toBeVisible()
  })
})
