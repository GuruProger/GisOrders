import { expect, test } from '@playwright/test'
import { CUSTOMER_EMAIL, localDeadline, loginViaUi, uniqueTitle } from './helpers'

/**
 * Scenario 2: a customer publishes an order through the creation form.
 *
 * The app has no visible «+» entry point yet, so the form is opened by its
 * route (`/orders/new`), which is the same screen the future button will link
 * to. The order is deleted at the end so repeated runs do not grow the feed.
 */
test('customer creates an order through the form', async ({ page }, testInfo) => {
  const title = uniqueTitle('заказ', testInfo)

  await loginViaUi(page, CUSTOMER_EMAIL, 'customer')
  await page.goto('/orders/new')

  await page.getByLabel('Название', { exact: true }).fill(title)
  await page
    .getByLabel('Описание', { exact: true })
    .fill('E2E: спилить берёзу, распилить ствол и вывезти ветки.')
  await page.getByLabel('Цена от', { exact: true }).fill('2000')
  await page.getByLabel('Цена до', { exact: true }).fill('4000')
  await page.getByLabel('Срок', { exact: true }).fill(localDeadline())
  await page.getByLabel('Адрес', { exact: true }).fill('Москва, Тверская улица, 1')
  await page.getByLabel('Порода', { exact: true }).fill('Берёза')
  await page.getByLabel('Высота, м', { exact: true }).fill('12')
  await page.getByLabel('Диаметр, см', { exact: true }).fill('35')

  // Clicking the Leaflet surface sets the order point; without it the form
  // refuses to submit with «Поставьте точку на карте».
  await page.locator('.leaflet-container').click({ position: { x: 160, y: 110 } })
  await expect(page.locator('.leaflet-marker-icon')).toBeVisible()

  await page.getByRole('button', { name: 'Опубликовать' }).click()

  await expect(page).toHaveURL(/\/orders\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByText('Открыт', { exact: true })).toBeVisible()

  // Clean up through the owner UI so the feed stays free of E2E fixtures.
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Мои заказы' })).toBeVisible()
})
