import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('extension shortcut icons', () => {
  it.each([16, 32, 48, 128])('provides a real %spx PNG instead of a placeholder', size => {
    const png = readFileSync(`src/icons/icon${size}.png`)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
  })

  it('assigns icons to the toolbar and sidebar without a Chrome override hiding them', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
    const chrome = JSON.parse(readFileSync('manifest.chrome.json', 'utf8'))
    expect(manifest.name).toBe('Cleanmarks')
    expect(manifest.action.default_title).toBe('Cleanmarks')
    expect(manifest.sidebar_action.default_title).toBe('Cleanmarks')
    expect(manifest.action.default_icon['16']).toBe('icons/icon16.png')
    expect(manifest.sidebar_action.default_icon['16']).toBe('icons/icon16.png')
    expect({ ...manifest, ...chrome }.action.default_icon).toEqual(manifest.action.default_icon)
  })
})
