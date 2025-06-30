import { requireAuth } from './auth'
import { getLinks, createLink, deleteLink } from './db'
import { uploadToGofile } from './gofile'

export type FileLocation = 'inline' | 'gofile'

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
    // if (contentType.includes('application/json')) {
    //   // Handle redirect links
    //   const data = (await request.json()) as any
    //   const { path, type, url } = data

    //   if (!path || !type || type !== 'redirect' || !url) {
    //     return new Response('Missing required fields', {
    //       status: 400,
    //     })
    //   }

    //   await createLink(env.DB, { path, type: 'redirect', url })
    //   return new Response('Link created successfully', {
    //     status: 201,
    //   })
    // } else if (contentType.includes('multipart/form-data')) {
    //   // Handle files
    //   const formData = await request.formData()
    //   const path = formData.get('path')
    //   const type = formData.get('type')
    //   const file = formData.get('file')
    //   const filename = formData.get('filename')

    //   if (
    //     typeof path !== 'string' ||
    //     typeof type !== 'string' ||
    //     !(file instanceof Blob) ||
    //     typeof filename !== 'string'
    //   ) {
    //     return new Response('Invalid form data', { status: 400 })
    //   }

    //   if (type === 'inline_file') {
    //     const fileBuffer = await file.arrayBuffer()
    //     const fileData = new Uint8Array(fileBuffer)
    //     const finalFilename = filename || file.name

    //     await createLink(env.DB, {
    //       path,
    //       type: type,
    //       file: fileData,
    //       contentType: file.type,
    //       filename: finalFilename,
    //     })

    //     return new Response('Link created successfully', {
    //       status: 201,
    //     })
    //   }
    //   if (type === 'attachment_file') {
    //     const downloadLink = await uploadToGofile(file, filename)
    //     await createLink(env.DB, {
    //       path,
    //       type: type,
    //       url: downloadLink,
    //       contentType: file.type,
    //       filename: filename,
    //     })

    //     return new Response('Link created successfully', {
    //       status: 201,
    //     })
    //   }
    // } else {
    //   return new Response('Unsupported content type', { status: 400 })
    // }

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
    if (!path || !contentType || !filename || !location) {
      throw new Error('Missing required fields')
    }

    switch (location) {
      case 'inline':
        const fileBuffer = await request.arrayBuffer()
        const fileData = new Uint8Array(fileBuffer)
        await createLink(env.DB, {
          path,
          type: 'inline_file',
          file: fileData,
          contentType,
          filename,
        })
        return new Response('Link created successfully', { status: 201 })
      case 'gofile':
        const file = request.body
        if (!file) {
          return new Response('File is required', { status: 400 })
        }
        const downloadLink = await uploadToGofile(file, filename)
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          url: downloadLink,
          contentType,
          filename,
        })
        return new Response('Link created successfully', { status: 201 })
      default:
        return new Response('Unsupported file location', { status: 400 })
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
