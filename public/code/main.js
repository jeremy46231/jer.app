import {
  any,
  assertAny,
  getElementById,
  getExtensionFromContentType,
  html,
  uploadWithProgress,
} from './utils.js'
/**
 * @typedef {import('../../shared-types.js').Link} Link
 */
/**
 * @typedef {import('../../shared-types.js').FileLocation} FileLocation
 */

/** @type {HTMLDialogElement} */
const dialog = getElementById('link-dialog')
/** @type {HTMLHeadingElement} */
const dialogTitle = getElementById('dialog-title')
/** @type {HTMLFormElement} */
const addLinkForm = getElementById('add-link-form')
/** @type {HTMLButtonElement} */
const submitBtn = assertAny(addLinkForm.querySelector('#submit-btn'))
/** @type {HTMLInputElement} */
const pathInput = getElementById('path')
/** @type {HTMLSelectElement} */
const typeSelect = getElementById('type')
/** @type {HTMLDivElement} */
const redirectFields = getElementById('redirect-fields')
/** @type {HTMLInputElement} */
const urlInput = getElementById('url')
/** @type {HTMLDivElement} */
const fileFields = getElementById('file-fields')
/** @type {HTMLDivElement} */
const fileInputGroup = getElementById('file-input-group')
/** @type {HTMLInputElement} */
const fileInput = getElementById('file')
/** @type {HTMLDivElement} */
const textInputGroup = getElementById('text-input-group')
/** @type {HTMLTextAreaElement} */
const textInput = getElementById('text')
/** @type {NodeListOf<HTMLInputElement>} */
let locationCheckboxes = document.querySelectorAll('input[name="locations"]')
/** @type {HTMLElement} */
const locationsHelp = getElementById('locations-help')
/** @type {HTMLElement} */
const filenameHelp = getElementById('filename-help')
/** @type {HTMLInputElement} */
const contentTypeInput = getElementById('content-type')
/** @type {HTMLElement} */
const contentTypeHelp = getElementById('content-type-help')
/** @type {HTMLElement} */
const redirectStatusGroup =
  getElementById('redirect-status').closest('.form-group')

/** @type {string | null} null = create mode, string = path of link being edited */
let editingPath = null
/** @type {string | null} original stored type of link being edited */
let editingLinkType = null

// ── Dialog open/close ─────────────────────────────────────────────────────────

/**
 * Opens the dialog, optionally pre-populated for editing.
 * @param {Link | null} [linkData]
 */
function openDialog(linkData) {
  addLinkForm.reset()

  if (linkData) {
    editingPath = linkData.path
    editingLinkType = linkData.type
    dialogTitle.textContent = 'Edit Link'
    submitBtn.textContent = 'Save Changes'
    pathInput.value = linkData.path

    if (linkData.type === 'redirect') {
      typeSelect.value = 'redirect'
      handleTypeChange()
      urlInput.value = linkData.url
      getElementById('redirect-status').value = String(
        any(linkData).status ?? 302
      )
      urlInput.dispatchEvent(new Event('input'))
    } else if (linkData.type === 'file') {
      typeSelect.value = 'file'
      handleTypeChange()

      const currentLocations = any(linkData).locations ?? []

      setLocationCheckboxesForEdit(currentLocations)
      locationsHelp.textContent =
        'Add or remove providers. Select a new file to replace the file content.'

      getElementById('filename').value = any(linkData).filename ?? ''
      contentTypeInput.value = any(linkData).contentType ?? ''
      getElementById('download').checked = !!any(linkData).download
    }
  } else {
    editingPath = null
    editingLinkType = null
    dialogTitle.textContent = 'Add New Link'
    submitBtn.textContent = 'Create Link'
    handleTypeChange()
    updateFilenameHelp()
  }

  dialog.showModal()
}

function closeDialog() {
  dialog.close()
  addLinkForm.reset()
  editingPath = null
  editingLinkType = null
  dialogTitle.textContent = 'Add New Link'
  submitBtn.textContent = 'Create Link'
  handleTypeChange()
  updateFilenameHelp()
  resetLocationCheckboxes()
}

