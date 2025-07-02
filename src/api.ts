import { FileLocation } from '../shared-types'
import { requireAuth } from './auth'
import { getLinks, createLink, deleteLink } from './db'
import { uploadGofile } from './storage/gofile'
import { uploadHCCdnDataURL } from './storage/hcCdn'
import { uploadCatbox, uploadLitterbox } from './storage/catbox'

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
    const location = url.searchParams.get('location') as FileLocation | null
    const download = url.searchParams.get('download') === 'true'
    if (!path || !contentType || !filename || !location) {
      throw new Error('Missing required fields')
    }

    switch (location) {
      case 'inline': {
        const fileBuffer = await request.arrayBuffer()
        const fileData = new Uint8Array(fileBuffer)
        await createLink(env.DB, {
          path,
          type: 'inline_file',
          file: fileData,
          contentType,
          filename,
          download,
        })
        return new Response('Link created successfully', { status: 201 })
      }
      case 'gofile': {
        const file = request.body
        const length = Number(request.headers.get('Content-Length'))
        if (!file) {
          return new Response('File is required', { status: 400 })
        }
        const downloadLink = await uploadGofile(file, filename, length)
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          url: downloadLink,
          contentType,
          filename,
          download,
        })
        return new Response('Link created successfully', { status: 201 })
      }
      case 'hc-cdn': {
        const file = request.body
        const length = Number(request.headers.get('Content-Length'))
        if (!file) {
          return new Response('File is required', { status: 400 })
        }
        const cdnURL = await uploadHCCdnDataURL(file, length)
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          url: cdnURL,
          contentType,
          filename,
          download,
        })
        return new Response('Link created successfully', { status: 201 })
      }
      case 'catbox': {
        const file = request.body
        const length = Number(request.headers.get('Content-Length'))
        if (!file) {
          return new Response('File is required', { status: 400 })
        }
        const catboxURL = await uploadCatbox(file, filename, length)
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          url: catboxURL,
          contentType,
          filename,
          download,
        })
        return new Response('Link created successfully', { status: 201 })
      }
      case 'litterbox': {
        const file = request.body
        const length = Number(request.headers.get('Content-Length'))
        if (!file) {
          return new Response('File is required', { status: 400 })
        }
        const litterboxURL = await uploadLitterbox(file, filename, length)
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          url: litterboxURL,
          contentType,
          filename,
          download,
        })
        return new Response('Link created successfully', { status: 201 })
      }
      default: {
        return new Response('Unsupported file location', { status: 400 })
      }
    }
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
