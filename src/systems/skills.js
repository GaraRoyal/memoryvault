/**
 * MemoryVault - Skills/Abilities System
 *
 * Tracks what characters have learned to do.
 * References past training when relevant actions are attempted.
 *
 * Data structure:
 * skills: {
 *   "character_name": [
 *     {
 *       id: string,
 *       skill: string,             // Name of the skill
 *       category: string,          // e.g., "combat", "magic", "social", "craft", "knowledge"
 *       description: string,       // What they can do with this skill
 *       proficiency: 'novice'|'beginner'|'competent'|'skilled'|'expert'|'master',
 *       learned_at: number,        // Timestamp when first acquired
 *       last_used: number|null,    // Timestamp of most recent use
 *       use_count: number,         // How many times used/practiced
 *       source: string,            // How they learned (training, self-taught, innate, etc.)
 *       teacher: string|null,      // Who taught them (if applicable)
 *       source_memory_id: string|null,
 *       related_memory_ids: string[], // Memories of using/training this skill
 *       notes: string[],           // Additional notes about the skill
 *       tags: string[],
 *     }
 *   ]
 * }
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { SKILLS_KEY } from '../constants.js';

/**
 * Skill proficiency levels (ordered from lowest to highest)
 */
export const SkillProficiency = {
    NOVICE: 'novice',
    BEGINNER: 'beginner',
    COMPETENT: 'competent',
    SKILLED: 'skilled',
    EXPERT: 'expert',
    MASTER: 'master',
};

/**
 * Proficiency level values for comparison
 */
const PROFICIENCY_VALUES = {
    [SkillProficiency.NOVICE]: 1,
    [SkillProficiency.BEGINNER]: 2,
    [SkillProficiency.COMPETENT]: 3,
    [SkillProficiency.SKILLED]: 4,
    [SkillProficiency.EXPERT]: 5,
    [SkillProficiency.MASTER]: 6,
};

/**
 * Skill categories
 */
export const SkillCategory = {
    COMBAT: 'combat',
    MAGIC: 'magic',
    SOCIAL: 'social',
    CRAFT: 'craft',
    KNOWLEDGE: 'knowledge',
    PHYSICAL: 'physical',
    STEALTH: 'stealth',
    SURVIVAL: 'survival',
    ARTISTIC: 'artistic',
    OTHER: 'other',
};

/**
 * Generate a unique skill ID
 * @returns {string} Unique ID
 */
