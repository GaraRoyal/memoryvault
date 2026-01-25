/**
 * MemoryVault Story Summary System
 *
 * Generates narrative summaries from memories and allows injection into chat.
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, saveOpenVaultData, log, safeSetExtensionPrompt } from '../utils.js';
import { extensionName, MEMORIES_KEY, CHARACTERS_KEY, RELATIONSHIPS_KEY, SUMMARY_KEY } from '../constants.js';
import { callLLMForExtraction } from '../llm.js';

// Track if summary is currently injected into system prompt
let summaryInjected = false;

/**
 * Build a prompt to generate a story summary
 * @param {Object[]} memories - Memories to summarize
 * @param {Object} characters - Character states
 * @param {Object} relationships - Relationship data
 * @param {number} maxWords - Maximum words for summary
 * @returns {string} Prompt for LLM
 */
function buildSummaryPrompt(memories, characters, relationships, maxWords) {
    // Sort memories chronologically
    const sortedMemories = [...memories].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    // Build memory list
    const memoryLines = sortedMemories.map((m, i) => {
        const chars = (m.characters_involved || []).join(', ');
        const location = m.location ? ` at ${m.location}` : '';
        return `${i + 1}. [${m.event_type}] ${m.summary} (Characters: ${chars}${location})`;
    }).join('\n');

    // Build character info
    const charLines = Object.entries(characters).map(([name, data]) => {
        return `- ${name}: Currently ${data.current_emotion || 'neutral'}`;
    }).join('\n');

    // Build relationship info
    const relLines = Object.entries(relationships).map(([key, rel]) => {
        const trustDesc = rel.trust_level >= 7 ? 'high trust' : rel.trust_level <= 3 ? 'low trust' : 'moderate trust';
        const tensionDesc = rel.tension_level >= 5 ? ', high tension' : '';
        return `- ${rel.character_a} & ${rel.character_b}: ${rel.relationship_type || 'acquaintance'} (${trustDesc}${tensionDesc})`;
    }).join('\n');

    return `You are a narrative summarizer. Generate a cohesive story summary from the following events and character information.

<events>
${memoryLines}
</events>

<characters>
${charLines || 'No character data available'}
</characters>

<relationships>
${relLines || 'No relationship data available'}
</relationships>

<instructions>
Write a narrative summary of the story so far in ${maxWords} words or less.
- Write in past tense, third person
- Focus on key plot points and character development
- Maintain chronological flow
- Include important emotional beats
- Mention significant relationship changes
- Be engaging but concise
- Do NOT include speculation or events not in the provided data
</instructions>

Write the summary now:`;
}

/**
 * Generate a story summary using the LLM
 * @param {number} maxWords - Maximum words for summary (default 1000)
 * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
 */
export async function generateSummary(maxWords = 1000) {
    const data = getOpenVaultData();
    if (!data) {
        return { success: false, error: 'No chat data available' };
    }

    const memories = data[MEMORIES_KEY] || [];
    if (memories.length === 0) {
        return { success: false, error: 'No memories to summarize' };
    }

    const characters = data[CHARACTERS_KEY] || {};
    const relationships = data[RELATIONSHIPS_KEY] || {};

    const prompt = buildSummaryPrompt(memories, characters, relationships, maxWords);

    try {
        log('Generating story summary...');
        const result = await callLLMForExtraction(prompt);

        if (!result || typeof result !== 'string') {
            return { success: false, error: 'Failed to generate summary' };
        }

        // Clean up the result (remove any JSON formatting if present)
        let summary = result.trim();

        // Try to extract just the text if it came back as JSON
        try {
            const parsed = JSON.parse(summary);
            if (parsed.summary) {
                summary = parsed.summary;
            }
        } catch {
            // Not JSON, use as-is
        }

        // Store the summary
        data[SUMMARY_KEY] = data[SUMMARY_KEY] || {};
        data[SUMMARY_KEY].current = {
            text: summary,
            generated_at: Date.now(),
            memory_count: memories.length,
            word_count: summary.split(/\s+/).length,
        };

        // Keep history of last 5 summaries
        data[SUMMARY_KEY].history = data[SUMMARY_KEY].history || [];
        data[SUMMARY_KEY].history.unshift({
            text: summary,
            generated_at: Date.now(),
            memory_count: memories.length,
        });
        if (data[SUMMARY_KEY].history.length > 5) {
            data[SUMMARY_KEY].history = data[SUMMARY_KEY].history.slice(0, 5);
        }

        await saveOpenVaultData();
        log(`Summary generated: ${summary.split(/\s+/).length} words`);

        return { success: true, summary };
    } catch (error) {
        getDeps().console.error('[MemoryVault] Summary generation error:', error);
        return { success: false, error: error.message || 'Unknown error' };
    }
}

