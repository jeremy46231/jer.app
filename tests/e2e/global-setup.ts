import { execSync } from 'child_process'

export default async function globalSetup() {
  // Idempotent — skips already-applied migrations
  execSync('wrangler d1 migrations apply DB --local', { stdio: 'inherit' })
}
