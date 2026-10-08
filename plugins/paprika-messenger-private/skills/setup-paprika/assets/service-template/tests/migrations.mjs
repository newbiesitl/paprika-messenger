import { readFile } from 'node:fs/promises';
export async function loadMigrations() {
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  return (await Promise.all(journal.entries.map(e=>readFile(`drizzle/${e.tag}.sql`,'utf8')))).join('\n');
}
// Only for the loopback development adapter; hosted migrations are owned by Sites.
export async function migrateDevelopmentDatabase(connection) {
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  connection.exec('CREATE TABLE IF NOT EXISTS _dot_dev_migrations(tag TEXT PRIMARY KEY)');
  const recorded=connection.prepare('SELECT tag FROM _dot_dev_migrations').all();
  if (!recorded.length && connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='boards'").get()) {
    // Older previews predate the migration ledger. Recognize only known versions.
    const known=['0000_board'];
    if (connection.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='message_post'").get()) known.push('0001_event-triggers');
    if (connection.prepare('PRAGMA table_info(coordination)').all().some(column=>column.name==='title')) known.push('0002_generic-boards');
    for(const tag of known) connection.prepare('INSERT INTO _dot_dev_migrations(tag) VALUES(?)').run(tag);
  }
  for(const entry of journal.entries) {
    if(connection.prepare('SELECT tag FROM _dot_dev_migrations WHERE tag=?').get(entry.tag))continue;
    const sql=await readFile(`drizzle/${entry.tag}.sql`,'utf8');
    connection.exec('BEGIN');
    try{connection.exec(sql);connection.prepare('INSERT INTO _dot_dev_migrations(tag) VALUES(?)').run(entry.tag);connection.exec('COMMIT');}
    catch(error){connection.exec('ROLLBACK');throw error;}
  }
}
