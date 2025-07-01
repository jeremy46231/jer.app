import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm'
import vhtml from 'https://cdn.jsdelivr.net/npm/vhtml@2.2.0/+esm'

const rawHtml = htm.bind(vhtml)
/**
 * A tagged template literal function for creating HTML strings.
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {string}
 */
export function html(strings, ...values) {
  const result = rawHtml(strings, ...values)
  // If the result is an array, join it into a single string
  return Array.isArray(result) ? result.join('') : result
}

/**
 * @param {string} id
 * @return {any}
 */
export function getElementById(id) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Element with id "${id}" not found`)
  }
  return element
}
/**
 * @param {string} selector
 * @return {any}
 */
export function querySelector(selector) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Element matching selector "${selector}" not found`)
  }
  return element
}

/**
 * Determines the appropriate file extension based on content type
 * @param {string} contentType
 * @returns {string}
 */
export function getExtensionFromContentType(contentType) {
  const extensions = {
    'text/html': 'html',
    'text/css': 'css', 
    'application/javascript': 'js',
    'text/javascript': 'js',
    'image/svg+xml': 'svg',
    'application/json': 'json',
    'text/plain': 'txt'
  }
  return extensions[/** @type {keyof typeof extensions} */(contentType)] || 'txt'
}

/**
 * Asserts that the value is truthy.
 * Returns the value typed to exclude falsy types.
 * @template T
 * @param {T} value
 * @returns {Omit<T, undefined | null | false | 0 | ''>}
 */
export function assert(value) {
  if (!value) {
    throw new Error('Value is falsy')
  }
  return value
}
/**
 * Identity function that returns with the type any.
 * @param {unknown} value
 * @returns {any}
 */
export function any(value) {
  return value
}
/**
 * Asserts that the value is truthy and returns it as
 * any, so you can override
 * @param {unknown} value
 * @returns {any}
 */
export function assertAny(value) {
  return assert(value)
}
