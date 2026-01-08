/**
 * MemoryVault Auto-Hide
 *
 * Automatically hides old messages that have been extracted into memories.
 * Also handles unhiding messages when switching to branches.
 */

import { getDeps } from './deps.js';
import { getOpenVaultData, showToast, log } from './utils.js';
import { getExtractedMessageIds } from './extraction/scheduler.js';
import { extensionName } from './constants.js';

/**
 * Auto-hide old messages beyond the threshold
 * Hides messages in pairs (user-assistant) to maintain conversation coherence
 * Messages are marked with is_system=true which excludes them from context
 * IMPORTANT: Only hides messages that have already been extracted into memories
 */
export async function autoHideOldMessages() {
    const deps = getDeps();
    const settings = deps.getExtensionSettings()[extensionName];
    if (!settings.autoHideEnabled) return;

    const context = deps.getContext();
    const chat = context.chat || [];
    const threshold = settings.autoHideThreshold || 50;

    // Get messages that have been extracted into memories
    const data = getOpenVaultData();
    const extractedMessageIds = getExtractedMessageIds(data);

    // Get visible (non-hidden) messages with their original indices
    const visibleMessages = chat
        .map((m, idx) => ({ ...m, idx }))
        .filter(m => !m.is_system);

    // If we have fewer messages than threshold, nothing to hide
    if (visibleMessages.length <= threshold) return;

    // Calculate how many messages to hide
    const toHideCount = visibleMessages.length - threshold;

    // Round down to nearest even number (for pairs)
    const pairsToHide = Math.floor(toHideCount / 2);
    const messagesToHide = pairsToHide * 2;

    if (messagesToHide <= 0) return;

    // Hide the oldest messages, but ONLY if they've been extracted
    let hiddenCount = 0;
    let skippedCount = 0;
    for (let i = 0; i < messagesToHide && i < visibleMessages.length; i++) {
        const msgIdx = visibleMessages[i].idx;

        // Only hide if this message has been extracted into memories
        if (extractedMessageIds.has(msgIdx)) {
            chat[msgIdx].is_system = true;
            hiddenCount++;
        } else {
            skippedCount++;
        }
    }

    if (hiddenCount > 0) {
        await getDeps().saveChatConditional();
        log(`Auto-hid ${hiddenCount} messages (skipped ${skippedCount} not yet extracted) - threshold: ${threshold}`);
        showToast('info', `Auto-hid ${hiddenCount} old messages`);
    } else if (skippedCount > 0) {
        log(`Auto-hide: ${skippedCount} messages need extraction before hiding`);
    }
}

/**
 * Unhide messages that were hidden but now exceed the chat length.
 * This is used when switching to a branch - if the branch has fewer messages,
 * we need to unhide messages so the user can see the available history.
 *
 * Also recalculates what should be hidden based on the new chat length.
 *
 * @returns {{unhiddenCount: number, rehiddenCount: number}} Count of messages affected
 */
export async function unhideMessagesForBranch() {
    const deps = getDeps();
    const settings = deps.getExtensionSettings()[extensionName];
    const context = deps.getContext();
    const chat = context.chat || [];
    const chatLength = chat.length;

    if (chatLength === 0) {
        return { unhiddenCount: 0, rehiddenCount: 0 };
    }

    let unhiddenCount = 0;

    // First pass: Unhide ALL messages in the current chat
    // This resets the hide state for the branch
    for (let i = 0; i < chatLength; i++) {
        if (chat[i].is_system === true) {
            // Check if this was hidden by auto-hide (not a true system message)
            // True system messages usually have specific content patterns
            // Auto-hidden messages are regular user/assistant messages marked as system
            const isAutoHidden = chat[i].is_user !== undefined ||
                                 chat[i].name !== undefined;

            if (isAutoHidden) {
                chat[i].is_system = false;
                unhiddenCount++;
            }
        }
    }

    if (unhiddenCount > 0) {
        log(`Branch switch: Unhid ${unhiddenCount} messages for branch compatibility`);
    }

    // Second pass: Re-apply auto-hide based on new chat length if enabled
    // This will be handled by the normal auto-hide flow on next generation

    return { unhiddenCount, rehiddenCount: 0 };
}

/**
 * Check if auto-hide should run after branch switch
 * Schedules auto-hide to run after a short delay to let the UI settle
 */
export function scheduleAutoHideAfterBranchSwitch() {
    const deps = getDeps();
    const settings = deps.getExtensionSettings()[extensionName];

    if (!settings.autoHideEnabled) return;

    // Schedule auto-hide to run after cooldown period
    deps.setTimeout(async () => {
        await autoHideOldMessages();
    }, 2500); // Run after chat loading cooldown
}
