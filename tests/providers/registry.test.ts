import { describe, expect, test } from 'bun:test'
import {
  allProviders,
  downloadPriority,
  providerMap,
} from '../../src/storage/providers'

describe('storage provider registry', () => {
  test('exposes the expected upload providers in providerMap', () => {
    expect([...providerMap.keys()].sort()).toEqual(
      ['catbox', 'gofile', 'inline', 'litterbox'].sort()
    )
  })

  test('every entry in providerMap is mirrored in allProviders', () => {
    expect(allProviders.length).toBe(providerMap.size)
    for (const provider of allProviders) {
      expect(providerMap.get(provider.id)).toBe(provider)
    }
  })

  test('downloadPriority starts with inline and includes hc-cdn (download-only)', () => {
    expect(downloadPriority[0]!.id).toBe('inline')
    const ids = downloadPriority.map((p) => p.id)
    expect(ids).toContain('hc-cdn')
    // hc-cdn must precede the public boxes (we want stable URLs first).
    expect(ids.indexOf('hc-cdn')).toBeLessThan(ids.indexOf('catbox'))
  })

  test('downloadPriority covers every uploadable provider', () => {
    const downloadIds = new Set(downloadPriority.map((p) => p.id))
    for (const id of providerMap.keys()) {
      expect(downloadIds.has(id)).toBe(true)
    }
  })
})
