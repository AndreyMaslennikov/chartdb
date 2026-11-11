export interface RoutePoint {
    x: number;
    y: number;
}

const samePoint = (a: RoutePoint, b: RoutePoint) => a.x === b.x && a.y === b.y;

const dedupe = (points: RoutePoint[]): RoutePoint[] =>
    points.filter((point, i) => i === 0 || !samePoint(point, points[i - 1]));

/**
 * Builds an orthogonal polyline from `start` to `end` through the waypoints.
 * Every leg between two points that are not aligned gets an elbow:
 * horizontal first, except for the last leg which is vertical first so the
 * line always enters the target horizontally (like the table handles).
 */
export const buildRoutePoints = (
    start: RoutePoint,
    waypoints: RoutePoint[],
    end: RoutePoint
): RoutePoint[] => {
    const anchors = [start, ...waypoints, end];
    const points: RoutePoint[] = [start];

    for (let i = 1; i < anchors.length; i++) {
        const prev = anchors[i - 1];
        const next = anchors[i];
        const isLastLeg = i === anchors.length - 1;

        if (prev.x !== next.x && prev.y !== next.y) {
            points.push(
                isLastLeg ? { x: prev.x, y: next.y } : { x: next.x, y: prev.y }
            );
        }
        points.push(next);
    }

    return dedupe(points);
};

/**
 * Converts a polyline to an SVG path with rounded corners.
 */
export const pointsToRoundedPath = (
    points: RoutePoint[],
    radius = 14
): string => {
    if (points.length === 0) {
        return '';
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const corner = points[i];
        const next = points[i + 1];

        const lenIn = Math.hypot(corner.x - prev.x, corner.y - prev.y);
        const lenOut = Math.hypot(next.x - corner.x, next.y - corner.y);
        const r = Math.min(radius, lenIn / 2, lenOut / 2);

        if (r <= 0) {
            path += ` L ${corner.x} ${corner.y}`;
            continue;
        }

        const before = {
            x: corner.x + ((prev.x - corner.x) / lenIn) * r,
            y: corner.y + ((prev.y - corner.y) / lenIn) * r,
        };
        const after = {
            x: corner.x + ((next.x - corner.x) / lenOut) * r,
            y: corner.y + ((next.y - corner.y) / lenOut) * r,
        };

        path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
    }

    if (points.length > 1) {
        const last = points[points.length - 1];
        path += ` L ${last.x} ${last.y}`;
    }

    return path;
};

/**
 * Midpoint of the longest segment of the polyline.
 */
export const getRouteMidpoint = (points: RoutePoint[]): RoutePoint => {
    if (points.length === 0) {
        return { x: 0, y: 0 };
    }

    let best = { length: -1, index: 0 };
    for (let i = 1; i < points.length; i++) {
        const length = Math.hypot(
            points[i].x - points[i - 1].x,
            points[i].y - points[i - 1].y
        );
        if (length > best.length) {
            best = { length, index: i };
        }
    }

    if (best.length < 0) {
        return points[0];
    }

    const a = points[best.index - 1];
    const b = points[best.index];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

/**
 * Adds a new waypoint in the middle of the longest leg between the
 * anchors (start, ...waypoints, end).
 */
export const insertWaypoint = (
    start: RoutePoint,
    waypoints: RoutePoint[],
    end: RoutePoint
): RoutePoint[] => {
    const anchors = [start, ...waypoints, end];

    let best = { length: -1, index: 0 };
    for (let i = 0; i < anchors.length - 1; i++) {
        const length = Math.hypot(
            anchors[i + 1].x - anchors[i].x,
            anchors[i + 1].y - anchors[i].y
        );
        if (length > best.length) {
            best = { length, index: i };
        }
    }

    const a = anchors[best.index];
    const b = anchors[best.index + 1];
    const middle = {
        x: Math.round((a.x + b.x) / 2),
        y: Math.round((a.y + b.y) / 2),
    };

    // `best.index` is the leg index, which equals the insert position in waypoints
    return [
        ...waypoints.slice(0, best.index),
        middle,
        ...waypoints.slice(best.index),
    ];
};
