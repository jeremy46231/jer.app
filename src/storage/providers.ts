import { AbstractStorageProvider } from './AbstractStorageProvider'
import { InlineStorageProvider } from './providers/InlineStorageProvider'
import { HcCdnStorageProvider } from './providers/HcCdnStorageProvider'
import { CatboxStorageProvider } from './providers/CatboxStorageProvider'
import { LitterboxStorageProvider } from './providers/LitterboxStorageProvider'
import { GofileStorageProvider } from './providers/GofileStorageProvider'
import {
  CopypartyStorageProvider,
  type CopypartyBackendConfig,
} from './providers/CopypartyStorageProvider'

const inline = new InlineStorageProvider()
const catbox = new CatboxStorageProvider()
const litterbox = new LitterboxStorageProvider()
const gofile = new GofileStorageProvider()
const hcCdn = new HcCdnStorageProvider()

function parseCopypartyBackends(
  json: string | undefined
): CopypartyStorageProvider[] {
  if (!json) return []
  try {
    const configs: CopypartyBackendConfig[] = JSON.parse(json)
    return configs.map((c) => new CopypartyStorageProvider(c))
  } catch {
    console.error('Failed to parse COPYPARTY_BACKENDS')
    return []
  }
}

export function getProviders(env: Env): {
  providerMap: Map<string, AbstractStorageProvider>
  downloadPriority: readonly AbstractStorageProvider[]
  allProviders: readonly AbstractStorageProvider[]
} {
  const copyparty = parseCopypartyBackends(env.COPYPARTY_BACKENDS)

  const providerMap = new Map<string, AbstractStorageProvider>([
    [inline.id, inline],
    ...copyparty.map((p) => [p.id, p] as [string, AbstractStorageProvider]),
    [catbox.id, catbox],
    [litterbox.id, litterbox],
    [gofile.id, gofile],
  ])

  const downloadPriority: readonly AbstractStorageProvider[] = [
    inline,
    ...copyparty,
    hcCdn,
    catbox,
    litterbox,
    gofile,
  ]

  return {
    providerMap,
    downloadPriority,
    allProviders: Array.from(providerMap.values()),
  }
}
