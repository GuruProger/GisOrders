import { expect, test } from '@playwright/test'
import {
  CUSTOMER_EMAIL,
  EXECUTOR_EMAIL,
  apiLogin,
  cleanupOrder,
  createOrderViaApi,
  loginViaUi,
  uniqueTitle,
} from './helpers'

/**
 * Scenario 1: an executor signs in, finds an order in the feed and responds.
 *
 * The order is created through the API with a unique title so the feed search
 * always targets a fresh order the executor has not responded to yet (an
 * already-proposed order would show «Ваш отклик» instead of the form).
 */
test('executor finds an order in the feed and sends a proposal', async ({
  page,
  request,
}, testInfo) => {
  const customer = await apiLogin(request, CUSTOMER_EMAIL)
  const title = uniqueTitle('отклик', testInfo)
  const order = await createOrderViaApi(request, customer.access_token, title)

  try {
    await loginViaUi(page, EXECUTOR_EMAIL, 'executor')

    await page.getByLabel('Поиск заказов').fill(title)
    const cardTitle = page.getByRole('heading', { level: 3, name: title })
    await expect(cardTitle).toBeVisible()
    await cardTitle.click()

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.getByRole('button', { name: 'Откликнуться' }).click()
    await page.getByLabel('Ваша цена').fill('3000')
    await page.getByRole('button', { name: 'Откликнуться' }).click()

    await expect(page.getByText('Ожидает', { exact: true })).toBeVisible()
  } finally {
    await cleanupOrder(request, customer.access_token, order.id)
  }
})
