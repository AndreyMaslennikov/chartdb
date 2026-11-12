import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Edge, EdgeProps } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import type {
    DBRelationship,
    Cardinality,
    RelationshipSide,
} from '@/lib/domain/db-relationship';
import { RIGHT_HANDLE_ID_PREFIX } from '../table-node/table-node-field';
import { useChartDB } from '@/hooks/use-chartdb';
import { cn } from '@/lib/utils';
import { getCardinalityMarkerId } from '../canvas-utils';
import { useDiff } from '@/context/diff-context/use-diff';
import { useLocalConfig } from '@/hooks/use-local-config';
import { useCanvas } from '@/hooks/use-canvas';
import { EditRelationshipPopover } from './edit-relationship-popover';
import type { RoutePoint } from '@/lib/utils/route-utils';
import {
    addBendsAt,
    buildRoute,
    clampVerticalSegmentX,
    dedupePoints,
    findLongestSegment,
    findNearestSegment,
    fitAttachedSegment,
    getDefaultRoute,
    getRouteMidpoint,
    isSegmentMovable,
    isSegmentVertical,
    moveSegment,
    parseRoute,
    pointsToRoundedPath,
    removeSegment,
    snapBends,
} from '@/lib/utils/route-utils';
import { EllipsisIcon, MessageCircleMore } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipPortal,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';

export type RelationshipEdgeType = Edge<
    {
        relationship: DBRelationship;
        highlighted?: boolean;
    },
    'relationship-edge'
>;

