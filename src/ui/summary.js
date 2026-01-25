/**
 * MemoryVault Summary UI
 *
 * Handles the Summary tab interface for generating and managing story summaries.
 */

import { showToast } from '../utils.js';
import { generateSummary, getCurrentSummary, getSummaryHistory, injectSummaryToChat } from '../systems/summary.js';

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
 * Render the current summary display
 */
export function renderCurrentSummary() {
    const summary = getCurrentSummary();
    const $content = $('#memoryvault_summary_content');
    const $meta = $('#memoryvault_summary_meta');
    const $injectBtn = $('#memoryvault_inject_summary_btn');

    if (!summary || !summary.text) {
        $content.html('<p class="memoryvault-placeholder">No summary generated yet. Click "Generate Summary" to create one.</p>');
        $meta.text('');
        $injectBtn.prop('disabled', true);
        return;
    }

    $content.text(summary.text);
    $meta.text(`${summary.word_count} words | ${summary.memory_count} memories | ${formatDate(summary.generated_at)}`);
    $injectBtn.prop('disabled', false);
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
 * Handle injecting summary to chat
 */
async function handleInjectSummary() {
    const summary = getCurrentSummary();
    if (!summary || !summary.text) {
        showToast('warning', 'No summary to inject');
        return;
    }

    const $btn = $('#memoryvault_inject_summary_btn');
    $btn.prop('disabled', true);

    try {
        const success = await injectSummaryToChat(summary.text);

        if (success) {
            showToast('success', 'Summary injected to chat');
        } else {
            showToast('error', 'Failed to inject summary');
        }
    } catch (error) {
        showToast('error', 'Failed to inject summary');
    } finally {
        $btn.prop('disabled', false);
    }
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

    // Inject button
    $('#memoryvault_inject_summary_btn').on('click', handleInjectSummary);

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
}
