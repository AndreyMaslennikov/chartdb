import { describe, it, expect } from 'vitest';
import type { DBTable } from '../db-table';
import type { DBIndex } from '../db-index';
import { getFieldIndexes, getFieldIndexesMap } from '../db-index';

const field = (id: string, name: string) =>
    ({ id, name }) as unknown as DBTable['fields'][number];

const index = (id: string, fieldIds: string[], extra: Partial<DBIndex> = {}) =>
    ({
        id,
        name: `idx_${id}`,
        unique: false,
        fieldIds,
        createdAt: 0,
        ...extra,
    }) as DBIndex;

const table = (indexes: DBIndex[]) =>
    ({
        id: 't',
        fields: [field('a', 'a'), field('b', 'b'), field('c', 'c')],
        indexes,
    }) as unknown as DBTable;

describe('getFieldIndexesMap', () => {
    it('should map a single-column index to its field', () => {
        const map = getFieldIndexesMap({ table: table([index('1', ['a'])]) });

        expect(getFieldIndexes(map, 'a')).toHaveLength(1);
        expect(getFieldIndexes(map, 'b')).toHaveLength(0);
    });

    it('should mark every field of a composite index with all column names', () => {
        const map = getFieldIndexesMap({
            table: table([index('1', ['a', 'b'])]),
        });

        expect(getFieldIndexes(map, 'a')[0].columnNames).toEqual(['a', 'b']);
        expect(getFieldIndexes(map, 'b')[0].columnNames).toEqual(['a', 'b']);
        expect(getFieldIndexes(map, 'c')).toHaveLength(0);
    });

    it('should ignore primary key indexes', () => {
        const map = getFieldIndexesMap({
            table: table([index('pk', ['a'], { isPrimaryKey: true })]),
        });

        expect(getFieldIndexes(map, 'a')).toHaveLength(0);
    });

    it('should list several indexes of the same field', () => {
        const map = getFieldIndexesMap({
            table: table([
                index('1', ['a']),
                index('2', ['a', 'c'], { unique: true }),
            ]),
        });

        expect(getFieldIndexes(map, 'a').map((i) => i.index.id)).toEqual([
            '1',
            '2',
        ]);
    });

    it('should skip unknown field ids and handle tables without indexes', () => {
        const map = getFieldIndexesMap({
            table: table([index('1', ['missing'])]),
        });

        expect(map.size).toBe(0);
        expect(
            getFieldIndexesMap({
                table: {
                    ...table([]),
                    indexes: undefined,
                } as unknown as DBTable,
            }).size
        ).toBe(0);
    });
});
