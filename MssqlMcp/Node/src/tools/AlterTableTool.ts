import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateTableSchema } from "../utils/schemaConfig.js";

export class AlterTableTool implements Tool {
  [key: string]: any;
  name = "alter_table";
  description = "Executes safe ALTER TABLE operations (add/drop/alter columns or constraints) on a specified MSSQL table. Not available when the server runs in READONLY mode.";

  inputSchema = {
    type: "object",
    properties: {
      tableName: {
        type: "string",
        description: "Target table name, optionally schema-qualified (e.g., dbo.Users)",
      },
      alterClause: {
        type: "string",
        description: "ALTER TABLE clause to apply (e.g., ADD [Age] INT NULL, DROP COLUMN [IsActive], ALTER COLUMN [Name] NVARCHAR(200) NOT NULL, ADD CONSTRAINT CK_Age CHECK ([Age] >= 0))",
      },
    },
    required: ["tableName", "alterClause"],
  } as any;

  private validateAlterClause(clause: string): { isValid: boolean; error?: string } {
    if (!clause || typeof clause !== "string") {
      return { isValid: false, error: "alterClause must be a non-empty string" };
    }

    const trimmed = clause.trim();

    // Reject obvious multi-statement or comment attempts
    if (/[;]/.test(trimmed)) {
      return { isValid: false, error: "Multiple statements are not allowed in alterClause" };
    }
    if (/--|\/\*/.test(trimmed)) {
      return { isValid: false, error: "Comments are not allowed in alterClause" };
    }

    // Allow only common ALTER TABLE operations
    const allowedPrefixes = [
      /^ADD\s+/i,
      /^DROP\s+COLUMN\s+/i,
      /^ALTER\s+COLUMN\s+/i,
      /^ADD\s+CONSTRAINT\s+/i,
      /^DROP\s+CONSTRAINT\s+/i,
      /^ENABLE\s+CONSTRAINT\s+/i,
      /^DISABLE\s+CONSTRAINT\s+/i,
      /^ENABLE\s+TRIGGER\s+/i,
      /^DISABLE\s+TRIGGER\s+/i,
      /^SWITCH\s+PARTITION\s+/i,
      /^REBUILD\s+PARTITION\s+/i,
    ];

    const matchesAllowedPrefix = allowedPrefixes.some((pattern) => pattern.test(trimmed));
    if (!matchesAllowedPrefix) {
      return {
        isValid: false,
        error:
          "alterClause must start with a supported ALTER TABLE operation (ADD, DROP COLUMN, ALTER COLUMN, CONSTRAINT/trigger/partition operations)",
      };
    }

    if (trimmed.length > 5000) {
      return { isValid: false, error: "alterClause is too long (max 5000 characters)" };
    }

    return { isValid: true };
  }

  async run(params: any) {
    try {
      if (process.env.READONLY === "true") {
        return {
          success: false,
          message: "Server is running in READONLY mode; alter_table is unavailable.",
        };
      }

      const { tableName, alterClause } = params;

      // Validate schema restrictions
      const schemaValidation = validateTableSchema(tableName);
      if (!schemaValidation.isValid) {
        return {
          success: false,
          message: schemaValidation.error,
        };
      }

      const clauseValidation = this.validateAlterClause(alterClause);
      if (!clauseValidation.isValid) {
        return {
          success: false,
          message: clauseValidation.error,
        };
      }

      const { schema, table } = schemaValidation;
      const query = `ALTER TABLE [${schema}].[${table}] ${alterClause.trim()}`;

      await new sql.Request().query(query);

      return {
        success: true,
        message: `ALTER TABLE executed successfully on ${schema}.${table}.`,
      };
    } catch (error) {
      console.error("Error executing ALTER TABLE:", error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      return {
        success: false,
        message: `Failed to execute ALTER TABLE: ${errorMessage}`,
      };
    }
  }
}
