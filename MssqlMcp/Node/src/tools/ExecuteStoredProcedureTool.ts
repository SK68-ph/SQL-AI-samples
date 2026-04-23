import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateTableSchema } from "../utils/schemaConfig.js";

export class ExecuteStoredProcedureTool implements Tool {
  [key: string]: any;
  name = "execute_stored_procedure";
  description = `Executes a stored procedure in the MSSQL Database. Supports input parameters and handles multiple result sets or no results.

FORMAT EXAMPLES:
Simple procedure with no parameters:
{
  "procedureName": "dbo.GetAllUsers"
}

Procedure with parameters:
{
  "procedureName": "dbo.GetUsersByStatus",
  "parameters": [
    { "name": "status", "type": "NVarChar", "value": "active" },
    { "name": "limit", "type": "Int", "value": 100 }
  ]
}

Procedure with output parameter:
{
  "procedureName": "dbo.CreateUser",
  "parameters": [
    { "name": "userName", "type": "NVarChar", "value": "john_doe" },
    { "name": "email", "type": "NVarChar", "value": "john@example.com" },
    { "name": "newUserId", "type": "Int", "direction": "output" }
  ]
}

SUPPORTED SQL TYPES:
- String: VarChar, NVarChar, Char, NChar, Text, NText
- Numeric: Int, BigInt, SmallInt, TinyInt, Float, Real, Decimal, Numeric, Money, SmallMoney
- Date/Time: DateTime, DateTime2, Date, Time, SmallDateTime, DateTimeOffset
- Binary: Binary, VarBinary, Image
- Other: Bit, UniqueIdentifier, Xml

PARAMETER DIRECTIONS:
- "input" (default): Input parameter
- "output": Output parameter (value will be returned)
- "inputoutput": Both input and output`;

