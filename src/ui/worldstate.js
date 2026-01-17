/**
 * MemoryVault World State UI
 *
 * Renders and manages the World State tab including:
 * - Secrets
 * - Locations
 * - Promises & Debts
 * - Character Goals
 * - Skills & Abilities
 */

import { getOpenVaultData } from '../utils.js';
import {
    SECRETS_KEY,
    LOCATIONS_KEY,
    PROMISES_KEY,
    GOALS_KEY,
    SKILLS_KEY,
} from '../constants.js';
import { PromiseStatus, fulfillPromise, breakPromise, forgivePromise } from '../systems/promises.js';
import { GoalStatus, completeGoal, abandonGoal } from '../systems/goals.js';

// Helper to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// =============================================================================
// SECRETS RENDERING
// =============================================================================

function renderSecretItem(secret) {
    const knownByList = (secret.known_by || []).join(', ') || 'Unknown';
    const revealedClass = secret.revealed_at ? ' revealed' : '';
    const revealedText = secret.revealed_at ? ' (Now public)' : '';

    return `
        <div class="memoryvault-secret-item${revealedClass}" data-id="${escapeHtml(secret.id)}">
            <div class="memoryvault-secret-content">${escapeHtml(secret.content)}</div>
            <div class="memoryvault-secret-meta">
                <span class="memoryvault-known-by">
                    <i class="fa-solid fa-eye"></i> Known by: ${escapeHtml(knownByList)}${revealedText}
                </span>
            </div>
        </div>
    `;
}

export function renderSecrets() {
    const data = getOpenVaultData();
    const $list = $('#memoryvault_secrets_list');
    const $count = $('#memoryvault_secrets_count');

    if (!data || !data[SECRETS_KEY]) {
        $list.html('<p class="memoryvault-placeholder">No secrets tracked yet</p>');
        $count.text('0');
        return;
    }

    const secrets = Object.values(data[SECRETS_KEY]);
    const activeSecrets = secrets.filter(s => !s.revealed_at);

    $count.text(activeSecrets.length);

    if (secrets.length === 0) {
        $list.html('<p class="memoryvault-placeholder">No secrets tracked yet</p>');
        return;
    }

    const html = secrets.map(renderSecretItem).join('');
    $list.html(html);
}

// =============================================================================
// LOCATIONS RENDERING
// =============================================================================

function renderLocationItem(location) {
    const memoryCount = location.memory_ids?.length || 0;
    const visitText = location.visit_count === 1 ? 'visit' : 'visits';

    return `
        <div class="memoryvault-location-item" data-id="${escapeHtml(location.id)}">
            <div class="memoryvault-location-header">
                <span class="memoryvault-location-name">
                    <i class="fa-solid fa-map-pin"></i> ${escapeHtml(location.name)}
                </span>
                <span class="memoryvault-location-visits">${location.visit_count} ${visitText}</span>
            </div>
            <div class="memoryvault-location-memories">
                <i class="fa-solid fa-brain"></i> ${memoryCount} memories here
            </div>
        </div>
    `;
}

export function renderLocations() {
    const data = getOpenVaultData();
    const $list = $('#memoryvault_locations_list');
    const $count = $('#memoryvault_locations_count');

    if (!data || !data[LOCATIONS_KEY]) {
        $list.html('<p class="memoryvault-placeholder">No locations tracked yet</p>');
        $count.text('0');
        return;
    }

    const locations = Object.values(data[LOCATIONS_KEY]);
    $count.text(locations.length);

    if (locations.length === 0) {
        $list.html('<p class="memoryvault-placeholder">No locations tracked yet</p>');
        return;
    }

    // Sort by visit count descending
    const sorted = locations.sort((a, b) => b.visit_count - a.visit_count);
    const html = sorted.map(renderLocationItem).join('');
    $list.html(html);
}

// =============================================================================
// PROMISES RENDERING
// =============================================================================

