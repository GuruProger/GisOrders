import { expect, test } from '@playwright/test'
import {
  CUSTOMER_EMAIL,
  EXECUTOR_EMAIL,
  apiLogin,
  cleanupOrder,
  createOrderViaApi,
  createProposalViaApi,
  findChatId,
  projectContextOptions,
  seedStorage,
  uniqueTitle,
} from './helpers'

/**
 * Scenario 3: the customer accepts the executor's proposal, both open the chat
 * and the executor receives the customer's message over the realtime channel.
 *
 * This test uses two browser contexts instead of the login form (covered by
 * scenario 1): the accounts are signed in through the API and their refresh
 * tokens are injected before the app boots. That keeps the login rate limit
 * and the executor's daily proposal quota available for the whole suite.
 */
test('customer accepts a proposal and both sides chat', async ({
  browser,
  context,
  request,
}, testInfo) => {
  const customer = await apiLogin(request, CUSTOMER_EMAIL)
  const executor = await apiLogin(request, EXECUTOR_EMAIL)
  const title = uniqueTitle('чат', testInfo)
  const order = await createOrderViaApi(request, customer.access_token, title)

  let executorContext: Awaited<ReturnType<typeof browser.newContext>> | null = null

  try {
    const proposalMessage = `Готов выполнить заказ ${order.id}`
    await createProposalViaApi(
      request,
      executor.access_token,
      order.id,
      proposalMessage,
    )

    await seedStorage(context, {
      mode: 'customer',
      refreshToken: customer.refresh_token,
    })
    const customerPage = await context.newPage()
    await customerPage.goto(`/orders/${order.id}`)
    await expect(
      customerPage.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible()

    await customerPage.getByRole('button', { name: 'Принять', exact: true }).click()
    await customerPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Принять и открыть чат' })
      .click()
    await expect(customerPage.getByRole('heading', { name: 'Чаты' })).toBeVisible()

    const chatId = await findChatId(request, customer.access_token, order.id)
    await customerPage.locator(`a[href="/chats/${chatId}"]`).click()
    await expect(customerPage.getByLabel('Сообщение')).toBeVisible()

    executorContext = await browser.newContext(projectContextOptions(testInfo))
    await seedStorage(executorContext, {
      mode: 'executor',
      refreshToken: executor.refresh_token,
    })
    const executorPage = await executorContext.newPage()
    await executorPage.goto(`/chats/${chatId}`)
    await expect(executorPage.getByText(proposalMessage, { exact: true })).toBeVisible()

    const message = `E2E сообщение ${Date.now()}`
    await customerPage.getByLabel('Сообщение').fill(message)
    await customerPage.getByRole('button', { name: 'Отправить' }).click()

    // While the optimistic bubble is replaced by the saved message the same
    // text can be in the DOM twice for a moment; wait until deduplication
    // settles before checking both sides.
    await expect(customerPage.getByText(message, { exact: true })).toHaveCount(1)
    await expect(executorPage.getByText(message, { exact: true })).toHaveCount(1)
  } finally {
    if (executorContext) await executorContext.close()
    await cleanupOrder(request, customer.access_token, order.id)
  }
})
