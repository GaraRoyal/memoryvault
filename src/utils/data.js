/**
 * MemoryVault Data Utilities
 *
 * Data persistence and metadata access utilities.
 */

import { getDeps } from '../deps.js';
import {
    extensionName,
    METADATA_KEY,
    MEMORIES_KEY,
    CHARACTERS_KEY,
    RELATIONSHIPS_KEY,
    LAST_PROCESSED_KEY,
    PROMISES_KEY,
    GOALS_KEY,
    SKILLS_KEY,
    LOCATIONS_KEY,
    SECRETS_KEY,
    SUMMARY_KEY
} from '../constants.js';
import { showToast } from './dom.js';

/**
 * Log message if debug mode is enabled
 * @param {string} message
 */
function log(message) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    if (settings?.debugMode) {
        getDeps().console.log(`[MemoryVault] ${message}`);
    }
}

/**
 * Get OpenVault data from chat metadata
 * @returns {Object|null} Returns null if context is not available
 */
export function getOpenVaultData() {
    const context = getDeps().getContext();
    if (!context) {
        getDeps().console.warn('[MemoryVault] getContext() returned null/undefined');
        return null;
    }
    if (!context.chatMetadata) {
        context.chatMetadata = {};
    }
    if (!context.chatMetadata[METADATA_KEY]) {
        context.chatMetadata[METADATA_KEY] = {
            [MEMORIES_KEY]: [],
            [CHARACTERS_KEY]: {},
            [RELATIONSHIPS_KEY]: {},
            [LAST_PROCESSED_KEY]: -1,
        };
    }
    return context.chatMetadata[METADATA_KEY];
}

/**
 * Get current chat ID for tracking across async operations
 * @returns {string|null}
 */
export function getCurrentChatId() {
    const context = getDeps().getContext();
    return context?.chatId || context?.chat_metadata?.chat_id || null;
}

/**
 * Save OpenVault data to chat metadata
 * @param {string} [expectedChatId] - If provided, verify chat hasn't changed before saving
 * @returns {Promise<boolean>} True if save succeeded, false otherwise
 */
export async function saveOpenVaultData(expectedChatId = null) {
    // If expectedChatId provided, verify we're still on the same chat
    if (expectedChatId !== null) {
        const currentId = getCurrentChatId();
        if (currentId !== expectedChatId) {
            getDeps().console.warn(`[MemoryVault] Chat changed during operation (expected: ${expectedChatId}, current: ${currentId}), aborting save`);
            return false;
        }
    }

    try {
        await getDeps().saveChatConditional();
        log('Data saved to chat metadata');
        return true;
    } catch (error) {
        getDeps().console.error('[MemoryVault] Failed to save data:', error);
        showToast('error', `Failed to save data: ${error.message}`);
        return false;
    }
}

/**
 * Generate a unique ID
 * @returns {string}
 */
