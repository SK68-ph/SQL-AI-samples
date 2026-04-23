import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateTableSchema } from "../utils/schemaConfig.js";

export class DropTableTool implements Tool {
  [key: string]: any;
  name = "drop_table";
  description = "Drops a table from the MSSQL Database.";
  inputSchema = {
    type: "object",
    properties: {
      tableName: { type: "string", description: "Name of the table to drop" }
    },
    required: ["tableName"],
  } as any;

  async run(params: any) {
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
      
      // Basic validation to prevent SQL injection
      if (!/^[\w\d_]+$/.test(table)) {
        throw new Error("Invalid table name.");
      }
      const query = `DROP TABLE [${schema}].[${table}]`;
      await new sql.Request().query(query);
      return {
        success: true,
        message: `Table '${schema}.${table}' dropped successfully.`
      };
    } catch (error) {
      console.error("Error dropping table:", error);
      return {
        success: false,
        message: `Failed to drop table: ${error}`
      };
    }
  }
}