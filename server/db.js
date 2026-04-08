const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // Tabela de Usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Animais (Atualizada com userId)
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
      userId INTEGER, -- Coluna que faltava para ligar ao usuário
      status INTEGER DEFAULT 0, -- 0: Perdido, 1: Resgatado
      rescuer_name TEXT,
      rescuer_contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id)
    )
  `);

  // --- CÓDIGO DE SEGURANÇA (MIGRATION) ---
  // Este trecho garante que, se o seu banco já existir, ele ganhe a coluna userId sem dar erro
  db.run("ALTER TABLE animals ADD COLUMN userId INTEGER", (err) => {
    if (err) {
      // Se der erro, é porque a coluna já existe, então não fazemos nada
      console.log("ℹ️ Info: Banco de dados já está atualizado.");
    } else {
      console.log("✅ Sucesso: Coluna 'userId' adicionada ao banco existente!");
    }
  });
});

module.exports = db;