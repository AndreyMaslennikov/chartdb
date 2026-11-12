export interface RoutePoint {
    x: number;
    y: number;
}

export type RouteSide = 'left' | 'right';

/** Minimal distance of a segment moved by dragging from a table side */
export const ROUTE_TABLE_MARGIN = 14;
/** Minimal length of a segment created by a double click */
const MIN_NEW_SEGMENT = 20;

const samePoint = (a: RoutePoint, b: RoutePoint) => a.x === b.x && a.y === b.y;

export const dedupePoints = (points: RoutePoint[]): RoutePoint[] =>
    points.filter((point, i) => i === 0 || !samePoint(point, points[i - 1]));

/**
 * A route is stored as a list of bends. It has an even number of bends (>= 2)
 * and the segments alternate: the first and the last segment are horizontal
 * (they enter the tables horizontally), the second one is vertical, the third
 * one is horizontal and so on. So consecutive bends share x, then y, then x...
 *
 * The y of the first bend and of the last bend are not meaningful, they always
 * follow the start and the end of the relationship.
 *
 * Returns the bends, or null when the data does not have this shape
 * (for example legacy free-form waypoints) and the default route must be used.
 */
export const parseRoute = (
    waypoints: RoutePoint[] | null | undefined
): RoutePoint[] | null => {
    if (!waypoints || waypoints.length < 2 || waypoints.length % 2 !== 0) {
        return null;
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const isVerticalSegment = i % 2 === 0;
        if (isVerticalSegment ? a.x !== b.x : a.y !== b.y) {
            return null;
        }
    }

    return waypoints;
};

/**
 * X of the vertical segment of the default route (3 segments, 2 bends).
 * Sides facing each other: the middle. Otherwise the line leaves the tables
 * outwards by `offset`.
 */
export const getDefaultSegmentX = ({
    startX,
    endX,
    startSide,
    endSide,
    offset,
}: {
    startX: number;
    endX: number;
    startSide: RouteSide;
    endSide: RouteSide;
    offset: number;
}): number => {
    const startDir = startSide === 'left' ? -1 : 1;
    const endDir = endSide === 'left' ? -1 : 1;

    const isFacing =
        (endX - startX) * startDir > 0 && (startX - endX) * endDir > 0;
    if (isFacing) {
        return Math.round((startX + endX) / 2);
    }

    if (startSide === endSide) {
        return Math.round(
            startSide === 'left'
                ? Math.min(startX, endX) - offset
                : Math.max(startX, endX) + offset
        );
    }

    return Math.round(startX + startDir * offset);
};

export const getDefaultBends = (
    start: RoutePoint,
    end: RoutePoint,
    segmentX: number
): RoutePoint[] => [
    { x: segmentX, y: start.y },
    { x: segmentX, y: end.y },
];

/**
 * Default bends of a relationship.
 *
 * Usually 3 segments (2 bends). When the line has to leave a table on one
 * side and enter the other one from the opposite side (the sides do not face
 * each other, e.g. tables stacked one under another), 3 segments would run
 * through the tables, so the route gets 5 segments (4 bends): out of the
 * source, to the middle height, across, down to the target and into it.
 */
export const getDefaultRoute = ({
    start,
    end,
    startSide,
    endSide,
    offset,
}: {
    start: RoutePoint;
    end: RoutePoint;
    startSide: RouteSide;
    endSide: RouteSide;
    offset: number;
}): RoutePoint[] => {
    const startDir = startSide === 'left' ? -1 : 1;
    const endDir = endSide === 'left' ? -1 : 1;

    const isFacing =
        (end.x - start.x) * startDir > 0 && (start.x - end.x) * endDir > 0;

    if (startSide === endSide || isFacing) {
        return getDefaultBends(
            start,
            end,
            getDefaultSegmentX({
                startX: start.x,
                endX: end.x,
                startSide,
                endSide,
                offset,
            })
        );
    }

    const startOutX = Math.round(start.x + startDir * offset);
    const endOutX = Math.round(end.x + endDir * offset);
    let middleY = Math.round((start.y + end.y) / 2);
    if (middleY === start.y && middleY === end.y) {
        middleY += 2 * MIN_NEW_SEGMENT;
    }

    return [
        { x: startOutX, y: start.y },
        { x: startOutX, y: middleY },
        { x: endOutX, y: middleY },
        { x: endOutX, y: end.y },
    ];
};

