import { describe, it, expect } from 'vitest';
import { exportBaseSQL } from '@/lib/data/sql-export/export-sql-script';
import { generateDBMLFromDiagram } from '@/lib/dbml/dbml-export/dbml-export';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBField } from '@/lib/domain/db-field';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import {
    isLogicalRelationship,
    withoutLogicalRelationships,
} from '@/lib/domain/db-relationship';

const field = (id: string, name: string, primaryKey = false): DBField =>
    ({
        id,
        name,
        type: { id: 'integer', name: 'integer' },
        primaryKey,
        nullable: !primaryKey,
        unique: false,
        createdAt: 0,
    }) as DBField;

const table = (id: string, name: string, fields: DBField[]): DBTable =>
    ({
        id,
        name,
        fields,
        indexes: [],
        color: '#fff',
        isView: false,
        createdAt: 0,
        x: 0,
        y: 0,
        width: 200,
    }) as DBTable;

const relationship = (overrides: Partial<DBRelationship>): DBRelationship => ({
    id: 'r1',
    name: 'users_id_fk',
    sourceTableId: 'orders',
    targetTableId: 'users',
    sourceFieldId: 'orders_user_id',
    targetFieldId: 'users_id',
    sourceCardinality: 'one',
    targetCardinality: 'many',
    createdAt: 0,
    ...overrides,
});

const diagram = (relationships: DBRelationship[]): Diagram =>
    ({
        id: 'd',
        name: 'd',
        databaseType: DatabaseType.POSTGRESQL,
        tables: [
            table('users', 'users', [field('users_id', 'id', true)]),
            table('orders', 'orders', [
                field('orders_id', 'id', true),
                field('orders_user_id', 'user_id'),
            ]),
        ],
        relationships,
        createdAt: new Date(),
        updatedAt: new Date(),
    }) as Diagram;

describe('logical relationships', () => {
    it('should detect logical relationships', () => {
        expect(isLogicalRelationship({ isLogical: true })).toBe(true);
        expect(isLogicalRelationship({ isLogical: false })).toBe(false);
        expect(isLogicalRelationship({})).toBe(false);
    });

    it('should strip only logical relationships from a diagram', () => {
        const fk = relationship({ id: 'fk' });
        const logical = relationship({ id: 'logical', isLogical: true });

        const result = withoutLogicalRelationships(diagram([fk, logical]));

        expect(result.relationships?.map((r) => r.id)).toEqual(['fk']);
    });

    it('should keep the same diagram object when there are no logical relationships', () => {
        const d = diagram([relationship({})]);

        expect(withoutLogicalRelationships(d)).toBe(d);
    });

    it('should export a foreign key for a regular relationship', () => {
        const sql = exportBaseSQL({
            diagram: diagram([relationship({})]),
            targetDatabaseType: DatabaseType.POSTGRESQL,
        });

        expect(sql).toContain('FOREIGN KEY');
    });

    it('should not export a foreign key for a logical relationship', () => {
        const sql = exportBaseSQL({
            diagram: diagram([relationship({ isLogical: true })]),
            targetDatabaseType: DatabaseType.POSTGRESQL,
        });

        expect(sql).toContain('CREATE TABLE');
        expect(sql).not.toContain('FOREIGN KEY');
    });

    it('should not export a Ref to DBML for a logical relationship', () => {
        const regular = generateDBMLFromDiagram(diagram([relationship({})]));
        const logical = generateDBMLFromDiagram(
            diagram([relationship({ isLogical: true })])
        );

        expect(regular.standardDbml).toContain('Ref');
        expect(logical.standardDbml).not.toContain('Ref');
    });
});
