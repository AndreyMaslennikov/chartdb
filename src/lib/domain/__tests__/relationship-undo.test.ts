import { describe, it, expect } from 'vitest';
import type { DBRelationship } from '../db-relationship';
import { getRelationshipUndoAttributes } from '../db-relationship';

const relationship: DBRelationship = {
    id: 'r1',
    name: 'rel',
    sourceTableId: 't1',
    targetTableId: 't2',
    sourceFieldId: 'f1',
    targetFieldId: 'f2',
    sourceCardinality: 'one',
    targetCardinality: 'many',
    createdAt: 1,
};

describe('getRelationshipUndoAttributes', () => {
    it('should reset a field that the previous relationship did not have', () => {
        const waypoints = [
            { x: 10, y: 0 },
            { x: 10, y: 50 },
        ];

        const undo = getRelationshipUndoAttributes(relationship, { waypoints });

        expect(undo.waypoints).toBeNull();
        // applying the undo data over the changed relationship removes the change
        expect({ ...relationship, waypoints, ...undo }.waypoints).toBeNull();
    });

    it('should reset all new fields of a change', () => {
        const undo = getRelationshipUndoAttributes(relationship, {
            isLogical: true,
            sourceSide: 'right',
        });

        expect(undo.isLogical).toBeNull();
        expect(undo.sourceSide).toBeNull();
    });

    it('should keep the previous value of a field that already existed', () => {
        const previous: DBRelationship = {
            ...relationship,
            waypoints: [
                { x: 1, y: 0 },
                { x: 1, y: 9 },
            ],
        };

        const undo = getRelationshipUndoAttributes(previous, {
            waypoints: [
                { x: 5, y: 0 },
                { x: 5, y: 9 },
            ],
        });

        expect(undo.waypoints).toEqual(previous.waypoints);
    });

    it('should not touch fields that are not part of the change', () => {
        const undo = getRelationshipUndoAttributes(relationship, {
            comments: 'x',
        });

        expect(undo.waypoints).toBeUndefined();
        expect(undo.comments).toBeNull();
        expect(undo.name).toBe('rel');
    });
});
