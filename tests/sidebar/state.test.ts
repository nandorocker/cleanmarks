// tests/sidebar/state.test.ts
import { describe, it, expect } from 'vitest'
import { createState, applyMessage, toggleSelection, selectAll, selectNone } from '../../src/sidebar/state'
import type { BookmarkResult } from '../../src/types'

const makeResult = (id: string, status: BookmarkResult['status']): BookmarkResult => ({
  bookmark: { id, title: `Bookmark ${id}`, url: `https://${id}.com` },
  status,
  statusCode: status === 'dead' ? 404 : 200,
})

describe('sidebar state', () => {
  it('starts in idle phase', () => {
    expect(createState().phase).toBe('idle')
  })

  it('transitions to scanning on progress message', () => {
    const state = applyMessage(createState(), { type: 'scan_progress', progress: { checked: 1, total: 100 } })
    expect(state.phase).toBe('scanning')
    expect(state.progress).toEqual({ checked: 1, total: 100 })
  })

  it('accumulates results', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('a', 'dead') })
    state = applyMessage(state, { type: 'result', result: makeResult('b', 'moved') })
    expect(state.results).toHaveLength(2)
  })

  it('transitions to done on scan_done', () => {
    let state = applyMessage(createState(), { type: 'result', result: makeResult('a', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.phase).toBe('done')
  })

  it('auto-selects dead bookmarks, not others', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('dead1', 'dead') })
    state = applyMessage(state, { type: 'result', result: makeResult('moved1', 'moved') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.selected.has('dead1')).toBe(true)
    expect(state.selected.has('moved1')).toBe(false)
  })

  it('selectAll selects all in category', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('a', 'moved') })
    state = applyMessage(state, { type: 'result', result: makeResult('b', 'moved') })
    state = applyMessage(state, { type: 'scan_done' })
    state = selectAll(state, 'moved')
    expect(state.selected.has('a')).toBe(true)
    expect(state.selected.has('b')).toBe(true)
  })

  it('selectNone deselects all in category', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('x', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    state = selectNone(state, 'dead')
    expect(state.selected.has('x')).toBe(false)
  })

  it('toggleSelection flips a bookmark', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('x', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.selected.has('x')).toBe(true)
    state = toggleSelection(state, 'x')
    expect(state.selected.has('x')).toBe(false)
    state = toggleSelection(state, 'x')
    expect(state.selected.has('x')).toBe(true)
  })
})
