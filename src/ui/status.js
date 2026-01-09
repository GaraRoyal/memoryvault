/**
 * MemoryVault Status & Stats UI
 *
 * Handles status indicator and statistics display.
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { getExtractedMessageIds } from '../extraction/scheduler.js';
import { MEMORIES_KEY, CHARACTERS_KEY, extensionName, defaultSettings } from '../constants.js';
import { getStatusText } from './formatting.js';
import { calculateExtractionStats, getBatchProgressInfo } from './calculations.js';

// Status icon mapping
const STATUS_ICONS = {
    ready: 'fa-solid fa-check',
    extracting: 'fa-solid fa-cog fa-spin',
    retrieving: 'fa-solid fa-magnifying-glass',
    error: 'fa-solid fa-triangle-exclamation'
};

// Status subtext mapping
const STATUS_SUBTEXT = {
    ready: 'MemoryVault is idle',
    extracting: 'Processing memories...',
    retrieving: 'Finding relevant memories...',
    error: 'An error occurred'
};

/**
 * Set the status indicator
 * @param {string} status - 'ready', 'extracting', 'retrieving', 'error'
 */
export function setStatus(status) {
    // Update legacy status badge
    const $indicator = $('#memoryvault_status');
    $indicator.removeClass('ready extracting retrieving error');
    $indicator.addClass(status);
    $indicator.text(getStatusText(status));

    // Update dashboard status card
    const $statusIndicator = $('#memoryvault_status_indicator');
    const $statusText = $('#memoryvault_status_text');
    const $statusSubtext = $('#memoryvault_status_subtext');

    $statusIndicator.removeClass('ready extracting retrieving error');
    $statusIndicator.addClass(status);
    $statusIndicator.html(`<i class="${STATUS_ICONS[status] || STATUS_ICONS.ready}"></i>`);

    $statusText.text(getStatusText(status));
    $statusSubtext.text(STATUS_SUBTEXT[status] || STATUS_SUBTEXT.ready);

    // Toggle working class on main container for animations
    const isWorking = status === 'extracting' || status === 'retrieving';
    $('#memoryvault_settings').toggleClass('working', isWorking);
}

/**
 * Update embedding status display
 * @param {string} statusText - Status text to display
 */
export function updateEmbeddingStatusDisplay(statusText) {
    const $containers = $('#memoryvault_embedding_status, #memoryvault_dashboard_embedding_status');
    const lowerStatus = statusText.toLowerCase();

    // Determine status type from text
    let statusClass = 'loading';
    let icon = 'fa-solid fa-circle-notch fa-spin';

    if (lowerStatus.includes('webgpu')) {
        statusClass = 'webgpu';
        icon = 'fa-solid fa-bolt';
    } else if (lowerStatus.includes('wasm') || lowerStatus.includes('cpu')) {
        statusClass = 'wasm';
        icon = 'fa-solid fa-microchip';
    } else if (lowerStatus.includes('ready') || lowerStatus.includes('loaded')) {
        statusClass = 'webgpu';
        icon = 'fa-solid fa-check';
    } else if (lowerStatus.includes('error') || lowerStatus.includes('failed')) {
        statusClass = 'wasm';
        icon = 'fa-solid fa-xmark';
    }

    $containers.removeClass('loading webgpu wasm');
    $containers.addClass(statusClass);
    $containers.html(`<i class="${icon}"></i> <span>${statusText}</span>`);
}

/**
 * Refresh statistics display
 */
export function refreshStats() {
    const data = getOpenVaultData();
    if (!data) {
        // Update new stat cards
        $('#memoryvault_stat_events').text('0');
        $('#memoryvault_stat_embeddings').text('0');
        $('#memoryvault_stat_characters').text('0');
        // Update legacy badges
        $('#memoryvault_stat_events_badge').text('0 events');
        $('#memoryvault_stat_embeddings_badge').text('0 embeddings');
        $('#memoryvault_stat_characters_badge').text('0 chars');
        // Update progress
        $('#memoryvault_batch_progress_fill').css('width', '0%');
        $('#memoryvault_batch_progress_label').text('No chat');
        return;
    }

    const memories = data[MEMORIES_KEY] || [];
    const eventCount = memories.length;
    const embeddingCount = memories.filter(m => m.embedding?.length > 0).length;
    const charCount = Object.keys(data[CHARACTERS_KEY] || {}).length;

    // Update new stat cards
    $('#memoryvault_stat_events').text(eventCount);
    $('#memoryvault_stat_embeddings').text(embeddingCount);
    $('#memoryvault_stat_characters').text(charCount);

    // Update legacy badges
    $('#memoryvault_stat_events_badge').text(`${eventCount} events`);
    $('#memoryvault_stat_embeddings_badge').text(`${embeddingCount} embeddings`);
    $('#memoryvault_stat_characters_badge').text(`${charCount} chars`);

    // Calculate batch progress
    const settings = getDeps().getExtensionSettings()[extensionName];
    const messageCount = settings?.messagesPerExtraction || defaultSettings.messagesPerExtraction;
    const bufferSize = settings?.extractionBuffer ?? defaultSettings.extractionBuffer;

    const context = getDeps().getContext();
    const chat = context.chat || [];
    const extractedMessageIds = getExtractedMessageIds(data);

    const stats = calculateExtractionStats(chat, extractedMessageIds, messageCount, bufferSize);
    const progressInfo = getBatchProgressInfo(stats);

    // Update batch progress bar
    $('#memoryvault_batch_progress_fill').css('width', `${progressInfo.percentage}%`);
    $('#memoryvault_batch_progress_label').text(progressInfo.label);

    log(`Stats: ${eventCount} memories, ${embeddingCount} embeddings, ${charCount} characters`);
}
