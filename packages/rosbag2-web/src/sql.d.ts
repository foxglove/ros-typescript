// Type declaration workaround for @foxglove/sql.js with NodeNext
declare module "@foxglove/sql.js" {
  export type SqlValue = number | string | Uint8Array | null;
  export type SqlJsConfig = Record<string, unknown>;
  export type BindParams = SqlValue[] | Record<string, SqlValue> | null;

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface DatabaseConstructorOptions {
    file?: File;
    data?: Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (options?: DatabaseConstructorOptions) => Database;
    Statement: typeof Statement;
  }

  export interface Database {
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    prepare(sql: string, params?: BindParams): Statement;
    close(): void;
  }

  export interface Statement {
    bind(params?: BindParams): boolean;
    step(): boolean;
    get(params?: BindParams): SqlValue[];
    getAsObject(params?: BindParams): Record<string, SqlValue>;
    reset(): void;
    free(): boolean;
    freemem(): void;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
