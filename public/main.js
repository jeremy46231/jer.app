import { getElementById, html } from './utils.js'
/**
 * @typedef {import('../src/db.ts').Link} Link
 */

/** @type {HTMLTableSectionElement} */
const linksTableBody = getElementById('links-tbody')
/** @type {HTMLFormElement} */
const addLinkForm = getElementById('add-link-form')
/** @type {HTMLSelectElement} */
const typeSelect = getElementById('type')
/** @type {HTMLDivElement} */
const redirectFields = getElementById('redirect-fields')
/** @type {HTMLDivElement} */
const fileFields = getElementById('file-fields')

/**
 * Shows or hides form fields based on selected link type
 */
function handleTypeChange() {
  const selectedType = typeSelect.value

  // Hide all type-specific fields
  redirectFields.style.display = 'none'
  fileFields.style.display = 'none'

  // Clear validation requirements
  /** @type {HTMLInputElement} */
  const urlInput = getElementById('url')
  /** @type {HTMLInputElement} */
  const fileInput = getElementById('file')

  urlInput.required = false
  fileInput.required = false

  // Show relevant fields and set validation
  switch (selectedType) {
    case 'redirect':
      redirectFields.style.display = 'block'
      urlInput.required = true
      break
    case 'inline_file':
    case 'attachment_file':
      fileFields.style.display = 'block'
      fileInput.required = true
      break
  }
}

/**
 * Handles form submission
 * @param {Event} event
 */
async function handleFormSubmit(event) {
  event.preventDefault()

  const formData = new FormData(addLinkForm)
  const type = /** @type {string | null} */ formData.get('type')
  const path = /** @type {string | null} */ formData.get('path')

  if (!type || !path) {
    showMessage('Please fill in all required fields', 'error')
    return
  }

  // Show loading state
  const submitButtonElement = addLinkForm.querySelector('button[type="submit"]')
  if (!submitButtonElement) return

  const originalText = submitButtonElement.textContent
  submitButtonElement.textContent = 'Creating...'
  // @ts-ignore
  submitButtonElement.disabled = true

  try {
    let requestBody
    /** @type {Record<string, string>} */
    const headers = {}

    if (type === 'redirect') {
      // For redirect links, send JSON
      requestBody = JSON.stringify({
        path: path,
        type: type,
        url: formData.get('url'),
      })
      headers['Content-Type'] = 'application/json'
    } else {
      // For file links, send FormData (multipart)
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        showMessage('Please select a file', 'error')
        return
      }

      const customFilename = formData.get('filename')
      const filename =
        customFilename && typeof customFilename === 'string'
          ? customFilename
          : file.name

      requestBody = new FormData()
      requestBody.append('path', path)
      requestBody.append('type', type)
      requestBody.append('file', file)
      requestBody.append('filename', filename)
    }

    const response = await fetch('/api/links', {
      method: 'POST',
      headers: headers,
      body: requestBody,
    })

    if (response.ok) {
      showMessage('Link created successfully!', 'success')
      addLinkForm.reset()
      handleTypeChange() // Reset form state
      await renderLinks() // Refresh the links table
    } else {
      const errorText = await response.text()
      showMessage(`Error creating link: ${errorText}`, 'error')
    }
  } catch (error) {
    console.error('Error creating link:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    showMessage(`Error creating link: ${errorMessage}`, 'error')
  } finally {
    // Reset button state
    if (submitButtonElement) {
      submitButtonElement.textContent = originalText
      // @ts-ignore
      submitButtonElement.disabled = false
    }
  }
}

/**
 * Shows a message to the user
 * @param {string} message
 * @param {'success' | 'error'} type
 */
function showMessage(message, type) {
  // Remove existing messages
  const existingMessages = document.querySelectorAll(
    '.success-message, .error-message'
  )
  existingMessages.forEach((msg) => msg.remove())

  const messageDiv = document.createElement('div')
  messageDiv.className =
    type === 'success' ? 'success-message' : 'error-message'
  messageDiv.textContent = message

  // Insert before the form
  const addLinkSection = document.querySelector('.add-link-section')
  if (addLinkSection) {
    addLinkSection.insertBefore(messageDiv, addLinkForm)
  }

  // Auto-remove success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      messageDiv.remove()
    }, 5000)
  }
}

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
  linksTableBody.innerHTML = html`
    <tr>
      <td colspan="3" style="text-align: center; color: #666;">
        Loading links...
      </td>
    </tr>
  `
  try {
    /** @type {import('../src/db.ts').Link[]} */
    const links = await getLinks()
    console.log('Links:', links)
    linksTableBody.innerHTML = ''

    if (links.length === 0) {
      linksTableBody.innerHTML = html`
        <tr>
          <td colspan="3" style="text-align: center; color: #666;">
            No links found
          </td>
        </tr>
      `
      return
    }

    links.forEach((link) => {
      const displayURL = `jer.app/${link.path}`
      const linkURL = new URL(`/${link.path}`, window.location.href)
      const row = document.createElement('tr')
      row.innerHTML = html`
        <td>
          <a href=${linkURL} target="_blank">${displayURL}</a>
        </td>
        <td><code>${link.type}</code></td>
      `
      switch (link.type) {
        case 'redirect':
          row.innerHTML += html`
            <td>
              <a href="${link.url}" target="_blank">${link.url}</a>
            </td>
          `
          break
        case 'inline_file':
          row.innerHTML += html`
            <td>
              <a href=${linkURL} target="_blank">
                <code>${link.filename}</code>
              </a>
              ${' '}(${link.contentType})
            </td>
          `
          break
        case 'attachment_file':
          row.innerHTML += html`
            <td>
              <a href=${link.url} target="_blank">
                <code>${link.filename}</code>
              </a>
              ${' '}(${link.contentType})
            </td>
          `
          break
        default:
          // @ts-ignore
          console.warn(`Unknown link type: ${link.type}`)
          row.innerHTML += html`<td style="color: red;">Unknown type</td>`
          break
      }
      linksTableBody.appendChild(row)
    })
  } catch (error) {
    console.error('Failed to render links:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const row = document.createElement('tr')
    row.innerHTML = html`
      <td colspan="3" style="text-align: center; color: red;">
        Error loading links: ${errorMessage}
      </td>
    `
    linksTableBody.appendChild(row)
  }
}

// Set up event listeners
typeSelect.addEventListener('change', handleTypeChange)
addLinkForm.addEventListener('submit', handleFormSubmit)

// Initialize form state
handleTypeChange()

// Load initial data
renderLinks()
