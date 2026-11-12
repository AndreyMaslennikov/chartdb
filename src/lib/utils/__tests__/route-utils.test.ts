import { describe, it, expect } from 'vitest';
import {
    addBendsAt,
    buildRoute,
    clampVerticalSegmentX,
    dedupePoints,
    findLongestSegment,
    fitAttachedSegment,
    findNearestSegment,
    getDefaultBends,
    getDefaultRoute,
    getDefaultSegmentX,
    getRouteMidpoint,
    isSegmentMovable,
    moveSegment,
    parseRoute,
    pointsToRoundedPath,
    removeSegment,
    snapBends,
} from '../route-utils';

const start = { x: 0, y: 0 };
const end = { x: 200, y: 100 };

// Default route of the example above: (0,0) -> (100,0) -> (100,100) -> (200,100)
const defaultBends = getDefaultBends(start, end, 100);

describe('route-utils', () => {
    describe('parseRoute', () => {
        it('should return null for empty or missing data', () => {
            expect(parseRoute(null)).toBeNull();
            expect(parseRoute(undefined)).toBeNull();
            expect(parseRoute([])).toBeNull();
        });

        it('should accept two bends sharing x', () => {
            const bends = [
                { x: 50, y: 0 },
                { x: 50, y: 100 },
            ];
            expect(parseRoute(bends)).toEqual(bends);
        });

        it('should accept four bends with alternating axes', () => {
            const bends = [
                { x: 20, y: 0 },
                { x: 20, y: 40 },
                { x: 80, y: 40 },
                { x: 80, y: 100 },
            ];
            expect(parseRoute(bends)).toEqual(bends);
        });

        it('should reject legacy free-form waypoints', () => {
            expect(parseRoute([{ x: 10, y: 20 }])).toBeNull();
            expect(
                parseRoute([
                    { x: 10, y: 20 },
                    { x: 30, y: 40 },
                ])
            ).toBeNull();
            expect(
                parseRoute([
                    { x: 10, y: 20 },
                    { x: 10, y: 40 },
                    { x: 30, y: 50 },
                    { x: 30, y: 60 },
                ])
            ).toBeNull();
        });
    });

    describe('getDefaultSegmentX', () => {
        it('should use the middle when the sides face each other', () => {
            expect(
                getDefaultSegmentX({
                    startX: 100,
                    endX: 300,
                    startSide: 'right',
                    endSide: 'left',
                    offset: 28,
                })
            ).toBe(200);
            expect(
                getDefaultSegmentX({
                    startX: 300,
                    endX: 100,
                    startSide: 'left',
                    endSide: 'right',
                    offset: 28,
                })
            ).toBe(200);
        });

        it('should leave outwards by the offset when both sides are left', () => {
            expect(
                getDefaultSegmentX({
                    startX: 100,
                    endX: 300,
                    startSide: 'left',
                    endSide: 'left',
                    offset: 28,
                })
            ).toBe(72);
        });

        it('should leave outwards by the offset when both sides are right', () => {
            expect(
                getDefaultSegmentX({
                    startX: 100,
                    endX: 300,
                    startSide: 'right',
                    endSide: 'right',
                    offset: 28,
                })
            ).toBe(328);
        });

        it('should leave the source outwards when the sides do not face each other', () => {
            expect(
                getDefaultSegmentX({
                    startX: 300,
                    endX: 100,
                    startSide: 'right',
                    endSide: 'left',
                    offset: 28,
                })
            ).toBe(328);
        });
    });

    describe('getDefaultRoute', () => {
        it('should use two bends when the sides face each other', () => {
            expect(
                getDefaultRoute({
                    start: { x: 100, y: 0 },
                    end: { x: 300, y: 80 },
                    startSide: 'right',
                    endSide: 'left',
                    offset: 28,
                })
            ).toEqual([
                { x: 200, y: 0 },
                { x: 200, y: 80 },
            ]);
        });

        it('should use two bends when both sides are the same', () => {
            expect(
                getDefaultRoute({
                    start: { x: 100, y: 0 },
                    end: { x: 300, y: 80 },
                    startSide: 'left',
                    endSide: 'left',
                    offset: 28,
                })
            ).toEqual([
                { x: 72, y: 0 },
                { x: 72, y: 80 },
            ]);
        });

        it('should use four bends when the sides do not face each other', () => {
            // source left side, target right side, the target is to the right
            const bends = getDefaultRoute({
                start: { x: 410, y: 100 },
                end: { x: 442, y: 636 },
                startSide: 'left',
                endSide: 'right',
                offset: 28,
            });

            expect(bends).toEqual([
                { x: 382, y: 100 },
                { x: 382, y: 368 },
                { x: 470, y: 368 },
                { x: 470, y: 636 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should not collapse the middle segment when both ends are at the same height', () => {
            const bends = getDefaultRoute({
                start: { x: 410, y: 100 },
                end: { x: 442, y: 100 },
                startSide: 'left',
                endSide: 'right',
                offset: 28,
            });

            expect(bends[1].y).not.toBe(100);
        });
    });

    describe('buildRoute', () => {
        it('should build three segments for the default bends', () => {
            expect(buildRoute(start, end, defaultBends)).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 100 },
            ]);
        });

        it('should make the first and the last segment follow the start and the end y', () => {
            const moved = buildRoute(
                { x: 0, y: 30 },
                { x: 200, y: 160 },
                defaultBends
            );

            expect(moved).toEqual([
                { x: 0, y: 30 },
                { x: 100, y: 30 },
                { x: 100, y: 160 },
                { x: 200, y: 160 },
            ]);
        });

        it('should keep inner bends of a longer route untouched', () => {
            const bends = [
                { x: 20, y: 0 },
                { x: 20, y: 40 },
                { x: 80, y: 40 },
                { x: 80, y: 100 },
            ];

            expect(buildRoute(start, end, bends)).toEqual([
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 20, y: 40 },
                { x: 80, y: 40 },
                { x: 80, y: 100 },
                { x: 200, y: 100 },
            ]);
        });
    });

    describe('snapBends', () => {
        it('should write the actual start and end y into the first and last bend', () => {
            expect(
                snapBends({ x: 0, y: 30 }, { x: 200, y: 160 }, defaultBends)
            ).toEqual([
                { x: 100, y: 30 },
                { x: 100, y: 160 },
            ]);
        });
    });

    describe('moveSegment', () => {
        it('should move the vertical segment by x', () => {
            expect(moveSegment(defaultBends, 1, 140)).toEqual([
                { x: 140, y: 0 },
                { x: 140, y: 100 },
            ]);
        });

        it('should move a horizontal inner segment by y', () => {
            const bends = [
                { x: 20, y: 0 },
                { x: 20, y: 40 },
                { x: 80, y: 40 },
                { x: 80, y: 100 },
            ];

            expect(moveSegment(bends, 2, 70)).toEqual([
                { x: 20, y: 0 },
                { x: 20, y: 70 },
                { x: 80, y: 70 },
                { x: 80, y: 100 },
            ]);
        });

        it('should not move the first and the last segment', () => {
            expect(isSegmentMovable(0, 2)).toBe(false);
            expect(isSegmentMovable(2, 2)).toBe(false);
            expect(isSegmentMovable(1, 2)).toBe(true);
            expect(moveSegment(defaultBends, 0, 999)).toBe(defaultBends);
            expect(moveSegment(defaultBends, 2, 999)).toBe(defaultBends);
        });
    });

    describe('clampVerticalSegmentX', () => {
        const base = {
            startX: 100,
            endX: 300,
            startSide: 'right' as const,
            endSide: 'left' as const,
        };

        it('should keep the segment between facing tables with a margin', () => {
            const options = {
                ...base,
                attachedToStart: true,
                attachedToEnd: true,
            };
            expect(clampVerticalSegmentX(50, options)).toBe(114);
            expect(clampVerticalSegmentX(999, options)).toBe(286);
            expect(clampVerticalSegmentX(200, options)).toBe(200);
        });

        it('should limit only the source side for a segment attached to the start', () => {
            const options = {
                ...base,
                attachedToStart: true,
                attachedToEnd: false,
            };
            expect(clampVerticalSegmentX(50, options)).toBe(114);
            expect(clampVerticalSegmentX(999, options)).toBe(999);
        });

        it('should not limit an inner segment', () => {
            expect(
                clampVerticalSegmentX(-500, {
                    ...base,
                    attachedToStart: false,
                    attachedToEnd: false,
                })
            ).toBe(-500);
        });

        it('should drop the limits when they contradict each other', () => {
            expect(
                clampVerticalSegmentX(10, {
                    startX: 300,
                    endX: 100,
                    startSide: 'right',
                    endSide: 'left',
                    attachedToStart: true,
                    attachedToEnd: true,
                })
            ).toBe(10);
        });
    });

    describe('fitAttachedSegment', () => {
        const fourBends = [
            { x: 60, y: 0 },
            { x: 60, y: 40 },
            { x: 150, y: 40 },
            { x: 150, y: 100 },
        ];

        it('should move the first vertical segment outwards when the source side changes to the other one', () => {
            // the source is now attached on the right side at x=100, the segment is at x=60
            expect(
                fitAttachedSegment(fourBends, 'start', 100, 'right', 28)
            ).toEqual([
                { x: 128, y: 0 },
                { x: 128, y: 40 },
                { x: 150, y: 40 },
                { x: 150, y: 100 },
            ]);
        });

        it('should move the last vertical segment outwards for the target', () => {
            // the target is now attached on the left side at x=120, the segment is at x=150
            expect(
                fitAttachedSegment(fourBends, 'end', 120, 'left', 28)
            ).toEqual([
                { x: 60, y: 0 },
                { x: 60, y: 40 },
                { x: 92, y: 40 },
                { x: 92, y: 100 },
            ]);
        });

        it('should keep the route when the segment is already on the outer side', () => {
            expect(
                fitAttachedSegment(fourBends, 'start', 100, 'left', 28)
            ).toBe(fourBends);
        });
    });

    describe('findNearestSegment / findLongestSegment', () => {
        const points = buildRoute(start, end, defaultBends);

        it('should find the segment closest to the point', () => {
            expect(findNearestSegment(points, { x: 30, y: 2 })).toBe(0);
            expect(findNearestSegment(points, { x: 99, y: 60 })).toBe(1);
            expect(findNearestSegment(points, { x: 170, y: 98 })).toBe(2);
        });

        it('should find the longest segment and its middle', () => {
            const tallEnd = { x: 200, y: 150 };
            const tall = buildRoute(
                start,
                tallEnd,
                getDefaultBends(start, tallEnd, 100)
            );

            expect(findLongestSegment(tall)).toEqual({
                index: 1,
                middle: { x: 100, y: 75 },
            });
        });
    });

    describe('addBendsAt', () => {
        it('should build the example from the first horizontal segment', () => {
            // click at (30, 0): (0,0) -> (30,0) -> (30,50) -> (100,50) -> (100,100) -> (200,100)
            const bends = addBendsAt(start, end, defaultBends, 0, {
                x: 30,
                y: 0,
            });

            expect(buildRoute(start, end, bends)).toEqual([
                { x: 0, y: 0 },
                { x: 30, y: 0 },
                { x: 30, y: 50 },
                { x: 100, y: 50 },
                { x: 100, y: 100 },
                { x: 200, y: 100 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should go perpendicular along the vertical segment', () => {
            // click at (100, 20): half of the x distance to the end (100 -> 200) is 150
            const bends = addBendsAt(start, end, defaultBends, 1, {
                x: 100,
                y: 20,
            });

            expect(buildRoute(start, end, bends)).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 20 },
                { x: 150, y: 20 },
                { x: 150, y: 100 },
                { x: 200, y: 100 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should mirror for the last segment', () => {
            // click at (170, 100) on the last segment, previous segment is x=100, y 0..100
            const bends = addBendsAt(start, end, defaultBends, 2, {
                x: 170,
                y: 100,
            });

            expect(buildRoute(start, end, bends)).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 170, y: 50 },
                { x: 170, y: 100 },
                { x: 200, y: 100 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should be repeatable and keep a valid route with horizontal ends', () => {
            let bends = defaultBends;
            bends = addBendsAt(start, end, bends, 0, { x: 30, y: 0 });
            bends = addBendsAt(start, end, bends, 3, { x: 60, y: 50 });
            bends = addBendsAt(start, end, bends, 5, { x: 190, y: 100 });

            expect(bends).toHaveLength(8);
            expect(parseRoute(bends)).not.toBeNull();

            const points = buildRoute(start, end, bends);
            // first and last segment are horizontal
            expect(points[1].y).toBe(start.y);
            expect(points[points.length - 2].y).toBe(end.y);
        });

        it('should keep a minimal length of the new segment when the tables are at the same level', () => {
            const flatEnd = { x: 200, y: 0 };
            const bends = addBendsAt(
                start,
                flatEnd,
                getDefaultBends(start, flatEnd, 100),
                0,
                { x: 30, y: 0 }
            );
            const points = buildRoute(start, flatEnd, bends);

            expect(Math.abs(points[2].y - points[1].y)).toBeGreaterThanOrEqual(
                20
            );
        });
    });

    describe('removeSegment', () => {
        const fourBends = [
            { x: 30, y: 0 },
            { x: 30, y: 50 },
            { x: 100, y: 50 },
            { x: 100, y: 100 },
        ];

        it('should restore the default route when the first vertical segment is removed', () => {
            expect(removeSegment(fourBends, 1)).toEqual([
                { x: 100, y: 50 },
                { x: 100, y: 100 },
            ]);
            expect(buildRoute(start, end, removeSegment(fourBends, 1))).toEqual(
                buildRoute(start, end, defaultBends)
            );
        });

        it('should merge the vertical segments when the middle horizontal one is removed', () => {
            const bends = removeSegment(fourBends, 2);

            expect(bends).toEqual([
                { x: 30, y: 0 },
                { x: 30, y: 100 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should keep the first bends when the last vertical segment is removed', () => {
            const bends = removeSegment(fourBends, 3);

            expect(bends).toEqual([
                { x: 30, y: 0 },
                { x: 30, y: 50 },
            ]);
            expect(buildRoute(start, end, bends)).toEqual([
                { x: 0, y: 0 },
                { x: 30, y: 0 },
                { x: 30, y: 100 },
                { x: 200, y: 100 },
            ]);
        });

        it('should merge the horizontal neighbours of a removed vertical segment in a longer route', () => {
            const sixBends = [
                { x: 20, y: 0 },
                { x: 20, y: 30 },
                { x: 60, y: 30 },
                { x: 60, y: 70 },
                { x: 120, y: 70 },
                { x: 120, y: 100 },
            ];

            // segment 3 is the vertical one at x=60
            const bends = removeSegment(sixBends, 3);

            expect(bends).toEqual([
                { x: 20, y: 0 },
                { x: 20, y: 30 },
                { x: 120, y: 30 },
                { x: 120, y: 100 },
            ]);
            expect(parseRoute(bends)).not.toBeNull();
        });

        it('should not remove anything from the base route or the first and last segments', () => {
            expect(removeSegment(defaultBends, 1)).toBe(defaultBends);
            expect(removeSegment(fourBends, 0)).toBe(fourBends);
            expect(removeSegment(fourBends, 4)).toBe(fourBends);
        });

        it('should undo the bends added by a double click', () => {
            const added = addBendsAt(start, end, defaultBends, 0, {
                x: 30,
                y: 0,
            });

            // the y of the first bend is ignored, compare the drawn routes
            expect(buildRoute(start, end, removeSegment(added, 1))).toEqual(
                buildRoute(start, end, defaultBends)
            );
        });
    });

    describe('dedupePoints', () => {
        it('should drop consecutive duplicates', () => {
            expect(
                dedupePoints([
                    { x: 0, y: 0 },
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                ])
            ).toEqual([
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ]);
        });
    });

    describe('pointsToRoundedPath', () => {
        it('should return an empty path for no points', () => {
            expect(pointsToRoundedPath([])).toBe('');
        });

        it('should round corners with a quadratic curve limited by the segment length', () => {
            const path = pointsToRoundedPath(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 100 },
                ],
                14
            );

            // radius is limited to half of the shortest adjacent segment (5)
            expect(path).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 100');
        });
    });

    describe('getRouteMidpoint', () => {
        it('should return the middle of the longest segment', () => {
            expect(
                getRouteMidpoint([
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 100 },
                ])
            ).toEqual({ x: 10, y: 50 });
        });
    });
});
