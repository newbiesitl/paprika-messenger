import { DatabaseSync } from 'node:sqlite';
export class SqliteD1 {
  constructor(path=':memory:') {this.connection=new DatabaseSync(path);this.connection.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
  prepare(sql) {return new Statement(this,sql);}
  withSession() {return this;}
  async batch(statements) {
    this.connection.exec('BEGIN');
    try {const results=statements.map(s=>s.execute());this.connection.exec('COMMIT');return results;}
    catch(error) {this.connection.exec('ROLLBACK');throw error;}
  }
  close() {this.connection.close();}
}
class Statement {
  constructor(db,sql,values=[]) {this.db=db;this.sql=sql;this.values=values;}
  bind(...values) {return new Statement(this.db,this.sql,values);}
  execute() {
    const statement=this.db.connection.prepare(this.sql);
    if (statement.columns().length) return {results:statement.all(...this.values),success:true,meta:{changes:0}};
    const result=statement.run(...this.values);return {results:[],success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
  }
  async run() {return this.execute();}
  async all() {return this.execute();}
  async first() {return this.execute().results[0] || null;}
}
