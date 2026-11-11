import { z } from 'zod';

export interface DBRelationship {
    id: string;
    name: string;
    sourceSchema?: string | null;
    sourceTableId: string;
    targetSchema?: string | null;
    targetTableId: string;
    sourceFieldId: string;
    targetFieldId: string;
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
    createdAt: number;
    // Logical (informational) relationship: drawn as a dashed line without
    // cardinality markers, never exported as a foreign key.
    isLogical?: boolean | null;
    comments?: string | null;
}

export const dbRelationshipSchema: z.ZodType<DBRelationship> = z.object({
    id: z.string(),
    name: z.string(),
    sourceSchema: z.string().or(z.null()).optional(),
    sourceTableId: z.string(),
    targetSchema: z.string().or(z.null()).optional(),
    targetTableId: z.string(),
    sourceFieldId: z.string(),
    targetFieldId: z.string(),
    sourceCardinality: z.union([z.literal('one'), z.literal('many')]),
    targetCardinality: z.union([z.literal('one'), z.literal('many')]),
    createdAt: z.number(),
    isLogical: z.boolean().or(z.null()).optional(),
    comments: z.string().or(z.null()).optional(),
});

export type RelationshipType =
    | 'one_to_one'
    | 'one_to_many'
    | 'many_to_one'
    | 'many_to_many';
export type Cardinality = 'one' | 'many';

export const determineRelationshipType = ({
    sourceCardinality,
    targetCardinality,
}: {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
}): RelationshipType => {
    if (sourceCardinality === 'one' && targetCardinality === 'one')
        return 'one_to_one';
    if (sourceCardinality === 'one' && targetCardinality === 'many')
        return 'one_to_many';
    if (sourceCardinality === 'many' && targetCardinality === 'one')
        return 'many_to_one';
    return 'many_to_many';
};

export const determineCardinalities = (
    relationshipType: RelationshipType
): {
    sourceCardinality: Cardinality;
    targetCardinality: Cardinality;
} => {
    switch (relationshipType) {
        case 'one_to_one':
            return { sourceCardinality: 'one', targetCardinality: 'one' };
        case 'one_to_many':
            return { sourceCardinality: 'one', targetCardinality: 'many' };
        case 'many_to_one':
            return { sourceCardinality: 'many', targetCardinality: 'one' };
        case 'many_to_many':
            return { sourceCardinality: 'many', targetCardinality: 'many' };
    }
};

export const isLogicalRelationship = (
    relationship: Pick<DBRelationship, 'isLogical'>
): boolean => !!relationship.isLogical;

/**
 * Logical relationships are informational only, so they must not take part in
 * SQL/DBML export or be treated as foreign keys.
 */
export const withoutLogicalRelationships = <
    T extends { relationships?: DBRelationship[] },
>(
    diagram: T
): T => {
    if (!diagram.relationships?.some(isLogicalRelationship)) {
        return diagram;
    }

    return {
        ...diagram,
        relationships: diagram.relationships.filter(
            (relationship) => !isLogicalRelationship(relationship)
        ),
    };
};
