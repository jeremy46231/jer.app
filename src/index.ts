import { requireAuth } from './auth'
import { getLinks, createLink, getLinkWithContent, deleteLink } from './db'
import { getGofileContents, uploadToGofile } from './gofile'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      if (env.WORKER_ENV === 'development') {
        return Response.redirect(new URL('/dash', request.url).href, 303)
      }
      return Response.redirect('https://jeremywoolley.com', 308)
    }

    if (url.pathname.startsWith('/api/')) {
      const authResponse = requireAuth(request, env)
      if (authResponse !== true) {
        return authResponse
      }

      switch (url.pathname) {
        case '/api/links':
          if (request.method === 'GET') {
            try {
              const links = await getLinks(env.DB)
              return new Response(JSON.stringify(links), {
                headers: { 'Content-Type': 'application/json' },
              })
            } catch (error) {
              console.error('Error fetching links:', error)
              return new Response('Internal Server Error', { status: 500 })
            }
          } else if (request.method === 'POST') {
            try {
              const contentType = request.headers.get('content-type') || ''

              if (contentType.includes('application/json')) {
                // Handle redirect links
                const data = (await request.json()) as any
                const { path, type, url } = data

                if (!path || !type || type !== 'redirect' || !url) {
                  return new Response('Missing required fields', {
                    status: 400,
                  })
                }

                await createLink(env.DB, { path, type: 'redirect', url })
                return new Response('Link created successfully', {
                  status: 201,
                })
              } else if (contentType.includes('multipart/form-data')) {
                // Handle files
                const formData = await request.formData()
                const path = formData.get('path')
                const type = formData.get('type')
                const file = formData.get('file')
                const filename = formData.get('filename')

                if (
                  typeof path !== 'string' ||
                  typeof type !== 'string' ||
                  !(file instanceof Blob) ||
                  typeof filename !== 'string'
                ) {
                  return new Response('Invalid form data', { status: 400 })
                }

                if (type === 'inline_file') {
                  const fileBuffer = await file.arrayBuffer()
                  const fileData = new Uint8Array(fileBuffer)
                  const finalFilename = filename || file.name

                  await createLink(env.DB, {
                    path,
                    type: type,
                    file: fileData,
                    contentType: file.type,
                    filename: finalFilename,
                  })

                  return new Response('Link created successfully', {
                    status: 201,
                  })
                }
                if (type === 'attachment_file') {
                  const downloadLink = await uploadToGofile(file, filename)
                  await createLink(env.DB, {
                    path,
                    type: type,
                    url: downloadLink,
                    contentType: file.type,
                    filename: filename,
                  })

                  return new Response('Link created successfully', {
                    status: 201,
                  })
                }
              } else {
                return new Response('Unsupported content type', { status: 400 })
              }
            } catch (error) {
              console.error('Error creating link:', error)
              return new Response('Internal Server Error', { status: 500 })
            }
          } else if (request.method === 'DELETE') {
            try {
              const url = new URL(request.url)
              const pathToDelete = url.searchParams.get('path')
              
              if (!pathToDelete) {
                return new Response('Path parameter is required', { status: 400 })
              }

              await deleteLink(env.DB, pathToDelete)
              return new Response('Link deleted successfully', { status: 200 })
            } catch (error) {
              console.error('Error deleting link:', error)
              return new Response('Internal Server Error', { status: 500 })
            }
          } else {
            return new Response('Method Not Allowed', { status: 405 })
          }
      }
    }

    const path = url.pathname.slice(1)
    try {
      const link = await getLinkWithContent(env.DB, path)
      if (link) {
        switch (link.type) {
          case 'redirect':
            return Response.redirect(link.url, 302)
          case 'inline_file':
            return new Response(link.file, {
              headers: {
                'Content-Type': link.contentType,
                'Content-Disposition': `inline; filename="${link.filename}"`,
              },
            })
          case 'attachment_file':
            try {
              if (link.url.startsWith('https://gofile.io/d/')) {
                const fileStream = await getGofileContents(link.url)
                return new Response(fileStream, {
                  headers: {
                    'Content-Type': link.contentType,
                    'Content-Disposition': `attachment; filename="${link.filename}"`,
                  },
                })
              }
            } catch (error) {
              console.error('Error fetching Gofile contents:', error)
            }
            // If there's no special handling for the URL, just redirect
            return Response.redirect(link.url, 307)
          default:
            return new Response('Unsupported link type', { status: 500 })
        }
      }
    } catch (error) {
      console.error('Error serving link:', error)
      return new Response('Internal Server Error', { status: 500 })
    }

    return new Response('Not Found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
