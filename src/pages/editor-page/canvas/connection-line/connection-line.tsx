import React, { useMemo } from 'react';
import type { ConnectionLineComponentProps } from '@xyflow/react';
import { getSmoothStepPath, Position, useViewport } from '@xyflow/react';
import type { NodeType } from '../canvas';
import {
    LEFT_HANDLE_ID_PREFIX,
    RIGHT_HANDLE_ID_PREFIX,
} from '../table-node/table-node-field';
import { useChartDB } from '@/hooks/use-chartdb';
import { useLocalConfig } from '@/hooks/use-local-config';
import type { RoutePoint, RouteSide } from '@/lib/utils/route-utils';
import {
    buildRoute,
    dedupePoints,
    getDefaultRoute,
    pointsToRoundedPath,
} from '@/lib/utils/route-utils';

const TARGET_HANDLE_OFFSET_X = -3;

export const ConnectionLine: React.FC<
    ConnectionLineComponentProps<NodeType>
> = ({
    fromNode,
    fromHandle,
    fromX,
    fromY,
    toNode,
    toX,
    toY,
    fromPosition,
    toPosition,
    pointer,
}) => {
    const { relationships } = useChartDB();
    const { showCardinality } = useLocalConfig();
    const { x: viewportX, zoom } = useViewport();

    // The preview is built exactly like the relationship edge will be drawn
    // (see RelationshipEdge): same endpoints, same sides, same default route.
    const edgePath = useMemo(() => {
        const handleId = fromHandle?.id ?? '';
        const fieldId = handleId.split('_').pop() ?? '';
        const leftHandle = fromNode?.internals.handleBounds?.source?.find(
            (handle) => handle.id === `${LEFT_HANDLE_ID_PREFIX}${fieldId}`
        );
        const isFieldHandle =
            handleId.startsWith(LEFT_HANDLE_ID_PREFIX) ||
            handleId.startsWith(RIGHT_HANDLE_ID_PREFIX);

        if (!fromNode || !isFieldHandle || !leftHandle) {
            // not a field relationship (e.g. a dependency)
            const [path] = getSmoothStepPath({
                sourceX: fromX,
                sourceY: fromY,
                sourcePosition: fromPosition ?? Position.Right,
                targetX: toX,
                targetY: toY,
                targetPosition: toPosition ?? Position.Left,
                borderRadius: 14,
            });
            return path;
        }

        // x of the left handle relative to the table is the same for all the tables
        const handleOffsetX = leftHandle.x;
        const sourceLeftHandleX =
            fromNode.internals.positionAbsolute.x + handleOffsetX;
        const sourceWidth = fromNode.measured.width ?? 0;

        const startSide: RouteSide = handleId.startsWith(RIGHT_HANDLE_ID_PREFIX)
            ? 'right'
            : 'left';
        const start: RoutePoint = {
            x: Math.round(
                startSide === 'left'
                    ? sourceLeftHandleX + 3
                    : sourceLeftHandleX + sourceWidth + 9
            ),
            y: Math.round(fromY),
        };

        let end: RoutePoint;
        let endSide: RouteSide;
        let edgeNumber = 0;

        if (toNode) {
            // While connecting the target handle is a field-wide overlay, the
            // real relationship uses the regular 6px left handle (centered
            // on the table border)
            const targetLeftHandleX =
                toNode.internals.positionAbsolute.x + TARGET_HANDLE_OFFSET_X;
            const targetWidth = toNode.measured.width ?? 0;
            const centerX =
                toNode.internals.positionAbsolute.x + targetWidth / 2;

            // the same rule is used when the relationship is created
            // (`pointer` is relative to the canvas in screen pixels)
            const pointerFlowX = (pointer.x - viewportX) / zoom;
            endSide = pointerFlowX < centerX ? 'left' : 'right';
            end = {
                x: Math.round(
                    endSide === 'left'
                        ? targetLeftHandleX - 1
                        : targetLeftHandleX + targetWidth + 10
                ),
                y: Math.round(toY),
            };

            edgeNumber = relationships.filter(
                (relationship) =>
                    (relationship.sourceTableId === fromNode.id &&
                        relationship.targetTableId === toNode.id) ||
                    (relationship.sourceTableId === toNode.id &&
                        relationship.targetTableId === fromNode.id)
            ).length;
        } else {
            // nothing to connect to yet: the line follows the cursor and
            // comes in from the side facing the source
            endSide = toX >= start.x ? 'left' : 'right';
            end = { x: Math.round(toX), y: Math.round(toY) };
        }

        const bends = getDefaultRoute({
            start,
            end,
            startSide,
            endSide,
            offset: (edgeNumber + 1 + (showCardinality ? 1.5 : 0)) * 14,
        });

        return pointsToRoundedPath(
            dedupePoints(buildRoute(start, end, bends)),
            14
        );
    }, [
        fromNode,
        fromHandle,
        fromX,
        fromY,
        toNode,
        toX,
        toY,
        fromPosition,
        toPosition,
        pointer,
        viewportX,
        zoom,
        relationships,
        showCardinality,
    ]);

    return (
        <g>
            <path
                fill="none"
                stroke="#ec4899"
                strokeWidth={2}
                strokeDasharray="5,5"
                d={edgePath}
            />
            <circle
                cx={toX}
                cy={toY}
                fill="#fff"
                r={3}
                stroke="#ec4899"
                strokeWidth={1.5}
            />
        </g>
    );
};
