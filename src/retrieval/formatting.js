/**
 * MemoryVault Context Formatting
 *
 * Formats memories and relationships for injection into prompts.
 */

import { RELATIONSHIPS_KEY } from '../constants.js';
import { sortMemoriesBySequence, estimateTokens } from '../utils.js';

/**
 * Get descriptive label for a relationship dimension value
 * Scale: 0-10 where meaning depends on dimension type
 * @param {number} value - Value from 0-10
 * @param {string} dimension - Dimension name
 * @returns {string} Descriptive label
 */
function getDimensionLabel(value, dimension) {
    // Dimensions where 5 is neutral (can go positive or negative)
    const neutralDimensions = ['trust', 'respect', 'loyalty'];

    if (neutralDimensions.includes(dimension)) {
        // 0-2: very low, 3-4: low, 5: neutral, 6-7: high, 8-10: very high
        if (value <= 2) return 'very low';
        if (value <= 4) return 'low';
        if (value === 5) return 'neutral';
        if (value <= 7) return 'high';
        return 'very high';
    } else {
        // 0: none, 1-3: low, 4-6: moderate, 7-8: high, 9-10: very high
        if (value === 0) return 'none';
        if (value <= 3) return 'low';
        if (value <= 6) return 'moderate';
        if (value <= 8) return 'high';
        return 'very high';
    }
}

/**
 * Get relationship context for active characters
 * Now includes all 7 relationship dimensions
 * @param {Object} data - OpenVault data
 * @param {string} povCharacter - POV character name
 * @param {string[]} activeCharacters - List of active characters
 * @returns {Object[]} Array of relevant relationships
 */
export function getRelationshipContext(data, povCharacter, activeCharacters) {
    const relationships = data[RELATIONSHIPS_KEY] || {};
    const relevant = [];

    for (const [_key, rel] of Object.entries(relationships)) {
        // Check if this relationship involves POV character and any active character
        const involvesPov = rel.character_a === povCharacter || rel.character_b === povCharacter;
        const involvesActive = activeCharacters.some(c =>
            c !== povCharacter && (rel.character_a === c || rel.character_b === c)
        );

        if (involvesPov && involvesActive) {
            const other = rel.character_a === povCharacter ? rel.character_b : rel.character_a;
            relevant.push({
                character: other,
                type: rel.relationship_type,
                // All 7 dimensions with defaults
                trust: rel.trust_level ?? 5,
                tension: rel.tension_level ?? 0,
                respect: rel.respect_level ?? 5,
                attraction: rel.attraction_level ?? 0,
                fear: rel.fear_level ?? 0,
                loyalty: rel.loyalty_level ?? 5,
                familiarity: rel.familiarity_level ?? 1,
            });
        }
    }

    // Deduplicate by character name (in case multiple relationship entries exist for same pair)
    const deduped = [];
    const seen = new Set();
    for (const rel of relevant) {
        if (!seen.has(rel.character)) {
            seen.add(rel.character);
            deduped.push(rel);
        }
    }

    return deduped;
}

/**
 * Format context for injection into prompt
 * @param {Object[]} memories - Selected memories
 * @param {Object[]} relationships - Relevant relationships
 * @param {Object} emotionalInfo - Emotional state info { emotion, fromMessages }
 * @param {string} characterName - Character name for header
 * @param {number} tokenBudget - Maximum token budget
 * @param {number} chatLength - Current chat length for context
 * @returns {string} Formatted context string
 */
