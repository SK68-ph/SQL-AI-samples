import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getAllowedSchemas, isSchemaAllowed, getAllowedSchemasDisplay } from "../utils/schemaConfig.js";

export class ListTableTool implements Tool {
  [key: string]: any;
  name = "list_table";
  description = "Lists tables in an MSSQL Database, or list tables in specific schemas";
  inputSchema = {
    type: "object",
    properties: {
      parameters: { 
        type: "array", 
        description: "Schemas to filter by (optional)",
        items: {
          type: "string"
        },
        minItems: 0
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    try {
      const { parameters } = params;
      const request = new sql.Request();
      
      // Get globally allowed schemas from environment
      const globalAllowedSchemas = getAllowedSchemas();
      
      // Determine which schemas to filter by
      let effectiveSchemas: string[] | null = null;
      
      if (parameters && parameters.length > 0) {
        // User requested specific schemas - validate against global allowed schemas
        if (globalAllowedSchemas) {
          // Filter to only include schemas that are both requested AND globally allowed
          const validSchemas = parameters.filter((p: string) => isSchemaAllowed(p));
          const invalidSchemas = parameters.filter((p: string) => !isSchemaAllowed(p));
          
          if (invalidSchemas.length > 0) {
            return {
              success: false,
              message: `Access denied: Schema(s) [${invalidSchemas.join(', ')}] not in allowed schemas. Allowed schemas: ${getAllowedSchemasDisplay()}`,
            };
          }
          effectiveSchemas = validSchemas;
        } else {
          effectiveSchemas = parameters;
        }
      } else if (globalAllowedSchemas) {
        // No specific schemas requested but global restriction exists
        effectiveSchemas = globalAllowedSchemas;
      }
      
      const schemaFilter = effectiveSchemas && effectiveSchemas.length > 0 
        ? `AND TABLE_SCHEMA IN (${effectiveSchemas.map((p: string) => `'${p}'`).join(", ")})` 
        : "";
      const query = `SELECT TABLE_SCHEMA + '.' + TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`;
      const result = await request.query(query);
      return {
        success: true,
        message: `List tables executed successfully${globalAllowedSchemas ? ` (restricted to schemas: ${getAllowedSchemasDisplay()})` : ''}`,
        items: result.recordset,
      };
    } catch (error) {
      console.error("Error listing tables:", error);
      return {
        success: false,
        message: `Failed to list tables: ${error}`,
      };
    }
  }
}
