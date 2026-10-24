import { expect, test, type Page } from '@playwright/test'
import type { Player, RoomView } from '../src/types'

async function identity(page: Page) {
  return page.evaluate(() => ({
    player: JSON.parse(localStorage.getItem('bluff-table-player')!) as Player,
    token: localStorage.getItem('bluff-table-device-token')!,
  }))
}

async function enter(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('PLAYER NAME', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Take a seat' }).click()
  await expect(page.getByRole('button', { name: 'Create table' })).toBeVisible()
  await expect(page.getByText('Reconnecting to the live table…')).toHaveCount(0)
  return identity(page)
}

test('persistent identity supports duplicate names and nickname edits', async ({ page, browser }) => {
  const first = await enter(page, 'Same nickname')
  const secondContext = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    const second = await enter(await secondContext.newPage(), 'Same nickname')
    expect(second.player.displayName).toBe(first.player.displayName)
    expect(second.player.id).not.toBe(first.player.id)
    expect(second.player.identityTag).not.toBe(first.player.identityTag)
  } finally { await secondContext.close() }

  await page.getByRole('button', { name: /Same nickname/ }).click()
  await page.getByLabel('NICKNAME', { exact: true }).fill('Renamed player')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: /Renamed player/ })).toBeVisible()
  expect((await identity(page)).player.id).toBe(first.player.id)
  expect((await identity(page)).token).toBe(first.token)
})

test('two browsers create, join, play, truth-check privately and stop a real deal', async ({ page, browser }) => {
  const host = await enter(page, 'CI dealer')
  const roomName = `CI table ${test.info().project.name} ${Date.now()}`
  let roomId: string | undefined
  const guestContext = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    await page.getByLabel('ROOM NAME', { exact: true }).fill(roomName)
    await page.getByRole('button', { name: 'Create table' }).click()
    await expect(page.getByRole('heading', { name: 'Waiting room.' })).toBeVisible()
    const listing = await page.request.get('/api/rooms', { headers: { Authorization: `Bearer ${host.token}` } })
    roomId = (await listing.json()).find((entry: { name: string }) => entry.name === roomName).id
    await expect(page.getByText('THIS GAME', { exact: true })).toHaveCount(0)

    const guestPage = await guestContext.newPage()
    const guest = await enter(guestPage, 'CI guest')
    await guestPage.getByRole('article').filter({ has: guestPage.getByRole('heading', { name: roomName, exact: true }) })
      .getByRole('button', { name: 'Join table' }).click()
    await expect(guestPage.getByRole('heading', { name: 'Waiting room.' })).toBeVisible()
    await expect(guestPage.getByText('GAME SETUP', { exact: true })).toHaveCount(0)
    await expect(page.getByText('HERE', { exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: /AUTO.*CUSTOM/ }).click()
    await page.getByLabel('CARDS PER PLAYER').fill('3')
    await page.getByRole('button', { name: 'Deal the cards' }).click()
    await expect(page.getByRole('region', { name: 'Round order' })).toBeVisible()
    await expect(guestPage.getByRole('region', { name: 'Round order' })).toBeVisible()

    const snapshot = async (token: string): Promise<RoomView> => {
      const response = await page.request.get(`/api/rooms/${roomId}/snapshot`, { headers: { Authorization: `Bearer ${token}` } })
      expect(response.ok()).toBe(true)
      return response.json()
    }
    const initial = await snapshot(host.token)
    const [actor, checker, actorToken, checkerToken] = initial.game!.currentPlayerId === host.player.id
      ? [page, guestPage, host.token, guest.token] : [guestPage, page, guest.token, host.token]
    const before = await snapshot(actorToken)
    const card = before.game!.hand[0]
    await actor.getByRole('button', { name: `${card.rank} of ${card.suit.toLowerCase()}`, exact: true }).click()
    await actor.getByRole('button', { name: /^PLAY / }).click()
    await expect(checker.getByRole('button', { name: /^TRUTH CHECK/ })).toBeEnabled()
    await checker.getByRole('button', { name: /^TRUTH CHECK/ }).click()
    await expect.poll(async () => (await snapshot(checkerToken)).game!.plays!.at(-1)!.status).not.toBe('PENDING')
    const checked = await snapshot(checkerToken)
    const defended = await snapshot(actorToken)
    expect(checked.game!.plays!.at(-1)!.revealedCards).toHaveLength(1)
    expect(defended.game!.plays!.at(-1)!.revealedCards).toHaveLength(0)
    await expect(checker.getByRole('region', { name: 'Recent plays' }).getByText(`${card.rank}${{ HEARTS: '♥', SPADES: '♠', DIAMONDS: '♦', CLUBS: '♣' }[card.suit]}`)).toBeVisible()

    // Dismiss the result overlay before opening the moderator dialog.
    for (const viewer of [page, guestPage]) {
      const dismiss = viewer.getByRole('button', { name: 'Dismiss result' })
      if (await dismiss.isVisible()) await dismiss.click()
    }
    await page.getByRole('button', { name: 'Stop deal' }).click()
    await page.getByRole('button', { name: 'Stop & restore wallets' }).click()
    await expect(page.getByRole('heading', { name: 'Waiting room.' })).toBeVisible()
    await expect(guestPage.getByRole('heading', { name: 'Waiting room.' })).toBeVisible()
    const stopped = await snapshot(host.token)
    expect(stopped.players.map(player => player.balance)).toEqual([0, 0])
    // The document itself must not overflow on the mobile viewport.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  } finally {
    await guestContext.close()
    if (roomId) {
      const deleted = await page.request.delete(`/api/rooms/${roomId}`, { headers: { Authorization: `Bearer ${host.token}` } })
      expect(deleted.status()).toBe(204)
    }
  }
})
