import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Trash2,
    ArrowLeftRight,
    CircleDotDashed,
    Link2,
    Plus,
    RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/input/input';
import { Button } from '@/components/button/button';
import type { Cardinality } from '@/lib/domain/db-relationship';
import { cn } from '@/lib/utils';
import { useClickAway } from 'react-use';
import { useCanvas } from '@/hooks/use-canvas';
import { useLayout } from '@/hooks/use-layout';

export interface EditRelationshipPopoverProps {
    anchorPosition: { x: number; y: number };
    relationshipId: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    isLogical: boolean;
    comments: string;
    onToggleLogical: () => void;
    hasWaypoints: boolean;
    onAddBend: () => void;
    onResetRoute: () => void;
    onCommentsChange: (comments: string) => void;
    onCardinalityChange: (
        sourceCardinality: Cardinality,
        targetCardinality: Cardinality
    ) => void;
    onSwitch: () => void;
    onDelete: () => void;
}

type RelationshipTypeOption = {
    label: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
};

const relationshipTypes: RelationshipTypeOption[] = [
    { label: '1:1', sourceCardinality: 'one', targetCardinality: 'one' },
    { label: '1:N', sourceCardinality: 'one', targetCardinality: 'many' },
];

export const EditRelationshipPopover: React.FC<
    EditRelationshipPopoverProps
> = ({
    anchorPosition,
    relationshipId,
    sourceCardinality,
    targetCardinality,
    isLogical,
    comments,
    onToggleLogical,
    hasWaypoints,
    onAddBend,
    onResetRoute,
    onCommentsChange,
    onCardinalityChange,
    onSwitch,
    onDelete,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const { closeRelationshipPopover } = useCanvas();
    const { selectSidebarSection, openRelationshipFromSidebar } = useLayout();

    const [commentsDraft, setCommentsDraft] = useState(comments);
    const commentsDraftRef = useRef(commentsDraft);
    commentsDraftRef.current = commentsDraft;

    useEffect(() => {
        setCommentsDraft(comments);
    }, [comments]);

    // Persist an unsaved comment when the popover is closed by clicking away
    useClickAway(popoverRef, () => {
        if (isLogical) {
            onCommentsChange(commentsDraftRef.current);
        }
        closeRelationshipPopover();
    });

    const openRelationshipInSidebar = useCallback(() => {
        selectSidebarSection('refs');
        openRelationshipFromSidebar(relationshipId);
        closeRelationshipPopover();
    }, [
        selectSidebarSection,
        openRelationshipFromSidebar,
        relationshipId,
        closeRelationshipPopover,
    ]);

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
            style={{
                left: anchorPosition.x,
                top: anchorPosition.y + 10,
            }}
        >
            <div className="flex items-center gap-1">
                {(isLogical ? [] : relationshipTypes).map((type) => {
                    const isActive =
                        type.sourceCardinality === sourceCardinality &&
                        type.targetCardinality === targetCardinality;
                    return (
                        <Button
                            key={type.label}
                            variant={isActive ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                                'h-7 w-11 text-xs font-medium',
                                isActive &&
                                    'bg-slate-700 text-white hover:bg-slate-600'
                            )}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onCardinalityChange(
                                    type.sourceCardinality,
                                    type.targetCardinality
                                );
                            }}
                        >
                            {type.label}
                        </Button>
                    );
                })}
                {isLogical ? null : (
                    <div className="mx-1 h-6 w-px bg-slate-300" />
                )}
                <Button
                    variant={isLogical ? 'default' : 'ghost'}
                    size="sm"
                    className={cn(
                        'h-7 gap-1 px-2 text-xs',
                        isLogical
                            ? 'bg-slate-700 text-white hover:bg-slate-600'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    )}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleLogical();
                    }}
                    title="Logical relationship: informational dashed line, not a foreign key"
                >
                    <Link2 className="!size-4" />
                    Logical
                </Button>
                {isLogical ? null : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSwitch();
                        }}
                        title="Switch tables"
                    >
                        <ArrowLeftRight className="!size-3.5" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openRelationshipInSidebar();
                    }}
                    title="Open in sidebar"
                >
                    <CircleDotDashed className="!size-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={onDelete}
                    title="Delete relationship"
                >
                    <Trash2 className="!size-3.5" />
                </Button>
            </div>
            <div className="mt-2 flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAddBend();
                    }}
                    title="Add a draggable bend to route the line manually"
                >
                    <Plus className="!size-3.5" />
                    Add bend
                </Button>
                {hasWaypoints ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onResetRoute();
                        }}
                        title="Remove all bends and route the line automatically"
                    >
                        <RotateCcw className="!size-3.5" />
                        Reset route
                    </Button>
                ) : null}
            </div>
            {isLogical ? (
                <Input
                    className="mt-2 h-8 text-xs"
                    placeholder="Comment (e.g. API endpoint)"
                    value={commentsDraft}
                    onChange={(e) => setCommentsDraft(e.target.value)}
                    onBlur={() => onCommentsChange(commentsDraft)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            onCommentsChange(commentsDraft);
                            closeRelationshipPopover();
                        }
                        e.stopPropagation();
                    }}
                />
            ) : null}
        </div>
    );
};