/**
 * Pre-check location checkboxes for edit mode.
 * @param {string[]} currentLocations
 */
function setLocationCheckboxesForEdit(currentLocations) {
  locationCheckboxes.forEach((cb) => {
    cb.checked = currentLocations.includes(cb.value)
    cb.disabled = false
  })
}

/** Restore all location checkboxes. */
function resetLocationCheckboxes() {
  locationCheckboxes.forEach((cb) => {
    cb.disabled = false
  })
}

async function loadProviders() {
  const container = getElementById('dynamic-locations')
  try {
    const res = await fetch('/api/providers')
    if (!res.ok) throw new Error('failed')
    /** @type {{ id: string; name: string }[]} */
    const providers = await res.json()
    container.innerHTML = providers
      .map(
        (p) =>
          html`<label class="checkbox-label"
            ><input type="checkbox" name="locations" value="${p.id}" /><span
              >${p.name}</span
            ></label
          >`
      )
      .join('')
  } catch {
    container.innerHTML = ''
  }
  locationCheckboxes = document.querySelectorAll('input[name="locations"]')
}

// ── Form field visibility ─────────────────────────────────────────────────────

function handleTypeChange() {
  const selectedType = typeSelect.value

  redirectFields.style.display = 'none'
  fileFields.style.display = 'none'
  urlInput.required = false
  fileInput.required = false
  textInput.required = false
  fileInputGroup.style.display = 'none'
  textInputGroup.style.display = 'none'

  switch (selectedType) {
    case 'redirect':
      redirectFields.style.display = 'block'
      urlInput.required = true
      break
    case 'file':
      fileFields.style.display = 'block'
      fileInputGroup.style.display = 'block'
      if (editingPath === null) fileInput.required = true
      contentTypeHelp.textContent =
        'Leave blank to use the browser-provided default'
      filenameHelp.textContent = 'Leave empty to use the original filename'
      break
    case 'text':
      fileFields.style.display = 'block'
      textInputGroup.style.display = 'block'
      if (editingPath === null) textInput.required = true
      contentTypeHelp.textContent = 'Defaults to text/plain'
      updateFilenameHelp()
      break
  }
}

// ── Form submission ───────────────────────────────────────────────────────────

/**
 * @param {Event} event
 */
