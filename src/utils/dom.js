/**
 * MemoryVault DOM Utilities
 *
 * DOM-related utility functions (escaping, toasts).
 */

import { getDeps } from '../deps.js';

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Safe wrapper for toastr to handle cases where it might not be available
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {string} message - Message to display
 * @param {string} title - Toast title (default: 'MemoryVault')
 * @param {object} options - Additional toastr options
 */
export function showToast(type, message, title = 'MemoryVault', options = {}) {
    getDeps().showToast(type, message, title, options);
}
