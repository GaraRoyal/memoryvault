/**
 * MemoryVault - Location Memory System
 *
 * Associates memories with places. When characters return to a location,
 * automatically surfaces what happened there before.
 *
 * Data structure:
 * locations: {
 *   "location_name_normalized": {
 *     id: string,
 *     name: string,              // Display name
 *     aliases: string[],         // Alternative names for the location
 *     description: string,       // Optional description
 *     first_visit: number,       // Timestamp of first mention
 *     last_visit: number,        // Timestamp of most recent mention
 *     visit_count: number,       // How many times location was mentioned
 *     memory_ids: string[],      // IDs of memories at this location
 *     parent_location: string|null, // For nested locations (e.g., "tavern" in "city")
 *     tags: string[],            // e.g., ["indoor", "dangerous", "home"]
 *   }
 * }
 */

import { getDeps } from '../deps.js';
import { getOpenVaultData, log } from '../utils.js';
import { LOCATIONS_KEY, MEMORIES_KEY } from '../constants.js';

/**
 * Normalize a location name for consistent lookups
 * @param {string} name - Location name
 * @returns {string} Normalized name
 */
export function normalizeLocationName(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
}

/**
 * Get all locations from current chat
 * @returns {Object} Locations object keyed by normalized name
 */
export function getLocations() {
    const data = getOpenVaultData();
    return data?.[LOCATIONS_KEY] || {};
}

/**
 * Get a specific location by name (checks aliases too)
 * @param {string} name - Location name to find
 * @returns {Object|null} Location object or null
 */
export function getLocation(name) {
    const locations = getLocations();
    const normalized = normalizeLocationName(name);

    // Direct match
    if (locations[normalized]) {
        return locations[normalized];
    }

    // Check aliases
    for (const loc of Object.values(locations)) {
        if (loc.aliases?.some(a => normalizeLocationName(a) === normalized)) {
            return loc;
        }
    }

    return null;
}

/**
 * Create or update a location
 * @param {string} name - Location name
 * @param {Object} options - Additional options
 * @returns {Object} The location object
 */
export async function upsertLocation(name, options = {}) {
    const data = getOpenVaultData();
    if (!data) return null;

    if (!data[LOCATIONS_KEY]) {
        data[LOCATIONS_KEY] = {};
    }

    const normalized = normalizeLocationName(name);
    const existing = data[LOCATIONS_KEY][normalized];

    if (existing) {
        // Update existing location
        existing.last_visit = Date.now();
        existing.visit_count = (existing.visit_count || 0) + 1;

        if (options.description && !existing.description) {
            existing.description = options.description;
        }
        if (options.tags) {
            existing.tags = [...new Set([...(existing.tags || []), ...options.tags])];
        }
        if (options.alias && !existing.aliases.includes(options.alias)) {
            existing.aliases.push(options.alias);
        }

        await getDeps().saveChatConditional();
        return existing;
    }

    // Create new location
    const location = {
        id: normalized,
        name: name.trim(),
        aliases: options.aliases || [],
        description: options.description || '',
        first_visit: Date.now(),
        last_visit: Date.now(),
        visit_count: 1,
        memory_ids: [],
        parent_location: options.parent_location || null,
        tags: options.tags || [],
    };

    data[LOCATIONS_KEY][normalized] = location;
    await getDeps().saveChatConditional();

    log(`Created location: ${name}`);
    return location;
}

/**
 * Link a memory to a location
 * @param {string} memoryId - Memory ID
 * @param {string} locationName - Location name
 * @returns {boolean} Success
 */
export async function linkMemoryToLocation(memoryId, locationName) {
    const data = getOpenVaultData();
    if (!data) return false;

    // Ensure location exists
    let location = getLocation(locationName);
    if (!location) {
        location = await upsertLocation(locationName);
    }

    const normalized = normalizeLocationName(locationName);

    // Add memory to location if not already linked
    if (!data[LOCATIONS_KEY][normalized].memory_ids.includes(memoryId)) {
        data[LOCATIONS_KEY][normalized].memory_ids.push(memoryId);
        await getDeps().saveChatConditional();
    }

    return true;
}

/**
 * Get all memories associated with a location
 * @param {string} locationName - Location name
 * @returns {Object[]} Array of memories
 */