/**
 * Full polyline `[start, ...bends, end]` where the first and the last bend
 * follow the y of the start and the end, so the line always enters the tables
 * horizontally. Segment `i` goes from point `i` to point `i + 1`.
 */
export const buildRoute = (
    start: RoutePoint,
    end: RoutePoint,
    bends: RoutePoint[]
): RoutePoint[] => {
    const last = bends.length - 1;
    return [
        start,
        ...bends.map((bend, i) => {
            if (i === 0) return { x: bend.x, y: start.y };
            if (i === last) return { x: bend.x, y: end.y };
            return bend;
        }),
        end,
    ];
};

/**
 * Writes the actual start and end y into the first and the last bend.
 */
export const snapBends = (
    start: RoutePoint,
    end: RoutePoint,
    bends: RoutePoint[]
): RoutePoint[] => buildRoute(start, end, bends).slice(1, -1);

/**
 * Index of the segment (of the full polyline) closest to the point.
 */
export const findNearestSegment = (
    points: RoutePoint[],
    point: RoutePoint
): number => {
    let best = { distance: Infinity, index: 0 };

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const t =
            lengthSquared === 0
                ? 0
                : Math.max(
                      0,
                      Math.min(
                          1,
                          ((point.x - a.x) * dx + (point.y - a.y) * dy) /
                              lengthSquared
                      )
                  );
        const distance = Math.hypot(
            point.x - (a.x + t * dx),
            point.y - (a.y + t * dy)
        );
        if (distance < best.distance) {
            best = { distance, index: i };
        }
    }

    return best.index;
};

/**
 * The longest segment of the full polyline and its middle.
 */
export const findLongestSegment = (
    points: RoutePoint[]
): { index: number; middle: RoutePoint } => {
    let best = { length: -1, index: 0 };
    for (let i = 0; i < points.length - 1; i++) {
        const length = Math.hypot(
            points[i + 1].x - points[i].x,
            points[i + 1].y - points[i].y
        );
        if (length > best.length) {
            best = { length, index: i };
        }
    }

    const a = points[best.index];
    const b = points[best.index + 1];
    return {
        index: best.index,
        middle: {
            x: Math.round((a.x + b.x) / 2),
            y: Math.round((a.y + b.y) / 2),
        },
    };
};

/**
 * Segment `index` of the full polyline is vertical when the index is odd.
 * The first and the last segment (horizontal, attached to the tables) can't
 * be moved.
 */
export const isSegmentVertical = (index: number): boolean => index % 2 === 1;

export const isSegmentMovable = (index: number, bendsCount: number): boolean =>
    index >= 1 && index <= bendsCount - 1;

/**
 * Moves segment `index` of the full polyline: a vertical one by x, a
 * horizontal one by y. Both its bends move, the neighbours just stretch.
 */
export const moveSegment = (
    bends: RoutePoint[],
    index: number,
    value: number
): RoutePoint[] => {
    if (!isSegmentMovable(index, bends.length)) {
        return bends;
    }

    const vertical = isSegmentVertical(index);
    return bends.map((bend, i) =>
        i === index - 1 || i === index
            ? vertical
                ? { x: value, y: bend.y }
                : { x: bend.x, y: value }
            : bend
    );
};

/**
 * Removes the inner segment `index` of the full polyline together with its two
 * bends, the neighbouring parallel segments are merged (4 bends -> 2, ...).
 * The part before the removed segment keeps its shape, the part after it is
 * stretched. The base route (2 bends) and the first / last segment can't be
 * removed.
 */
export const removeSegment = (
    bends: RoutePoint[],
    index: number
): RoutePoint[] => {
    if (bends.length < 4 || !isSegmentMovable(index, bends.length)) {
        return bends;
    }

    const before = bends.slice(0, index - 1);
    const after = bends.slice(index + 1);

    if (before.length > 0 && after.length > 0) {
        const anchor = before[before.length - 1];
        const first = after[0];
        after[0] = isSegmentVertical(index)
            ? { x: first.x, y: anchor.y }
            : { x: anchor.x, y: first.y };
    }

    return [...before, ...after];
};

/**
 * Keeps a vertical segment on the outer side of the table it is attached to
 * (the second segment: the source table, the last but one: the target table).
 * When the limits contradict each other (a single segment attached to both
 * tables which are placed unfavourably) the limits are not applied.
 */
