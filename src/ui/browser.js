/**
 * MemoryVault Memory Browser UI
 *
 * Handles memory list rendering, character states, and relationship displays.
 * Uses template literals for cleaner, more maintainable HTML generation.
 */

import { getOpenVaultData, showToast } from '../utils.js';
import { getDeps } from '../deps.js';
import { escapeHtml } from '../utils/dom.js';
import { MEMORIES_KEY, CHARACTERS_KEY, RELATIONSHIPS_KEY, MEMORIES_PER_PAGE } from '../constants.js';
import { deleteMemory as deleteMemoryAction, updateMemory as updateMemoryAction, toggleMemoryPin as togglePinAction } from '../data/actions.js';
import { getEmbedding, isEmbeddingsEnabled } from '../embeddings.js';
import { refreshStats } from './status.js';
import { formatMemoryImportance, formatMemoryDate, formatWitnesses } from './formatting.js';
import { filterMemories, sortMemoriesByDate, getPaginationInfo, extractCharactersSet, buildCharacterStateData, buildRelationshipData } from './calculations.js';

// Pagination state for memory browser
let memoryBrowserPage = 0;
let memorySearchQuery = '';

// Event type icons mapping
const EVENT_TYPE_ICONS = {
    action: 'fa-solid fa-bolt',
    revelation: 'fa-solid fa-lightbulb',
    emotion_shift: 'fa-solid fa-heart',
    relationship_change: 'fa-solid fa-people-arrows',
    default: 'fa-solid fa-bookmark'
};

// =============================================================================
// Template Functions
// =============================================================================

/**
 * Get icon class for event type
 * @param {string} eventType - Event type
 * @returns {string} Font Awesome icon class
 */
function getEventTypeIcon(eventType) {
    return EVENT_TYPE_ICONS[eventType] || EVENT_TYPE_ICONS.default;
}

/**
 * Get valence indicator class
 * @param {number} valence - Emotional valence (-1 to 1)
 * @returns {string} CSS class for valence indicator
 */
function getValenceClass(valence) {
    if (valence > 0.3) return 'positive';
    if (valence < -0.3) return 'negative';
    return 'neutral';
}

/**
 * Render a single memory item as a card
 * @param {Object} memory - Memory object
 * @returns {string} HTML string
 */
function renderMemoryItemTemplate(memory) {
    const typeClass = (memory.event_type || 'action').replace(/[^a-zA-Z0-9-]/g, '');
    const importance = memory.importance || 3;
    const stars = formatMemoryImportance(importance);
    const date = formatMemoryDate(memory.created_at);
    const witnessText = formatWitnesses(memory.witnesses);
    const iconClass = getEventTypeIcon(memory.event_type);
    const location = memory.location || '';
    const needsEmbed = !memory.embedding && isEmbeddingsEnabled();
    const isPinned = memory.pinned === true;

    // Build badges
    const badges = [];

    // Pinned badge comes first
    if (isPinned) {
        badges.push(`<span class="memoryvault-memory-card-badge pinned" title="Pinned - always included in context"><i class="fa-solid fa-thumbtack"></i></span>`);
    }

    badges.push(`<span class="memoryvault-memory-card-badge importance">${stars}</span>`);
    if (needsEmbed) {
        badges.push(`<span class="memoryvault-memory-card-badge pending-embed" title="Embedding pending"><i class="fa-solid fa-rotate-right"></i></span>`);
    }
    if (witnessText) {
        badges.push(`<span class="memoryvault-memory-card-badge witness"><i class="fa-solid fa-eye"></i> ${escapeHtml(witnessText)}</span>`);
    }
    if (location) {
        badges.push(`<span class="memoryvault-memory-card-badge location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(location)}</span>`);
    }

    // Emotional valence indicator
    const valence = memory.emotional_valence || 0;
    const valenceClass = getValenceClass(valence);
    badges.push(`<span class="memoryvault-memory-card-badge valence ${valenceClass}" title="Emotional valence: ${valence.toFixed(1)}"><i class="fa-solid fa-heart-pulse"></i></span>`);

    // Build character tags
    const characters = (memory.characters_involved || [])
        .map(c => `<span class="memoryvault-character-tag">${escapeHtml(c)}</span>`)
        .join('');

    // Build emotional tone tags
    const emotionalTones = (memory.emotional_tone || [])
        .map(tone => `<span class="memoryvault-emotion-tag">${escapeHtml(tone)}</span>`)
        .join('');

    const pinnedClass = isPinned ? ' pinned' : '';
    const pinIcon = isPinned ? 'fa-solid fa-thumbtack' : 'fa-regular fa-thumbtack';
    const pinTitle = isPinned ? 'Unpin memory' : 'Pin memory (always include in context)';

    return `
        <div class="memoryvault-memory-card ${typeClass}${pinnedClass}" data-id="${escapeHtml(memory.id)}">
            <div class="memoryvault-memory-card-header">
                <div class="memoryvault-memory-card-icon ${typeClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="memoryvault-memory-card-meta">
                    <span class="memoryvault-memory-card-type">${escapeHtml(memory.event_type || 'event')}</span>
                    <span class="memoryvault-memory-card-date">${escapeHtml(date)}</span>
                </div>
            </div>
            <div class="memoryvault-memory-card-summary">${escapeHtml(memory.summary || 'No summary')}</div>
            ${emotionalTones ? `<div class="memoryvault-memory-emotions">${emotionalTones}</div>` : ''}
            <div class="memoryvault-memory-card-footer">
                <div class="memoryvault-memory-card-badges">
                    ${badges.join('')}
                </div>
                <div>
                    <button class="menu_button memoryvault-pin-memory${isPinned ? ' pinned' : ''}" data-id="${escapeHtml(memory.id)}" title="${pinTitle}">
                        <i class="${pinIcon}"></i>
                    </button>
                    <button class="menu_button memoryvault-edit-memory" data-id="${escapeHtml(memory.id)}" title="Edit memory">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="menu_button memoryvault-delete-memory" data-id="${escapeHtml(memory.id)}" title="Delete memory">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            ${characters ? `<div class="memoryvault-memory-characters" style="margin-top: 8px;">${characters}</div>` : ''}
        </div>
    `;
}