export function getMemoriesAtLocation(locationName) {
    const data = getOpenVaultData();
    if (!data) return [];

    const location = getLocation(locationName);
    if (!location) return [];

    const memories = data[MEMORIES_KEY] || [];
    return memories.filter(m => location.memory_ids.includes(m.id));
}

/**
 * Get memories at a location, optionally including child locations
 * @param {string} locationName - Location name
 * @param {boolean} includeChildren - Include child location memories
 * @returns {Object[]} Array of memories
 */
export function getMemoriesAtLocationRecursive(locationName, includeChildren = true) {
    const memories = getMemoriesAtLocation(locationName);

    if (!includeChildren) return memories;

    const locations = getLocations();
    const normalized = normalizeLocationName(locationName);

    // Find child locations
    const childLocations = Object.values(locations).filter(
        loc => loc.parent_location === normalized
    );

    for (const child of childLocations) {
        const childMemories = getMemoriesAtLocation(child.name);
        memories.push(...childMemories);
    }

    // Deduplicate by ID
    const seen = new Set();
    return memories.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
}

/**
 * Detect location from text and link to memory
 * Called during extraction when location field is populated
 * @param {Object} memory - Memory object with location field
 * @returns {boolean} Whether a location was linked
 */
export async function processMemoryLocation(memory) {
    if (!memory.location) return false;

    await linkMemoryToLocation(memory.id, memory.location);
    return true;
}

/**
 * Set parent-child relationship between locations
 * @param {string} childName - Child location name
 * @param {string} parentName - Parent location name
 * @returns {boolean} Success
 */
export async function setLocationParent(childName, parentName) {
    const data = getOpenVaultData();
    if (!data?.[LOCATIONS_KEY]) return false;

    const childNorm = normalizeLocationName(childName);
    const parentNorm = normalizeLocationName(parentName);

    if (!data[LOCATIONS_KEY][childNorm]) return false;
    if (!data[LOCATIONS_KEY][parentNorm]) {
        await upsertLocation(parentName);
    }

    data[LOCATIONS_KEY][childNorm].parent_location = parentNorm;
    await getDeps().saveChatConditional();

    log(`Set ${childName} as child of ${parentName}`);
    return true;
}

/**
 * Add alias to a location
 * @param {string} locationName - Primary location name
 * @param {string} alias - Alias to add
 * @returns {boolean} Success
 */
export async function addLocationAlias(locationName, alias) {
    const data = getOpenVaultData();
    if (!data?.[LOCATIONS_KEY]) return false;

    const normalized = normalizeLocationName(locationName);
    const location = data[LOCATIONS_KEY][normalized];
    if (!location) return false;

    if (!location.aliases.includes(alias)) {
        location.aliases.push(alias);
        await getDeps().saveChatConditional();
    }

    return true;
}

/**
 * Delete a location
 * @param {string} locationName - Location name
 * @returns {boolean} Success
 */
export async function deleteLocation(locationName) {
    const data = getOpenVaultData();
    if (!data?.[LOCATIONS_KEY]) return false;

    const normalized = normalizeLocationName(locationName);
    if (!data[LOCATIONS_KEY][normalized]) return false;

    delete data[LOCATIONS_KEY][normalized];
    await getDeps().saveChatConditional();

    log(`Deleted location: ${locationName}`);
    return true;
}

/**
 * Get locations sorted by visit count (most visited first)
 * @returns {Object[]} Array of locations
 */
export function getLocationsByPopularity() {
    const locations = getLocations();
    return Object.values(locations).sort((a, b) => b.visit_count - a.visit_count);
}

/**
 * Get locations sorted by recency (most recent first)
 * @returns {Object[]} Array of locations
 */
export function getLocationsByRecency() {
    const locations = getLocations();
    return Object.values(locations).sort((a, b) => b.last_visit - a.last_visit);
}

/**
 * Get summary of location data
 * @returns {Object} Summary statistics
 */
export function getLocationsSummary() {
    const locations = getLocations();
    const locationsList = Object.values(locations);

    const totalMemories = locationsList.reduce(
        (sum, loc) => sum + (loc.memory_ids?.length || 0), 0
    );

    return {
        totalLocations: locationsList.length,
        totalMemoriesLinked: totalMemories,
        mostVisited: locationsList.sort((a, b) => b.visit_count - a.visit_count)[0]?.name || null,
        mostRecent: locationsList.sort((a, b) => b.last_visit - a.last_visit)[0]?.name || null,
    };
}