export const clampVerticalSegmentX = (
    x: number,
    {
        attachedToStart,
        attachedToEnd,
        startX,
        endX,
        startSide,
        endSide,
        margin = ROUTE_TABLE_MARGIN,
    }: {
        attachedToStart: boolean;
        attachedToEnd: boolean;
        startX: number;
        endX: number;
        startSide: RouteSide;
        endSide: RouteSide;
        margin?: number;
    }
): number => {
    let min = -Infinity;
    let max = Infinity;

    if (attachedToStart) {
        if (startSide === 'left') {
            max = Math.min(max, startX - margin);
        } else {
            min = Math.max(min, startX + margin);
        }
    }

    if (attachedToEnd) {
        if (endSide === 'left') {
            max = Math.min(max, endX - margin);
        } else {
            min = Math.max(min, endX + margin);
        }
    }

    if (min > max) {
        return x;
    }

    return Math.round(Math.min(max, Math.max(min, x)));
};

/**
 * After the side of a table changes the segment attached to it can end up on
 * the wrong side (inside the table). Moves it outwards by `offset` then,
 * everything else stays as is.
 */
export const fitAttachedSegment = (
    bends: RoutePoint[],
    which: 'start' | 'end',
    edgeX: number,
    side: RouteSide,
    offset: number,
    margin = ROUTE_TABLE_MARGIN
): RoutePoint[] => {
    const index = which === 'start' ? 1 : bends.length - 1;
    if (!isSegmentMovable(index, bends.length)) {
        return bends;
    }

    const x = bends[index].x;
    const isOnWrongSide =
        side === 'left' ? x > edgeX - margin : x < edgeX + margin;
    if (!isOnWrongSide) {
        return bends;
    }

    return moveSegment(
        bends,
        index,
        Math.round(side === 'left' ? edgeX - offset : edgeX + offset)
    );
};

const keepInside = (value: number, a: number, b: number): number => {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const margin = Math.min(ROUTE_TABLE_MARGIN, (high - low) / 4);
    return Math.round(Math.min(high - margin, Math.max(low + margin, value)));
};

// Half of the way from `from` to `to`, but not shorter than the minimal segment
const halfway = (from: number, to: number): number => {
    const half = (to - from) / 2;
    const direction = half < 0 ? -1 : 1;
    return Math.round(
        from + direction * Math.max(Math.abs(half), MIN_NEW_SEGMENT)
    );
};

/**
 * Adds two bends to the route at the double-clicked point of segment `index`
 * of the full polyline.
 *
 * Starting at the clicked point the line goes perpendicular to the segment
 * for a half of the distance to the end of the next segment (for the last
 * segment: of the previous one), then goes to the line of that segment and
 * continues along it. The first and the last segments stay horizontal.
 */
export const addBendsAt = (
    start: RoutePoint,
    end: RoutePoint,
    bends: RoutePoint[],
    index: number,
    click: RoutePoint
): RoutePoint[] => {
    const points = buildRoute(start, end, bends);
    const lastIndex = points.length - 2;
    const clamped = Math.max(0, Math.min(lastIndex, index));
    const vertical = isSegmentVertical(clamped);

    const a = points[clamped];
    const b = points[clamped + 1];

    let result: RoutePoint[];

    if (clamped < lastIndex) {
        // go along the next segment
        const next = points[clamped + 2];

        if (vertical) {
            const cy = keepInside(click.y, a.y, b.y);
            const xm = halfway(a.x, next.x);
            result = [
                ...points.slice(0, clamped + 1),
                { x: a.x, y: cy },
                { x: xm, y: cy },
                { x: xm, y: b.y },
                ...points.slice(clamped + 2),
            ];
        } else {
            const cx = keepInside(click.x, a.x, b.x);
            const ym = halfway(a.y, next.y);
            result = [
                ...points.slice(0, clamped + 1),
                { x: cx, y: a.y },
                { x: cx, y: ym },
                { x: b.x, y: ym },
                ...points.slice(clamped + 2),
            ];
        }
    } else {
        // the last segment: mirror, use the previous one
        const previous = points[clamped - 1];
        const cx = keepInside(click.x, a.x, b.x);
        const ym = halfway(b.y, previous.y);
        result = [
            ...points.slice(0, clamped),
            { x: a.x, y: ym },
            { x: cx, y: ym },
            { x: cx, y: b.y },
            b,
        ];
    }

    return result.slice(1, -1);
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

    if (points.length === 1) {
        return points[0];
    }

    return findLongestSegment(points).middle;
};