async function handleFormSubmit(event) {
  event.preventDefault()

  if (editingPath !== null) {
    await submitEdit()
    return
  }

  const formData = new FormData(addLinkForm)
  /** @type {string} */
  const type = any(formData.get('type'))
  /** @type {string} */
  const path = any(formData.get('path'))

  if (!type || !path) {
    showMessage('Please fill in all required fields', 'error')
    return
  }

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
        status: Number(formData.get('redirect-status')) || 302,
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
        closeDialog()
        await renderLinks()
      } else {
        const errorText = await response.text()
        showMessage(`Error creating link: ${errorText}`, 'error')
      }
    } else if (type === 'file' || type === 'text') {
      const selectedLocations = Array.from(locationCheckboxes)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value)

      if (selectedLocations.length === 0) {
        showMessage('Please select at least one storage location', 'error')
        return
      }

      /** @type {string | undefined} */
      let filename = any(formData.get('filename'))
      /** @type {string | undefined} */
      let contentType = any(formData.get('content-type'))
      const download = formData.get('download') === 'on'

      let fileToUpload
      let defaultContentType

      if (type === 'text') {
        const textContent = formData.get('text')
        if (!textContent || typeof textContent !== 'string') {
          showMessage('Text content is required for text links', 'error')
          return
        }

        fileToUpload = new Blob([textContent], { type: 'text/plain' })
        defaultContentType = 'text/plain'

        if (!filename || typeof filename !== 'string') {
          const actualContentType = contentType || defaultContentType
          const extension = getExtensionFromContentType(actualContentType)
          filename = `${path}.${extension}`
        }
      } else {
        /** @type {File | null} */
        const file = any(formData.get('file'))
        if (!file) {
          showMessage('File is required for file links', 'error')
          return
        }

        fileToUpload = file
        defaultContentType = file.type || 'application/octet-stream'

        if (!filename || typeof filename !== 'string') {
          filename = file.name
        }
      }

      if (!contentType || typeof contentType !== 'string') {
        contentType = defaultContentType
      }

      const uploadUrl = new URL('/api/links/upload', window.location.href)
      uploadUrl.searchParams.set('path', path)
      uploadUrl.searchParams.set('content-type', contentType)
      uploadUrl.searchParams.set('filename', filename)
      selectedLocations.forEach((location) => {
        uploadUrl.searchParams.append('locations', location)
      })
      uploadUrl.searchParams.set('download', download.toString())

      const response = await uploadWithProgress(
        uploadUrl.toString(),
        fileToUpload,
        (progress) => {
          if (progress === 100) {
            showMessage(`Processing...`, 'info')
            return
          }
          showMessage(`Uploading... ${progress.toFixed(0)}%`, 'info')
        }
      )

      if (response.ok || response.status === 207) {
        try {
          const result = await response.json()
          if (result.failed && result.failed.length > 0) {
            const successMsg = `${type === 'text' ? 'Text' : 'File'} link created successfully!`
            const failMsg = `Some storage providers failed: ${result.failed.map((/** @type {any} */ f) => f.location).join(', ')}`
            showMessage(`${successMsg} ${failMsg}`, 'info')
          } else {
            showMessage(
              `${type === 'text' ? 'Text' : 'File'} link created successfully!`,
              'success'
            )
          }
        } catch (e) {
          showMessage(
            `${type === 'text' ? 'Text' : 'File'} link created successfully!`,
            'success'
          )
        }
        closeDialog()
        await renderLinks()
      } else {
        try {
          const errorData = await response.json()
          const errorMsg = errorData.error || 'Unknown error'
          showMessage(`Error creating ${type} link: ${errorMsg}`, 'error')
        } catch (e) {
          const errorText = await response.text()
          showMessage(`Error creating ${type} link: ${errorText}`, 'error')
        }
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
    if (submitButtonElement) {
      submitButtonElement.textContent = originalText
      submitButtonElement.disabled = false
    }
  }
}