function generateSkillId() {
    return `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all skills from current chat
 * @returns {Object} Skills object keyed by character name
 */
export function getSkills() {
    const data = getOpenVaultData();
    return data?.[SKILLS_KEY] || {};
}

/**
 * Get skills for a specific character
 * @param {string} characterName - Character name
 * @returns {Object[]} Array of skills
 */
export function getCharacterSkills(characterName) {
    const skills = getSkills();
    return skills[characterName] || [];
}

/**
 * Get a specific skill for a character
 * @param {string} characterName - Character name
 * @param {string} skillName - Skill name (case-insensitive)
 * @returns {Object|null} Skill object or null
 */
export function getSkill(characterName, skillName) {
    const skills = getCharacterSkills(characterName);
    const normalized = skillName.toLowerCase();
    return skills.find(s => s.skill.toLowerCase() === normalized) || null;
}

/**
 * Check if a character has a skill
 * @param {string} characterName - Character name
 * @param {string} skillName - Skill name
 * @returns {boolean} Whether they have the skill
 */
export function hasSkill(characterName, skillName) {
    return getSkill(characterName, skillName) !== null;
}

/**
 * Get skills by category for a character
 * @param {string} characterName - Character name
 * @param {string} category - Skill category
 * @returns {Object[]} Array of skills in that category
 */
export function getSkillsByCategory(characterName, category) {
    const skills = getCharacterSkills(characterName);
    return skills.filter(s => s.category === category);
}

/**
 * Get skills at or above a proficiency level
 * @param {string} characterName - Character name
 * @param {string} minProficiency - Minimum proficiency level
 * @returns {Object[]} Array of skills meeting criteria
 */
export function getSkillsByProficiency(characterName, minProficiency) {
    const skills = getCharacterSkills(characterName);
    const minValue = PROFICIENCY_VALUES[minProficiency] || 1;
    return skills.filter(s => (PROFICIENCY_VALUES[s.proficiency] || 1) >= minValue);
}

/**
 * Create a new skill for a character
 * @param {string} characterName - Character name
 * @param {Object} skillData - Skill data
 * @returns {Object|null} Created skill or null
 */
export async function createSkill(characterName, skillData) {
    const data = getOpenVaultData();
    if (!data) return null;

    if (!data[SKILLS_KEY]) {
        data[SKILLS_KEY] = {};
    }

    if (!data[SKILLS_KEY][characterName]) {
        data[SKILLS_KEY][characterName] = [];
    }

    // Check if skill already exists
    const existing = getSkill(characterName, skillData.skill);
    if (existing) {
        log(`Skill "${skillData.skill}" already exists for ${characterName}`);
        return existing;
    }

    const skill = {
        id: generateSkillId(),
        skill: skillData.skill,
        category: skillData.category || SkillCategory.OTHER,
        description: skillData.description || '',
        proficiency: skillData.proficiency || SkillProficiency.NOVICE,
        learned_at: Date.now(),
        last_used: null,
        use_count: 0,
        source: skillData.source || 'unknown',
        teacher: skillData.teacher || null,
        source_memory_id: skillData.source_memory_id || null,
        related_memory_ids: skillData.related_memory_ids || [],
        notes: skillData.notes || [],
        tags: skillData.tags || [],
    };

    data[SKILLS_KEY][characterName].push(skill);
    await getDeps().saveChatConditional();

    log(`Created skill for ${characterName}: "${skill.skill}" (${skill.proficiency})`);
    return skill;
}

/**
 * Update skill proficiency
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @param {string} newProficiency - New proficiency level
 * @returns {boolean} Success
 */
export async function updateSkillProficiency(characterName, skillId, newProficiency) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    if (!Object.values(SkillProficiency).includes(newProficiency)) {
        log(`Invalid skill proficiency: ${newProficiency}`);
        return false;
    }

    const skill = data[SKILLS_KEY][characterName].find(s => s.id === skillId);
    if (!skill) return false;

    const oldProficiency = skill.proficiency;
    skill.proficiency = newProficiency;
    await getDeps().saveChatConditional();

    log(`${characterName}'s "${skill.skill}" proficiency: ${oldProficiency} -> ${newProficiency}`);
    return true;
}

/**
 * Improve skill proficiency by one level
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @returns {boolean} Success (false if already at max)
 */
export async function improveSkill(characterName, skillId) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    const skill = data[SKILLS_KEY][characterName].find(s => s.id === skillId);
    if (!skill) return false;

    const levels = Object.values(SkillProficiency);
    const currentIndex = levels.indexOf(skill.proficiency);

    if (currentIndex >= levels.length - 1) {
        log(`${characterName}'s "${skill.skill}" is already at maximum proficiency`);
        return false;
    }

    const newProficiency = levels[currentIndex + 1];
    return updateSkillProficiency(characterName, skillId, newProficiency);
}

/**
 * Record skill usage
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @param {string} memoryId - Optional memory ID of the usage
 * @returns {boolean} Success
 */
export async function recordSkillUsage(characterName, skillId, memoryId = null) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    const skill = data[SKILLS_KEY][characterName].find(s => s.id === skillId);
    if (!skill) return false;

    skill.last_used = Date.now();
    skill.use_count = (skill.use_count || 0) + 1;

    if (memoryId && !skill.related_memory_ids.includes(memoryId)) {
        skill.related_memory_ids.push(memoryId);
    }

    await getDeps().saveChatConditional();
    return true;
}

/**
 * Add note to a skill
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @param {string} note - Note to add
 * @returns {boolean} Success
 */
export async function addSkillNote(characterName, skillId, note) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    const skill = data[SKILLS_KEY][characterName].find(s => s.id === skillId);
    if (!skill) return false;

    skill.notes.push({
        note,
        timestamp: Date.now(),
    });
    await getDeps().saveChatConditional();

    return true;
}

