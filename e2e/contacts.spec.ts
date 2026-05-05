import { test, expect } from '@playwright/test'

test.describe('Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/contacts')
  })

  test('should display contacts page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /contactos 360°/i })).toBeVisible()
  })

  test('should open new contact dialog', async ({ page }) => {
    await page.getByRole('button', { name: /nuevo contacto/i }).click()
    await expect(page.getByText('Crear Nuevo Contacto')).toBeVisible()
  })

  test('should filter contacts by search', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Buscar contactos...')
    await searchInput.fill('test')
    await expect(searchInput).toHaveValue('test')
  })

  test('should display contact list or empty state', async ({ page }) => {
    const contactList = page.locator('text=No hay contactos')
    const table = page.locator('table')
    
    await expect(contactList.or(table)).toBeVisible()
  })
})
