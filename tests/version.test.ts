import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('uses the beta label publicly and a store-compatible numeric version below stable 1.0.0', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const base = JSON.parse(readFileSync('manifest.json', 'utf8'))
  const chrome = JSON.parse(readFileSync('manifest.chrome.json', 'utf8'))
  expect(pkg.version).toBe('1.0.0-beta.1')
  expect(chrome.version_name).toBe(pkg.version)
  expect(base).not.toHaveProperty('version_name') // Firefox does not support it.
  expect(base.version).toBe('0.99.1')
  expect(base.version).toMatch(/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/)
  expect(base.version.split('.').every((part: string) => Number(part) <= 65535)).toBe(true)
  // Browser update ordering must allow both the previous build and stable 1.0.0.
  expect(Number(base.version.split('.')[1])).toBeGreaterThan(1)
  expect(Number(base.version.split('.')[0])).toBeLessThan(1)
})
