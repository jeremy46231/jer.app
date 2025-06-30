import { getElementById, html } from './utils.js'
/**
 * @typedef {import('../src/db.ts').Link} Link
 */

/** @type {HTMLTableSectionElement} */
const linksTableBody = getElementById('links-tbody')

/**
 * Fetches links from the API.
 * @returns {Promise<Link[]>} A promise that resolves to an array of links.
 */
async function getLinks() {
  const response = await fetch('/api/links')
  if (response.ok) {
    const data = await response.json()
    return data
  } else {
    throw new Error(`Error fetching links: ${response.statusText}`)
  }
}
async function renderLinks() {
  try {
    /** @type {import('../src/db.ts').Link[]} */
    const links = await getLinks()
    console.log('Links:', links)
    linksTableBody.innerHTML = ''
    links.forEach((link) => {
      let value = ''
      switch (link.type) {
        case 'redirect':
          value = html`<a href="${link.url}" target="_blank">${link.url}</a>`
          break
        // TODO: Handle other link types
      }
      const row = document.createElement('tr')
      row.innerHTML = html`
        <td>
          <a href="https://jer.app/${link.path}" target="_blank">
            jer.app/${link.path}
          </a>
        </td>
        <td><code>${link.type}</code></td>
        <td>${value}</td>
      `
      linksTableBody.appendChild(row)
    })
  } catch (error) {
    console.error('Failed to render links:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const row = document.createElement('tr')
    row.innerHTML = `
      <td colspan="3" style="color: red;">Error loading links: ${errorMessage}</td>
    `
    linksTableBody.appendChild(row)
  }
}

renderLinks()
