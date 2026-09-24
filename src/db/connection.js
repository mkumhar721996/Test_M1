const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function resolveDbPath() {
  return process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'data', 'app.db');
}

function getDb() {
  if (!db) {
    const dbPath = resolveDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    `);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { getDb, closeDb };
