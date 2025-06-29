import NextAuth from 'next-auth'
import Passkey from 'next-auth/providers/passkey'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from "@/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Passkey],
  experimental: { enableWebAuthn: true },
  trustHost: true,
})
