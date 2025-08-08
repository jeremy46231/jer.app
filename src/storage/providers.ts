import { AbstractStorageProvider } from './AbstractStorageProvider'
import { InlineStorageProvider } from './providers/InlineStorageProvider'
import { HcCdnStorageProvider } from './providers/HcCdnStorageProvider'
import { CatboxStorageProvider } from './providers/CatboxStorageProvider'
import { LitterboxStorageProvider } from './providers/LitterboxStorageProvider'
import { GofileStorageProvider } from './providers/GofileStorageProvider'

export const providerMap = new Map<string, AbstractStorageProvider>()
const addProvider = (p: AbstractStorageProvider) => providerMap.set(p.id, p)

addProvider(new InlineStorageProvider())
addProvider(new HcCdnStorageProvider())
addProvider(new CatboxStorageProvider())
addProvider(new LitterboxStorageProvider())
addProvider(new GofileStorageProvider())

export const downloadPriority: readonly AbstractStorageProvider[] = [
  providerMap.get('inline')!,
  providerMap.get('hc-cdn')!,
  providerMap.get('catbox')!,
  providerMap.get('litterbox')!,
  providerMap.get('gofile')!,
]

export const allProviders: readonly AbstractStorageProvider[] = Array.from(
  providerMap.values()
)