  inputSchema = {
    type: "object",
    properties: {
      procedureName: {
        type: "string",
        description: "Name of the stored procedure to execute (can include schema, e.g., 'dbo.MyProcedure')"
      },
      parameters: {
        type: "array",
        description: "Array of parameters to pass to the stored procedure",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Parameter name (without @ prefix)" },
            type: { type: "string", description: "SQL data type (e.g., 'NVarChar', 'Int', 'DateTime')" },
            value: { description: "Parameter value (not required for output-only parameters)" },
            direction: { 
              type: "string", 
              enum: ["input", "output", "inputoutput"],
              description: "Parameter direction (default: 'input')" 
            },
            length: { 
              type: "number", 
              description: "Length for string types (optional, e.g., 255 for NVarChar(255))" 
            },
            precision: { 
              type: "number", 
              description: "Precision for decimal types (optional)" 
            },
            scale: { 
              type: "number", 
              description: "Scale for decimal types (optional)" 
            }
          },
          required: ["name", "type"]
        }
      }
    },
    required: ["procedureName"],
  } as any;

  // Map string type names to mssql types
  private getSqlType(typeName: string, length?: number, precision?: number, scale?: number): sql.ISqlTypeFactoryWithNoParams | sql.ISqlTypeWithLength | sql.ISqlTypeWithScale | sql.ISqlTypeWithPrecisionScale {
    const upperType = typeName.toUpperCase();
    
    switch (upperType) {
      // String types
      case 'VARCHAR':
        return sql.VarChar(length || sql.MAX);
      case 'NVARCHAR':
        return sql.NVarChar(length || sql.MAX);
      case 'CHAR':
        return sql.Char(length || 1);
      case 'NCHAR':
        return sql.NChar(length || 1);
      case 'TEXT':
        return sql.Text;
      case 'NTEXT':
        return sql.NText;
      
      // Numeric types
      case 'INT':
        return sql.Int;
      case 'BIGINT':
        return sql.BigInt;
      case 'SMALLINT':
        return sql.SmallInt;
      case 'TINYINT':
        return sql.TinyInt;
      case 'FLOAT':
        return sql.Float;
      case 'REAL':
        return sql.Real;
      case 'DECIMAL':
      case 'NUMERIC':
        return sql.Decimal(precision || 18, scale || 0);
      case 'MONEY':
        return sql.Money;
      case 'SMALLMONEY':
        return sql.SmallMoney;
      
      // Date/Time types
      case 'DATETIME':
        return sql.DateTime;
      case 'DATETIME2':
        return sql.DateTime2(scale || 7);
      case 'DATE':
        return sql.Date;
      case 'TIME':
        return sql.Time(scale || 7);
      case 'SMALLDATETIME':
        return sql.SmallDateTime;
      case 'DATETIMEOFFSET':
        return sql.DateTimeOffset(scale || 7);
      
      // Binary types
      case 'BINARY':
        return sql.Binary;
      case 'VARBINARY':
        return sql.VarBinary(length || sql.MAX);
      case 'IMAGE':
        return sql.Image;
      
      // Other types
      case 'BIT':
        return sql.Bit;
      case 'UNIQUEIDENTIFIER':
        return sql.UniqueIdentifier;
      case 'XML':
        return sql.Xml;
      
      default:
        // Default to NVarChar for unknown types
        console.warn(`Unknown SQL type '${typeName}', defaulting to NVarChar`);
        return sql.NVarChar(length || sql.MAX);
    }
  }

  async run(params: any) {
    try {
      const { procedureName, parameters = [] } = params;

      if (!procedureName || typeof procedureName !== 'string') {
        return {
          success: false,
          message: "Missing or invalid 'procedureName' argument",
        };
      }

      // Validate schema restrictions
      const schemaValidation = validateTableSchema(procedureName);
      if (!schemaValidation.isValid) {
        return {
          success: false,
          message: schemaValidation.error,
        };
      }

      const { schema, table: procName } = schemaValidation;
      const fullProcName = `[${schema}].[${procName}]`;

      const request = new sql.Request();
      const outputParams: string[] = [];

      // Add parameters to the request
      for (const param of parameters) {
        const { name, type, value, direction = 'input', length, precision, scale } = param;
        const sqlType = this.getSqlType(type, length, precision, scale);
        const paramName = name.startsWith('@') ? name.substring(1) : name;

        switch (direction.toLowerCase()) {
          case 'output':
            request.output(paramName, sqlType);
            outputParams.push(paramName);
            break;
          case 'inputoutput':
            request.output(paramName, sqlType, value);
            outputParams.push(paramName);
            break;
          case 'input':
          default:
            request.input(paramName, sqlType, value);
            break;
        }
      }

      // Execute the stored procedure
      const result = await request.execute(fullProcName);

      // Build the response
      const response: any = {
        success: true,
        message: `Stored procedure '${schema}.${procName}' executed successfully`,
      };

      // Handle multiple result sets - cast to array type
      const recordsets = result.recordsets as sql.IRecordSet<any>[];
      
      if (recordsets && recordsets.length > 0) {
        if (recordsets.length === 1) {
          // Single result set
          response.data = recordsets[0];
          response.recordCount = recordsets[0].length;
        } else {
          // Multiple result sets
          response.resultSets = recordsets.map((recordset: sql.IRecordSet<any>, index: number) => ({
            resultSetIndex: index,
            data: recordset,
            recordCount: recordset.length
          }));
          response.resultSetCount = recordsets.length;
          response.totalRecordCount = recordsets.reduce((sum: number, rs: sql.IRecordSet<any>) => sum + rs.length, 0);
        }
      } else {
        // No result sets
        response.data = [];
        response.recordCount = 0;
        response.message += " (no result sets returned)";
      }

      // Include output parameter values
      if (outputParams.length > 0 && result.output) {
        response.outputParameters = {};
        for (const paramName of outputParams) {
          response.outputParameters[paramName] = result.output[paramName];
        }
      }

      // Include rows affected if available
      if (result.rowsAffected && result.rowsAffected.length > 0) {
        response.rowsAffected = result.rowsAffected;
        response.totalRowsAffected = result.rowsAffected.reduce((sum, count) => sum + count, 0);
      }

      // Include return value if present
      if (result.returnValue !== undefined) {
        response.returnValue = result.returnValue;
      }

      return response;

    } catch (error) {
      console.error("Error executing stored procedure:", error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        message: `Failed to execute stored procedure: ${errorMessage}`,
        error: 'STORED_PROCEDURE_EXECUTION_FAILED'
      };
    }
  }
}
