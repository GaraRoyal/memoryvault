/**
 * MemoryVault - Promises & Debts System
 *
 * Tracks commitments characters make to each other.
 * Reminds when promises are broken or fulfilled.
 *
 * Data structure:
 * promises: {
 *   "promise_id": {
 *     id: string,
 *     from: string,              // Character who made the promise
 *     to: string,                // Character who received the promise
 *     content: string,           // What was promised
 *     context: string,           // Why/when it was made
 *     made_at: number,           // Timestamp
 *     made_at_message: number,   // Message index when made
 *     deadline: string|null,     // Optional deadline description
 *     status: 'pending'|'fulfilled'|'broken'|'forgiven'|'expired',
 *     status_changed_at: number|null,
 *     importance: number,        // 1-5 scale
 *     source_memory_id: string|null,
 *     tags: string[],            // e.g., ["romantic", "favor", "oath"]
 *   }
 * }
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { PROMISES_KEY } from '../constants.js';

/**
 * Promise status enum
 */
export const PromiseStatus = {
    PENDING: 'pending',
    FULFILLED: 'fulfilled',
    BROKEN: 'broken',
    FORGIVEN: 'forgiven',
    EXPIRED: 'expired',
};

/**
 * Generate a unique promise ID
 * @returns {string} Unique ID
 */
