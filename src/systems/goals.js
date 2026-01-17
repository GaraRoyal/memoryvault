/**
 * MemoryVault - Character Goals System
 *
 * Tracks what each character wants. Auto-retrieves relevant memories
 * when goals are discussed or pursued.
 *
 * Data structure:
 * goals: {
 *   "character_name": [
 *     {
 *       id: string,
 *       goal: string,              // What the character wants
 *       motivation: string,        // Why they want it
 *       priority: 'critical'|'high'|'medium'|'low',
 *       status: 'active'|'completed'|'abandoned'|'failed'|'on_hold',
 *       created_at: number,
 *       status_changed_at: number|null,
 *       deadline: string|null,     // Optional deadline description
 *       progress_notes: string[],  // Updates on progress
 *       related_memory_ids: string[],
 *       obstacles: string[],       // Known obstacles
 *       source_memory_id: string|null,
 *       tags: string[],
 *     }
 *   ]
 * }
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { GOALS_KEY } from '../constants.js';

/**
 * Goal priority levels
 */
export const GoalPriority = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
};

/**
 * Goal status enum
 */
export const GoalStatus = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
    FAILED: 'failed',
    ON_HOLD: 'on_hold',
};

/**
 * Generate a unique goal ID
 * @returns {string} Unique ID
 */
function generateGoalId() {
    return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all goals from current chat
 * @returns {Object} Goals object keyed by character name
 */
export function getGoals() {
    const data = getOpenVaultData();
    return data?.[GOALS_KEY] || {};
}

/**
 * Get goals for a specific character
 * @param {string} characterName - Character name
 * @param {string|null} status - Filter by status (null for all)
 * @returns {Object[]} Array of goals
 */
export function getCharacterGoals(characterName, status = null) {
    const goals = getGoals();
    const charGoals = goals[characterName] || [];

    if (status === null) return charGoals;
    return charGoals.filter(g => g.status === status);
}

/**
 * Get active goals for a character
 * @param {string} characterName - Character name
 * @returns {Object[]} Array of active goals
 */
export function getActiveGoals(characterName) {
    return getCharacterGoals(characterName, GoalStatus.ACTIVE);
}

/**
 * Get all active goals across all characters
 * @returns {Object[]} Array of {character, goal} objects
 */
export function getAllActiveGoals() {
    const goals = getGoals();
    const result = [];

    for (const [character, charGoals] of Object.entries(goals)) {
        for (const goal of charGoals) {
            if (goal.status === GoalStatus.ACTIVE) {
                result.push({ character, goal });
            }
        }
    }

    return result;
}

/**
 * Create a new goal for a character
 * @param {string} characterName - Character name
 * @param {Object} goalData - Goal data
 * @returns {Object|null} Created goal or null
 */
export async function createGoal(characterName, goalData) {
    const data = getOpenVaultData();
    if (!data) return null;

    if (!data[GOALS_KEY]) {
        data[GOALS_KEY] = {};
    }

    if (!data[GOALS_KEY][characterName]) {
        data[GOALS_KEY][characterName] = [];
    }

    const goal = {
        id: generateGoalId(),
        goal: goalData.goal,
        motivation: goalData.motivation || '',
        priority: goalData.priority || GoalPriority.MEDIUM,
        status: GoalStatus.ACTIVE,
        created_at: Date.now(),
        status_changed_at: null,
        deadline: goalData.deadline || null,
        progress_notes: [],
        related_memory_ids: goalData.related_memory_ids || [],
        obstacles: goalData.obstacles || [],
        source_memory_id: goalData.source_memory_id || null,
        tags: goalData.tags || [],
    };

    data[GOALS_KEY][characterName].push(goal);
    await getDeps().saveChatConditional();

    log(`Created goal for ${characterName}: "${goal.goal}"`);
    return goal;
}

/**
 * Update goal status
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @param {string} newStatus - New status
 * @returns {boolean} Success
 */
export async function updateGoalStatus(characterName, goalId, newStatus) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    if (!Object.values(GoalStatus).includes(newStatus)) {
        log(`Invalid goal status: ${newStatus}`);
        return false;
    }

    const goal = data[GOALS_KEY][characterName].find(g => g.id === goalId);
    if (!goal) return false;

    goal.status = newStatus;
    goal.status_changed_at = Date.now();
    await getDeps().saveChatConditional();

    log(`Goal ${goalId} for ${characterName} status changed to: ${newStatus}`);
    return true;
}

/**
 * Mark a goal as completed
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @returns {boolean} Success
 */
export async function completeGoal(characterName, goalId) {
    return updateGoalStatus(characterName, goalId, GoalStatus.COMPLETED);
}

/**
 * Mark a goal as abandoned
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @returns {boolean} Success
 */
export async function abandonGoal(characterName, goalId) {
    return updateGoalStatus(characterName, goalId, GoalStatus.ABANDONED);
}

/**
 * Mark a goal as failed
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @returns {boolean} Success
 */
export async function failGoal(characterName, goalId) {
    return updateGoalStatus(characterName, goalId, GoalStatus.FAILED);
}

