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
}

type FileLink = GenericLink & {
  contentType: string
  filename: string
  download: boolean
}

export type InlineFileLink = FileLink & {
  type: 'inline_file'
}

export type AttachmentFileLink = FileLink & {
  type: 'attachment_file'
  gofileUrl?: string
  catboxUrl?: string
  litterboxUrl?: string
  hcCdnUrl?: string
  locations?: string[] // Array of provider IDs where file is stored
}

export type Link = RedirectLink | InlineFileLink | AttachmentFileLink

// Full link types with file content - used only when storing/retrieving complete file data
export type InlineFileLinkWithContent = InlineFileLink & {
  file: Uint8Array
}

export type LinkWithContent =
  | RedirectLink
  | InlineFileLinkWithContent
  | AttachmentFileLink
