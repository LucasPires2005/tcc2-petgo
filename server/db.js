const { Pool } = require('pg');

// Conexão com o banco de dados na nuvem (Supabase)
const pool = new Pool({
  connectionString: 'postgresql://postgres:rCOuOdCbWJjNQJlf@db.ioxunltwsawqafaabvmt.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false // Necessário para conexões em nuvem
  },
  family: 4 // FORÇA O USO DE IPV4 (Resolve o erro ENETUNREACH no Render)
});

// Testa a conexão ao iniciar
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Erro ao conectar ao banco de dados Supabase:', err.stack);
  }
  console.log('✅ Conectado ao banco de dados Supabase com sucesso!');
  release();
});

// ==========================================
// ADAPTADOR SQLITE -> POSTGRES
// ==========================================

// Função que converte as interrogações (?) do SQLite para o formato do Postgres ($1, $2, etc)
const convertQuery = (sql) => {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
};

const db = {
  // Equivalente ao db.run do SQLite (Para INSERT, UPDATE, DELETE)
  run: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertQuery(sql), params || [], (err, res) => {
      if (callback) callback(err);
    });
  },

  // Equivalente ao db.get do SQLite (Para buscar 1 único registro)
  get: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertQuery(sql), params || [], (err, res) => {
      if (callback) callback(err, res && res.rows.length > 0 ? res.rows[0] : null);
    });
  },

  // Equivalente ao db.all do SQLite (Para buscar uma lista de registros)
  all: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    pool.query(convertQuery(sql), params || [], (err, res) => {
      if (callback) callback(err, res ? res.rows : []);
    });
  }
};

module.exports = db;