/**
 * Get the current stored summary
 * @returns {Object|null} Current summary object or null
 */
export function getCurrentSummary() {
    const data = getOpenVaultData();
    return data?.[SUMMARY_KEY]?.current || null;
}

/**
 * Get summary history
 * @returns {Object[]} Array of past summaries
 */
export function getSummaryHistory() {
    const data = getOpenVaultData();
    return data?.[SUMMARY_KEY]?.history || [];
}

/**
 * Inject summary into the chat as a system message
 * @param {string} summary - Summary text to inject
 * @returns {Promise<boolean>} Success status
 */
export async function injectSummaryToChat(summary) {
    if (!summary) {
        return false;
    }

    const deps = getDeps();
    const context = deps.getContext();

    if (!context || !context.chat) {
        return false;
    }

    try {
        // Create a formatted message
        const formattedSummary = `## Story Summary (MemoryVault)\n\n${summary}\n\n---\n*Generated from ${getCurrentSummary()?.memory_count || '?'} memories*`;

        // Use SillyTavern's message sending if available
        if (typeof deps.sendSystemMessage === 'function') {
            await deps.sendSystemMessage('generic', formattedSummary);
            return true;
        }

        // Fallback: add directly to chat array
        const message = {
            name: 'MemoryVault',
            is_user: false,
            is_system: true,
            mes: formattedSummary,
            send_date: new Date().toISOString(),
        };

        context.chat.push(message);
        await deps.saveChatConditional();

        return true;
    } catch (error) {
        getDeps().console.error('[MemoryVault] Failed to inject summary:', error);
        return false;
    }
}

/**
 * Delete the current summary
 * @returns {Promise<boolean>} Success status
 */
export async function deleteSummary() {
    const data = getOpenVaultData();
    if (!data || !data[SUMMARY_KEY]) {
        return false;
    }

    data[SUMMARY_KEY].current = null;
    await saveOpenVaultData();
    return true;
}

/**
 * Inject summary into the system prompt (invisible to user, visible to AI)
 * This uses a separate injection slot so it doesn't conflict with memory injection
 * @param {string} summary - Summary text to inject
 * @returns {boolean} Success status
 */
export function injectSummaryToPrompt(summary) {
    if (!summary) {
        return false;
    }

    try {
        const formattedSummary = `[Story Summary - Key events and context from earlier in this narrative]\n\n${summary}`;

        // Use extension prompt with a unique identifier for summary
        // This injects into the system prompt where the AI can read it
        const deps = getDeps();
        if (typeof deps.setExtensionPrompt === 'function') {
            deps.setExtensionPrompt(
                'memoryvault_summary',  // Unique key for summary injection
                formattedSummary,
                1,  // Extension prompt position (after main prompt)
                0   // Depth (0 = at the end of system prompt)
            );
            summaryInjected = true;
            log('Summary injected into system prompt (invisible)');
            return true;
        }

        return false;
    } catch (error) {
        getDeps().console.error('[MemoryVault] Failed to inject summary to prompt:', error);
        return false;
    }
}

/**
 * Remove summary from system prompt
 * @returns {boolean} Success status
 */
export function removeSummaryFromPrompt() {
    try {
        const deps = getDeps();
        if (typeof deps.setExtensionPrompt === 'function') {
            deps.setExtensionPrompt('memoryvault_summary', '', 1, 0);
            summaryInjected = false;
            log('Summary removed from system prompt');
            return true;
        }
        return false;
    } catch (error) {
        getDeps().console.error('[MemoryVault] Failed to remove summary from prompt:', error);
        return false;
    }
}

/**
 * Check if summary is currently injected into system prompt
 * @returns {boolean} Injection status
 */
export function isSummaryInjected() {
    return summaryInjected;
}

/**
 * Toggle summary injection in system prompt
 * @param {string} summary - Summary text
 * @returns {boolean} New injection state
 */
export function toggleSummaryInjection(summary) {
    if (summaryInjected) {
        removeSummaryFromPrompt();
        return false;
    } else {
        injectSummaryToPrompt(summary);
        return true;
    }
}
