import { z } from 'zod';
import { generateId } from '../utils';
import { DatabaseType } from './database-type';
import type { DBTable } from './db-table';
import type { DBField } from './db-field';

export const INDEX_TYPES = [
    'btree',
    'hash',
    'gist',
    'gin',
    'spgist',
    'brin',
    // sql server
    'nonclustered',
    'clustered',
    'xml',
    'fulltext',
    'spatial',
    'hash',
    'index',
] as const;
export type IndexType = (typeof INDEX_TYPES)[number];

export interface DBIndex {
    id: string;
    name: string;
    unique: boolean;
    fieldIds: string[];
    createdAt: number;
    type?: IndexType | null;
    isPrimaryKey?: boolean | null;
    comments?: string | null;
}

export const dbIndexSchema: z.ZodType<DBIndex> = z.object({
    id: z.string(),
    name: z.string(),
    unique: z.boolean(),
    fieldIds: z.array(z.string()),
    createdAt: z.number(),
    type: z.enum(INDEX_TYPES).optional(),
    isPrimaryKey: z.boolean().or(z.null()).optional(),
    comments: z.string().or(z.null()).optional(),
});

export const databaseIndexTypes: Record<DatabaseType, IndexType[] | undefined> =
    {
        [DatabaseType.POSTGRESQL]: ['btree', 'hash', 'gin'],
        [DatabaseType.COCKROACHDB]: ['btree', 'hash', 'gin'],
        [DatabaseType.MYSQL]: undefined,
        [DatabaseType.MARIADB]: undefined,
        [DatabaseType.SQL_SERVER]: undefined,
        [DatabaseType.SQLITE]: undefined,
        [DatabaseType.CLICKHOUSE]: undefined,
        [DatabaseType.ORACLE]: undefined,
        [DatabaseType.GENERIC]: undefined,
    };

export const defaultIndexTypeForDatabase: Record<
    DatabaseType,
    IndexType | undefined
> = {
    [DatabaseType.POSTGRESQL]: 'btree',
    [DatabaseType.COCKROACHDB]: 'btree',
    [DatabaseType.MYSQL]: undefined,
    [DatabaseType.MARIADB]: undefined,
    [DatabaseType.SQL_SERVER]: undefined,
    [DatabaseType.SQLITE]: undefined,
    [DatabaseType.CLICKHOUSE]: undefined,
    [DatabaseType.ORACLE]: undefined,
    [DatabaseType.GENERIC]: undefined,
};

// Data types that support GIN indexes in PostgreSQL/CockroachDB
const GIN_SUPPORTED_TYPES = ['jsonb', 'json', 'tsvector', 'hstore'] as const;

export const supportsGinIndex = (field: DBField): boolean => {
    if (field.isArray) return true;
    const typeLower = field.type.id.toLowerCase();
    return GIN_SUPPORTED_TYPES.includes(
        typeLower as (typeof GIN_SUPPORTED_TYPES)[number]
    );
};

export const canFieldsUseGinIndex = (fields: DBField[]): boolean => {
    return fields.length > 0 && fields.every(supportsGinIndex);
};

export interface IndexTypeConfig {
    label: string;
    value: IndexType;
    disabledTooltip?: string;
}

export const INDEX_TYPE_CONFIGS: IndexTypeConfig[] = [
    { label: 'B-tree (default)', value: 'btree' },
    { label: 'Hash', value: 'hash' },
    {
        label: 'GIN',
        value: 'gin',
        disabledTooltip:
            'GIN indexes require array, jsonb, json, tsvector, or hstore types',
    },
];

export const getTablePrimaryKeyIndex = ({
    table,
}: {
    table: DBTable;
}): DBIndex | null => {
    const primaryKeyFields = table.fields.filter((f) => f.primaryKey);
    const existingPKIndex = table.indexes.find((idx) => idx.isPrimaryKey);

    if (primaryKeyFields.length === 0) {
        return null;
    }

    const pkFieldIds = primaryKeyFields.map((f) => f.id);

    if (existingPKIndex) {
        return {
            ...existingPKIndex,
            fieldIds: pkFieldIds,
        };
    } else {
        // Create new PK index for primary key(s)
        // Use empty name for auto-generated PK indexes to indicate no CONSTRAINT should be used
        const pkIndex: DBIndex = {
            id: generateId(),
            name: '',
            fieldIds: pkFieldIds,
            unique: true,
            isPrimaryKey: true,
            createdAt: Date.now(),
        };

        return pkIndex;
    }
};

export const getTableIndexesWithPrimaryKey = ({
    table,
}: {
    table: DBTable;
}): DBIndex[] => {
    const primaryKeyIndex = getTablePrimaryKeyIndex({ table });
    const indexesWithoutPKIndex = table.indexes.filter(
        (idx) => !idx.isPrimaryKey
    );
    return primaryKeyIndex
        ? [primaryKeyIndex, ...indexesWithoutPKIndex]
        : indexesWithoutPKIndex;
};

export interface FieldIndexInfo {
    index: DBIndex;
    // Names of all columns of the index (in index order), for composite indexes
    columnNames: string[];
}

const NO_FIELD_INDEXES: FieldIndexInfo[] = [];

/**
 * Maps a field id to the (non primary key) indexes that include this field.
 * Primary key indexes are skipped since they are already marked on the field.
 */
export const getFieldIndexesMap = ({
    table,
}: {
    table: DBTable;
}): Map<string, FieldIndexInfo[]> => {
    const fieldNameById = new Map(table.fields.map((f) => [f.id, f.name]));
    const result = new Map<string, FieldIndexInfo[]>();

    for (const index of table.indexes ?? []) {
        if (index.isPrimaryKey) {
            continue;
        }

        const columnNames = index.fieldIds
            .map((fieldId) => fieldNameById.get(fieldId))
            .filter((name): name is string => !!name);

        for (const fieldId of index.fieldIds) {
            if (!fieldNameById.has(fieldId)) {
                continue;
            }
            const list = result.get(fieldId) ?? [];
            list.push({ index, columnNames });
            result.set(fieldId, list);
        }
    }

    return result;
};

export const getFieldIndexes = (
    map: Map<string, FieldIndexInfo[]>,
    fieldId: string
): FieldIndexInfo[] => map.get(fieldId) ?? NO_FIELD_INDEXES;