function generatePromiseId() {
    return `promise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all promises from current chat
 * @returns {Object} Promises object keyed by ID
 */
export function getPromises() {
    const data = getOpenVaultData();
    return data?.[PROMISES_KEY] || {};
}

/**
 * Get promises made BY a character
 * @param {string} characterName - Character who made promises
 * @param {string|null} status - Filter by status (null for all)
 * @returns {Object[]} Array of promises
 */
export function getPromisesMadeBy(characterName, status = null) {
    const promises = Object.values(getPromises());
    return promises.filter(p =>
        p.from === characterName &&
        (status === null || p.status === status)
    );
}

/**
 * Get promises made TO a character
 * @param {string} characterName - Character who received promises
 * @param {string|null} status - Filter by status (null for all)
 * @returns {Object[]} Array of promises
 */
export function getPromisesMadeTo(characterName, status = null) {
    const promises = Object.values(getPromises());
    return promises.filter(p =>
        p.to === characterName &&
        (status === null || p.status === status)
    );
}

/**
 * Get all pending promises involving a character (made by OR to them)
 * @param {string} characterName - Character name
 * @returns {Object[]} Array of pending promises
 */
export function getPendingPromisesFor(characterName) {
    const promises = Object.values(getPromises());
    return promises.filter(p =>
        p.status === PromiseStatus.PENDING &&
        (p.from === characterName || p.to === characterName)
    );
}

/**
 * Get promises between two specific characters
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @returns {Object[]} Array of promises between them
 */
export function getPromisesBetween(char1, char2) {
    const promises = Object.values(getPromises());
    return promises.filter(p =>
        (p.from === char1 && p.to === char2) ||
        (p.from === char2 && p.to === char1)
    );
}

/**
 * Create a new promise
 * @param {Object} promiseData - Promise data
 * @returns {Object|null} Created promise or null
 */
export async function createPromise(promiseData) {
    const data = getOpenVaultData();
    if (!data) return null;

    if (!data[PROMISES_KEY]) {
        data[PROMISES_KEY] = {};
    }

    const context = getDeps().getContext();
    const currentMessage = context.chat?.length || 0;

    const promise = {
        id: generatePromiseId(),
        from: promiseData.from,
        to: promiseData.to,
        content: promiseData.content,
        context: promiseData.context || '',
        made_at: Date.now(),
        made_at_message: currentMessage,
        deadline: promiseData.deadline || null,
        status: PromiseStatus.PENDING,
        status_changed_at: null,
        importance: promiseData.importance || 3,
        source_memory_id: promiseData.source_memory_id || null,
        tags: promiseData.tags || [],
    };

    data[PROMISES_KEY][promise.id] = promise;
    await getDeps().saveChatConditional();

    log(`Created promise: ${promise.from} -> ${promise.to}: "${promise.content}"`);
    return promise;
}

/**
 * Update promise status
 * @param {string} promiseId - Promise ID
 * @param {string} newStatus - New status
 * @returns {boolean} Success
 */
export async function updatePromiseStatus(promiseId, newStatus) {
    const data = getOpenVaultData();
    if (!data?.[PROMISES_KEY]?.[promiseId]) return false;

    if (!Object.values(PromiseStatus).includes(newStatus)) {
        log(`Invalid promise status: ${newStatus}`);
        return false;
    }

    data[PROMISES_KEY][promiseId].status = newStatus;
    data[PROMISES_KEY][promiseId].status_changed_at = Date.now();
    await getDeps().saveChatConditional();

    log(`Promise ${promiseId} status changed to: ${newStatus}`);
    return true;
}

/**
 * Mark a promise as fulfilled
 * @param {string} promiseId - Promise ID
 * @returns {boolean} Success
 */
export async function fulfillPromise(promiseId) {
    return updatePromiseStatus(promiseId, PromiseStatus.FULFILLED);
}

/**
 * Mark a promise as broken
 * @param {string} promiseId - Promise ID
 * @returns {boolean} Success
 */
export async function breakPromise(promiseId) {
    return updatePromiseStatus(promiseId, PromiseStatus.BROKEN);
}

/**
 * Mark a promise as forgiven
 * @param {string} promiseId - Promise ID
 * @returns {boolean} Success
 */
export async function forgivePromise(promiseId) {
    return updatePromiseStatus(promiseId, PromiseStatus.FORGIVEN);
}

/**
 * Delete a promise
 * @param {string} promiseId - Promise ID
 * @returns {boolean} Success
 */
export async function deletePromise(promiseId) {
    const data = getOpenVaultData();
    if (!data?.[PROMISES_KEY]?.[promiseId]) return false;

    delete data[PROMISES_KEY][promiseId];
    await getDeps().saveChatConditional();

    log(`Deleted promise ${promiseId}`);
    return true;
}

/**
 * Get promises that should be reminded about
 * Based on how many messages have passed since the promise was made
 * @param {number} threshold - Messages since promise to trigger reminder
 * @returns {Object[]} Array of promises needing reminder
 */
export function getPromisesNeedingReminder(threshold = 10) {
    const context = getDeps().getContext();
    const currentMessage = context.chat?.length || 0;

    const promises = Object.values(getPromises());
    return promises.filter(p => {
        if (p.status !== PromiseStatus.PENDING) return false;
        const messagesSince = currentMessage - (p.made_at_message || 0);
        return messagesSince >= threshold;
    });
}

/**
 * Get broken promises that haven't been forgiven
 * @returns {Object[]} Array of unforgiven broken promises
 */
export function getUnforgivenBrokenPromises() {
    const promises = Object.values(getPromises());
    return promises.filter(p => p.status === PromiseStatus.BROKEN);
}

/**
 * Get summary of promise data
 * @returns {Object} Summary statistics
 */
export function getPromisesSummary() {
    const promises = Object.values(getPromises());

    const byStatus = {
        pending: 0,
        fulfilled: 0,
        broken: 0,
        forgiven: 0,
        expired: 0,
    };

    for (const p of promises) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }

    // Count by character
    const madeBy = {};
    const madeTo = {};
    for (const p of promises) {
        madeBy[p.from] = (madeBy[p.from] || 0) + 1;
        madeTo[p.to] = (madeTo[p.to] || 0) + 1;
    }

    return {
        total: promises.length,
        byStatus,
        promisesMadeByCharacter: madeBy,
        promisesReceivedByCharacter: madeTo,
    };
}

/**
 * Detect promise-like language in text
 * Returns detected promise phrases for extraction hints
 * @param {string} text - Text to analyze
 * @returns {string[]} Detected promise phrases
 */
export function detectPromiseLanguage(text) {
    const promisePatterns = [
        /I promise/gi,
        /I swear/gi,
        /I vow/gi,
        /I pledge/gi,
        /I give you my word/gi,
        /you have my word/gi,
        /I'll make sure/gi,
        /I won't let you down/gi,
        /you can count on me/gi,
        /I owe you/gi,
        /you owe me/gi,
        /in your debt/gi,
        /I'll repay/gi,
        /I guarantee/gi,
        /cross my heart/gi,
        /on my honor/gi,
        /on my life/gi,
    ];

    const detected = [];
    for (const pattern of promisePatterns) {
        const matches = text.match(pattern);
        if (matches) {
            detected.push(...matches);
        }
    }

    return [...new Set(detected)]; // Deduplicate
}
