/**
 * Schema configuration utility for restricting database access to specific schemas.
 * 
 * Set the ALLOWED_SCHEMAS environment variable as a comma-separated list of schema names
 * to restrict all database operations to those schemas only.
 * 
 * Example: ALLOWED_SCHEMAS=dbo,sales,inventory
 * 
 * If ALLOWED_SCHEMAS is not set or empty, all schemas are allowed.
 */

// Cache the allowed schemas list
let allowedSchemas: string[] | null = null;

/**
 * Gets the list of allowed schemas from environment variable.
 * Returns null if all schemas are allowed (no restriction).
 */
export function getAllowedSchemas(): string[] | null {
  if (allowedSchemas !== null) {
    return allowedSchemas.length > 0 ? allowedSchemas : null;
  }

  const envSchemas = process.env.ALLOWED_SCHEMAS;
  if (!envSchemas || envSchemas.trim() === '') {
    allowedSchemas = [];
    return null;
  }

  allowedSchemas = envSchemas
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);

  return allowedSchemas.length > 0 ? allowedSchemas : null;
}

/**
 * Checks if a schema is allowed based on the ALLOWED_SCHEMAS configuration.
 * @param schema The schema name to check
 * @returns true if the schema is allowed, false otherwise
 */
export function isSchemaAllowed(schema: string): boolean {
  const schemas = getAllowedSchemas();
  if (schemas === null) {
    return true; // No restriction
  }
  return schemas.includes(schema.toLowerCase());
}

/**
 * Parses a table name that may include schema (schema.table or just table).
 * @param tableName The table name, optionally prefixed with schema
 * @param defaultSchema The default schema to use if not specified (default: 'dbo')
 * @returns Object with schema and table name
 */
export function parseTableName(tableName: string, defaultSchema: string = 'dbo'): { schema: string; table: string } {
  const parts = tableName.split('.');
  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  } else if (parts.length === 1) {
    return { schema: defaultSchema, table: parts[0] };
  } else {
    // Handle cases like [schema].[table] or database.schema.table
    // For simplicity, take last two parts
    return { 
      schema: parts[parts.length - 2] || defaultSchema, 
      table: parts[parts.length - 1] 
    };
  }
}

/**
 * Validates that a table name's schema is allowed.
 * @param tableName The table name, optionally prefixed with schema
 * @param defaultSchema The default schema to use if not specified
 * @returns Validation result with success flag and error message if invalid
 */
export function validateTableSchema(tableName: string, defaultSchema: string = 'dbo'): { 
  isValid: boolean; 
  error?: string;
  schema: string;
  table: string;
} {
  const { schema, table } = parseTableName(tableName, defaultSchema);
  const schemas = getAllowedSchemas();
  
  if (schemas === null) {
    return { isValid: true, schema, table };
  }

  if (!isSchemaAllowed(schema)) {
    return {
      isValid: false,
      error: `Access denied: Schema '${schema}' is not in the allowed schemas list. Allowed schemas: [${schemas.join(', ')}]`,
      schema,
      table
    };
  }

  return { isValid: true, schema, table };
}

/**
 * Extracts table references from a SQL query and validates their schemas.
 * This is a basic implementation that handles common patterns.
 * @param query The SQL query to analyze
 * @returns Validation result
 */
export function validateQuerySchemas(query: string): { isValid: boolean; error?: string } {
  const schemas = getAllowedSchemas();
  if (schemas === null) {
    return { isValid: true }; // No restriction
  }

  // Normalize the query for analysis
  const normalizedQuery = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Pattern to match table references: FROM table, JOIN table, INTO table, UPDATE table, etc.
  // Handles: schema.table, [schema].[table], "schema"."table", and just table
  const tablePatterns = [
    /(?:FROM|JOIN|INTO|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(\[?[\w]+\]?\.)?(\[?[\w]+\]?)/gi,
  ];

  const foundTables: { schema: string; table: string }[] = [];

  for (const pattern of tablePatterns) {
    let match;
    while ((match = pattern.exec(normalizedQuery)) !== null) {
      const schemaMatch = match[1];
      const tableMatch = match[2];
      
      // Clean up brackets
      const schema = schemaMatch 
        ? schemaMatch.replace(/[\[\]\.]/g, '').trim() 
        : 'dbo';
      const table = tableMatch.replace(/[\[\]]/g, '').trim();
      
      if (table && !['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'AS'].includes(table.toUpperCase())) {
        foundTables.push({ schema, table });
      }
    }
  }

  // Validate each found table's schema
  for (const { schema, table } of foundTables) {
    if (!isSchemaAllowed(schema)) {
      return {
        isValid: false,
        error: `Access denied: Query references table '${schema}.${table}' which is not in an allowed schema. Allowed schemas: [${schemas.join(', ')}]`
      };
    }
  }

  return { isValid: true };
}

/**
 * Gets a formatted string of allowed schemas for use in error messages.
 */
export function getAllowedSchemasDisplay(): string {
  const schemas = getAllowedSchemas();
  if (schemas === null) {
    return 'all schemas (no restriction)';
  }
  return `[${schemas.join(', ')}]`;
}

/**
 * Resets the cached allowed schemas (useful for testing).
 */
export function resetSchemaCache(): void {
  allowedSchemas = null;
}
