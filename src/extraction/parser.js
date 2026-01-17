/**
 * MemoryVault Extraction Parser
 *
 * Parses LLM extraction results and updates character states and relationships.
 * Enhanced with emotion history tracking and expanded relationship dimensions.
 * Now also processes promises, goals, skills, and secret knowledge.
 */

import { generateId, safeParseJSON } from '../utils.js';
import { CHARACTERS_KEY, RELATIONSHIPS_KEY, PROMISES_KEY, GOALS_KEY, SKILLS_KEY } from '../constants.js';
import { processMemoryLocation } from '../systems/locations.js';

// Maximum emotion history entries to keep per character
const MAX_EMOTION_HISTORY = 50;

/**
 * Parse extraction result from LLM
 * @param {string} jsonString - JSON string from LLM
 * @param {Array} messages - Source messages
 * @param {string} characterName - Character name
 * @param {string} userName - User name
 * @param {string} batchId - Unique batch ID for this extraction run
 * @returns {Array} Array of parsed event objects
 */
export function parseExtractionResult(jsonString, messages, characterName, userName, batchId = null) {
    const parsed = safeParseJSON(jsonString);
    if (!parsed) {
        return [];
    }
    const events = Array.isArray(parsed) ? parsed : [parsed];

    // Get message IDs for sequence ordering
    const messageIds = messages.map(m => m.id);
    const minMessageId = Math.min(...messageIds);

    // Enrich events with metadata
    return events.map((event, index) => ({
        id: generateId(),
        ...event,
        message_ids: messageIds,
        // Sequence is based on the earliest message ID, with sub-index for multiple events from same batch
        sequence: minMessageId * 1000 + index,
        created_at: Date.now(),
        batch_id: batchId,
        characters_involved: event.characters_involved || [],
        witnesses: event.witnesses || event.characters_involved || [],
        location: event.location || null,
        is_secret: event.is_secret || false,
        // Secret knowledge tracking: who knows about this memory
        known_by: event.is_secret
            ? (event.known_by || event.witnesses || event.characters_involved || [])
            : null,
        importance: Math.min(5, Math.max(1, event.importance || 3)), // Clamp to 1-5, default 3
        // New emotional fields
        emotional_tone: event.emotional_tone || [],
        emotional_valence: typeof event.emotional_valence === 'number'
            ? Math.min(1, Math.max(-1, event.emotional_valence))
            : 0,
        emotional_impact: event.emotional_impact || {},
        relationship_impact: event.relationship_impact || {},
        // New feature fields (stored with memory for reference, also processed into separate stores)
        promise: event.promise || null,
        goal: event.goal || null,
        skill: event.skill || null,
        // Pinned memories are always included in retrieval
        pinned: false,
    }));
}

/**
 * Update character states based on extracted events
 * Now includes emotion history tracking
 * @param {Array} events - Extracted events
 * @param {Object} data - MemoryVault data object
 */
export function updateCharacterStatesFromEvents(events, data) {
    data[CHARACTERS_KEY] = data[CHARACTERS_KEY] || {};

    for (const event of events) {
        // Get message range for this event
        const messageIds = event.message_ids || [];
        const messageRange = messageIds.length > 0
            ? { min: Math.min(...messageIds), max: Math.max(...messageIds) }
            : null;

        // Update emotional impact
        if (event.emotional_impact) {
            for (const [charName, emotion] of Object.entries(event.emotional_impact)) {
                if (!data[CHARACTERS_KEY][charName]) {
                    data[CHARACTERS_KEY][charName] = {
                        name: charName,
                        current_emotion: 'neutral',
                        emotion_intensity: 5,
                        known_events: [],
                        emotion_history: [], // NEW: Track emotion changes over time
                    };
                }

                const charState = data[CHARACTERS_KEY][charName];

                // Initialize emotion_history if it doesn't exist (for existing data)
                if (!charState.emotion_history) {
                    charState.emotion_history = [];
                }

                // Add to emotion history before updating current
                const historyEntry = {
                    emotion: emotion,
                    timestamp: Date.now(),
                    event_id: event.id,
                    message_range: messageRange,
                    event_type: event.event_type,
                    emotional_tone: event.emotional_tone || [],
                    valence: event.emotional_valence || 0,
                };

                charState.emotion_history.push(historyEntry);

                // Trim history if it exceeds max
                if (charState.emotion_history.length > MAX_EMOTION_HISTORY) {
                    charState.emotion_history = charState.emotion_history.slice(-MAX_EMOTION_HISTORY);
                }

                // Update current emotion
                charState.current_emotion = emotion;
                charState.last_updated = Date.now();
                if (messageRange) {
                    charState.emotion_from_messages = messageRange;
                }
            }
        }

        // Add event to witnesses' knowledge
        for (const witness of (event.witnesses || [])) {
            if (!data[CHARACTERS_KEY][witness]) {
                data[CHARACTERS_KEY][witness] = {
                    name: witness,
                    current_emotion: 'neutral',
                    emotion_intensity: 5,
                    known_events: [],
                    emotion_history: [],
                };
            }
            if (!data[CHARACTERS_KEY][witness].known_events.includes(event.id)) {
                data[CHARACTERS_KEY][witness].known_events.push(event.id);
            }
        }
    }
}

