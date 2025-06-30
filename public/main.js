import { any, assertAny, getElementById, html } from './utils.js'
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
  /** @type {HTMLSelectElement} */
  const locationSelect = getElementById('location')

  urlInput.required = false
  fileInput.required = false
  locationSelect.required = false

  // Show relevant fields and set validation
  switch (selectedType) {
    case 'redirect':
      redirectFields.style.display = 'block'
      urlInput.required = true
      break
    case 'file':
      fileFields.style.display = 'block'
      fileInput.required = true
      locationSelect.required = true
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
  /** @type {string} */
  const type = any(formData.get('type'))
  /** @type {string} */
  const path = any(formData.get('path'))

  if (!type || !path) {
    showMessage('Please fill in all required fields', 'error')
    return
  }

  // Show loading state
  /** @type {HTMLButtonElement} */
  const submitButtonElement = any(
    addLinkForm.querySelector('button[type="submit"]')
  )
  if (!submitButtonElement) return

  const originalText = submitButtonElement.textContent
  submitButtonElement.textContent = 'Creating...'
  submitButtonElement.disabled = true

  try {
    if (type === 'redirect') {
      const url = formData.get('url')
      if (!url) {
        showMessage('URL is required for redirect links', 'error')
        return
      }

      const requestBody = {
        path: path,
        type: 'redirect',
        url: url,
      }

      const response = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
    } else if (type === 'file') {
      /** @type {File} */
      const file = any(formData.get('file'))
      /** @type {string} */
      const location = any(formData.get('location'))
      /** @type {string | undefined} */
      let filename = any(formData.get('filename'))
      /** @type {string | undefined} */
      let contentType = any(formData.get('content-type'))
      const download = formData.get('download') === 'on'

      // Use original filename if not provided
      if (!filename || typeof filename !== 'string') {
        filename = file.name
      }
      // Use file's content type if not provided
      if (!contentType || typeof contentType !== 'string') {
        contentType = file.type || 'application/octet-stream'
      }

      // Build URL with query parameters
      const uploadUrl = new URL('/api/links/upload', window.location.href)
      uploadUrl.searchParams.set('path', path)
      uploadUrl.searchParams.set('content-type', contentType)
      uploadUrl.searchParams.set('filename', filename)
      uploadUrl.searchParams.set('location', location)
      uploadUrl.searchParams.set('download', download.toString())

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: file,
      })

      if (response.ok) {
        showMessage('File link created successfully!', 'success')
        addLinkForm.reset()
        handleTypeChange()
        await renderLinks()
      } else {
        const errorText = await response.text()
        showMessage(`Error creating file link: ${errorText}`, 'error')
      }
    } else {
      showMessage('Please select a valid link type', 'error')
      return
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
      submitButtonElement.disabled = false
    }
  }
}

/**
 * Handles deleting a link
 * @param {string} path
 */
async function handleDeleteLink(path) {
  if (!confirm(`Are you sure you want to delete the link "jer.app/${path}"?`)) {
    return
  }

  try {
    const response = await fetch(
      `/api/links?path=${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
      }
    )

    if (response.ok) {
      showMessage(`Link "jer.app/${path}" deleted successfully!`, 'success')
    } else {
      const errorText = await response.text()
      showMessage(`Error deleting link: ${errorText}`, 'error')
    }
    await renderLinks()
  } catch (error) {
    console.error('Error deleting link:', error)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    showMessage(`Error deleting link: ${errorMessage}`, 'error')
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
      <td colspan="4" style="text-align: center; color: #666;">
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
          <td colspan="4" style="text-align: center; color: #666;">
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
          row.insertAdjacentHTML(
            'beforeend',
            html`
              <td>
                <a href="${link.url}" target="_blank">${link.url}</a>
              </td>
            `
          )
          break
        case 'inline_file':
          const inlineDownloadText = link.download ? ' (force download)' : ''
          row.insertAdjacentHTML(
            'beforeend',
            html`
              <td>
                <a href=${linkURL} target="_blank">
                  <code>${link.filename}</code>
                </a>
                ${' '}(${link.contentType})${inlineDownloadText}
              </td>
            `
          )
          break
        case 'attachment_file':
          const attachmentDownloadText = link.download
            ? ' (force download)'
            : ''
          row.insertAdjacentHTML(
            'beforeend',
            html`
              <td>
                <a href=${link.url} target="_blank">
                  <code>${link.filename}</code>
                </a>
                ${' '}(${link.contentType})${attachmentDownloadText}
              </td>
            `
          )
          break
        default:
          // @ts-ignore
          console.warn(`Unknown link type: ${link.type}`)
          row.innerHTML += html`<td style="color: red;">Unknown type</td>`
          break
      }

      // Add delete button as the last column
      row.insertAdjacentHTML(
        'beforeend',
        html`
          <td>
            <button class="delete-btn" title="Delete link">❌</button>
          </td>
        `
      )

      /** @type {HTMLButtonElement} */
      const deleteButton = assertAny(row.querySelector('.delete-btn'))
      deleteButton.addEventListener('click', () => {
        handleDeleteLink(link.path)
      })
      linksTableBody.appendChild(row)
    })
  } catch (error) {
    console.error('Failed to render links:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const row = document.createElement('tr')
    row.innerHTML = html`
      <td colspan="4" style="text-align: center; color: red;">
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
