import { Base64EncodeStream } from '../base64EncodeStream.js'
import { CombineStream } from '../combineStream.js'

export async function uploadHCCdnDataURL(
  file: Blob | string,
  filename: string
): Promise<string>
export async function uploadHCCdnDataURL(
  file: ReadableStream<Uint8Array>,
  filename: string,
  length: number
): Promise<string>
export async function uploadHCCdnDataURL(
  file: ReadableStream<Uint8Array> | Blob | string,
  filename: string,
  length?: number
): Promise<string> {
  let fileStream: ReadableStream<Uint8Array>
  let fileLength: number

  if (typeof file === 'string') {
    const blob = new Blob([file], { type: 'text/plain' })
    fileStream = blob.stream()
    fileLength = blob.size
  } else if (file instanceof Blob) {
    fileStream = file.stream()
    fileLength = file.size
  } else {
    if (length === undefined) {
      throw new Error('Length must be provided for ReadableStream uploads')
    }
    fileStream = file
    fileLength = length
  }

  const prefix = '["data:application/octet-stream;base64,'
  const base64Stream = fileStream.pipeThrough(new Base64EncodeStream())
  const suffix = `"]`

  
  const combinedStream = new CombineStream([
    prefix,
    { stream: base64Stream, length: fileLength },
    suffix,
  ])

  // serialize the stream to text as a test
  const text = await new Response(combinedStream).text()
  console.log('Serialized stream text:', text)
  throw new Error('Test error to check stream serialization')

  const response = await fetch('https://cdn.hackclub.com/api/v3/new', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer beans', // yep, that's the token
      'Content-Type': 'application/json',
      'Content-Length': String(combinedStream.length),
    },
    body: combinedStream,
  })
  if (!response.ok) {
    try {
      const text = await response.text()
      throw new Error(
        `Failed to upload file: ${response.status} ${response.statusText} - ${text}`
      )
    } catch {
      throw new Error(
        `Failed to upload file: ${response.status} ${response.statusText}`
      )
    }
  }

  const data = (await response.json()) as {
    files: {
      deployedUrl: string
      file: string
      sha: string
      size: number
    }[]
    cdnBase: string
  }
  return data.files[0].deployedUrl
}