export const RelationshipEdge: React.FC<EdgeProps<RelationshipEdgeType>> =
    React.memo(
        ({
            id,
            sourceX,
            sourceY,
            targetX,
            targetY,
            source,
            target,
            selected,
            data,
        }) => {
            const { getInternalNode, getEdge, screenToFlowPosition } =
                useReactFlow();
            const { checkIfRelationshipRemoved, checkIfNewRelationship } =
                useDiff();
            const { showCardinality } = useLocalConfig();

            const { relationships, updateRelationship, removeRelationship } =
                useChartDB();
            const {
                editRelationshipPopover,
                openRelationshipPopover,
                closeRelationshipPopover,
            } = useCanvas();

            const relationship = data?.relationship;
            const isLogical = !!relationship?.isLogical;

            // Manual route (a list of bends, see route-utils). While a segment
            // is dragged the local copy is used, the result is saved on release.
            const savedBends = useMemo(
                () => parseRoute(relationship?.waypoints),
                [relationship?.waypoints]
            );
            const [dragBends, setDragBends] = useState<RoutePoint[] | null>(
                null
            );

            useEffect(() => {
                setDragBends(null);
            }, [relationship?.waypoints]);

            const isPopoverOpen = useMemo(
                () => editRelationshipPopover?.relationshipId === id,
                [editRelationshipPopover, id]
            );

            const handleContextMenu = useCallback(
                (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openRelationshipPopover({
                        relationshipId: id,
                        position: { x: e.clientX, y: e.clientY },
                    });
                },
                [id, openRelationshipPopover]
            );

            const handleIndicatorClick = useCallback(
                (e: React.MouseEvent) => {
                    e.stopPropagation();
                    openRelationshipPopover({
                        relationshipId: id,
                        position: { x: e.clientX, y: e.clientY },
                    });
                },
                [id, openRelationshipPopover]
            );

            const handleToggleLogical = useCallback(async () => {
                if (!relationship) return;

                await updateRelationship(
                    id,
                    { isLogical: !relationship.isLogical },
                    { updateHistory: true }
                );
            }, [id, relationship, updateRelationship]);

            const handleCommentsChange = useCallback(
                async (comments: string) => {
                    if (!relationship) return;

                    const newComments = comments.trim() || null;
                    if ((relationship.comments ?? null) === newComments) {
                        return;
                    }

                    await updateRelationship(
                        id,
                        { comments: newComments },
                        { updateHistory: true }
                    );
                },
                [id, relationship, updateRelationship]
            );

            const handleSwitchTables = useCallback(async () => {
                if (!relationship) return;

                const sameCardinality =
                    relationship.sourceCardinality ===
                    relationship.targetCardinality;

                if (sameCardinality) {
                    // Equal cardinalities: swap everything (tables, fields, schemas, cardinalities)
                    await updateRelationship(
                        id,
                        {
                            sourceSchema: relationship.targetSchema,
                            targetSchema: relationship.sourceSchema,
                            sourceTableId: relationship.targetTableId,
                            targetTableId: relationship.sourceTableId,
                            sourceFieldId: relationship.targetFieldId,
                            targetFieldId: relationship.sourceFieldId,
                            sourceSide: relationship.targetSide ?? null,
                            targetSide: relationship.sourceSide ?? null,
                            sourceCardinality: relationship.targetCardinality,
                            targetCardinality: relationship.sourceCardinality,
                        },
                        { updateHistory: true }
                    );
                } else if (relationship.sourceCardinality === 'many') {
                    // many:one → one:many (swap cardinalities so "many" moves to target)
                    await updateRelationship(
                        id,
                        {
                            sourceCardinality: 'one',
                            targetCardinality: 'many',
                        },
                        { updateHistory: true }
                    );
                } else {
                    // one:many → swap tables/fields/schemas (keeps one:many with different tables)
                    await updateRelationship(
                        id,
                        {
                            sourceSchema: relationship.targetSchema,
                            targetSchema: relationship.sourceSchema,
                            sourceTableId: relationship.targetTableId,
                            targetTableId: relationship.sourceTableId,
                            sourceFieldId: relationship.targetFieldId,
                            targetFieldId: relationship.sourceFieldId,
                            sourceSide: relationship.targetSide ?? null,
                            targetSide: relationship.sourceSide ?? null,
                        },
                        { updateHistory: true }
                    );
                }

                closeRelationshipPopover();
            }, [
                id,
                relationship,
                updateRelationship,
                closeRelationshipPopover,
            ]);

            const handleCardinalityChange = useCallback(
                async (
                    newSourceCardinality: Cardinality,
                    newTargetCardinality: Cardinality
                ) => {
                    if (!relationship) return;

                    // Ensure "many" is always on target side when cardinalities differ
                    // If trying to set many:one (N:1), swap tables and set one:many
                    if (
                        newSourceCardinality === 'many' &&
                        newTargetCardinality === 'one'
                    ) {
                        await updateRelationship(
                            id,
                            {
                                // Swap tables/fields/schemas
                                sourceSchema: relationship.targetSchema,
                                targetSchema: relationship.sourceSchema,
                                sourceTableId: relationship.targetTableId,
                                targetTableId: relationship.sourceTableId,
                                sourceFieldId: relationship.targetFieldId,
                                targetFieldId: relationship.sourceFieldId,
                                sourceSide: relationship.targetSide ?? null,
                                targetSide: relationship.sourceSide ?? null,
                                // Set one:many (many on target)
                                sourceCardinality: 'one',
                                targetCardinality: 'many',
                            },
                            { updateHistory: true }
                        );
                    } else {
                        await updateRelationship(
                            id,
                            {
                                sourceCardinality: newSourceCardinality,
                                targetCardinality: newTargetCardinality,
                            },
                            { updateHistory: true }
                        );
                    }
                    closeRelationshipPopover();
                },
                [id, relationship, updateRelationship, closeRelationshipPopover]
            );

            const handleDelete = useCallback(() => {
                removeRelationship(id, { updateHistory: true });
                closeRelationshipPopover();
            }, [id, removeRelationship, closeRelationshipPopover]);

            const edgeNumber = useMemo(() => {
                let index = 0;
                for (const rel of relationships) {
                    if (
                        (rel.targetTableId === target &&
                            rel.sourceTableId === source) ||
                        (rel.targetTableId === source &&
                            rel.sourceTableId === target)
                    ) {
                        if (rel.id === id) return index;
                        index++;
                    }
                }
                return -1;
            }, [relationships, id, source, target]);

            const sourceNode = useMemo(
                () => getInternalNode(source),
                [getInternalNode, source]
            );
            const targetNode = useMemo(
                () => getInternalNode(target),
                [getInternalNode, target]
            );
            const edge = useMemo(() => getEdge(id), [getEdge, id]);

            const sourceHandle: 'left' | 'right' = useMemo(
                () =>
                    edge?.sourceHandle?.startsWith?.(RIGHT_HANDLE_ID_PREFIX)
                        ? 'right'
                        : 'left',
                [edge?.sourceHandle]
            );

            const sourceWidth = sourceNode?.measured.width ?? 0;
            const sourceLeftX =
                sourceHandle === 'left'
                    ? sourceX + 3
                    : sourceX - sourceWidth - 10;
            const sourceRightX =
                sourceHandle === 'left' ? sourceX + sourceWidth + 9 : sourceX;

            const targetWidth = targetNode?.measured.width ?? 0;
            const targetLeftX = targetX - 1;
            const targetRightX = targetX + targetWidth + 10;

            const { sourceSide: autoSourceSide, targetSide: autoTargetSide } =
                useMemo(() => {
                    const distances = {
                        leftToLeft: Math.abs(sourceLeftX - targetLeftX),
                        leftToRight: Math.abs(sourceLeftX - targetRightX),
                        rightToLeft: Math.abs(sourceRightX - targetLeftX),
                        rightToRight: Math.abs(sourceRightX - targetRightX),
                    };

                    const minDistance = Math.min(
                        distances.leftToLeft,
                        distances.leftToRight,
                        distances.rightToLeft,
                        distances.rightToRight
                    );

                    const minDistanceKey = Object.keys(distances).find(
                        (key) =>
                            distances[key as keyof typeof distances] ===
                            minDistance
                    ) as keyof typeof distances;

                    switch (minDistanceKey) {
                        case 'leftToRight':
                            return { sourceSide: 'left', targetSide: 'right' };
                        case 'rightToLeft':
                            return { sourceSide: 'right', targetSide: 'left' };
                        case 'rightToRight':
                            return { sourceSide: 'right', targetSide: 'right' };
                        default:
                            return { sourceSide: 'left', targetSide: 'left' };
                    }
                }, [sourceLeftX, sourceRightX, targetLeftX, targetRightX]);

            // The side can be chosen manually (saved on the relationship, or
            // local while the end handle is dragged), otherwise it is automatic
            const [dragSides, setDragSides] = useState<{
                source?: RelationshipSide;
                target?: RelationshipSide;
            }>({});
            useEffect(() => {
                setDragSides({});
            }, [relationship?.sourceSide, relationship?.targetSide]);

            const sourceSide: RelationshipSide =
                dragSides.source ??
                relationship?.sourceSide ??
                (autoSourceSide as RelationshipSide);
            const targetSide: RelationshipSide =
                dragSides.target ??
                relationship?.targetSide ??
                (autoTargetSide as RelationshipSide);

            // Edge endpoints (same ones the automatic route uses)
            const routeStart: RoutePoint = useMemo(
                () => ({
                    x: Math.round(
                        sourceSide === 'left' ? sourceLeftX : sourceRightX
                    ),
                    y: Math.round(sourceY),
                }),
                [sourceSide, sourceLeftX, sourceRightX, sourceY]
            );
            const routeEnd: RoutePoint = useMemo(
                () => ({
                    x: Math.round(
                        targetSide === 'left' ? targetLeftX : targetRightX
                    ),
                    y: Math.round(targetY),
                }),
                [targetSide, targetLeftX, targetRightX, targetY]
            );

            // Distance the line leaves the tables by when the sides don't face
            // each other, grows for parallel relationships between the tables
            const segmentOffset =
                (edgeNumber + 1 + (showCardinality && !isLogical ? 1.5 : 0)) *
                14;

            const bends = useMemo(
                () =>
                    dragBends ??
                    savedBends ??
                    getDefaultRoute({
                        start: routeStart,
                        end: routeEnd,
                        startSide: sourceSide,
                        endSide: targetSide,
                        offset: segmentOffset,
                    }),
                [
                    dragBends,
                    savedBends,
                    routeStart,
                    routeEnd,
                    sourceSide,
                    targetSide,
                    segmentOffset,
                ]
            );

            // Segment i goes from fullRoute[i] to fullRoute[i + 1]
            const fullRoute = useMemo(
                () => buildRoute(routeStart, routeEnd, bends),
                [routeStart, routeEnd, bends]
            );
            const routePoints = useMemo(
                () => dedupePoints(fullRoute),
                [fullRoute]
            );

            // Alt/Option over a removable segment: show what will be removed
            const [hoverSegment, setHoverSegment] = useState<number | null>(
                null
            );
            const [altPressed, setAltPressed] = useState(false);
            const isHoveringSegment = hoverSegment !== null;

            useEffect(() => {
                if (!isHoveringSegment) {
                    setAltPressed(false);
                    return;
                }

                const onKey = (event: KeyboardEvent) =>
                    setAltPressed(event.altKey);
                window.addEventListener('keydown', onKey);
                window.addEventListener('keyup', onKey);
                return () => {
                    window.removeEventListener('keydown', onKey);
                    window.removeEventListener('keyup', onKey);
                };
            }, [isHoveringSegment]);

            // segment indexes change when bends are added or removed
            useEffect(() => {
                setHoverSegment(null);
            }, [bends.length]);

            // the cross is drawn in the middle of the segment to be removed
            const removeMarker = useMemo(() => {
                if (
                    hoverSegment === null ||
                    !altPressed ||
                    bends.length < 4 ||
                    !isSegmentMovable(hoverSegment, bends.length)
                ) {
                    return null;
                }

                const from = fullRoute[hoverSegment];
                const to = fullRoute[hoverSegment + 1];
                return {
                    x: Math.round((from.x + to.x) / 2),
                    y: Math.round((from.y + to.y) / 2),
                };
            }, [hoverSegment, altPressed, bends.length, fullRoute]);

            const edgePath = useMemo(
                () => pointsToRoundedPath(routePoints, 14),
                [routePoints]
            );

            const sourceMarker = useMemo(
                () =>
                    getCardinalityMarkerId({
                        cardinality: relationship?.sourceCardinality ?? 'one',
                        selected: selected ?? false,
                        side: sourceSide,
                    }),
                [relationship?.sourceCardinality, selected, sourceSide]
            );
            const targetMarker = useMemo(
                () =>
                    getCardinalityMarkerId({
                        cardinality: relationship?.targetCardinality ?? 'one',
                        selected: selected ?? false,
                        side: targetSide,
                    }),
                [relationship?.targetCardinality, selected, targetSide]
            );

            const isDiffNewRelationship = useMemo(
                () =>
                    relationship?.id
                        ? checkIfNewRelationship({
                              relationshipId: relationship.id,
                          })
                        : false,
                [checkIfNewRelationship, relationship?.id]
            );

            const isDiffRelationshipRemoved = useMemo(
                () =>
                    relationship?.id
                        ? checkIfRelationshipRemoved({
                              relationshipId: relationship.id,
                          })
                        : false,
                [checkIfRelationshipRemoved, relationship?.id]
            );

            // Calculate the midpoint of the edge for the indicator
            const edgeMidpoint = useMemo(
                () => getRouteMidpoint(routePoints),
                [routePoints]
            );

            const saveBends = useCallback(
                (newBends: RoutePoint[] | null) =>
                    updateRelationship(
                        id,
                        {
                            waypoints:
                                newBends && newBends.length > 0
                                    ? snapBends(routeStart, routeEnd, newBends)
                                    : null,
                        },
                        { updateHistory: true }
                    ),
                [id, updateRelationship, routeStart, routeEnd]
            );

            const handleResetRoute = useCallback(() => {
                updateRelationship(
                    id,
                    { waypoints: null, sourceSide: null, targetSide: null },
                    { updateHistory: true }
                );
                closeRelationshipPopover();
            }, [id, updateRelationship, closeRelationshipPopover]);

            // Double click on the line adds two bends at the clicked point
            const handleEdgeDoubleClick = useCallback(
                (e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();

                    const point = screenToFlowPosition({
                        x: e.clientX,
                        y: e.clientY,
                    });
                    const segmentIndex = findNearestSegment(fullRoute, point);
                    saveBends(
                        addBendsAt(
                            routeStart,
                            routeEnd,
                            bends,
                            segmentIndex,
                            point
                        )
                    );
                },
                [
                    screenToFlowPosition,
                    fullRoute,
                    saveBends,
                    routeStart,
                    routeEnd,
                    bends,
                ]
            );

            const handleAddBend = useCallback(() => {
                const { index, middle } = findLongestSegment(fullRoute);
                saveBends(
                    addBendsAt(routeStart, routeEnd, bends, index, middle)
                );
                closeRelationshipPopover();
            }, [
                fullRoute,
                saveBends,
                routeStart,
                routeEnd,
                bends,
                closeRelationshipPopover,
            ]);

            // Dragging an end of the line to the other half of its table
            // changes the side the line is attached to
            const handleEndPointerDown = useCallback(
                (
                    end: 'source' | 'target',
                    e: React.PointerEvent<SVGCircleElement>
                ) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();

                    const node = end === 'source' ? sourceNode : targetNode;
                    if (!node) return;

                    const handle = e.currentTarget;
                    const pointerId = e.pointerId;
                    handle.setPointerCapture(pointerId);

                    const centerX =
                        node.internals.positionAbsolute.x +
                        (node.measured.width ?? 0) / 2;
                    const initialSide =
                        end === 'source' ? sourceSide : targetSide;
                    let latest = initialSide;

                    const onMove = (event: PointerEvent) => {
                        const point = screenToFlowPosition({
                            x: event.clientX,
                            y: event.clientY,
                        });
                        const side: RelationshipSide =
                            point.x < centerX ? 'left' : 'right';
                        if (side === latest) return;

                        latest = side;
                        setDragSides((prev) => ({ ...prev, [end]: side }));
                    };

                    const onUp = () => {
                        handle.removeEventListener('pointermove', onMove);
                        handle.removeEventListener('pointerup', onUp);
                        handle.releasePointerCapture(pointerId);

                        if (latest === initialSide) {
                            return;
                        }

                        // keep the bends, only move the segment attached to
                        // this table when it is now on the wrong side of it
                        const edgeX = Math.round(
                            end === 'source'
                                ? latest === 'left'
                                    ? sourceLeftX
                                    : sourceRightX
                                : latest === 'left'
                                  ? targetLeftX
                                  : targetRightX
                        );
                        const fitted = savedBends
                            ? fitAttachedSegment(
                                  savedBends,
                                  end === 'source' ? 'start' : 'end',
                                  edgeX,
                                  latest,
                                  segmentOffset
                              )
                            : null;

                        updateRelationship(
                            id,
                            {
                                [end === 'source'
                                    ? 'sourceSide'
                                    : 'targetSide']: latest,
                                ...(fitted && fitted !== savedBends
                                    ? { waypoints: fitted }
                                    : {}),
                            },
                            { updateHistory: true }
                        );
                    };

                    handle.addEventListener('pointermove', onMove);
                    handle.addEventListener('pointerup', onUp);
                },
                [
                    sourceNode,
                    targetNode,
                    sourceSide,
                    targetSide,
                    screenToFlowPosition,
                    sourceLeftX,
                    sourceRightX,
                    targetLeftX,
                    targetRightX,
                    savedBends,
                    segmentOffset,
                    id,
                    updateRelationship,
                ]
            );

            const handleSegmentPointerDown = useCallback(
                (
                    segmentIndex: number,
                    e: React.PointerEvent<SVGLineElement>
                ) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();

                    // Alt/Option + click removes the segment with its two bends
                    if (e.altKey) {
                        setHoverSegment(null);
                        saveBends(removeSegment(bends, segmentIndex));
                        return;
                    }

                    const handle = e.currentTarget;
                    const pointerId = e.pointerId;
                    handle.setPointerCapture(pointerId);

                    const vertical = isSegmentVertical(segmentIndex);
                    const startSide = sourceSide;
                    const endSide = targetSide;
                    let latest: RoutePoint[] | null = null;

                    const onMove = (event: PointerEvent) => {
                        const point = screenToFlowPosition({
                            x: event.clientX,
                            y: event.clientY,
                        });
                        const value = vertical
                            ? clampVerticalSegmentX(Math.round(point.x), {
                                  attachedToStart: segmentIndex === 1,
                                  attachedToEnd:
                                      segmentIndex === bends.length - 1,
                                  startX: routeStart.x,
                                  endX: routeEnd.x,
                                  startSide,
                                  endSide,
                              })
                            : Math.round(point.y);

                        latest = moveSegment(bends, segmentIndex, value);
                        setDragBends(latest);
                    };

                    const onUp = () => {
                        handle.removeEventListener('pointermove', onMove);
                        handle.removeEventListener('pointerup', onUp);
                        handle.releasePointerCapture(pointerId);

                        if (!latest) {
                            return;
                        }
                        saveBends(latest);
                    };

                    handle.addEventListener('pointermove', onMove);
                    handle.addEventListener('pointerup', onUp);
                },
                [
                    bends,
                    sourceSide,
                    targetSide,
                    routeStart,
                    routeEnd,
                    screenToFlowPosition,
                    saveBends,
                ]
            );

            return (
                <>
                    <path
                        id={id}
                        d={edgePath}
                        markerStart={
                            isLogical ? undefined : `url(#${sourceMarker})`
                        }
                        markerEnd={
                            isLogical ? undefined : `url(#${targetMarker})`
                        }
                        strokeDasharray={isLogical ? '6 5' : undefined}
                        fill="none"
                        className={cn([
                            'react-flow__edge-path',
                            `!stroke-2 ${selected ? '!stroke-pink-600' : '!stroke-slate-400'}`,
                            {
                                '!stroke-green-500 !stroke-[3px]':
                                    isDiffNewRelationship,
                                '!stroke-red-500 !stroke-[3px]':
                                    isDiffRelationshipRemoved,
                            },
                        ])}
                        onDoubleClick={handleEdgeDoubleClick}
                        onContextMenu={handleContextMenu}
                    />
                    <path
                        d={edgePath}
                        fill="none"
                        strokeOpacity={0}
                        strokeWidth={20}
                        // eslint-disable-next-line tailwindcss/no-custom-classname
                        className="react-flow__edge-interaction"
                        onDoubleClick={handleEdgeDoubleClick}
                        onContextMenu={handleContextMenu}
                    />
                    {fullRoute.slice(0, -1).map((from, index) => {
                        const to = fullRoute[index + 1];
                        if (
                            !isSegmentMovable(index, bends.length) ||
                            (from.x === to.x && from.y === to.y)
                        ) {
                            return null;
                        }

                        return (
                            <line
                                key={index}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                stroke="transparent"
                                strokeWidth={14}
                                // eslint-disable-next-line tailwindcss/no-custom-classname
                                className="nodrag nopan"
                                style={{
                                    pointerEvents: 'stroke',
                                    cursor:
                                        removeMarker && hoverSegment === index
                                            ? 'pointer'
                                            : isSegmentVertical(index)
                                              ? 'ew-resize'
                                              : 'ns-resize',
                                }}
                                onPointerDown={(e) =>
                                    handleSegmentPointerDown(index, e)
                                }
                                onPointerEnter={(e) => {
                                    setAltPressed(e.altKey);
                                    setHoverSegment(index);
                                }}
                                onPointerMove={(e) => {
                                    if (e.altKey !== altPressed) {
                                        setAltPressed(e.altKey);
                                    }
                                }}
                                onPointerLeave={() => setHoverSegment(null)}
                                onDoubleClick={handleEdgeDoubleClick}
                                onContextMenu={handleContextMenu}
                            >
                                <title>
                                    {bends.length >= 4
                                        ? 'Drag to move, double-click to add bends, Alt+click to remove'
                                        : 'Drag to move, double-click to add bends'}
                                </title>
                            </line>
                        );
                    })}
                    {removeMarker && (
                        <path
                            d={`M ${removeMarker.x - 6} ${removeMarker.y - 6} L ${removeMarker.x + 6} ${removeMarker.y + 6} M ${removeMarker.x + 6} ${removeMarker.y - 6} L ${removeMarker.x - 6} ${removeMarker.y + 6}`}
                            stroke="#db2777"
                            strokeWidth={3}
                            strokeLinecap="round"
                            fill="none"
                            // a highlighted edge is `animated`: its paths get a
                            // moving dashed stroke from the react flow styles
                            style={{
                                pointerEvents: 'none',
                                strokeDasharray: 'none',
                                animation: 'none',
                            }}
                        />
                    )}
                    {selected &&
                        (
                            [
                                ['source', routeStart],
                                ['target', routeEnd],
                            ] as const
                        ).map(([end, point]) => (
                            <circle
                                key={end}
                                cx={point.x}
                                cy={point.y}
                                r={6}
                                strokeWidth={2}
                                // eslint-disable-next-line tailwindcss/no-custom-classname
                                className="nodrag nopan fill-pink-600 stroke-white"
                                style={{
                                    pointerEvents: 'all',
                                    cursor: 'grab',
                                }}
                                onPointerDown={(e) =>
                                    handleEndPointerDown(end, e)
                                }
                            >
                                <title>
                                    Drag to the other half of the table to
                                    change the side
                                </title>
                            </circle>
                        ))}
                    {isLogical && relationship?.comments && (
                        <foreignObject
                            width={24}
                            height={24}
                            // keep clear of the edit button shown at the midpoint when selected
                            x={edgeMidpoint.x - (selected ? 40 : 12)}
                            y={edgeMidpoint.y - 12}
                            className="overflow-visible"
                            style={{ pointerEvents: 'all' }}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="flex size-6 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground shadow"
                                        onClick={handleIndicatorClick}
                                    >
                                        <MessageCircleMore size={14} />
                                    </div>
                                </TooltipTrigger>
                                <TooltipPortal>
                                    <TooltipContent
                                        side="top"
                                        className="max-w-xs whitespace-pre-wrap break-words"
                                    >
                                        {relationship.comments}
                                    </TooltipContent>
                                </TooltipPortal>
                            </Tooltip>
                        </foreignObject>
                    )}
                    {selected && (
                        <foreignObject
                            width={24}
                            height={24}
                            x={edgeMidpoint.x - 12}
                            y={edgeMidpoint.y - 12}
                            className="overflow-visible"
                            style={{ pointerEvents: 'all' }}
                        >
                            <button
                                onClick={handleIndicatorClick}
                                className="relative flex size-6 items-center justify-center rounded-full border-2 border-pink-600 bg-background shadow-lg transition-all hover:scale-110 hover:bg-pink-50"
                                title="Edit relationship"
                                style={{ zIndex: 10 }}
                            >
                                <EllipsisIcon className="size-4 text-pink-600" />
                            </button>
                        </foreignObject>
                    )}
                    {relationship &&
                        isPopoverOpen &&
                        editRelationshipPopover?.position &&
                        createPortal(
                            <EditRelationshipPopover
                                anchorPosition={
                                    editRelationshipPopover.position
                                }
                                relationshipId={id}
                                sourceCardinality={
                                    relationship.sourceCardinality ?? 'one'
                                }
                                targetCardinality={
                                    relationship.targetCardinality ?? 'one'
                                }
                                isLogical={isLogical}
                                comments={relationship.comments ?? ''}
                                onToggleLogical={handleToggleLogical}
                                hasWaypoints={
                                    !!relationship.waypoints?.length ||
                                    !!relationship.sourceSide ||
                                    !!relationship.targetSide
                                }
                                onAddBend={handleAddBend}
                                onResetRoute={handleResetRoute}
                                onCommentsChange={handleCommentsChange}
                                onCardinalityChange={handleCardinalityChange}
                                onSwitch={handleSwitchTables}
                                onDelete={handleDelete}
                            />,
                            document.body
                        )}
                </>
                // <BaseEdge
                //     id={id}
                //     path={edgePath}
                //     markerStart="url(#cardinality_one)"
                //     markerEnd="url(#cardinality_one)"
                //     className={`!stroke-2 ${selected ? '!stroke-slate-500' : '!stroke-slate-300'}`}
                // />
            );
        }
    );

RelationshipEdge.displayName = 'RelationshipEdge';
