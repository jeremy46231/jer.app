import { describe, expect, test } from 'bun:test'
import { getProviders } from '../../src/storage/providers'
import { createTestEnv } from '../helpers/env'

const env = createTestEnv()
const { providerMap, downloadPriority, allProviders } = getProviders(env)

describe('storage provider registry', () => {
  test('exposes the expected upload providers in providerMap', () => {
    expect([...providerMap.keys()].sort()).toEqual(
      ['catbox', 'gofile', 'hc-cdn', 'inline', 'litterbox'].sort()
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
    expect(ids.indexOf('hc-cdn')).toBeLessThan(ids.indexOf('catbox'))
  })

  test('downloadPriority covers every uploadable provider', () => {
    const downloadIds = new Set(downloadPriority.map((p) => p.id))
    for (const id of providerMap.keys()) {
      expect(downloadIds.has(id)).toBe(true)
    }
  })

  test('copyparty providers appear in providerMap and downloadPriority when COPYPARTY_BACKENDS is set', () => {
    const envWithCopyparty = {
      ...env,
      COPYPARTY_BACKENDS: JSON.stringify([
        {
          id: 'vps',
          name: 'VPS',
          baseUrl: 'https://files.jer.app/files/jer.app/',
          username: 'jer-app',
          password: 'testpass',
        },
      ]),
    }
    const { providerMap: pm, downloadPriority: dp } =
      getProviders(envWithCopyparty)
    expect(pm.has('vps')).toBe(true)
    const ids = dp.map((p) => p.id)
    expect(ids.indexOf('vps')).toBeLessThan(ids.indexOf('catbox'))
    expect(ids.indexOf('vps')).toBeGreaterThan(ids.indexOf('inline'))
  })
})
