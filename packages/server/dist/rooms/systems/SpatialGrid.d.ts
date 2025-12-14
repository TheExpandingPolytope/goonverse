/**
 * Entity interface for spatial grid
 */
export interface SpatialEntity {
    id: string;
    x: number;
    y: number;
    radius: number;
}
/**
 * Spatial Grid for efficient collision detection
 *
 * Divides the world into cells and tracks which entities are in each cell.
 * Reduces collision checks from O(n²) to approximately O(n) by only checking
 * entities in nearby cells.
 */
export declare class SpatialGrid<T extends SpatialEntity> {
    private cells;
    private entityCells;
    private cellSize;
    private worldWidth;
    private worldHeight;
    constructor(worldWidth?: number, worldHeight?: number, cellSize?: number);
    /**
     * Get the cell key for a given position
     */
    private getCellKey;
    /**
     * Get all cell keys that an entity occupies (based on its radius)
     */
    private getEntityCells;
    /**
     * Insert an entity into the grid
     */
    insert(entity: T): void;
    /**
     * Remove an entity from the grid
     */
    remove(entity: T): void;
    /**
     * Update an entity's position in the grid
     */
    update(entity: T): void;
    /**
     * Query entities within a radius of a point
     */
    queryRadius(x: number, y: number, radius: number): T[];
    /**
     * Query entities that might collide with a given entity
     */
    queryPotentialCollisions(entity: T): T[];
    /**
     * Get all entities in the grid
     */
    getAllEntities(): T[];
    /**
     * Clear the grid
     */
    clear(): void;
    /**
     * Get debug info about the grid
     */
    getDebugInfo(): {
        cellCount: number;
        entityCount: number;
    };
}
