import { requireAuth } from './auth'
import {
  getLinks,
  createLink,
  deleteLink,
  getLinkWithContent,
  updateLink,
} from './db'
import { getProviders } from './storage/providers'
import type {
  Link,
  RedirectLink,
  FileLink,
  FileLinkWithContent,
} from '../shared-types'

type GenericLinkCreationData = {
  path: string
}
type RedirectLinkCreationData = GenericLinkCreationData & {
  type: 'redirect'
  url: string
  status?: 301 | 302 | 307 | 308
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
  const { providerMap, downloadPriority } = getProviders(env)

  // GET /api/providers - list available upload providers
  if (url.pathname === '/api/providers' && request.method === 'GET') {
    const list = Array.from(providerMap.values())
      .filter((p) => p.id !== 'inline')
      .map((p) => ({ id: p.id, name: p.name }))
    return new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

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
        const { path, type, url, status } = data
        if (!path || !type || type !== 'redirect' || !url) {
          return new Response('Missing required fields', { status: 400 })
        }
        await createLink(env.DB, {
          path,
          type: 'redirect',
          url,
          status: status ?? 302,
        })
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
      type: 'file',
      contentType,
      filename,
      download,
      providerUrls: {},
      locations: [],
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
        throw new Error(`Unhandled error in upload: ${result.reason}`)
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

    const linkToDelete = await getLinkWithContent(env.DB, pathToDelete)
    if (linkToDelete?.type === 'file') {
      await Promise.allSettled(
        linkToDelete.locations
          .filter((id) => id !== 'inline')
          .map((id) => providerMap.get(id)?.delete(linkToDelete))
          .filter(Boolean)
      )
    }

    await deleteLink(env.DB, pathToDelete)
    return new Response('Link deleted successfully', { status: 200 })
  }

  // GET /api/links/<path> — single link (no file bytes)
  if (url.pathname.startsWith('/api/links/') && request.method === 'GET') {
    const linkPath = decodeURIComponent(
      url.pathname.slice('/api/links/'.length)
    )
    const full = await getLinkWithContent(env.DB, linkPath)
    if (!full) return new Response('Not Found', { status: 404 })
    let serializable: Link
    if (full.type === 'file') {
      const { file: _, ...rest } = full
      serializable = rest
    } else {
      serializable = full
    }
    return new Response(JSON.stringify(serializable), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // PUT /api/links — update metadata and optionally change providers (no new file)
  if (url.pathname === '/api/links' && request.method === 'PUT') {
    const data = (await request.json()) as {
      oldPath: string
      path: string
      type: string
      url?: string
      status?: number
      contentType?: string
      filename?: string
      download?: boolean
      locations?: string[]
    }

    const { oldPath, path: newPath, type } = data
    if (!oldPath || !newPath || !type) {
      return new Response('Missing required fields: oldPath, path, type', {
        status: 400,
      })
    }

    const currentLink = await getLinkWithContent(env.DB, oldPath)
    if (!currentLink) return new Response('Link not found', { status: 404 })

    let linkData: Link
    if (type === 'redirect') {
      if (!data.url)
        return new Response('URL required for redirect', { status: 400 })
      linkData = {
        path: newPath,
        type: 'redirect',
        url: data.url,
        status: (data.status ?? 302) as RedirectLink['status'],
      }
    } else if (type === 'file') {
      if (!data.contentType || !data.filename) {
        return new Response('contentType and filename required', {
          status: 400,
        })
      }

      const currentLocations =
        currentLink.type === 'file'
          ? ((currentLink as FileLink).locations ?? [])
          : []
      const newLocations = data.locations ?? currentLocations

      // Validate: at least one provider must remain
      if (newLocations.length === 0) {
        return new Response('At least one storage provider is required', {
          status: 400,
        })
      }

      // Remove unchecked attachment providers (before adding new ones, using oldPath)
      const removed = currentLocations.filter(
        (l) => l !== 'inline' && !newLocations.includes(l)
      )
      for (const providerId of removed) {
        const provider = providerMap.get(providerId)
        if (provider) await provider.delete(currentLink)
        await env.DB.prepare(
          'DELETE FROM link_providers WHERE path = ? AND provider_id = ?'
        )
          .bind(oldPath, providerId)
          .run()
      }

      // Remove inline bytes if inline was deselected
      if (
        currentLocations.includes('inline') &&
        !newLocations.includes('inline')
      ) {
        await env.DB.prepare('UPDATE links SET file = NULL WHERE path = ?')
          .bind(oldPath)
          .run()
      }

      // Add new providers by re-uploading existing file content
      const added = newLocations.filter((l) => !currentLocations.includes(l))
      if (added.length > 0) {
        let fileBytes: Uint8Array | null = null
        if (currentLink.type === 'file') {
          const fileLink = currentLink as FileLinkWithContent
          if (fileLink.file?.length) {
            fileBytes = fileLink.file
          } else {
            for (const provider of downloadPriority) {
              if (provider.has(currentLink)) {
                try {
                  const resp = await provider.download(
                    currentLink,
                    new Headers()
                  )
                  if (resp) {
                    fileBytes = new Uint8Array(await resp.arrayBuffer())
                    break
                  }
                } catch {}
              }
            }
          }
        }
        if (!fileBytes || fileBytes.length === 0) {
          return new Response(
            'Could not retrieve file content to upload to new providers',
            { status: 500 }
          )
        }
        const currentFilename =
          currentLink.type !== 'redirect' ? currentLink.filename : ''
        for (const location of added) {
          const provider = providerMap.get(location)
          if (!provider) continue
          const bytes = fileBytes
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            },
          })
          await provider.upload(
            stream,
            currentFilename,
            bytes.length,
            oldPath,
            env.DB
          )
        }
      }

      linkData = {
        path: newPath,
        type: 'file',
        contentType: data.contentType,
        filename: data.filename,
        download: !!data.download,
        providerUrls: {},
        locations: [],
      }
    } else {
      return new Response('Unsupported link type', { status: 400 })
    }

    await updateLink(env.DB, oldPath, linkData)
    return new Response('OK', { status: 200 })
  }

  // PUT /api/links/upload — replace file on existing link
  if (url.pathname === '/api/links/upload' && request.method === 'PUT') {
    const oldPath = url.searchParams.get('old-path')
    const newPath = url.searchParams.get('path')
    const contentType = url.searchParams.get('content-type')
    const filename = url.searchParams.get('filename')
    const locations = url.searchParams.getAll('locations')
    const download = url.searchParams.get('download') === 'true'

    if (
      !oldPath ||
      !newPath ||
      !contentType ||
      !filename ||
      locations.length === 0
    ) {
      return new Response(
        'Missing required fields (old-path, path, content-type, filename, locations)',
        { status: 400 }
      )
    }

    for (const location of locations) {
      if (!providerMap.has(location)) {
        return new Response(`Unsupported file location: ${location}`, {
          status: 400,
        })
      }
    }

    const file = request.body
    const length = Number(request.headers.get('Content-Length'))
    if (!file) return new Response('File is required', { status: 400 })

    const currentLink = await getLinkWithContent(env.DB, oldPath)
    if (!currentLink) return new Response('Link not found', { status: 404 })

    // Upload to providers first (using oldPath) before touching any DB state.
    // This way, if all uploads fail, nothing has changed.
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

    const uploadPromises = locations.map(async (location, index) => {
      const provider = providerMap.get(location)!
      try {
        await provider.upload(streams[index], filename, length, oldPath, env.DB)
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
    const uploadResults = results.map((r) => {
      if (r.status === 'fulfilled') return r.value
      throw new Error(`Unhandled upload error: ${r.reason}`)
    })

    const successfulUploads = uploadResults.filter((r) => r.success)
    const failedUploads = uploadResults.filter((r) => !r.success)

    if (successfulUploads.length === 0) {
      // Nothing changed — safe to return an error as-is
      return new Response(
        JSON.stringify({ error: 'All uploads failed', details: failedUploads }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // At least one upload succeeded — now remove deselected providers and
    // update metadata / rename. Both use oldPath before the rename runs.
    if (currentLink.type === 'file') {
      const currentLocations = (currentLink as FileLink).locations ?? []
      const removed = currentLocations.filter(
        (l) => !locations.includes(l) && l !== 'inline'
      )
      for (const providerId of removed) {
        await env.DB.prepare(
          'DELETE FROM link_providers WHERE path = ? AND provider_id = ?'
        )
          .bind(oldPath, providerId)
          .run()
      }
      // Clear inline bytes if 'inline' was removed
      if (
        currentLocations.includes('inline') &&
        !locations.includes('inline')
      ) {
        await env.DB.prepare('UPDATE links SET file = NULL WHERE path = ?')
          .bind(oldPath)
          .run()
      }
    }

    const linkData: Link = {
      path: newPath,
      type: 'file',
      contentType,
      filename,
      download,
      providerUrls: {},
      locations: [],
    }

    await updateLink(env.DB, oldPath, linkData)

    return new Response(
      JSON.stringify({
        message: 'Upload updated',
        successful: successfulUploads.map((r) => r.location),
        failed: failedUploads.length > 0 ? failedUploads : undefined,
      }),
      {
        status: failedUploads.length > 0 ? 207 : 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return new Response('Not Found', { status: 404 })
}
