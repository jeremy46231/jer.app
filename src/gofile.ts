export async function uploadToGofile(
  file: Blob | string,
  filename: string
): Promise<string>
export async function uploadToGofile(
  file: ReadableStream,
  filename: string,
  length: number
): Promise<string>
export async function uploadToGofile(
  file: ReadableStream | Blob | string,
  filename: string,
  length?: number
): Promise<string> {
  // https://gofile.io/api

  if (typeof file === 'string') {
    file = new Blob([file], { type: 'text/plain' })
  }
  let request: Request
  if (file instanceof Blob) {
    const formData = new FormData()
    formData.append('file', file, filename)
    request = new Request('https://upload.gofile.io/uploadFile', {
      method: 'POST',
      body: formData,
    })
  } else if (file instanceof ReadableStream) {
    if (length === undefined) {
      throw new Error('Length must be provided for ReadableStream uploads')
    }

    const boundary = '-'.repeat(30) + Math.random().toFixed(15).slice(2)

    const encoder = new TextEncoder()
    const prefix = encoder.encode(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n` +
        `Content-Length: ${length}\r\n` +
        `\r\n`
    )
    const suffix = encoder.encode(`\r\n--${boundary}--\r\n`)

    const multipartStream = new ReadableStream({
      async start(controller) {
        console.log('Starting multipart stream upload to Gofile')
        // Emit the prefix
        controller.enqueue(prefix)
        // Pipe the source file stream
        const reader = file.getReader()
        while (true) {
          console.log('Reading from file stream...')
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
        // Emit the suffix and close
        controller.enqueue(suffix)
        controller.close()
        console.log('Multipart stream upload to Gofile completed')
      },
    })

    request = new Request('https://upload.gofile.io/uploadFile', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartStream,
    })
  } else {
    throw new Error('Unsupported file type. Must be Blob or ReadableStream.')
  }

  console.log('Uploading to Gofile:', request.url)
  const response = await fetch(request)
  console.log('Gofile upload response:', response.status, response.statusText)
  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`)
  }

  const json = (await response.json()) as any
  const downloadPage = json?.data?.downloadPage
  if (typeof downloadPage !== 'string') {
    throw new Error('Invalid response from Gofile: missing downloadPage')
  }
  return downloadPage
}

export async function getGofileContents(
  url: string
): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> {
  // We must obtain a guest token from the accounts endpoint,
  // then use that token and the webToken from the global.js script
  // to access the contents route. Accessing the contents route
  // with a token also authorizes that token to download the file
  // from the direct link.

  const folderCode = url.replace('https://gofile.io/d/', '')

  const accountsResponse = await fetch('https://api.gofile.io/accounts', {
    method: 'POST',
  })
  if (!accountsResponse.ok) {
    throw new Error(
      `Failed to get account token: ${accountsResponse.statusText}`
    )
  }
  const accountsJson = (await accountsResponse.json()) as any
  const token = accountsJson?.data?.token
  if (typeof token !== 'string') {
    throw new Error('Invalid response from Gofile: missing token')
  }

  const script = await (
    await fetch('https://gofile.io/dist/js/global.js')
  ).text()
  const webToken = script.match(/appdata\.wt = "([^\n"]+)"/)?.[1]
  if (!webToken) {
    throw new Error('Failed to extract web token from Gofile script')
  }

  const contentsURL = `https://api.gofile.io/contents/${folderCode}?wt=${webToken}`
  const contentsResult = await fetch(contentsURL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!contentsResult.ok) {
    throw new Error(`Failed to get contents: ${contentsResult.statusText}`)
  }

  const contentsJson = (await contentsResult.json()) as any
  const files = contentsJson?.data?.children
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    throw new Error('No files found in Gofile contents')
  }
  const firstFile = Object.values(files)[0] as any
  if (!firstFile || !firstFile.link) {
    throw new Error('No valid file link found in Gofile contents')
  }
  const downloadUrl = firstFile.link as string

  const fileResponse = await fetch(downloadUrl, {
    headers: {
      Cookie: `accountToken=${token}`,
    },
  })

  return fileResponse.body!
}
