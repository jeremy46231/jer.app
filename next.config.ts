import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: 'https://jeremywoolley.com',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
