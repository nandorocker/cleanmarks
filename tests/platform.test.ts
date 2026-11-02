import { expect, it, vi } from 'vitest'
const setTitle = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('webextension-polyfill', () => ({ default: { sidebarAction: { setTitle } } }))
import { syncSidebarTitle } from '../src/platform'

it('refreshes Firefox’s native sidebar title instead of retaining an old cached title', async () => {
  await syncSidebarTitle()
  expect(setTitle).toHaveBeenCalledWith({ title: 'Cleanmarks' })
})