/**
 * Update relationships based on extracted events
 * Now supports expanded relationship dimensions
 * @param {Array} events - Extracted events
 * @param {Object} data - MemoryVault data object
 */
export function updateRelationshipsFromEvents(events, data) {
    data[RELATIONSHIPS_KEY] = data[RELATIONSHIPS_KEY] || {};

    for (const event of events) {
        if (event.relationship_impact) {
            for (const [relationKey, impact] of Object.entries(event.relationship_impact)) {
                // Parse relationship key (e.g., "Alice->Bob")
                const match = relationKey.match(/^(.+?)\s*->\s*(.+)$/);
                if (!match) continue;

                const [, charA, charB] = match;
                // Sort names alphabetically to ensure unique key regardless of direction
                const sortedNames = [charA, charB].sort();
                const key = `${sortedNames[0]}<->${sortedNames[1]}`;

                if (!data[RELATIONSHIPS_KEY][key]) {
                    data[RELATIONSHIPS_KEY][key] = {
                        character_a: sortedNames[0],
                        character_b: sortedNames[1],
                        // Core dimensions
                        trust_level: 5,
                        tension_level: 0,
                        // NEW: Expanded relationship dimensions
                        respect_level: 5,
                        attraction_level: 0,
                        fear_level: 0,
                        loyalty_level: 5,
                        familiarity_level: 1,
                        // Metadata
                        relationship_type: 'acquaintance',
                        history: [],
                    };
                }

                const rel = data[RELATIONSHIPS_KEY][key];

                // Handle new structured impact format
                if (typeof impact === 'object' && impact !== null) {
                    // New format: {"change": "description", "trust": 1, "tension": -1, ...}
                    applyStructuredImpact(rel, impact);
                } else {
                    // Legacy format: string description - parse keywords
                    applyLegacyImpact(rel, String(impact));
                }

                // Add to history
                const messageId = event.message_ids?.length > 0
                    ? Math.max(...event.message_ids)
                    : null;

                rel.history.push({
                    event_id: event.id,
                    impact: impact,
                    timestamp: Date.now(),
                    message_id: messageId,
                    direction: `${charA}->${charB}`, // Track which direction the impact was from
                });

                // Track last updated message for decay calculations
                if (messageId !== null) {
                    rel.last_updated_message_id = messageId;
                }
            }
        }
    }
}

/**
 * Apply structured impact values to relationship
 * @param {Object} rel - Relationship object
 * @param {Object} impact - Structured impact with numeric values
 */
function applyStructuredImpact(rel, impact) {
    // Apply each dimension if provided
    if (typeof impact.trust === 'number') {
        rel.trust_level = clamp(rel.trust_level + impact.trust, 0, 10);
    }
    if (typeof impact.tension === 'number') {
        rel.tension_level = clamp(rel.tension_level + impact.tension, 0, 10);
    }
    if (typeof impact.respect === 'number') {
        rel.respect_level = clamp(rel.respect_level + impact.respect, 0, 10);
    }
    if (typeof impact.attraction === 'number') {
        rel.attraction_level = clamp(rel.attraction_level + impact.attraction, 0, 10);
    }
    if (typeof impact.fear === 'number') {
        rel.fear_level = clamp(rel.fear_level + impact.fear, 0, 10);
    }
    if (typeof impact.loyalty === 'number') {
        rel.loyalty_level = clamp(rel.loyalty_level + impact.loyalty, 0, 10);
    }
    if (typeof impact.familiarity === 'number') {
        rel.familiarity_level = clamp(rel.familiarity_level + impact.familiarity, 0, 10);
    }
}

/**
 * Apply legacy string-based impact to relationship (backwards compatibility)
 * @param {Object} rel - Relationship object
 * @param {string} impactStr - Impact description string
 */
