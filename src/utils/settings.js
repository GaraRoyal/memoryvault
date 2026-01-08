/**
 * MemoryVault Settings Utilities
 *
 * Utilities for checking extension settings and debug logging.
 */

import { getDeps } from '../deps.js';
import { extensionName } from '../constants.js';

/**
 * Log message if debug mode is enabled
 * @param {string} message
 */
export function log(message) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    if (settings?.debugMode) {
        getDeps().console.log(`[MemoryVault] ${message}`);
    }
}

/**
 * Check if MemoryVault extension is enabled
 * @returns {boolean}
 */
export function isExtensionEnabled() {
    return getDeps().getExtensionSettings()[extensionName]?.enabled === true;
}

/**
 * Check if MemoryVault extension is enabled (automatic mode is now implicit)
 * @returns {boolean}
 */
export function isAutomaticMode() {
    const settings = getDeps().getExtensionSettings()[extensionName];
    return settings?.enabled === true;
}