export function generateId() {
    return `${getDeps().Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Prune memories that reference messages beyond the current chat length.
 * This handles the case when a user creates a branch from an earlier point
 * in the conversation - memories from messages that don't exist in the branch
 * should be removed.
 *
 * Also cleans up:
 * - Character states (removes references to pruned memories)
 * - Relationships (resets last_updated_message_id if beyond chat length)
 * - Promises (removes if made_at_message beyond chat length or source_memory pruned)
 * - Goals (removes references to pruned memories)
 * - Skills (removes references to pruned memories)
 * - Locations (removes references to pruned memories)
 * - Secrets (removes if source_memory pruned)
 * - Summary (clears if based on pruned memories)
 * - last_processed_message_id (resets if beyond chat length)
 *
 * @returns {Object} Count of pruned items
 */
export function pruneMemoriesForBranch() {
    const context = getDeps().getContext();
    const chat = context?.chat || [];
    const chatLength = chat.length;

    const data = getOpenVaultData();
    if (!data) {
        return { prunedMemories: 0, prunedCharacterEvents: 0, prunedRelationships: 0 };
    }

    const memories = data[MEMORIES_KEY] || [];
    let prunedMemories = 0;
    let prunedCharacterEvents = 0;
    let prunedRelationships = 0;
    let prunedPromises = 0;
    let prunedGoals = 0;
    let prunedSkills = 0;
    let prunedLocations = 0;
    let prunedSecrets = 0;

    // If chat is empty or has no memories, nothing to prune
    if (chatLength === 0 || memories.length === 0) {
        return { prunedMemories: 0, prunedCharacterEvents: 0, prunedRelationships: 0 };
    }

    // Find memories that reference messages beyond chat length
    // A memory is invalid if ANY of its message_ids >= chatLength
    const validMemories = [];
    const prunedMemoryIds = new Set();

    for (const memory of memories) {
        const messageIds = memory.message_ids || [];
        // Check if any message ID is beyond the current chat length
        const hasInvalidMessageId = messageIds.some(id => id >= chatLength);

        if (hasInvalidMessageId) {
            prunedMemoryIds.add(memory.id);
            prunedMemories++;
            log(`Pruning memory "${memory.summary?.substring(0, 50)}..." - references message(s) beyond chat length ${chatLength}`);
        } else {
            validMemories.push(memory);
        }
    }

    // Update memories array
    if (prunedMemories > 0) {
        data[MEMORIES_KEY] = validMemories;
    }

    // Clean up character states - remove references to pruned memories
    const characterStates = data[CHARACTERS_KEY] || {};
    for (const [charName, state] of Object.entries(characterStates)) {
        if (state.known_events && Array.isArray(state.known_events)) {
            const originalLength = state.known_events.length;
            state.known_events = state.known_events.filter(eventId => !prunedMemoryIds.has(eventId));
            const removed = originalLength - state.known_events.length;
            if (removed > 0) {
                prunedCharacterEvents += removed;
                log(`Removed ${removed} known_events from character "${charName}"`);
            }
        }

        // Reset emotion_from_messages if it references messages beyond chat length
        if (state.emotion_from_messages) {
            const { min, max } = state.emotion_from_messages;
            if (max >= chatLength) {
                // Clamp to valid range or reset
                if (min >= chatLength) {
                    delete state.emotion_from_messages;
                } else {
                    state.emotion_from_messages.max = chatLength - 1;
                }
            }
        }

        // Clean up emotion_history - remove entries with invalid message ranges
        if (state.emotion_history && Array.isArray(state.emotion_history)) {
            state.emotion_history = state.emotion_history.filter(entry => {
                if (entry.message_range) {
                    return entry.message_range.max < chatLength;
                }
                // Also filter by event_id if source memory was pruned
                if (entry.event_id && prunedMemoryIds.has(entry.event_id)) {
                    return false;
                }
                return true;
            });
        }
    }

    // Clean up relationships - reset last_updated_message_id if beyond chat length
    const relationships = data[RELATIONSHIPS_KEY] || {};
    for (const [key, relationship] of Object.entries(relationships)) {
        if (typeof relationship.last_updated_message_id === 'number' &&
            relationship.last_updated_message_id >= chatLength) {
            // Reset to the last valid message or -1
            relationship.last_updated_message_id = chatLength > 0 ? chatLength - 1 : -1;
            prunedRelationships++;
            log(`Reset last_updated_message_id for relationship "${key}"`);
        }

        // Also clean up history if it has message IDs
        if (relationship.history && Array.isArray(relationship.history)) {
            const originalHistoryLength = relationship.history.length;
            relationship.history = relationship.history.filter(h =>
                (typeof h.message_id !== 'number' || h.message_id < chatLength) &&
                (!h.event_id || !prunedMemoryIds.has(h.event_id))
            );
            if (relationship.history.length < originalHistoryLength) {
                log(`Removed ${originalHistoryLength - relationship.history.length} history entries from relationship "${key}"`);
            }
        }
    }

    // Clean up Promises - remove if made_at_message beyond chat length or source memory pruned
    const promises = data[PROMISES_KEY] || {};
    const promiseKeysToDelete = [];
    for (const [promiseId, promise] of Object.entries(promises)) {
        const shouldPrune =
            (typeof promise.made_at_message === 'number' && promise.made_at_message >= chatLength) ||
            (promise.source_memory_id && prunedMemoryIds.has(promise.source_memory_id));

        if (shouldPrune) {
            promiseKeysToDelete.push(promiseId);
            prunedPromises++;
            log(`Pruning promise "${promise.content?.substring(0, 30)}..." from ${promise.from} to ${promise.to}`);
        }
    }
    for (const key of promiseKeysToDelete) {
        delete promises[key];
    }

    // Clean up Goals - remove references to pruned memories, delete if source memory pruned
    const goals = data[GOALS_KEY] || {};
    for (const [charName, charGoals] of Object.entries(goals)) {
        if (!Array.isArray(charGoals)) continue;

        const validGoals = charGoals.filter(goal => {
            // Delete goal if its source memory was pruned
            if (goal.source_memory_id && prunedMemoryIds.has(goal.source_memory_id)) {
                prunedGoals++;
                log(`Pruning goal "${goal.goal?.substring(0, 30)}..." for ${charName}`);
                return false;
            }

            // Clean up related_memory_ids
            if (goal.related_memory_ids && Array.isArray(goal.related_memory_ids)) {
                goal.related_memory_ids = goal.related_memory_ids.filter(id => !prunedMemoryIds.has(id));
            }

            return true;
        });

        goals[charName] = validGoals;
    }

    // Clean up Skills - remove references to pruned memories
    const skills = data[SKILLS_KEY] || {};
    for (const [charName, charSkills] of Object.entries(skills)) {
        if (!Array.isArray(charSkills)) continue;

        const validSkills = charSkills.filter(skill => {
            // Delete skill if its source memory was pruned AND it has no other references
            if (skill.source_memory_id && prunedMemoryIds.has(skill.source_memory_id)) {
                // Clean related_memory_ids first
                if (skill.related_memory_ids && Array.isArray(skill.related_memory_ids)) {
                    skill.related_memory_ids = skill.related_memory_ids.filter(id => !prunedMemoryIds.has(id));
                }
                // Only delete if no remaining related memories
                if (!skill.related_memory_ids || skill.related_memory_ids.length === 0) {
                    prunedSkills++;
                    log(`Pruning skill "${skill.skill}" for ${charName}`);
                    return false;
                }
                // Clear source but keep skill since it has other references
                skill.source_memory_id = null;
            } else if (skill.related_memory_ids && Array.isArray(skill.related_memory_ids)) {
                // Just clean up related_memory_ids
                skill.related_memory_ids = skill.related_memory_ids.filter(id => !prunedMemoryIds.has(id));
            }

            return true;
        });

        skills[charName] = validSkills;
    }

    // Clean up Locations - remove references to pruned memories
    const locations = data[LOCATIONS_KEY] || {};
    for (const [locName, location] of Object.entries(locations)) {
        if (location.memory_ids && Array.isArray(location.memory_ids)) {
            const originalLength = location.memory_ids.length;
            location.memory_ids = location.memory_ids.filter(id => !prunedMemoryIds.has(id));
            const removed = originalLength - location.memory_ids.length;
            if (removed > 0) {
                prunedLocations += removed;
                log(`Removed ${removed} memory references from location "${locName}"`);
            }
        }
    }

    // Clean up Secrets - remove if source memory was pruned
    const secrets = data[SECRETS_KEY] || {};
    const secretKeysToDelete = [];
    for (const [secretId, secret] of Object.entries(secrets)) {
        if (secret.source_memory_id && prunedMemoryIds.has(secret.source_memory_id)) {
            secretKeysToDelete.push(secretId);
            prunedSecrets++;
            log(`Pruning secret "${secret.content?.substring(0, 30)}..."`);
        }
    }
    for (const key of secretKeysToDelete) {
        delete secrets[key];
    }

    // Clean up Summary - clear if current summary was based mostly on pruned memories
    const summary = data[SUMMARY_KEY];
    if (summary?.current && prunedMemories > 0) {
        // If we pruned a significant portion of memories, the summary may be invalid
        const remainingMemories = validMemories.length;
        const originalMemoryCount = summary.current.memory_count || 0;

        // If more than half the memories the summary was based on are now pruned, clear it
        if (originalMemoryCount > 0 && remainingMemories < originalMemoryCount / 2) {
            log(`Clearing summary - based on ${originalMemoryCount} memories, only ${remainingMemories} remain`);
            summary.current = null;
        }
    }

    // Reset last_processed_message_id if beyond chat length
    if (typeof data[LAST_PROCESSED_KEY] === 'number' && data[LAST_PROCESSED_KEY] >= chatLength) {
        data[LAST_PROCESSED_KEY] = chatLength > 0 ? chatLength - 1 : -1;
        log(`Reset last_processed_message_id to ${data[LAST_PROCESSED_KEY]}`);
    }

    // Log summary if anything was pruned from new systems
    if (prunedPromises > 0 || prunedGoals > 0 || prunedSkills > 0 || prunedLocations > 0 || prunedSecrets > 0) {
        log(`World state pruning: promises=${prunedPromises}, goals=${prunedGoals}, skills=${prunedSkills}, location refs=${prunedLocations}, secrets=${prunedSecrets}`);
    }

    return {
        prunedMemories,
        prunedCharacterEvents,
        prunedRelationships,
        prunedPromises,
        prunedGoals,
        prunedSkills,
        prunedLocations,
        prunedSecrets
    };
}