// Event type options for edit dropdown
const EVENT_TYPES = ['action', 'revelation', 'emotion_shift', 'relationship_change'];

/**
 * Render edit mode template for a memory
 * @param {Object} memory - Memory object
 * @returns {string} HTML string
 */
function renderMemoryEditTemplate(memory) {
    const typeClass = (memory.event_type || 'action').replace(/[^a-zA-Z0-9-]/g, '');
    const importance = memory.importance || 3;
    const eventType = memory.event_type || 'action';

    const importanceOptions = [1, 2, 3, 4, 5]
        .map(i => `<option value="${i}"${i === importance ? ' selected' : ''}>${i}</option>`)
        .join('');

    const typeOptions = EVENT_TYPES
        .map(t => `<option value="${t}"${t === eventType ? ' selected' : ''}>${t.replace('_', ' ')}</option>`)
        .join('');

    return `
        <div class="memoryvault-memory-card ${typeClass}" data-id="${escapeHtml(memory.id)}">
            <div class="memoryvault-edit-form">
                <textarea class="memoryvault-edit-textarea" data-field="summary">${escapeHtml(memory.summary || '')}</textarea>
                <div class="memoryvault-edit-row">
                    <label>
                        Importance
                        <select data-field="importance">${importanceOptions}</select>
                    </label>
                    <label>
                        Event Type
                        <select data-field="event_type">${typeOptions}</select>
                    </label>
                </div>
                <div class="memoryvault-edit-actions">
                    <button class="menu_button memoryvault-cancel-edit" data-id="${escapeHtml(memory.id)}">
                        <i class="fa-solid fa-times"></i> Cancel
                    </button>
                    <button class="menu_button memoryvault-save-edit" data-id="${escapeHtml(memory.id)}">
                        <i class="fa-solid fa-check"></i> Save
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a single character state as HTML
 * @param {Object} charData - Character state data from buildCharacterStateData
 * @returns {string} HTML string
 */
function renderCharacterStateTemplate(charData) {
    return `
        <div class="memoryvault-character-item">
            <div class="memoryvault-character-name">${escapeHtml(charData.name)}</div>
            <div class="memoryvault-emotion">
                <span class="memoryvault-emotion-label">${escapeHtml(charData.emotion)}${charData.emotionSource || ''}</span>
                <div class="memoryvault-emotion-bar">
                    <div class="memoryvault-emotion-fill" style="width: ${charData.intensityPercent}%"></div>
                </div>
            </div>
            <div class="memoryvault-memory-witnesses">Known events: ${charData.knownCount}</div>
        </div>
    `;
}

/**
 * Render a single relationship as HTML
 * Now displays all relationship dimensions
 * @param {Object} relData - Relationship data from buildRelationshipData
 * @returns {string} HTML string
 */
function renderRelationshipTemplate(relData) {
    return `
        <div class="memoryvault-relationship-item">
            <div class="memoryvault-relationship-pair">${escapeHtml(relData.characterA)} \u2194 ${escapeHtml(relData.characterB)}</div>
            <div class="memoryvault-relationship-type">${escapeHtml(relData.type)}</div>
            <div class="memoryvault-relationship-bars">
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Trust</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill trust" style="width: ${relData.trustPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.trust}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Tension</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill tension" style="width: ${relData.tensionPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.tension}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Respect</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill respect" style="width: ${relData.respectPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.respect}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Attraction</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill attraction" style="width: ${relData.attractionPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.attraction}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Fear</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill fear" style="width: ${relData.fearPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.fear}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Loyalty</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill loyalty" style="width: ${relData.loyaltyPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.loyalty}</span>
                </div>
                <div class="memoryvault-bar-row">
                    <span class="memoryvault-bar-label">Familiarity</span>
                    <div class="memoryvault-bar-container">
                        <div class="memoryvault-bar-fill familiarity" style="width: ${relData.familiarityPercent}%"></div>
                    </div>
                    <span class="memoryvault-bar-value">${relData.familiarity}</span>
                </div>
            </div>
        </div>
    `;
}

// =============================================================================
// Initialization & Navigation
// =============================================================================

/**
 * Initialize browser event handlers using event delegation.
 * Call once after HTML is loaded.
 */
export function initBrowser() {
    const $list = $('#memoryvault_memory_list');

    // Event delegation: attach once to container, not per-render to children
    $list.on('click', '.memoryvault-delete-memory', async function() {
        const id = $(this).data('id');
        await deleteMemory(id);
    });

    // Pin button - toggle pinned status
    $list.on('click', '.memoryvault-pin-memory', async function() {
        const id = $(this).data('id');
        const $btn = $(this);
        $btn.prop('disabled', true);

        const toggled = await togglePinAction(id);
        if (toggled) {
            // Re-render the card with updated pin state
            const memory = getMemoryById(id);
            if (memory) {
                const $card = $btn.closest('.memoryvault-memory-card');
                $card.replaceWith(renderMemoryItemTemplate(memory));
            }
            const status = memory?.pinned ? 'Pinned' : 'Unpinned';
            showToast('success', `${status} memory`);
        }
        $btn.prop('disabled', false);
    });

    // Edit button - swap to edit mode
    $list.on('click', '.memoryvault-edit-memory', function() {
        const id = $(this).data('id');
        const memory = getMemoryById(id);
        if (memory) {
            const $card = $(this).closest('.memoryvault-memory-card');
            $card.replaceWith(renderMemoryEditTemplate(memory));
        }
    });

    // Cancel edit - restore view mode
    $list.on('click', '.memoryvault-cancel-edit', function() {
        const id = $(this).data('id');
        const memory = getMemoryById(id);
        if (memory) {
            const $card = $(this).closest('.memoryvault-memory-card');
            $card.replaceWith(renderMemoryItemTemplate(memory));
        }
    });

    // Save edit - update memory and auto-embed
    $list.on('click', '.memoryvault-save-edit', async function() {
        const id = $(this).data('id');
        const $card = $(this).closest('.memoryvault-memory-card');
        const $btn = $(this);

        // Gather values
        const summary = $card.find('[data-field="summary"]').val().trim();
        const importance = parseInt($card.find('[data-field="importance"]').val(), 10);
        const event_type = $card.find('[data-field="event_type"]').val();

        if (!summary) {
            showToast('warning', 'Summary cannot be empty');
            return;
        }

        // Disable button during save
        $btn.prop('disabled', true);

        const updated = await updateMemoryAction(id, { summary, importance, event_type });
        if (updated) {
            // Auto-generate embedding if summary changed
            const memory = getMemoryById(id);
            if (memory && !memory.embedding && isEmbeddingsEnabled()) {
                const embedding = await getEmbedding(summary);
                if (embedding) {
                    memory.embedding = embedding;
                    await getDeps().saveChatConditional();
                }
            }

            // Re-render card in view mode
            const updatedMemory = getMemoryById(id);
            if (updatedMemory) {
                $card.replaceWith(renderMemoryItemTemplate(updatedMemory));
            }
            showToast('success', 'Memory updated');
            refreshStats();
        }
        $btn.prop('disabled', false);
    });

    // Search input handler with debounce
    let searchTimeout;
    $('#memoryvault_memory_search').on('input', function() {
        clearTimeout(searchTimeout);
        const query = $(this).val();
        searchTimeout = setTimeout(() => {
            memorySearchQuery = query.toLowerCase().trim();
            memoryBrowserPage = 0;
            renderMemoryBrowser();
        }, 200);
    });
}

/**
 * Get memory by ID from current data
 * @param {string} id - Memory ID
 * @returns {Object|null} Memory object or null
 */
function getMemoryById(id) {
    const data = getOpenVaultData();
    if (!data) return null;
    return data[MEMORIES_KEY]?.find(m => m.id === id) || null;
}

/**
 * Reset memory browser page (called on chat change)
 */
export function resetMemoryBrowserPage() {
    memoryBrowserPage = 0;
}

/**
 * Navigate to previous page
 */
export function prevPage() {
    if (memoryBrowserPage > 0) {
        memoryBrowserPage--;
        renderMemoryBrowser();
    }
}

/**
 * Navigate to next page
 */
export function nextPage() {
    memoryBrowserPage++;
    renderMemoryBrowser();
}

/**
 * Reset page and re-render (for filter changes)
 */
export function resetAndRender() {
    memoryBrowserPage = 0;
    renderMemoryBrowser();
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Filter memories by search query
 * @param {Object[]} memories - Array of memories
 * @param {string} query - Search query (lowercase)
 * @returns {Object[]} Filtered memories
 */
function filterBySearch(memories, query) {
    if (!query) return memories;
    return memories.filter(m => {
        const summary = (m.summary || '').toLowerCase();
        const characters = (m.characters_involved || []).join(' ').toLowerCase();
        const location = (m.location || '').toLowerCase();
        const eventType = (m.event_type || '').toLowerCase();
        return summary.includes(query) ||
               characters.includes(query) ||
               location.includes(query) ||
               eventType.includes(query);
    });
}

/**
 * Filter memories by emotional tone
 * @param {Object[]} memories - Array of memories
 * @param {string} emotionFilter - Emotion tag to filter by
 * @returns {Object[]} Filtered memories
 */
function filterByEmotion(memories, emotionFilter) {
    if (!emotionFilter) return memories;
    return memories.filter(m => {
        const tones = m.emotional_tone || [];
        return tones.some(t => t.toLowerCase() === emotionFilter.toLowerCase());
    });
}

/**
 * Filter memories by emotional valence
 * @param {Object[]} memories - Array of memories
 * @param {string} valenceFilter - Valence category ('positive', 'neutral', 'negative')
 * @returns {Object[]} Filtered memories
 */
function filterByValence(memories, valenceFilter) {
    if (!valenceFilter) return memories;
    return memories.filter(m => {
        const valence = m.emotional_valence || 0;
        if (valenceFilter === 'positive') return valence > 0.3;
        if (valenceFilter === 'negative') return valence < -0.3;
        if (valenceFilter === 'neutral') return valence >= -0.3 && valence <= 0.3;
        return true;
    });
}

/**
 * Render the memory browser list
 */
export function renderMemoryBrowser() {
    const data = getOpenVaultData();
    if (!data) {
        $('#memoryvault_memory_list').html('<p class="memoryvault-placeholder">No chat loaded</p>');
        $('#memoryvault_page_info').text('Page 0 / 0');
        return;
    }

    const memories = data[MEMORIES_KEY] || [];
    const $list = $('#memoryvault_memory_list');
    const $pageInfo = $('#memoryvault_page_info');
    const $prevBtn = $('#memoryvault_prev_page');
    const $nextBtn = $('#memoryvault_next_page');

    // Get filter values
    const typeFilter = $('#memoryvault_filter_type').val();
    const characterFilter = $('#memoryvault_filter_character').val();
    const emotionFilter = $('#memoryvault_filter_emotion').val();
    const valenceFilter = $('#memoryvault_filter_valence').val();

    // Filter, search, and sort using pure functions
    let filteredMemories = filterMemories(memories, typeFilter, characterFilter);
    filteredMemories = filterByEmotion(filteredMemories, emotionFilter);
    filteredMemories = filterByValence(filteredMemories, valenceFilter);
    filteredMemories = filterBySearch(filteredMemories, memorySearchQuery);
    filteredMemories = sortMemoriesByDate(filteredMemories);

    // Pagination using pure function
    const pagination = getPaginationInfo(filteredMemories.length, memoryBrowserPage, MEMORIES_PER_PAGE);
    memoryBrowserPage = pagination.currentPage;
    const pageMemories = filteredMemories.slice(pagination.startIdx, pagination.endIdx);

    // Render memories using template
    if (pageMemories.length === 0) {
        const message = memorySearchQuery ? 'No memories match your search' : 'No memories yet';
        $list.html(`<p class="memoryvault-placeholder">${message}</p>`);
    } else {
        const html = pageMemories.map(renderMemoryItemTemplate).join('');
        $list.html(html);
    }

    // Update pagination
    $pageInfo.text(`Page ${pagination.currentPage + 1} of ${pagination.totalPages}`);
    $prevBtn.prop('disabled', !pagination.hasPrev);
    $nextBtn.prop('disabled', !pagination.hasNext);

    // Populate character filter dropdown
    populateCharacterFilter();
}

/**
 * Delete a memory by ID (UI wrapper for data action)
 * @param {string} id - Memory ID to delete
 */
async function deleteMemory(id) {
    const deleted = await deleteMemoryAction(id);
    if (deleted) {
        refreshAllUI();
        showToast('success', 'Memory deleted');
    }
}

/**
 * Populate the character filter dropdown
 */
export function populateCharacterFilter() {
    const data = getOpenVaultData();
    if (!data) {
        $('#memoryvault_filter_character').find('option:not(:first)').remove();
        return;
    }

    const memories = data[MEMORIES_KEY] || [];
    const characters = extractCharactersSet(memories);

    const $filter = $('#memoryvault_filter_character');
    const currentValue = $filter.val();
    $filter.find('option:not(:first)').remove();

    if (characters.length > 0) {
        const optionsHtml = characters
            .map(char => `<option value="${escapeHtml(char)}">${escapeHtml(char)}</option>`)
            .join('');
        $filter.append(optionsHtml);
    }

    // Restore selection if still valid
    if (currentValue && characters.includes(currentValue)) {
        $filter.val(currentValue);
    }
}

/**
 * Render character states
 */
export function renderCharacterStates() {
    const data = getOpenVaultData();
    const $container = $('#memoryvault_character_states');

    if (!data) {
        $container.html('<p class="memoryvault-placeholder">No chat loaded</p>');
        return;
    }

    const characters = data[CHARACTERS_KEY] || {};
    const charNames = Object.keys(characters);

    if (charNames.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No character data yet</p>');
        return;
    }

    const html = charNames
        .sort()
        .map(name => renderCharacterStateTemplate(buildCharacterStateData(name, characters[name])))
        .join('');

    $container.html(html);
}

/**
 * Render relationships
 */
export function renderRelationships() {
    const data = getOpenVaultData();
    const $container = $('#memoryvault_relationships');

    if (!data) {
        $container.html('<p class="memoryvault-placeholder">No chat loaded</p>');
        return;
    }

    const relationships = data[RELATIONSHIPS_KEY] || {};
    const relKeys = Object.keys(relationships);

    if (relKeys.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No relationship data yet</p>');
        return;
    }

    const html = relKeys
        .sort()
        .map(key => renderRelationshipTemplate(buildRelationshipData(key, relationships[key])))
        .join('');

    $container.html(html);
}

// =============================================================================
// Memory Timeline
// =============================================================================

/**
 * Group memories by date for timeline display
 * @param {Object[]} memories - Array of memories
 * @returns {Map<string, Object[]>} Memories grouped by date string
 */
function groupMemoriesByDate(memories) {
    const groups = new Map();

    for (const memory of memories) {
        const timestamp = memory.created_at || 0;
        const date = new Date(timestamp);
        const dateKey = timestamp === 0 ? 'Unknown' : date.toLocaleDateString();

        if (!groups.has(dateKey)) {
            groups.set(dateKey, []);
        }
        groups.get(dateKey).push(memory);
    }

    return groups;
}

/**
 * Render a single timeline item
 * @param {Object} memory - Memory object
 * @returns {string} HTML string
 */
function renderTimelineItemTemplate(memory) {
    const typeClass = (memory.event_type || 'action').replace(/[^a-zA-Z0-9-]/g, '');
    const date = formatMemoryDate(memory.created_at);
    const isPinned = memory.pinned === true;
    const pinnedClass = isPinned ? ' pinned' : '';

    // Build character tags
    const characters = (memory.characters_involved || [])
        .slice(0, 3) // Limit to 3 for timeline
        .map(c => `<span class="memoryvault-character-tag">${escapeHtml(c)}</span>`)
        .join('');

    // Build emotion tags (limit to 2 for timeline)
    const emotions = (memory.emotional_tone || [])
        .slice(0, 2)
        .map(e => `<span class="memoryvault-emotion-tag">${escapeHtml(e)}</span>`)
        .join('');

    // Truncate summary for timeline view
    let summary = memory.summary || 'No summary';
    if (summary.length > 120) {
        summary = summary.substring(0, 117) + '...';
    }

    return `
        <div class="memoryvault-timeline-item ${typeClass}${pinnedClass}" data-id="${escapeHtml(memory.id)}">
            <div class="memoryvault-timeline-card">
                <div class="memoryvault-timeline-header">
                    <span class="memoryvault-timeline-date">${escapeHtml(date)}</span>
                    <span class="memoryvault-timeline-type">${escapeHtml(memory.event_type || 'event')}</span>
                </div>
                <div class="memoryvault-timeline-summary">${escapeHtml(summary)}</div>
                ${(characters || emotions) ? `
                    <div class="memoryvault-timeline-meta">
                        ${characters}${emotions}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Render date separator for timeline
 * @param {string} dateStr - Date string
 * @returns {string} HTML string
 */
function renderTimelineSeparator(dateStr) {
    return `
        <div class="memoryvault-timeline-separator">
            <span class="memoryvault-timeline-separator-text">${escapeHtml(dateStr)}</span>
        </div>
    `;
}

/**
 * Render the memory timeline visualization
 */
export function renderTimeline() {
    const data = getOpenVaultData();
    const $container = $('#memoryvault_timeline');

    if (!data) {
        $container.html('<p class="memoryvault-placeholder">No chat loaded</p>');
        return;
    }

    const memories = data[MEMORIES_KEY] || [];

    if (memories.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No memories to display</p>');
        return;
    }

    // Sort by date (oldest first for timeline - chronological order)
    const sortedMemories = [...memories].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    // Group by date
    const groups = groupMemoriesByDate(sortedMemories);

    // Build HTML
    let html = '';
    for (const [dateStr, dateMemories] of groups) {
        html += renderTimelineSeparator(dateStr);
        for (const memory of dateMemories) {
            html += renderTimelineItemTemplate(memory);
        }
    }

    $container.html(html);
}

// =============================================================================
// Character Profiles
// =============================================================================

/**
 * Get valence class from emotion valence value
 * @param {number} valence - Valence value (-1 to 1)
 * @returns {string} CSS class
 */
function getEmotionValenceClass(valence) {
    if (valence > 0.2) return 'positive';
    if (valence < -0.2) return 'negative';
    return 'neutral';
}

/**
 * Render emotion history items
 * @param {Object[]} history - Emotion history array
 * @returns {string} HTML string
 */
function renderEmotionHistory(history) {
    if (!history || history.length === 0) {
        return '<span class="memoryvault-placeholder" style="font-size: 0.8em; padding: 0;">No history yet</span>';
    }

    // Show last 8 emotions (most recent first)
    const recentHistory = [...history].reverse().slice(0, 8);

    return recentHistory.map(entry => {
        const valenceClass = getEmotionValenceClass(entry.valence || 0);
        const sourceText = entry.message_range
            ? `msg ${entry.message_range.min}${entry.message_range.min !== entry.message_range.max ? `-${entry.message_range.max}` : ''}`
            : '';

        return `
            <div class="memoryvault-emotion-history-item ${valenceClass}">
                <span class="emotion-name">${escapeHtml(entry.emotion || 'neutral')}</span>
                ${sourceText ? `<span class="emotion-source">(${sourceText})</span>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Get relationships for a specific character
 * @param {Object} relationships - All relationships
 * @param {string} charName - Character name to find relationships for
 * @returns {Object[]} Relationships involving this character
 */
function getCharacterRelationships(relationships, charName) {
    if (!relationships) return [];

    return Object.entries(relationships)
        .filter(([_, rel]) =>
            rel.character_a === charName || rel.character_b === charName
        )
        .map(([key, rel]) => ({
            key,
            otherChar: rel.character_a === charName ? rel.character_b : rel.character_a,
            type: rel.relationship_type || 'acquaintance',
            trust: rel.trust_level ?? 5,
        }));
}

/**
 * Render character relationships summary
 * @param {Object[]} relationships - Character's relationships
 * @returns {string} HTML string
 */
function renderProfileRelationships(relationships) {
    if (relationships.length === 0) {
        return '<span class="memoryvault-placeholder" style="font-size: 0.8em; padding: 0;">No relationships</span>';
    }

    return relationships.map(rel => `
        <div class="memoryvault-profile-rel-item">
            <span class="memoryvault-profile-rel-name">${escapeHtml(rel.otherChar)}</span>
            <span class="memoryvault-profile-rel-type">${escapeHtml(rel.type)}</span>
            <div class="memoryvault-profile-rel-trust">
                <div class="memoryvault-profile-rel-trust-fill" style="width: ${rel.trust * 10}%"></div>
            </div>
        </div>
    `).join('');
}

/**
 * Render a single character profile
 * @param {string} name - Character name
 * @param {Object} charData - Character state data
 * @param {Object[]} charRelationships - Character's relationships
 * @returns {string} HTML string
 */
function renderCharacterProfileTemplate(name, charData, charRelationships) {
    const emotion = charData.current_emotion || 'neutral';
    const intensity = charData.emotion_intensity || 5;
    const knownCount = charData.known_events?.length || 0;
    const emotionHistory = charData.emotion_history || [];

    return `
        <div class="memoryvault-character-profile">
            <div class="memoryvault-profile-header">
                <div class="memoryvault-profile-name">
                    <i class="fa-solid fa-user"></i>
                    ${escapeHtml(name)}
                </div>
                <div class="memoryvault-profile-emotion">
                    <span class="memoryvault-profile-emotion-label">${escapeHtml(emotion)}</span>
                    <div class="memoryvault-profile-emotion-intensity">
                        <div class="memoryvault-profile-emotion-fill" style="width: ${intensity * 10}%"></div>
                    </div>
                </div>
            </div>
            <div class="memoryvault-profile-content">
                <div class="memoryvault-profile-section">
                    <div class="memoryvault-profile-section-title">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        Emotion History
                    </div>
                    <div class="memoryvault-emotion-history">
                        ${renderEmotionHistory(emotionHistory)}
                    </div>
                </div>

                <div class="memoryvault-profile-section">
                    <div class="memoryvault-profile-section-title">
                        <i class="fa-solid fa-brain"></i>
                        Known Events
                    </div>
                    <div class="memoryvault-known-events">
                        <span class="memoryvault-known-events-count">${knownCount}</span>
                        <span class="memoryvault-known-events-label">memories witnessed by ${escapeHtml(name)}</span>
                    </div>
                </div>

                <div class="memoryvault-profile-section">
                    <div class="memoryvault-profile-section-title">
                        <i class="fa-solid fa-heart"></i>
                        Relationships
                    </div>
                    <div class="memoryvault-profile-relationships">
                        ${renderProfileRelationships(charRelationships)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render character profiles panel
 */
export function renderCharacterProfiles() {
    const data = getOpenVaultData();
    const $container = $('#memoryvault_character_profiles');

    if (!data) {
        $container.html('<p class="memoryvault-placeholder">No chat loaded</p>');
        return;
    }

    const characters = data[CHARACTERS_KEY] || {};
    const relationships = data[RELATIONSHIPS_KEY] || {};
    const charNames = Object.keys(characters);

    if (charNames.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No character data yet</p>');
        return;
    }

    const html = charNames
        .sort()
        .map(name => {
            const charRelationships = getCharacterRelationships(relationships, name);
            return renderCharacterProfileTemplate(name, characters[name], charRelationships);
        })
        .join('');

    $container.html(html);
}

/**
 * Refresh all UI components
 */
export function refreshAllUI() {
    refreshStats();
    renderMemoryBrowser();
    renderCharacterStates();
    renderCharacterProfiles();
    renderRelationships();
    renderTimeline();
}
