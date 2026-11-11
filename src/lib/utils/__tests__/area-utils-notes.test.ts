import { describe, it, expect } from 'vitest';
import type { Area } from '@/lib/domain/area';
import type { Note } from '@/lib/domain/note';
import { getNotesInArea, updateNotesParentAreas } from '@/lib/utils/area-utils';

const area = (id: string, x: number, order = 0): Area => ({
    id,
    name: id,
    x,
    y: 0,
    width: 400,
    height: 400,
    color: '#fff',
    order,
});

const note = (id: string, x: number, parentAreaId?: string | null): Note => ({
    id,
    content: '',
    x,
    y: 50,
    width: 100,
    height: 100,
    color: '#fff',
    parentAreaId,
});

describe('area-utils notes', () => {
    it('should assign parentAreaId to notes fully inside an area', () => {
        const result = updateNotesParentAreas(
            [note('inside', 50), note('outside', 600), note('partial', 350)],
            [area('a', 0)]
        );

        expect(result.map((n) => n.parentAreaId)).toEqual([
            'a',
            undefined,
            undefined,
        ]);
    });

    it('should prefer the top-most area for nested areas', () => {
        const result = updateNotesParentAreas(
            [note('n', 50)],
            [area('outer', 0, 0), area('inner', 0, 1)]
        );

        expect(result[0].parentAreaId).toBe('inner');
    });

    it('should clear parentAreaId when a note leaves the area', () => {
        const result = updateNotesParentAreas(
            [note('n', 900, 'a')],
            [area('a', 0)]
        );

        expect(result[0].parentAreaId).toBeNull();
    });

    it('should return only notes glued to the given area', () => {
        const notes = [note('1', 0, 'a'), note('2', 0, 'b'), note('3', 0)];

        expect(getNotesInArea('a', notes).map((n) => n.id)).toEqual(['1']);
    });
});
