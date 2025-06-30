export async function uploadToGofile(file: Blob, filename: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file, filename)

  const response = await fetch('https://upload.gofile.io/uploadFile', {
    method: 'POST',
    body: formData,
  })
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
  const folderCode = url.replace('https://gofile.io/d/', '')

  const accountsResponse = await fetch('https://api.gofile.io/accounts', {
    method: 'POST',
  })
  if (!accountsResponse.ok) {
    throw new Error(`Failed to get account token: ${accountsResponse.statusText}`)
  }
  const accountsJson = await accountsResponse.json() as any
  const token = accountsJson?.data?.token
  if (typeof token !== 'string') {
    throw new Error('Invalid response from Gofile: missing token')
  }

  const script = await (await fetch('https://gofile.io/dist/js/global.js')).text()
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
  
  const contentsJson = await contentsResult.json() as any
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
      'Cookie': `accountToken=${token}`,
    },
  })
  
  return fileResponse.body!
}