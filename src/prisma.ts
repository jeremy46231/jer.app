import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const env = (await getCloudflareContext({ async: true }))
  .env as CloudflareEnv & {
  DB: D1Database
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  (() => {
    const adapter = new PrismaD1(env.DB)
    return new PrismaClient({ adapter })
  })()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