/**
 * Link a memory to a skill
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @param {string} memoryId - Memory ID
 * @returns {boolean} Success
 */
export async function linkMemoryToSkill(characterName, skillId, memoryId) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    const skill = data[SKILLS_KEY][characterName].find(s => s.id === skillId);
    if (!skill) return false;

    if (!skill.related_memory_ids.includes(memoryId)) {
        skill.related_memory_ids.push(memoryId);
        await getDeps().saveChatConditional();
    }

    return true;
}

/**
 * Delete a skill
 * @param {string} characterName - Character name
 * @param {string} skillId - Skill ID
 * @returns {boolean} Success
 */
export async function deleteSkill(characterName, skillId) {
    const data = getOpenVaultData();
    if (!data?.[SKILLS_KEY]?.[characterName]) return false;

    const index = data[SKILLS_KEY][characterName].findIndex(s => s.id === skillId);
    if (index === -1) return false;

    data[SKILLS_KEY][characterName].splice(index, 1);
    await getDeps().saveChatConditional();

    log(`Deleted skill ${skillId} for ${characterName}`);
    return true;
}

/**
 * Get all skills across all characters by category
 * @param {string} category - Skill category
 * @returns {Object[]} Array of {character, skill} objects
 */
export function getAllSkillsByCategory(category) {
    const skills = getSkills();
    const result = [];

    for (const [character, charSkills] of Object.entries(skills)) {
        for (const skill of charSkills) {
            if (skill.category === category) {
                result.push({ character, skill });
            }
        }
    }

    return result;
}

/**
 * Compare skill proficiency between two characters
 * @param {string} char1 - First character
 * @param {string} char2 - Second character
 * @param {string} skillName - Skill to compare
 * @returns {Object} Comparison result
 */
export function compareSkills(char1, char2, skillName) {
    const skill1 = getSkill(char1, skillName);
    const skill2 = getSkill(char2, skillName);

    const value1 = skill1 ? PROFICIENCY_VALUES[skill1.proficiency] || 0 : 0;
    const value2 = skill2 ? PROFICIENCY_VALUES[skill2.proficiency] || 0 : 0;

    return {
        [char1]: skill1 ? skill1.proficiency : 'none',
        [char2]: skill2 ? skill2.proficiency : 'none',
        winner: value1 > value2 ? char1 : value2 > value1 ? char2 : 'tie',
        difference: Math.abs(value1 - value2),
    };
}

/**
 * Get summary of skills data
 * @returns {Object} Summary statistics
 */
export function getSkillsSummary() {
    const skills = getSkills();

    let totalSkills = 0;
    const byCategory = {};
    const byProficiency = {};
    const byCharacter = {};

    for (const [character, charSkills] of Object.entries(skills)) {
        byCharacter[character] = charSkills.length;

        for (const skill of charSkills) {
            totalSkills++;
            byCategory[skill.category] = (byCategory[skill.category] || 0) + 1;
            byProficiency[skill.proficiency] = (byProficiency[skill.proficiency] || 0) + 1;
        }
    }

    return {
        totalSkills,
        byCategory,
        byProficiency,
        byCharacter,
    };
}

/**
 * Detect skill-related language in text
 * Returns detected skill phrases for extraction hints
 * @param {string} text - Text to analyze
 * @returns {string[]} Detected skill phrases
 */
export function detectSkillLanguage(text) {
    const skillPatterns = [
        /learned to/gi,
        /taught me/gi,
        /trained in/gi,
        /practiced/gi,
        /mastered/gi,
        /skilled at/gi,
        /expert in/gi,
        /knows how to/gi,
        /can now/gi,
        /finally able to/gi,
        /improved at/gi,
        /getting better at/gi,
        /talent for/gi,
        /ability to/gi,
        /proficient in/gi,
        /specializes in/gi,
        /studied/gi,
        /self-taught/gi,
    ];

    const detected = [];
    for (const pattern of skillPatterns) {
        const matches = text.match(pattern);
        if (matches) {
            detected.push(...matches);
        }
    }

    return [...new Set(detected)];
}