function applyLegacyImpact(rel, impactStr) {
    const impactLower = impactStr.toLowerCase();

    // Trust
    if (impactLower.includes('trust') && (impactLower.includes('increas') || impactLower.includes('deepen') || impactLower.includes('gain'))) {
        rel.trust_level = Math.min(10, rel.trust_level + 1);
    } else if (impactLower.includes('trust') && (impactLower.includes('decreas') || impactLower.includes('lost') || impactLower.includes('betray'))) {
        rel.trust_level = Math.max(0, rel.trust_level - 1);
    }

    // Tension
    if (impactLower.includes('tension') && impactLower.includes('increas')) {
        rel.tension_level = Math.min(10, rel.tension_level + 1);
    } else if (impactLower.includes('tension') && impactLower.includes('decreas')) {
        rel.tension_level = Math.max(0, rel.tension_level - 1);
    }

    // Respect (new)
    if (impactLower.includes('respect') && (impactLower.includes('gain') || impactLower.includes('increas') || impactLower.includes('shown'))) {
        rel.respect_level = Math.min(10, rel.respect_level + 1);
    } else if (impactLower.includes('respect') && (impactLower.includes('lost') || impactLower.includes('decreas'))) {
        rel.respect_level = Math.max(0, rel.respect_level - 1);
    }

    // Attraction (new)
    if (impactLower.includes('attract') || impactLower.includes('desire') || impactLower.includes('romantic') || impactLower.includes('intimacy')) {
        rel.attraction_level = Math.min(10, rel.attraction_level + 1);
    }

    // Fear (new)
    if (impactLower.includes('fear') || impactLower.includes('intimidat') || impactLower.includes('threat')) {
        rel.fear_level = Math.min(10, rel.fear_level + 1);
    } else if (impactLower.includes('reassur') || impactLower.includes('comfort')) {
        rel.fear_level = Math.max(0, rel.fear_level - 1);
    }

    // Loyalty (new)
    if (impactLower.includes('loyal') || impactLower.includes('devotion') || impactLower.includes('commit')) {
        rel.loyalty_level = Math.min(10, rel.loyalty_level + 1);
    } else if (impactLower.includes('betray') || impactLower.includes('abandon')) {
        rel.loyalty_level = Math.max(0, rel.loyalty_level - 1);
    }

    // Familiarity always increases with interaction
    rel.familiarity_level = Math.min(10, rel.familiarity_level + 1);
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Process promises extracted from events
 * @param {Array} events - Extracted events
 * @param {Object} data - MemoryVault data object
 */
export function processPromisesFromEvents(events, data) {
    data[PROMISES_KEY] = data[PROMISES_KEY] || {};

    for (const event of events) {
        if (event.promise && event.promise.from && event.promise.to && event.promise.content) {
            const promiseId = `promise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            data[PROMISES_KEY][promiseId] = {
                id: promiseId,
                from: event.promise.from,
                to: event.promise.to,
                content: event.promise.content,
                context: event.summary || '',
                made_at: Date.now(),
                made_at_message: event.message_ids?.length > 0 ? Math.max(...event.message_ids) : 0,
                deadline: event.promise.deadline || null,
                status: 'pending',
                status_changed_at: null,
                importance: event.importance || 3,
                source_memory_id: event.id,
                tags: [],
            };
        }
    }
}

/**
 * Process goals extracted from events
 * @param {Array} events - Extracted events
 * @param {Object} data - MemoryVault data object
 */
export function processGoalsFromEvents(events, data) {
    data[GOALS_KEY] = data[GOALS_KEY] || {};

    for (const event of events) {
        if (event.goal && event.goal.character && event.goal.goal) {
            const charName = event.goal.character;

            if (!data[GOALS_KEY][charName]) {
                data[GOALS_KEY][charName] = [];
            }

            // Check if similar goal already exists
            const existingGoal = data[GOALS_KEY][charName].find(g =>
                g.goal.toLowerCase() === event.goal.goal.toLowerCase()
            );

            if (!existingGoal) {
                const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                data[GOALS_KEY][charName].push({
                    id: goalId,
                    goal: event.goal.goal,
                    motivation: event.goal.motivation || '',
                    priority: 'medium',
                    status: 'active',
                    created_at: Date.now(),
                    status_changed_at: null,
                    deadline: null,
                    progress_notes: [],
                    related_memory_ids: [event.id],
                    obstacles: [],
                    source_memory_id: event.id,
                    tags: [],
                });
            }
        }
    }
}

/**
 * Process skills extracted from events
 * @param {Array} events - Extracted events
 * @param {Object} data - MemoryVault data object
 */
export function processSkillsFromEvents(events, data) {
    data[SKILLS_KEY] = data[SKILLS_KEY] || {};

    for (const event of events) {
        if (event.skill && event.skill.character && event.skill.skill) {
            const charName = event.skill.character;

            if (!data[SKILLS_KEY][charName]) {
                data[SKILLS_KEY][charName] = [];
            }

            // Check if skill already exists
            const existingSkill = data[SKILLS_KEY][charName].find(s =>
                s.skill.toLowerCase() === event.skill.skill.toLowerCase()
            );

            if (existingSkill) {
                // Update existing skill - maybe improve proficiency or add note
                if (!existingSkill.related_memory_ids.includes(event.id)) {
                    existingSkill.related_memory_ids.push(event.id);
                }
                existingSkill.last_used = Date.now();
                existingSkill.use_count = (existingSkill.use_count || 0) + 1;
            } else {
                // Create new skill
                const skillId = `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                data[SKILLS_KEY][charName].push({
                    id: skillId,
                    skill: event.skill.skill,
                    category: event.skill.category || 'other',
                    description: '',
                    proficiency: 'novice',
                    learned_at: Date.now(),
                    last_used: Date.now(),
                    use_count: 1,
                    source: event.skill.source || 'unknown',
                    teacher: event.skill.teacher || null,
                    source_memory_id: event.id,
                    related_memory_ids: [event.id],
                    notes: [],
                    tags: [],
                });
            }
        }
    }
}

/**
 * Process location linking for events
 * @param {Array} events - Extracted events
 */
export async function processLocationsFromEvents(events) {
    for (const event of events) {
        if (event.location) {
            await processMemoryLocation(event);
        }
    }
}