function renderPromiseItem(promise) {
    const statusClass = promise.status || 'pending';
    const statusText = promise.status ? promise.status.charAt(0).toUpperCase() + promise.status.slice(1) : 'Pending';

    const showActions = promise.status === PromiseStatus.PENDING;

    return `
        <div class="memoryvault-promise-item ${statusClass}" data-id="${escapeHtml(promise.id)}">
            <div class="memoryvault-promise-header">
                <span class="memoryvault-promise-parties">
                    ${escapeHtml(promise.from)} <i class="fa-solid fa-arrow-right"></i> ${escapeHtml(promise.to)}
                </span>
                <span class="memoryvault-promise-status ${statusClass}">${statusText}</span>
            </div>
            <div class="memoryvault-promise-content">"${escapeHtml(promise.content)}"</div>
            ${showActions ? `
                <div class="memoryvault-promise-actions">
                    <button class="menu_button memoryvault-fulfill-promise" data-id="${escapeHtml(promise.id)}">
                        <i class="fa-solid fa-check"></i> Fulfill
                    </button>
                    <button class="menu_button memoryvault-break-promise" data-id="${escapeHtml(promise.id)}">
                        <i class="fa-solid fa-x"></i> Broken
                    </button>
                    <button class="menu_button memoryvault-forgive-promise" data-id="${escapeHtml(promise.id)}">
                        <i class="fa-solid fa-heart"></i> Forgive
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

export function renderPromises() {
    const data = getOpenVaultData();
    const $list = $('#memoryvault_promises_list');
    const $count = $('#memoryvault_promises_count');
    const statusFilter = $('#memoryvault_promise_status_filter').val();

    if (!data || !data[PROMISES_KEY]) {
        $list.html('<p class="memoryvault-placeholder">No promises tracked yet</p>');
        $count.text('0');
        return;
    }

    let promises = Object.values(data[PROMISES_KEY]);
    const pendingCount = promises.filter(p => p.status === PromiseStatus.PENDING).length;
    $count.text(pendingCount);

    // Apply filter
    if (statusFilter) {
        promises = promises.filter(p => p.status === statusFilter);
    }

    if (promises.length === 0) {
        $list.html('<p class="memoryvault-placeholder">No promises match filter</p>');
        return;
    }

    // Sort by date (newest first), pending first
    const sorted = promises.sort((a, b) => {
        if (a.status === PromiseStatus.PENDING && b.status !== PromiseStatus.PENDING) return -1;
        if (a.status !== PromiseStatus.PENDING && b.status === PromiseStatus.PENDING) return 1;
        return b.made_at - a.made_at;
    });

    const html = sorted.map(renderPromiseItem).join('');
    $list.html(html);
}

// =============================================================================
// GOALS RENDERING
// =============================================================================

function renderGoalItem(characterName, goal) {
    const statusClass = goal.status || 'active';
    const priorityClass = goal.priority || 'medium';

    return `
        <div class="memoryvault-goal-item ${statusClass}" data-id="${escapeHtml(goal.id)}" data-character="${escapeHtml(characterName)}">
            <div class="memoryvault-goal-header">
                <span class="memoryvault-goal-character">
                    <i class="fa-solid fa-user"></i> ${escapeHtml(characterName)}
                </span>
                <span class="memoryvault-goal-priority ${priorityClass}">${priorityClass}</span>
            </div>
            <div class="memoryvault-goal-content">${escapeHtml(goal.goal)}</div>
            ${goal.motivation ? `<div class="memoryvault-goal-motivation">"${escapeHtml(goal.motivation)}"</div>` : ''}
        </div>
    `;
}

export function renderGoals() {
    const data = getOpenVaultData();
    const $list = $('#memoryvault_goals_list');
    const $count = $('#memoryvault_goals_count');
    const statusFilter = $('#memoryvault_goal_status_filter').val();

    if (!data || !data[GOALS_KEY]) {
        $list.html('<p class="memoryvault-placeholder">No goals tracked yet</p>');
        $count.text('0');
        return;
    }

    const goals = data[GOALS_KEY];
    let allGoals = [];

    for (const [charName, charGoals] of Object.entries(goals)) {
        for (const goal of charGoals) {
            allGoals.push({ character: charName, ...goal });
        }
    }

    const activeCount = allGoals.filter(g => g.status === GoalStatus.ACTIVE).length;
    $count.text(activeCount);

    // Apply filter
    if (statusFilter) {
        allGoals = allGoals.filter(g => g.status === statusFilter);
    }

    if (allGoals.length === 0) {
        $list.html('<p class="memoryvault-placeholder">No goals match filter</p>');
        return;
    }

    // Sort: active first, then by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = allGoals.sort((a, b) => {
        if (a.status === GoalStatus.ACTIVE && b.status !== GoalStatus.ACTIVE) return -1;
        if (a.status !== GoalStatus.ACTIVE && b.status === GoalStatus.ACTIVE) return 1;
        return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });

    const html = sorted.map(g => renderGoalItem(g.character, g)).join('');
    $list.html(html);
}

// =============================================================================
// SKILLS RENDERING
// =============================================================================

function renderSkillItem(characterName, skill) {
    const categoryClass = skill.category || 'other';
    const proficiencyClass = skill.proficiency || 'novice';

    return `
        <div class="memoryvault-skill-item" data-id="${escapeHtml(skill.id)}" data-character="${escapeHtml(characterName)}">
            <div class="memoryvault-skill-header">
                <span class="memoryvault-skill-name">
                    <i class="fa-solid fa-star"></i> ${escapeHtml(skill.skill)}
                </span>
                <span class="memoryvault-skill-category ${categoryClass}">${escapeHtml(categoryClass)}</span>
            </div>
            <div class="memoryvault-skill-character">${escapeHtml(characterName)}</div>
            <div class="memoryvault-skill-proficiency">
                <span class="memoryvault-skill-proficiency-label">${escapeHtml(proficiencyClass)}</span>
                <div class="memoryvault-skill-proficiency-bar">
                    <div class="memoryvault-skill-proficiency-fill ${proficiencyClass}"></div>
                </div>
            </div>
            ${skill.source && skill.source !== 'unknown' ? `<div class="memoryvault-skill-source">Learned: ${escapeHtml(skill.source)}</div>` : ''}
        </div>
    `;
}

