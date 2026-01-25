/**
 * MemoryVault Summary UI
 *
 * Handles the Summary tab interface for generating and managing story summaries.
 */

import { showToast } from '../utils.js';
import {
    generateSummary,
    getCurrentSummary,
    getSummaryHistory,
    injectSummaryToChat,
    injectSummaryToPrompt,
    removeSummaryFromPrompt,
    isSummaryInjected
} from '../systems/summary.js';

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

/**
 * Escape HTML for safe display
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Update the summary status display
 * @param {string} message - Status message
 * @param {string} type - Status type (loading, success, error)
 */
function setStatus(message, type = 'loading') {
    const $status = $('#memoryvault_summary_status');
    $status.text(message);
    $status.removeClass('loading success error visible');
    if (message) {
        $status.addClass(type).addClass('visible');
    }
}

/**
 * Update the injection status indicator
 */
function updateInjectionStatus() {
    const $indicator = $('#memoryvault_injection_status');
    const $hiddenBtn = $('#memoryvault_inject_hidden_btn');

    if (isSummaryInjected()) {
        $indicator.addClass('active').text('Summary is active in system prompt (AI can read it)');
        $hiddenBtn.addClass('active').html('<i class="fa-solid fa-eye"></i> Remove from Prompt');
    } else {
        $indicator.removeClass('active').text('');
        $hiddenBtn.removeClass('active').html('<i class="fa-solid fa-eye-slash"></i> To Prompt (Hidden)');
    }
}

/**
 * Render the current summary display
 */
export function renderCurrentSummary() {
    const summary = getCurrentSummary();
    const $content = $('#memoryvault_summary_content');
    const $meta = $('#memoryvault_summary_meta');
    const $visibleBtn = $('#memoryvault_inject_visible_btn');
    const $hiddenBtn = $('#memoryvault_inject_hidden_btn');

    if (!summary || !summary.text) {
        $content.html('<p class="memoryvault-placeholder">No summary generated yet. Click "Generate Summary" to create one.</p>');
        $meta.text('');
        $visibleBtn.prop('disabled', true);
        $hiddenBtn.prop('disabled', true);
        return;
    }

    $content.text(summary.text);
    $meta.text(`${summary.word_count} words | ${summary.memory_count} memories | ${formatDate(summary.generated_at)}`);
    $visibleBtn.prop('disabled', false);
    $hiddenBtn.prop('disabled', false);

    // Update injection status indicator
    updateInjectionStatus();
}

/**
 * Render the summary history
 */
export function renderSummaryHistory() {
    const history = getSummaryHistory();
    const $container = $('#memoryvault_summary_history');

    if (!history || history.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No previous summaries</p>');
        return;
    }

    // Skip the first one (current summary is shown above)
    const pastSummaries = history.slice(1);

    if (pastSummaries.length === 0) {
        $container.html('<p class="memoryvault-placeholder">No previous summaries</p>');
        return;
    }

    const html = pastSummaries.map((item, index) => {
        const preview = item.text.length > 150 ? item.text.substring(0, 147) + '...' : item.text;
        const wordCount = item.text.split(/\s+/).length;

        return `
            <div class="memoryvault-summary-history-item" data-index="${index + 1}">
                <div class="history-date">${formatDate(item.generated_at)}</div>
                <div class="history-preview">${escapeHtml(preview)}</div>
                <div class="history-meta">${wordCount} words | ${item.memory_count} memories</div>
            </div>
        `;
    }).join('');

    $container.html(html);
}

/**
 * Handle summary generation
 */
async function handleGenerateSummary() {
    const $btn = $('#memoryvault_generate_summary_btn');
    const wordLimit = parseInt($('#memoryvault_summary_words').val(), 10) || 1000;

    // Disable button and show loading
    $btn.prop('disabled', true);
    $btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
    setStatus('Generating summary... This may take a moment.', 'loading');

    try {
        const result = await generateSummary(wordLimit);

        if (result.success) {
            setStatus(`Summary generated: ${result.summary.split(/\s+/).length} words`, 'success');
            showToast('success', 'Summary generated successfully');
            renderCurrentSummary();
            renderSummaryHistory();
        } else {
            setStatus(`Error: ${result.error}`, 'error');
            showToast('error', result.error || 'Failed to generate summary');
        }
    } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
        showToast('error', 'Failed to generate summary');
    } finally {
        $btn.prop('disabled', false);
        $btn.html('<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Summary');
    }
}

/**
 * Handle injecting summary to chat (visible)
 */
async function handleInjectVisible() {
    const summary = getCurrentSummary();
    if (!summary || !summary.text) {
        showToast('warning', 'No summary to inject');
        return;
    }

    const $btn = $('#memoryvault_inject_visible_btn');
    $btn.prop('disabled', true);

    try {
        const success = await injectSummaryToChat(summary.text);

        if (success) {
            showToast('success', 'Summary added to chat (visible)');
        } else {
            showToast('error', 'Failed to inject summary to chat');
        }
    } catch (error) {
        showToast('error', 'Failed to inject summary to chat');
    } finally {
        $btn.prop('disabled', false);
    }
}

/**
 * Handle toggling summary in system prompt (hidden)
 */
function handleToggleHidden() {
    const summary = getCurrentSummary();
    if (!summary || !summary.text) {
        showToast('warning', 'No summary to inject');
        return;
    }

    if (isSummaryInjected()) {
        // Remove from prompt
        const success = removeSummaryFromPrompt();
        if (success) {
            showToast('success', 'Summary removed from system prompt');
        } else {
            showToast('error', 'Failed to remove summary');
        }
    } else {
        // Inject to prompt
        const success = injectSummaryToPrompt(summary.text);
        if (success) {
            showToast('success', 'Summary injected to system prompt (AI can read it)');
        } else {
            showToast('error', 'Failed to inject summary to prompt');
        }
    }

    updateInjectionStatus();
}

/**
 * Handle clicking on a history item to view it
 * @param {number} index - History index
 */
function handleHistoryClick(index) {
    const history = getSummaryHistory();
    if (!history || !history[index]) return;

    const item = history[index];
    const $content = $('#memoryvault_summary_content');
    const $meta = $('#memoryvault_summary_meta');

    const wordCount = item.text.split(/\s+/).length;
    $content.text(item.text);
    $meta.text(`${wordCount} words | ${item.memory_count} memories | ${formatDate(item.generated_at)} (Historical)`);
}

/**
 * Initialize the Summary UI
 */
export function initSummary() {
    // Generate button
    $('#memoryvault_generate_summary_btn').on('click', handleGenerateSummary);

    // Visible injection button (to chat)
    $('#memoryvault_inject_visible_btn').on('click', handleInjectVisible);

    // Hidden injection button (to system prompt) - toggle
    $('#memoryvault_inject_hidden_btn').on('click', handleToggleHidden);

    // Word limit slider
    $('#memoryvault_summary_words').on('input', function() {
        const value = $(this).val();
        $('#memoryvault_summary_words_value').text(`${value} words`);
    });

    // History item clicks (event delegation)
    $('#memoryvault_summary_history').on('click', '.memoryvault-summary-history-item', function() {
        const index = parseInt($(this).data('index'), 10);
        handleHistoryClick(index);
    });
}

/**
 * Refresh the Summary UI
 */
export function refreshSummary() {
    renderCurrentSummary();
    renderSummaryHistory();
    updateInjectionStatus();
}
