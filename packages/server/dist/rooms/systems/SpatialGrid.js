import { GAME_CONFIG } from "../../gameConfig.js";
/**
 * Spatial Grid for efficient collision detection
 *
 * Divides the world into cells and tracks which entities are in each cell.
 * Reduces collision checks from O(n²) to approximately O(n) by only checking
 * entities in nearby cells.
 */
export class SpatialGrid {
    constructor(worldWidth = GAME_CONFIG.WORLD_WIDTH, worldHeight = GAME_CONFIG.WORLD_HEIGHT, cellSize = GAME_CONFIG.GRID_CELL_SIZE) {
        this.cells = new Map();
        this.entityCells = new Map(); // Track which cells each entity is in
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.cellSize = cellSize;
    }
    /**
     * Get the cell key for a given position
     */
    getCellKey(x, y) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }
    /**
     * Get all cell keys that an entity occupies (based on its radius)
     */
    getEntityCells(entity) {
        const cells = [];
        const minX = Math.floor((entity.x - entity.radius) / this.cellSize);
        const maxX = Math.floor((entity.x + entity.radius) / this.cellSize);
        const minY = Math.floor((entity.y - entity.radius) / this.cellSize);
        const maxY = Math.floor((entity.y + entity.radius) / this.cellSize);
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                cells.push(`${x},${y}`);
            }
        }
        return cells;
    }
    /**
     * Insert an entity into the grid
     */
    insert(entity) {
        const cellKeys = this.getEntityCells(entity);
        this.entityCells.set(entity.id, new Set(cellKeys));
        for (const key of cellKeys) {
            if (!this.cells.has(key)) {
                this.cells.set(key, new Set());
            }
            this.cells.get(key).add(entity);
        }
    }
    /**
     * Remove an entity from the grid
     */
    remove(entity) {
        const cellKeys = this.entityCells.get(entity.id);
        if (!cellKeys)
            return;
        for (const key of cellKeys) {
            const cell = this.cells.get(key);
            if (cell) {
                cell.delete(entity);
                if (cell.size === 0) {
                    this.cells.delete(key);
                }
            }
        }
        this.entityCells.delete(entity.id);
    }
    /**
     * Update an entity's position in the grid
     */
    update(entity) {
        const oldCellKeys = this.entityCells.get(entity.id);
        const newCellKeys = this.getEntityCells(entity);
        const newCellKeysSet = new Set(newCellKeys);
        // If entity wasn't in grid, just insert it
        if (!oldCellKeys) {
            this.insert(entity);
            return;
        }
        // Remove from cells no longer occupied
        for (const key of oldCellKeys) {
            if (!newCellKeysSet.has(key)) {
                const cell = this.cells.get(key);
                if (cell) {
                    cell.delete(entity);
                    if (cell.size === 0) {
                        this.cells.delete(key);
                    }
                }
            }
        }
        // Add to new cells
        for (const key of newCellKeys) {
            if (!oldCellKeys.has(key)) {
                if (!this.cells.has(key)) {
                    this.cells.set(key, new Set());
                }
                this.cells.get(key).add(entity);
            }
        }
        this.entityCells.set(entity.id, newCellKeysSet);
    }
    /**
     * Query entities within a radius of a point
     */
    queryRadius(x, y, radius) {
        const results = new Set();
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minY = Math.floor((y - radius) / this.cellSize);
        const maxY = Math.floor((y + radius) / this.cellSize);
        for (let cellX = minX; cellX <= maxX; cellX++) {
            for (let cellY = minY; cellY <= maxY; cellY++) {
                const key = `${cellX},${cellY}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const entity of cell) {
                        results.add(entity);
                    }
                }
            }
        }
        return Array.from(results);
    }
    /**
     * Query entities that might collide with a given entity
     */
    queryPotentialCollisions(entity) {
        // Query with the entity's radius plus some buffer for other entities
        const queryRadius = entity.radius + this.cellSize;
        const candidates = this.queryRadius(entity.x, entity.y, queryRadius);
        // Filter out self
        return candidates.filter(e => e.id !== entity.id);
    }
    /**
     * Get all entities in the grid
     */
    getAllEntities() {
        const allEntities = new Set();
        for (const cell of this.cells.values()) {
            for (const entity of cell) {
                allEntities.add(entity);
            }
        }
        return Array.from(allEntities);
    }
    /**
     * Clear the grid
     */
    clear() {
        this.cells.clear();
        this.entityCells.clear();
    }
    /**
     * Get debug info about the grid
     */
    getDebugInfo() {
        return {
            cellCount: this.cells.size,
            entityCount: this.entityCells.size,
        };
    }
}
