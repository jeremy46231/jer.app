import { requireAuth } from './auth'
import { getLinks, createLink, deleteLink, getLinkWithContent } from './db'
import { providerMap } from './storage/providers'

type GenericLinkCreationData = {
  path: string
}
type RedirectLinkCreationData = GenericLinkCreationData & {
  type: 'redirect'
  url: string
}
export type NonFileLinkCreationData = RedirectLinkCreationData

/**
 * Handle a request to the API paths
 * This function will check authorization
 */
export async function handleAPI(
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env
): Promise<Response> {
  const authResponse = requireAuth(request, env)
  if (authResponse !== true) {
    return authResponse
  }

  const url = new URL(request.url)

  // GET /api/links - list all links
  if (url.pathname === '/api/links' && request.method === 'GET') {
    const links = await getLinks(env.DB)
    return new Response(JSON.stringify(links), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // POST /api/links - create a new non-file link
  if (url.pathname === '/api/links' && request.method === 'POST') {
    const data = (await request.json()) as NonFileLinkCreationData
    switch (data.type) {
      case 'redirect':
        const { path, type, url } = data
        if (!path || !type || type !== 'redirect' || !url) {
          return new Response('Missing required fields', { status: 400 })
        }
        await createLink(env.DB, { path, type: 'redirect', url })
        return new Response('Link created successfully', { status: 201 })
      default:
        return new Response('Unsupported link type', { status: 400 })
    }
  }

  // POST /api/links/upload - create a new file link
  if (url.pathname === '/api/links/upload' && request.method === 'POST') {
    // data stored in search params to allow the body to be the file
    // we don't use multipart forms because this lets us stream and measure
    // the progress of file in a much easier way

    const path = url.searchParams.get('path')
    const contentType = url.searchParams.get('content-type')
    const filename = url.searchParams.get('filename')
    const locations = url.searchParams.getAll('locations')
    const download = url.searchParams.get('download') === 'true'

    if (!path || !contentType || !filename || locations.length === 0) {
      return new Response(
        'Missing required fields (path, content-type, filename, locations)',
        { status: 400 }
      )
    }

    // Validate that all requested locations are supported
    for (const location of locations) {
      if (!providerMap.has(location)) {
        return new Response(`Unsupported file location: ${location}`, {
          status: 400,
        })
      }
    }

    const file = request.body
    const length = Number(request.headers.get('Content-Length'))
    if (!file) {
      return new Response('File is required', { status: 400 })
    }

    await createLink(env.DB, {
      path,
      type: 'attachment_file',
      contentType,
      filename,
      download,
    })

    // Clone the request body stream for each provider
    const streams: ReadableStream<Uint8Array>[] = []
    if (locations.length === 1) {
      streams.push(file)
    } else {
      const teeStreams = file.tee()
      streams.push(teeStreams[0])
      let remainingStream = teeStreams[1]

      for (let i = 1; i < locations.length - 1; i++) {
        const nextTee = remainingStream.tee()
        streams.push(nextTee[0])
        remainingStream = nextTee[1]
      }
      streams.push(remainingStream)
    }

    // Upload to all requested providers in parallel
    const uploadPromises = locations.map(async (location, index) => {
      const provider = providerMap.get(location)!
      try {
        await provider.upload(streams[index], filename, length, path, env.DB)
        return { location, success: true as const, error: null }
      } catch (error) {
        return {
          location,
          success: false as const,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })

    const results = await Promise.allSettled(uploadPromises)

    // Collect upload results
    const uploadResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        // shouldn't be possible, but just in case
        throw new Error(
          `Unhandled error in upload: ${result.reason}`
        )
      }
    })

    const successfulUploads = uploadResults.filter((r) => r.success)
    const failedUploads = uploadResults.filter((r) => !r.success)

    if (successfulUploads.length === 0) {
      // All uploads failed, delete the created record
      await deleteLink(env.DB, path)
      return new Response(
        JSON.stringify({
          error: 'All uploads failed',
          details: failedUploads,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Return success with details about which uploads succeeded/failed
    const response = {
      message: 'Upload completed',
      successful: successfulUploads.map((r) => r.location),
      failed: failedUploads.length > 0 ? failedUploads : undefined,
    }

    return new Response(JSON.stringify(response), {
      status: failedUploads.length > 0 ? 207 : 201, // 207 Multi-Status if partial success
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (url.pathname === '/api/links' && request.method === 'DELETE') {
    const url = new URL(request.url)
    const pathToDelete = url.searchParams.get('path')

    if (!pathToDelete) {
      return new Response('Path parameter is required', { status: 400 })
    }

    await deleteLink(env.DB, pathToDelete)
    return new Response('Link deleted successfully', { status: 200 })
  }

  return new Response('Not Found', { status: 404 })
}