export function renderSkills() {
    const data = getOpenVaultData();
    const $list = $('#memoryvault_skills_list');
    const $count = $('#memoryvault_skills_count');
    const categoryFilter = $('#memoryvault_skill_category_filter').val();

    if (!data || !data[SKILLS_KEY]) {
        $list.html('<p class="memoryvault-placeholder">No skills tracked yet</p>');
        $count.text('0');
        return;
    }

    const skills = data[SKILLS_KEY];
    let allSkills = [];

    for (const [charName, charSkills] of Object.entries(skills)) {
        for (const skill of charSkills) {
            allSkills.push({ character: charName, ...skill });
        }
    }

    $count.text(allSkills.length);

    // Apply filter
    if (categoryFilter) {
        allSkills = allSkills.filter(s => s.category === categoryFilter);
    }

    if (allSkills.length === 0) {
        $list.html('<p class="memoryvault-placeholder">No skills match filter</p>');
        return;
    }

    // Sort by character, then skill name
    const sorted = allSkills.sort((a, b) => {
        if (a.character !== b.character) return a.character.localeCompare(b.character);
        return a.skill.localeCompare(b.skill);
    });

    const html = sorted.map(s => renderSkillItem(s.character, s)).join('');
    $list.html(html);
}

// =============================================================================
// WORLD STATE SUMMARY
// =============================================================================

export function updateWorldStateSummary() {
    const data = getOpenVaultData();

    if (!data) {
        $('#memoryvault_active_secrets').text('0');
        $('#memoryvault_total_locations').text('0');
        $('#memoryvault_pending_promises').text('0');
        $('#memoryvault_active_goals').text('0');
        $('#memoryvault_total_skills').text('0');
        return;
    }

    // Secrets
    const secrets = Object.values(data[SECRETS_KEY] || {});
    const activeSecrets = secrets.filter(s => !s.revealed_at).length;
    $('#memoryvault_active_secrets').text(activeSecrets);

    // Locations
    const locations = Object.values(data[LOCATIONS_KEY] || {});
    $('#memoryvault_total_locations').text(locations.length);

    // Promises
    const promises = Object.values(data[PROMISES_KEY] || {});
    const pendingPromises = promises.filter(p => p.status === PromiseStatus.PENDING).length;
    $('#memoryvault_pending_promises').text(pendingPromises);

    // Goals
    const goals = data[GOALS_KEY] || {};
    let activeGoals = 0;
    for (const charGoals of Object.values(goals)) {
        activeGoals += charGoals.filter(g => g.status === GoalStatus.ACTIVE).length;
    }
    $('#memoryvault_active_goals').text(activeGoals);

    // Skills
    const skills = data[SKILLS_KEY] || {};
    let totalSkills = 0;
    for (const charSkills of Object.values(skills)) {
        totalSkills += charSkills.length;
    }
    $('#memoryvault_total_skills').text(totalSkills);
}

// =============================================================================
// INITIALIZATION & EVENT HANDLERS
// =============================================================================

export function initWorldState() {
    // Promise filter change
    $('#memoryvault_promise_status_filter').on('change', () => {
        renderPromises();
    });

    // Goal filter change
    $('#memoryvault_goal_status_filter').on('change', () => {
        renderGoals();
    });

    // Skill filter change
    $('#memoryvault_skill_category_filter').on('change', () => {
        renderSkills();
    });

    // Promise action buttons (event delegation)
    $('#memoryvault_promises_list').on('click', '.memoryvault-fulfill-promise', async function() {
        const id = $(this).data('id');
        await fulfillPromise(id);
        renderPromises();
        updateWorldStateSummary();
    });

    $('#memoryvault_promises_list').on('click', '.memoryvault-break-promise', async function() {
        const id = $(this).data('id');
        await breakPromise(id);
        renderPromises();
        updateWorldStateSummary();
    });

    $('#memoryvault_promises_list').on('click', '.memoryvault-forgive-promise', async function() {
        const id = $(this).data('id');
        await forgivePromise(id);
        renderPromises();
        updateWorldStateSummary();
    });
}

/**
 * Refresh all World State UI
 */
export function refreshWorldState() {
    renderSecrets();
    renderLocations();
    renderPromises();
    renderGoals();
    renderSkills();
    updateWorldStateSummary();
}
