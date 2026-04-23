import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateTableSchema, getAllowedSchemasDisplay } from "../utils/schemaConfig.js";

export class DescribeTableTool implements Tool {
  [key: string]: any;
  name = "describe_table";
  description = "Describes the schema (columns and types) of a specified MSSQL Database table.";
  inputSchema = {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table to describe" },
    },
    required: ["tableName"],
  } as any;

  async run(params: { tableName: string }) {
    try {
      const { tableName } = params;
      
      // Validate schema restrictions
      const schemaValidation = validateTableSchema(tableName);
      if (!schemaValidation.isValid) {
        return {
          success: false,
          message: schemaValidation.error,
        };
      }
      
      const { schema, table } = schemaValidation;
      const request = new sql.Request();
      const query = `SELECT COLUMN_NAME as name, DATA_TYPE as type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName`;
      request.input("schemaName", sql.NVarChar, schema);
      request.input("tableName", sql.NVarChar, table);
      const result = await request.query(query);
      return {
        success: true,
        columns: result.recordset,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe table: ${error}`,
      };
    }
  }
}
