import { describe, it, expect } from 'vitest';
import {
    buildRoutePoints,
    getRouteMidpoint,
    insertWaypoint,
    pointsToRoundedPath,
} from '../route-utils';

describe('route-utils', () => {
    describe('buildRoutePoints', () => {
        it('should add a horizontal-first elbow for a single waypoint and enter the target horizontally', () => {
            const points = buildRoutePoints(
                { x: 0, y: 0 },
                [{ x: 100, y: 50 }],
                { x: 200, y: 100 }
            );

            expect(points).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 100, y: 100 },
                { x: 200, y: 100 },
            ]);
        });

        it('should not add elbows between aligned points', () => {
            const points = buildRoutePoints(
                { x: 0, y: 0 },
                [{ x: 100, y: 0 }],
                { x: 200, y: 0 }
            );

            expect(points).toEqual([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 200, y: 0 },
            ]);
        });

        it('should route start to end with one elbow when there are no waypoints', () => {
            const points = buildRoutePoints({ x: 0, y: 0 }, [], {
                x: 10,
                y: 20,
            });

            expect(points).toEqual([
                { x: 0, y: 0 },
                { x: 0, y: 20 },
                { x: 10, y: 20 },
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

    describe('insertWaypoint', () => {
        it('should insert the first waypoint in the middle between start and end', () => {
            expect(
                insertWaypoint({ x: 0, y: 0 }, [], { x: 100, y: 40 })
            ).toEqual([{ x: 50, y: 20 }]);
        });

        it('should insert into the longest leg keeping the waypoint order', () => {
            const result = insertWaypoint({ x: 0, y: 0 }, [{ x: 10, y: 0 }], {
                x: 300,
                y: 0,
            });

            expect(result).toEqual([
                { x: 10, y: 0 },
                { x: 155, y: 0 },
            ]);
        });
    });
});
