import { CombineStream } from '../combineStream.js'

export async function uploadCatbox(
  file: Blob | string,
  filename?: string
): Promise<string>
export async function uploadCatbox(
  file: ReadableStream<Uint8Array>,
  filename: string | undefined,
  length: number
): Promise<string>
export async function uploadCatbox(
  file: ReadableStream<Uint8Array> | Blob | string,
  filename: string = 'file',
  length?: number
): Promise<string> {
  // https://catbox.moe/tools.php

  if (typeof file === 'string') {
    file = new Blob([file], { type: 'text/plain' })
  }
  let request: Request
  if (file instanceof Blob) {
    const formData = new FormData()
    formData.append('reqtype', 'fileupload')
    formData.append('fileToUpload', file, filename)
    request = new Request('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData,
    })
  } else if (file instanceof ReadableStream) {
    if (length === undefined) {
      throw new Error('Length must be provided for ReadableStream uploads')
    }

    const boundary = '-'.repeat(20) + Math.random().toFixed(20).slice(2)

    const prefix = `--${boundary}
Content-Disposition: form-data; name="reqtype"

fileupload
--${boundary}
Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"
Content-Type: application/octet-stream

`.replaceAll(/\r?\n/g, '\r\n')
    const suffix = `\r\n--${boundary}--\r\n`

    const combinedStream = CombineStream([
      prefix,
      { stream: file, length },
      suffix,
    ])

    request = new Request('https://catbox.moe/user/api.php', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: combinedStream,
    })
  } else {
    throw new Error('Unsupported file type. Must be Blob or ReadableStream.')
  }

  console.log('Uploading to Catbox:', request.url)
  const response = await fetch(request)
  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`)
  }

  const link = await response.text()
  if (!link.startsWith('https://files.catbox.moe/')) {
    throw new Error('Invalid response from Catbox')
  }
  return link
}

export async function uploadLitterbox(
  file: Blob | string,
  filename: string
): Promise<string>
export async function uploadLitterbox(
  file: ReadableStream<Uint8Array>,
  filename: string,
  length: number
): Promise<string>
export async function uploadLitterbox(
  file: ReadableStream<Uint8Array> | Blob | string,
  filename: string,
  length?: number
): Promise<string> {
  // https://litterbox.catbox.moe/tools.php

  if (typeof file === 'string') {
    file = new Blob([file], { type: 'text/plain' })
  }
  let request: Request
  if (file instanceof Blob) {
    const formData = new FormData()
    formData.append('reqtype', 'fileupload')
    formData.append('fileToUpload', file, filename)
    request = new Request(
      'https://litterbox.catbox.moe/resources/internals/api.php',
      {
        method: 'POST',
        body: formData,
      }
    )
  } else if (file instanceof ReadableStream) {
    if (length === undefined) {
      throw new Error('Length must be provided for ReadableStream uploads')
    }

    const boundary = '-'.repeat(20) + Math.random().toFixed(20).slice(2)

    const prefix = `--${boundary}
Content-Disposition: form-data; name="reqtype"

fileupload
--${boundary}
Content-Disposition: form-data; name="time"

72h
--${boundary}
Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"
Content-Type: application/octet-stream

`.replaceAll(/\r?\n/g, '\r\n')
    const suffix = `\r\n--${boundary}--\r\n`

    const combinedStream = CombineStream([
      prefix,
      { stream: file, length },
      suffix,
    ])

    request = new Request(
      'https://litterbox.catbox.moe/resources/internals/api.php',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: combinedStream,
      }
    )
  } else {
    throw new Error('Unsupported file type. Must be Blob or ReadableStream.')
  }

  console.log('Uploading to Litterbox:', request.url)
  const response = await fetch(request)
  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`)
  }

  const link = await response.text()
  if (!link.startsWith('https://litter.catbox.moe/')) {
    throw new Error('Invalid response from Litterbox')
  }
  return link
}
