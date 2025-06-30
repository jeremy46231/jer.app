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