async function submitEdit() {
  const formData = new FormData(addLinkForm)
  const type = any(formData.get('type'))
  const newPath = any(formData.get('path'))
  const oldPath = editingPath

  if (!type || !newPath || oldPath === null) {
    showMessage('Please fill in all required fields', 'error')
    return
  }

  /** @type {HTMLButtonElement} */
  const submitButtonElement = any(addLinkForm.querySelector('#submit-btn'))
  const originalText = submitButtonElement.textContent
  submitButtonElement.textContent = 'Saving...'
  submitButtonElement.disabled = true

  try {
    if (type === 'redirect') {
      const linkUrl = formData.get('url')
      if (!linkUrl) {
        showMessage('URL is required for redirect links', 'error')
        return
      }
      const status = Number(formData.get('redirect-status')) || 302
      const response = await fetch('/api/links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPath,
          path: newPath,
          type: 'redirect',
          url: linkUrl,
          status,
        }),
      })
      if (response.ok) {
        showMessage('Link updated!', 'success')
        closeDialog()
        await renderLinks()
      } else {
        showMessage(`Error: ${await response.text()}`, 'error')
      }
    } else if (type === 'file' || type === 'text') {
      const selectedLocations = Array.from(locationCheckboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.value)

      if (selectedLocations.length === 0) {
        showMessage('Please select at least one storage location', 'error')
        return
      }

      let filename = any(formData.get('filename'))
      let contentType = any(formData.get('content-type'))
      const download = formData.get('download') === 'on'

      const hasNewFile =
        type === 'file' && fileInput.files && fileInput.files.length > 0
      const textContent = type === 'text' ? any(formData.get('text')) : null
      const hasNewText = type === 'text' && !!textContent

      if (hasNewFile || hasNewText) {
        // Re-upload with new file content
        let fileToUpload
        let defaultContentType

        if (hasNewText) {
          fileToUpload = new Blob([textContent], { type: 'text/plain' })
          defaultContentType = 'text/plain'
          if (!filename) {
            const ext = getExtensionFromContentType(
              contentType || defaultContentType
            )
            filename = `${newPath}.${ext}`
          }
        } else {
          const files = fileInput.files
          if (!files) return
          const file = files[0]
          fileToUpload = file
          defaultContentType = file.type || 'application/octet-stream'
          if (!filename) filename = file.name
        }

        if (!contentType) contentType = defaultContentType

        const uploadUrl = new URL('/api/links/upload', window.location.href)
        uploadUrl.searchParams.set('old-path', oldPath)
        uploadUrl.searchParams.set('path', newPath)
        uploadUrl.searchParams.set('content-type', contentType)
        uploadUrl.searchParams.set('filename', filename)
        selectedLocations.forEach((l) =>
          uploadUrl.searchParams.append('locations', l)
        )
        uploadUrl.searchParams.set('download', download.toString())

        const response = await uploadWithProgress(
          uploadUrl.toString(),
          fileToUpload,
          (progress) => {
            if (progress === 100) showMessage('Processing...', 'info')
            else showMessage(`Uploading... ${progress.toFixed(0)}%`, 'info')
          },
          'PUT'
        )

        if (response.ok || response.status === 207) {
          try {
            const result = await response.json()
            if (result.failed && result.failed.length > 0) {
              showMessage(
                `Link updated! Some providers failed: ${result.failed.map((/** @type {any} */ f) => f.location).join(', ')}`,
                'info'
              )
            } else {
              showMessage('Link updated!', 'success')
            }
          } catch {
            showMessage('Link updated!', 'success')
          }
          closeDialog()
          await renderLinks()
        } else {
          try {
            const errorData = await response.json()
            showMessage(`Error: ${errorData.error || 'Unknown error'}`, 'error')
          } catch {
            showMessage(`Error: ${await response.text()}`, 'error')
          }
        }
      } else {
        // Metadata-only update (no new file selected)
        if (!contentType) contentType = 'application/octet-stream'
        if (!filename) filename = newPath

        const storedType = 'file'

        const response = await fetch('/api/links', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldPath,
            path: newPath,
            type: storedType,
            contentType,
            filename,
            download,
            locations: selectedLocations,
          }),
        })

        if (response.ok) {
          showMessage('Link updated!', 'success')
          closeDialog()
          await renderLinks()
        } else {
          showMessage(`Error: ${await response.text()}`, 'error')
        }
      }
    } else {
      showMessage('Please select a valid link type', 'error')
    }
  } catch (error) {
    console.error('Error updating link:', error)
    showMessage(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    )
  } finally {
    submitButtonElement.textContent = originalText
    submitButtonElement.disabled = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * @param {string} path
 */
async function handleDeleteLink(path) {
  if (
    !confirm(
      `Are you sure you want to delete the link "${location.host}/${path}"?`
    )
  ) {
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
      showMessage(
        `Link "${location.host}/${path}" deleted successfully!`,
        'success'
      )
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
 * @param {string} path
 */
async function handleEditLink(path) {
  try {
    const response = await fetch(`/api/links/${encodeURIComponent(path)}`)
    if (!response.ok) {
      showMessage(`Error loading link: ${response.statusText}`, 'error')
      return
    }
    const linkData = await response.json()
    openDialog(linkData)
  } catch (error) {
    console.error('Error loading link for edit:', error)
    showMessage(
      `Error loading link: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    )
  }
}

// ── Links table ───────────────────────────────────────────────────────────────

/**
 * @returns {Promise<Link[]>}
 */
async function getLinks() {
  const response = await fetch('/api/links')
  if (response.status === 401) {
    window.location.href = '/login'
    return []
  }
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
    /** @type {Link[]} */
    const links = await getLinks()
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
      const displayURL = `${location.host}/${link.path}`
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
        case 'file': {
          const downloadText = link.download ? ' (force download)' : ''
          const locationsText =
            link.locations && link.locations.length > 0
              ? ` [Available: ${link.locations.join(', ')}]`
              : ''
          row.insertAdjacentHTML(
            'beforeend',
            html`
              <td>
                <a href=${linkURL} target="_blank">
                  <code>${link.filename}</code>
                </a>
                ${' '}(${link.contentType})${downloadText}${locationsText}
              </td>
            `
          )
          break
        }
        default:
          // @ts-ignore
          console.warn(`Unknown link type: ${link.type}`)
          row.innerHTML += html`<td style="color: red;">Unknown type</td>`
          break
      }

      row.insertAdjacentHTML(
        'beforeend',
        html`
          <td style="white-space: nowrap">
            <button class="edit-btn" title="Edit link">Edit</button>
            <button class="delete-btn" title="Delete link">❌</button>
          </td>
        `
      )

      /** @type {HTMLButtonElement} */
      const editButton = assertAny(row.querySelector('.edit-btn'))
      editButton.addEventListener('click', () => handleEditLink(link.path))

      /** @type {HTMLButtonElement} */
      const deleteButton = assertAny(row.querySelector('.delete-btn'))
      deleteButton.addEventListener('click', () => handleDeleteLink(link.path))

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

/** @type {HTMLTableSectionElement} */
const linksTableBody = getElementById('links-tbody')

// ── Messages ──────────────────────────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} */
let messageTimeout = null

/**
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
export function showMessage(message, type) {
  const existingMessages = document.querySelectorAll(
    '.success-message, .error-message, .info-message'
  )
  existingMessages.forEach((msg) => msg.remove())
  if (messageTimeout) {
    clearTimeout(messageTimeout)
  }
  messageTimeout = null

  const messageDiv = document.createElement('div')
  messageDiv.className = `${type}-message`
  messageDiv.textContent = message
  document.body.appendChild(messageDiv)

  if (type === 'success') {
    messageTimeout = setTimeout(() => {
      messageDiv.remove()
    }, 5000)
  }
}

// ── Text content fetch ────────────────────────────────────────────────────────

/**
 * Returns true if the content type is human-readable text.
 * @param {string} ct
 */
function isTextContentType(ct) {
  if (!ct) return false
  const norm = ct.split(';')[0].trim().toLowerCase()
  return (
    norm.startsWith('text/') ||
    norm === 'application/json' ||
    norm === 'application/javascript' ||
    norm === 'application/xml' ||
    norm === 'image/svg+xml'
  )
}

/**
 * When switching to Text type in edit mode, auto-fetch the current file
 * content and populate the textarea so the user can edit it in place.
 */
async function maybeFetchTextContent() {
  if (editingPath === null) return
  if (typeSelect.value !== 'text') return
  if (!isTextContentType(contentTypeInput.value)) return

  textInput.value = ''
  textInput.disabled = true
  textInput.placeholder = 'Loading…'

  try {
    const response = await fetch(`/${encodeURIComponent(editingPath)}`)
    if (response.ok) {
      textInput.value = await response.text()
    } else {
      showMessage('Could not load file content for editing', 'error')
    }
  } catch {
    showMessage('Could not load file content for editing', 'error')
  } finally {
    textInput.disabled = false
    textInput.placeholder = 'Enter text content here'
  }
}

// ── Filename help text ────────────────────────────────────────────────────────

function updateFilenameHelp() {
  if (typeSelect.value === 'text') {
    const contentType = contentTypeInput.value || 'text/plain'
    const extension = getExtensionFromContentType(contentType)
    const currentPath = pathInput.value || 'path'
    filenameHelp.textContent = `Leave empty to use "${currentPath}.${extension}"`
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

getElementById('open-dialog-btn').addEventListener('click', () =>
  openDialog(null)
)
getElementById('close-dialog-btn').addEventListener('click', closeDialog)
getElementById('cancel-btn').addEventListener('click', closeDialog)

typeSelect.addEventListener('change', () => {
  handleTypeChange()
  maybeFetchTextContent()
})
urlInput.addEventListener('input', () => {
  redirectStatusGroup.style.display = urlInput.value.startsWith('/')
    ? 'none'
    : ''
})
addLinkForm.addEventListener('submit', handleFormSubmit)
contentTypeInput.addEventListener('input', updateFilenameHelp)
pathInput.addEventListener('input', updateFilenameHelp)

// Initialize form state
handleTypeChange()
updateFilenameHelp()

// Load initial data
loadProviders()
renderLinks()