/**
 * Add progress note to a goal
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @param {string} note - Progress note
 * @returns {boolean} Success
 */
export async function addGoalProgress(characterName, goalId, note) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    const goal = data[GOALS_KEY][characterName].find(g => g.id === goalId);
    if (!goal) return false;

    goal.progress_notes.push({
        note,
        timestamp: Date.now(),
    });
    await getDeps().saveChatConditional();

    return true;
}

/**
 * Add obstacle to a goal
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @param {string} obstacle - Obstacle description
 * @returns {boolean} Success
 */
export async function addGoalObstacle(characterName, goalId, obstacle) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    const goal = data[GOALS_KEY][characterName].find(g => g.id === goalId);
    if (!goal) return false;

    if (!goal.obstacles.includes(obstacle)) {
        goal.obstacles.push(obstacle);
        await getDeps().saveChatConditional();
    }

    return true;
}

/**
 * Link a memory to a goal
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @param {string} memoryId - Memory ID
 * @returns {boolean} Success
 */
export async function linkMemoryToGoal(characterName, goalId, memoryId) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    const goal = data[GOALS_KEY][characterName].find(g => g.id === goalId);
    if (!goal) return false;

    if (!goal.related_memory_ids.includes(memoryId)) {
        goal.related_memory_ids.push(memoryId);
        await getDeps().saveChatConditional();
    }

    return true;
}

/**
 * Update goal priority
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @param {string} priority - New priority
 * @returns {boolean} Success
 */
export async function updateGoalPriority(characterName, goalId, priority) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    if (!Object.values(GoalPriority).includes(priority)) {
        log(`Invalid goal priority: ${priority}`);
        return false;
    }

    const goal = data[GOALS_KEY][characterName].find(g => g.id === goalId);
    if (!goal) return false;

    goal.priority = priority;
    await getDeps().saveChatConditional();

    return true;
}

/**
 * Delete a goal
 * @param {string} characterName - Character name
 * @param {string} goalId - Goal ID
 * @returns {boolean} Success
 */
export async function deleteGoal(characterName, goalId) {
    const data = getOpenVaultData();
    if (!data?.[GOALS_KEY]?.[characterName]) return false;

    const index = data[GOALS_KEY][characterName].findIndex(g => g.id === goalId);
    if (index === -1) return false;

    data[GOALS_KEY][characterName].splice(index, 1);
    await getDeps().saveChatConditional();

    log(`Deleted goal ${goalId} for ${characterName}`);
    return true;
}

/**
 * Get goals by priority across all characters
 * @param {string} priority - Priority level
 * @returns {Object[]} Array of {character, goal} objects
 */
export function getGoalsByPriority(priority) {
    const goals = getGoals();
    const result = [];

    for (const [character, charGoals] of Object.entries(goals)) {
        for (const goal of charGoals) {
            if (goal.priority === priority && goal.status === GoalStatus.ACTIVE) {
                result.push({ character, goal });
            }
        }
    }

    return result;
}

/**
 * Get critical/high priority active goals
 * @returns {Object[]} Array of {character, goal} objects
 */
export function getUrgentGoals() {
    const critical = getGoalsByPriority(GoalPriority.CRITICAL);
    const high = getGoalsByPriority(GoalPriority.HIGH);
    return [...critical, ...high];
}

/**
 * Get summary of goals data
 * @returns {Object} Summary statistics
 */
export function getGoalsSummary() {
    const goals = getGoals();

    let totalGoals = 0;
    const byStatus = {
        active: 0,
        completed: 0,
        abandoned: 0,
        failed: 0,
        on_hold: 0,
    };
    const byCharacter = {};

    for (const [character, charGoals] of Object.entries(goals)) {
        byCharacter[character] = {
            total: charGoals.length,
            active: charGoals.filter(g => g.status === GoalStatus.ACTIVE).length,
        };

        for (const goal of charGoals) {
            totalGoals++;
            byStatus[goal.status] = (byStatus[goal.status] || 0) + 1;
        }
    }

    return {
        totalGoals,
        byStatus,
        byCharacter,
        urgentGoals: getUrgentGoals().length,
    };
}

/**
 * Detect goal-like language in text
 * Returns detected goal phrases for extraction hints
 * @param {string} text - Text to analyze
 * @returns {string[]} Detected goal phrases
 */
export function detectGoalLanguage(text) {
    const goalPatterns = [
        /I want to/gi,
        /I need to/gi,
        /I must/gi,
        /I have to/gi,
        /my goal is/gi,
        /my dream is/gi,
        /I'm trying to/gi,
        /I'm going to/gi,
        /I will/gi,
        /I plan to/gi,
        /I intend to/gi,
        /I aim to/gi,
        /I hope to/gi,
        /I wish to/gi,
        /I'm determined to/gi,
        /my mission is/gi,
        /my purpose is/gi,
        /what I really want/gi,
        /more than anything/gi,
    ];

    const detected = [];
    for (const pattern of goalPatterns) {
        const matches = text.match(pattern);
        if (matches) {
            detected.push(...matches);
        }
    }

    return [...new Set(detected)];
}
