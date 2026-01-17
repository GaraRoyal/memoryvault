/**
 * MemoryVault - Secret Knowledge System
 *
 * Tracks what each character knows vs. doesn't know.
 * Prevents AI from accidentally revealing information a character shouldn't know.
 *
 * Data structure:
 * secrets: {
 *   "secret_id": {
 *     id: string,
 *     content: string,           // The secret information
 *     known_by: string[],        // Characters who know this secret
 *     created_at: number,        // Timestamp
 *     source_memory_id: string,  // Link to the memory that revealed this
 *     revealed_at: number|null,  // When it became common knowledge (null if still secret)
 *     importance: number,        // 1-5 scale
 *     tags: string[],            // Categorization tags
 *   }
 * }
 *
 * Memory enhancement:
 * - memories gain `is_secret: boolean` and `known_by: string[]` fields
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { SECRETS_KEY, MEMORIES_KEY } from '../constants.js';

/**
 * Generate a unique secret ID
 * @returns {string} Unique ID
 */
function generateSecretId() {
    return `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all secrets from current chat
 * @returns {Object} Secrets object keyed by ID
 */
export function getSecrets() {
    const data = getOpenVaultData();
    return data?.[SECRETS_KEY] || {};
}

/**
 * Get secrets known by a specific character
 * @param {string} characterName - Character to check
 * @returns {Object[]} Array of secrets known by this character
 */
export function getSecretsKnownBy(characterName) {
    const secrets = getSecrets();
    return Object.values(secrets).filter(s =>
        s.known_by.includes(characterName) && !s.revealed_at
    );
}

/**
 * Get secrets NOT known by a specific character
 * @param {string} characterName - Character to check
 * @returns {Object[]} Array of secrets unknown to this character
 */
export function getSecretsUnknownTo(characterName) {
    const secrets = getSecrets();
    return Object.values(secrets).filter(s =>
        !s.known_by.includes(characterName) && !s.revealed_at
    );
}

/**
 * Create a new secret
 * @param {Object} secretData - Secret data
 * @returns {Object|null} Created secret or null
 */
export async function createSecret(secretData) {
    const data = getOpenVaultData();
    if (!data) return null;

    if (!data[SECRETS_KEY]) {
        data[SECRETS_KEY] = {};
    }

    const secret = {
        id: generateSecretId(),
        content: secretData.content,
        known_by: secretData.known_by || [],
        created_at: Date.now(),
        source_memory_id: secretData.source_memory_id || null,
        revealed_at: null,
        importance: secretData.importance || 3,
        tags: secretData.tags || [],
    };

    data[SECRETS_KEY][secret.id] = secret;
    await getDeps().saveChatConditional();

    log(`Created secret: ${secret.id} known by [${secret.known_by.join(', ')}]`);
    return secret;
}

/**
 * Reveal a secret to additional characters
 * @param {string} secretId - Secret ID
 * @param {string[]} characters - Characters learning the secret
 * @returns {boolean} Success
 */
export async function revealSecretTo(secretId, characters) {
    const data = getOpenVaultData();
    if (!data?.[SECRETS_KEY]?.[secretId]) return false;

    const secret = data[SECRETS_KEY][secretId];
    const newKnowers = characters.filter(c => !secret.known_by.includes(c));

    if (newKnowers.length === 0) return true;

    secret.known_by = [...secret.known_by, ...newKnowers];
    await getDeps().saveChatConditional();

    log(`Revealed secret ${secretId} to [${newKnowers.join(', ')}]`);
    return true;
}

/**
 * Mark a secret as common knowledge (no longer secret)
 * @param {string} secretId - Secret ID
 * @returns {boolean} Success
 */
export async function revealSecretPublicly(secretId) {
    const data = getOpenVaultData();
    if (!data?.[SECRETS_KEY]?.[secretId]) return false;

    data[SECRETS_KEY][secretId].revealed_at = Date.now();
    await getDeps().saveChatConditional();

    log(`Secret ${secretId} is now public knowledge`);
    return true;
}

/**
 * Delete a secret
 * @param {string} secretId - Secret ID
 * @returns {boolean} Success
 */
export async function deleteSecret(secretId) {
    const data = getOpenVaultData();
    if (!data?.[SECRETS_KEY]?.[secretId]) return false;

    delete data[SECRETS_KEY][secretId];
    await getDeps().saveChatConditional();

    log(`Deleted secret ${secretId}`);
    return true;
}

/**
 * Mark a memory as secret with specific knowledge holders
 * @param {string} memoryId - Memory ID
 * @param {string[]} knownBy - Characters who know this memory
 * @returns {boolean} Success
 */
export async function markMemoryAsSecret(memoryId, knownBy) {
    const data = getOpenVaultData();
    if (!data?.[MEMORIES_KEY]) return false;

    const memory = data[MEMORIES_KEY].find(m => m.id === memoryId);
    if (!memory) return false;

    memory.is_secret = true;
    memory.known_by = knownBy;
    await getDeps().saveChatConditional();

    log(`Marked memory ${memoryId} as secret, known by [${knownBy.join(', ')}]`);
    return true;
}

/**
 * Remove secret status from a memory
 * @param {string} memoryId - Memory ID
 * @returns {boolean} Success
 */
export async function unmarkMemoryAsSecret(memoryId) {
    const data = getOpenVaultData();
    if (!data?.[MEMORIES_KEY]) return false;

    const memory = data[MEMORIES_KEY].find(m => m.id === memoryId);
    if (!memory) return false;

    memory.is_secret = false;
    memory.known_by = null;
    await getDeps().saveChatConditional();

    log(`Unmarked memory ${memoryId} as secret`);
    return true;
}

/**
 * Filter memories based on what a character knows
 * Used during retrieval to prevent knowledge leakage
 * @param {Object[]} memories - Array of memories
 * @param {string} characterName - POV character (or null for no filtering)
 * @returns {Object[]} Filtered memories
 */
export function filterMemoriesByKnowledge(memories, characterName) {
    if (!characterName) return memories;

    return memories.filter(memory => {
        // Non-secret memories are always included
        if (!memory.is_secret) return true;

        // Secret memories only included if character knows them
        return memory.known_by?.includes(characterName);
    });
}

/**
 * Get summary of secret knowledge state
 * @returns {Object} Summary statistics
 */
export function getSecretsSummary() {
    const secrets = getSecrets();
    const secretsList = Object.values(secrets);

    const activeSecrets = secretsList.filter(s => !s.revealed_at);
    const revealedSecrets = secretsList.filter(s => s.revealed_at);

    // Count secrets per character
    const knowledgeMap = {};
    for (const secret of activeSecrets) {
        for (const char of secret.known_by) {
            knowledgeMap[char] = (knowledgeMap[char] || 0) + 1;
        }
    }

    return {
        total: secretsList.length,
        active: activeSecrets.length,
        revealed: revealedSecrets.length,
        knowledgeByCharacter: knowledgeMap,
    };
}