export function formatContextForInjection(memories, relationships, emotionalInfo, characterName, tokenBudget, chatLength = 0) {
    // Get current message number for context
    const currentMessageNum = chatLength;

    // Build header lines
    const headerLines = [
        '<scene_memory>',
        `(Current chat has #${currentMessageNum} messages)`,
        ''
    ];

    // Emotional state - handle both old string format and new object format
    const emotion = typeof emotionalInfo === 'string' ? emotionalInfo : emotionalInfo?.emotion;
    const fromMessages = typeof emotionalInfo === 'object' ? emotionalInfo?.fromMessages : null;

    if (emotion && emotion !== 'neutral') {
        let emotionLine = `Emotional state: ${emotion}`;
        if (fromMessages) {
            const { min, max } = fromMessages;
            emotionLine += min === max
                ? ` (as of msg #${min})`
                : ` (as of msgs #${min}-${max})`;
        }
        headerLines.push(emotionLine);
        headerLines.push('');
    }

    // Relationships - now with all 7 dimensions
    if (relationships && relationships.length > 0) {
        headerLines.push('Relationships with present characters (scale: 0-10, 5=neutral for trust/respect/loyalty):');
        for (const rel of relationships) {
            // Build dimension descriptions, only include non-default/notable values
            const dims = [];

            // Trust (default 5 = neutral)
            dims.push(`trust: ${getDimensionLabel(rel.trust, 'trust')}`);

            // Respect (default 5 = neutral)
            if (rel.respect !== 5) {
                dims.push(`respect: ${getDimensionLabel(rel.respect, 'respect')}`);
            }

            // Loyalty (default 5 = neutral)
            if (rel.loyalty !== 5) {
                dims.push(`loyalty: ${getDimensionLabel(rel.loyalty, 'loyalty')}`);
            }

            // Tension (default 0 = none)
            if (rel.tension > 0) {
                dims.push(`tension: ${getDimensionLabel(rel.tension, 'tension')}`);
            }

            // Attraction (default 0 = none)
            if (rel.attraction > 0) {
                dims.push(`attraction: ${getDimensionLabel(rel.attraction, 'attraction')}`);
            }

            // Fear (default 0 = none)
            if (rel.fear > 0) {
                dims.push(`fear: ${getDimensionLabel(rel.fear, 'fear')}`);
            }

            // Familiarity (default 1 = low)
            if (rel.familiarity > 3) {
                dims.push(`familiarity: ${getDimensionLabel(rel.familiarity, 'familiarity')}`);
            }

            headerLines.push(`- ${rel.character}: ${rel.type || 'acquaintance'} (${dims.join(', ')})`);
        }
        headerLines.push('');
    }

    const footerLine = '</scene_memory>';

    // Calculate overhead tokens (header + footer)
    const overheadTokens = estimateTokens(headerLines.join('\n') + footerLine);
    const availableForMemories = tokenBudget - overheadTokens;

    // Pre-truncate memories to fit within budget
    let memoriesToFormat = memories || [];
    if (memoriesToFormat.length > 0) {
        const truncatedMemories = [];
        let currentTokens = 0;

        for (const memory of memoriesToFormat) {
            const memoryTokens = estimateTokens(memory.summary || '') + 5; // +5 for formatting overhead
            if (currentTokens + memoryTokens <= availableForMemories) {
                truncatedMemories.push(memory);
                currentTokens += memoryTokens;
            } else {
                break;
            }
        }
        memoriesToFormat = truncatedMemories;
    }

    // Build memory lines
    const memoryLines = [];
    if (memoriesToFormat.length > 0) {
        const sortedMemories = sortMemoriesBySequence(memoriesToFormat, true);

        memoryLines.push('Relevant memories (in chronological order, # show position in chat when it happened, \u2605=minor to \u2605\u2605\u2605\u2605\u2605=critical):');
        sortedMemories.forEach((memory) => {
            const prefix = memory.is_secret ? '[Secret] ' : '';
            const msgIds = memory.message_ids || [];
            let msgLabel = '';
            if (msgIds.length === 1) {
                msgLabel = `#${msgIds[0]}`;
            } else if (msgIds.length > 1) {
                const minMsg = Math.min(...msgIds);
                msgLabel = `#${minMsg}`;
            }
            const importance = memory.importance || 3;
            const importanceLabel = '\u2605'.repeat(importance);
            memoryLines.push(`${msgLabel} [${importanceLabel}] ${prefix}${memory.summary}`);
        });
    }

    // Combine all lines
    return [...headerLines, ...memoryLines, footerLine].join('\n');
}
