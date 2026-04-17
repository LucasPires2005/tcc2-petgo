const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // Tabela de Usuários (Com Moedas e Premium)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      coins INTEGER DEFAULT 0,
      is_premium INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Animais (ADICIONADA COLUNA rescue_image_url)
  db.run(`
    CREATE TABLE IF NOT EXISTS animals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      species TEXT,
      breed TEXT,
      health TEXT,
      latitude REAL,
      longitude REAL,
      image_url TEXT,
      rescue_image_url TEXT, 
      userId INTEGER,
      status INTEGER DEFAULT 0,
      rescuer_name TEXT,
      rescuer_contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // Tabela de Parceiros
  db.run(`
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      icon TEXT
    )
  `);

  // NOVO: Migrations que não quebram o servidor (Ignoram erro se a coluna já existir)
  db.run("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE animals ADD COLUMN userId INTEGER", () => {});
  db.run("ALTER TABLE animals ADD COLUMN rescue_image_url TEXT", () => {}); 
});

module.exports = db;