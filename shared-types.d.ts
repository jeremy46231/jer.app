// Shared types that can be used by both frontend and backend
// This is the single source of truth for Link types

export type FileLocation =
  | 'inline'
  | 'gofile'
  | 'hc-cdn'
  | 'catbox'
  | 'litterbox'

type GenericLink = {
  path: string
}

export type RedirectLink = GenericLink & {
  type: 'redirect'
  url: string
  status: 301 | 302 | 307 | 308
}

export type FileLink = GenericLink & {
  type: 'file'
  contentType: string
  filename: string
  download: boolean
  providerUrls: Record<string, string>
  locations: string[]
}

export type Link = RedirectLink | FileLink

export type FileLinkWithContent = FileLink & {
  file?: Uint8Array
}

export type LinkWithContent = RedirectLink | FileLinkWithContent
