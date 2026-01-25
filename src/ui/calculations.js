/**
 * MemoryVault UI Calculation Functions
 *
 * Pure functions for data processing and calculations.
 * No DOM dependencies - fully testable.
 */

/**
 * Filter memories by type and character
 * @param {Array} memories - Array of memory objects
 * @param {string} typeFilter - Event type filter (empty = all)
 * @param {string} characterFilter - Character filter (empty = all)
 * @returns {Array} Filtered memories
 */
export function filterMemories(memories, typeFilter, characterFilter) {
    return memories.filter(m => {
        if (typeFilter && m.event_type !== typeFilter) return false;
        if (characterFilter && !m.characters_involved?.includes(characterFilter)) return false;
        return true;
    });
}

/**
 * Sort memories by creation date (newest first)
 * @param {Array} memories - Array of memory objects
 * @returns {Array} New sorted array
 */
export function sortMemoriesByDate(memories) {
    return [...memories].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/**
 * Calculate pagination info
 * @param {number} totalItems - Total number of items
 * @param {number} currentPage - Current page (0-indexed)
 * @param {number} itemsPerPage - Items per page
 * @returns {Object} Pagination info
 */
export function getPaginationInfo(totalItems, currentPage, itemsPerPage) {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const validPage = Math.min(currentPage, totalPages - 1);
    const startIdx = validPage * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;

    return {
        totalPages,
        currentPage: validPage,
        startIdx,
        endIdx,
        hasPrev: validPage > 0,
        hasNext: validPage < totalPages - 1,
    };
}

/**
 * Extract unique character names from memories
 * @param {Array} memories - Array of memory objects
 * @returns {string[]} Sorted array of unique character names
 */
export function extractCharactersSet(memories) {
    const characters = new Set();
    for (const memory of memories) {
        for (const char of (memory.characters_involved || [])) {
            characters.add(char);
        }
    }
    return Array.from(characters).sort();
}

/**
 * Build character state display data
 * @param {string} name - Character name
 * @param {Object} charData - Character state data
 * @returns {Object} Display-ready character data
 */
export function buildCharacterStateData(name, charData) {
    const emotion = charData.current_emotion || 'neutral';
    const intensity = charData.emotion_intensity || 5;
    const knownCount = charData.known_events?.length || 0;

    let emotionSource = '';
    if (charData.emotion_from_messages) {
        const { min, max } = charData.emotion_from_messages;
        emotionSource = min === max
            ? ` (msg ${min})`
            : ` (msgs ${min}-${max})`;
    }

    return {
        name,
        emotion,
        emotionSource,
        intensity,
        intensityPercent: intensity * 10,
        knownCount,
    };
}

/**
 * Get descriptive label for a relationship dimension value
 * @param {number} value - Value from 0-10
 * @param {string} dimension - Dimension name for context
 * @returns {string} Descriptive label
 */
export function getDimensionLabel(value, dimension) {
    // Dimensions where 5 is neutral (can go positive or negative)
    const neutralDimensions = ['trust', 'respect', 'loyalty'];
    // Dimensions where 0 is none/absent (only go up from 0)
    const absenceDimensions = ['tension', 'attraction', 'fear', 'familiarity'];

    if (neutralDimensions.includes(dimension)) {
        // 0-2: Very Low, 3-4: Low, 5: Neutral, 6-7: High, 8-10: Very High
        if (value <= 2) return 'Very Low';
        if (value <= 4) return 'Low';
        if (value === 5) return 'Neutral';
        if (value <= 7) return 'High';
        return 'Very High';
    } else {
        // 0: None, 1-3: Low, 4-6: Moderate, 7-8: High, 9-10: Very High
        if (value === 0) return 'None';
        if (value <= 3) return 'Low';
        if (value <= 6) return 'Moderate';
        if (value <= 8) return 'High';
        return 'Very High';
    }
}

/**
 * Build relationship display data
 * Now includes expanded relationship dimensions with descriptive labels
 * @param {string} key - Relationship key
 * @param {Object} relData - Relationship data
 * @returns {Object} Display-ready relationship data
 */
export function buildRelationshipData(key, relData) {
    const trust = relData.trust_level ?? 5;
    const tension = relData.tension_level ?? 0;
    const respect = relData.respect_level ?? 5;
    const attraction = relData.attraction_level ?? 0;
    const fear = relData.fear_level ?? 0;
    const loyalty = relData.loyalty_level ?? 5;
    const familiarity = relData.familiarity_level ?? 1;

    return {
        key,
        characterA: relData.character_a || '?',
        characterB: relData.character_b || '?',
        type: relData.relationship_type || 'acquaintance',
        // Core dimensions with labels
        trust,
        trustPercent: trust * 10,
        trustLabel: getDimensionLabel(trust, 'trust'),
        tension,
        tensionPercent: tension * 10,
        tensionLabel: getDimensionLabel(tension, 'tension'),
        // Expanded dimensions with labels
        respect,
        respectPercent: respect * 10,
        respectLabel: getDimensionLabel(respect, 'respect'),
        attraction,
        attractionPercent: attraction * 10,
        attractionLabel: getDimensionLabel(attraction, 'attraction'),
        fear,
        fearPercent: fear * 10,
        fearLabel: getDimensionLabel(fear, 'fear'),
        loyalty,
        loyaltyPercent: loyalty * 10,
        loyaltyLabel: getDimensionLabel(loyalty, 'loyalty'),
        familiarity,
        familiarityPercent: familiarity * 10,
        familiarityLabel: getDimensionLabel(familiarity, 'familiarity'),
    };
}

/**
 * Calculate extraction statistics
 * @param {Array} chat - Chat messages array
 * @param {Set} extractedMessageIds - Set of extracted message indices
 * @param {number} messageCount - Messages per extraction setting
 * @param {number} bufferSize - Recent messages excluded from extraction
 * @returns {Object} Extraction statistics
 */
export function calculateExtractionStats(chat, extractedMessageIds, messageCount, bufferSize = 0) {
    const totalMessages = chat.length;
    const hiddenMessages = chat.filter(m => m.is_system).length;
    const extractedCount = extractedMessageIds.size;

    // Calculate extractable messages (total minus buffer)
    const extractableMessages = Math.max(0, totalMessages - bufferSize);

    // Calculate unextracted messages (only from extractable pool)
    const unextractedCount = Math.max(0, extractableMessages - extractedCount);

    // Batch progress: how many messages in current partial batch
    const batchProgress = unextractedCount % messageCount;
    const messagesNeeded = batchProgress === 0 && unextractedCount > 0 ? 0 : messageCount - batchProgress;

    return {
        totalMessages,
        hiddenMessages,
        extractedCount,
        extractableMessages,
        unextractedCount,
        batchProgress,
        messagesNeeded,
        messageCount,
        bufferSize,
    };
}

/**
 * Get batch progress info for display
 * @param {Object} stats - Stats from calculateExtractionStats
 * @returns {Object} { current, total, percentage, label }
 */
export function getBatchProgressInfo(stats) {
    const { batchProgress, messagesNeeded, messageCount, unextractedCount, bufferSize = 0 } = stats;

    const bufferLabel = bufferSize > 0 ? ` [${bufferSize} buffered]` : '';

    // If all extracted, show full bar
    if (unextractedCount === 0) {
        return {
            current: messageCount,
            total: messageCount,
            percentage: 100,
            label: `Up to date${bufferLabel}`,
        };
    }

    // If ready to extract (full batch waiting), show full bar
    if (messagesNeeded === 0) {
        return {
            current: messageCount,
            total: messageCount,
            percentage: 100,
            label: `Ready!${bufferLabel}`,
        };
    }

    return {
        current: batchProgress,
        total: messageCount,
        percentage: Math.round((batchProgress / messageCount) * 100),
        label: `${batchProgress}/${messageCount} (+${messagesNeeded})${bufferLabel}`,
    };
}

/**
 * Validate and clamp RPM value
 * @param {*} value - Input value
 * @param {number} defaultValue - Default if invalid
 * @returns {number} Clamped value between 1-600
 */
export function validateRPM(value, defaultValue = 30) {
    const parsed = parseInt(value);
    const num = Number.isNaN(parsed) ? defaultValue : parsed;
    return Math.max(1, Math.min(600, num));
}

/**
 * Build profile options array for dropdown
 * @param {Array} profiles - Available connection profiles
 * @param {string} currentValue - Currently selected profile ID
 * @returns {Array} Array of option objects {id, name, selected}
 */
export function buildProfileOptions(profiles, currentValue) {
    return profiles.map(profile => ({
        id: profile.id,
        name: profile.name,
        selected: profile.id === currentValue,
    }));
}
