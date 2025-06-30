// Type declarations for CDN imports
// This maps the CDN URLs to the types from the locally installed packages

declare module 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm' {
  export { default } from 'htm'
  export * from 'htm'
}

declare module 'https://cdn.jsdelivr.net/npm/vhtml@2.2.0/+esm' {
  // vhtml doesn't ship with types, so we define them here
  interface VNode {
    nodeName: string
    attributes: Record<string, any>
    children: (VNode | string)[]
  }

  function vhtml(
    nodeName: string,
    attributes: Record<string, any> | null,
    ...children: (VNode | string)[]
  ): string

  export = vhtml
}
