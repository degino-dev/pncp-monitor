const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = "pncpAdmin2026!";
const DB_PATH = '/tmp/licencas.db';
app.use(cors());
app.use(express.json());
let db;
async function initDatabase() {
  const SQL = await initSqlJs();
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nome TEXT NOT NULL,
      email TEXT DEFAULT '',
      licenseKey TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'trial',
      trialEndsAt TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  salvarDB();
}
function salvarDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('Erro ao salvar DB:', e.message);
  }
}
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
function execute(sql, params = []) {
  db.run(sql, params);
  salvarDB();
}
function authAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: "Acesso negado" });
  next();
}

// === ENDPOINTS PÚBLICOS ===

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, nome, email } = req.body;
    if (!username || !password || !nome) {
      return res.json({ success: false, error: "Campos obrigatorios: username, password, nome" });
    }
    const hash = bcrypt.hashSync(password, 10);
    const licenseKey = uuidv4();
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    execute(
      'INSERT INTO users (username, password, nome, email, licenseKey, status, trialEndsAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hash, nome, email || '', licenseKey, 'trial', trialEnds.toISOString()]
    );
    res.json({
      success: true,
      user: { username, nome, email: email || '', licenseKey, status: 'trial', trialEndsAt: trialEnds.toISOString() }
    });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.json({ success: false, error: "Usuario ja existe." });
    }
    res.json({ success: false, error: "Erro ao cadastrar: " + (e.message || e) });
  }
});

// =========================================================
// MODIFICADO: Login ACEITA apenas usuário e senha
// A validação de licenseKey foi REMOVIDA
// =========================================================
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.json({ success: false, error: "Usuario nao encontrado." });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, error: "Senha incorreta." });
    }
    const agora = new Date();
    if (user.status === 'trial') {
      const trialEnd = new Date(user.trialEndsAt);
      if (agora > trialEnd) {
        execute('UPDATE users SET status = ? WHERE id = ?', ['expired', user.id]);
        return res.json({ success: false, error: "Periodo de teste expirou (7 dias). Renove sua licenca." });
      }
    }
    if (user.status === 'expired') {
      return res.json({ success: false, error: "Licenca expirada. Contate o administrador." });
    }
    if (user.status === 'inactive') {
      return res.json({ success: false, error: "Licenca desativada. Contate o administrador." });
    }
    res.json({
      success: true,
      user: {
        username: user.username,
        nome: user.nome,
        email: user.email,
        status: user.status,
        trialEndsAt: user.trialEndsAt,
        licenseKey: user.licenseKey
      }
    });
  } catch (e) {
    res.json({ success: false, error: "Erro interno: " + (e.message || e) });
  }
});

app.get('/api/validate-key', (req, res) => {
  try {
    const { key } = req.query;
    const user = queryOne('SELECT username, status, trialEndsAt FROM users WHERE licenseKey = ?', [key]);
    if (!user) return res.json({ success: false, error: "Chave invalida." });
    if (user.status === 'trial' && new Date() > new Date(user.trialEndsAt)) {
      execute('UPDATE users SET status = ? WHERE licenseKey = ?', ['expired', key]);
      return res.json({ success: false, error: "Trial expirado." });
    }
    if (user.status !== 'active' && user.status !== 'trial') {
      return res.json({ success: false, error: "Licenca nao esta ativa." });
    }
    res.json({ success: true, user });
  } catch (e) {
    res.json({ success: false, error: "Erro interno" });
  }
});

// === ENDPOINTS ADMIN ===

app.get('/api/users', authAdmin, (req, res) => {
  try {
    const users = query('SELECT id, username, nome, email, licenseKey, status, trialEndsAt, createdAt FROM users ORDER BY createdAt DESC');
    res.json({ success: true, users });
  } catch (e) {
    res.json({ success: false, error: "Erro ao listar usuarios" });
  }
});

app.post('/api/users/activate', authAdmin, (req, res) => {
  execute('UPDATE users SET status = ?, trialEndsAt = NULL WHERE username = ?', ['active', req.body.username]);
  res.json({ success: true });
});

app.post('/api/users/deactivate', authAdmin, (req, res) => {
  execute('UPDATE users SET status = ? WHERE username = ?', ['inactive', req.body.username]);
  res.json({ success: true });
});

app.post('/api/users/delete', authAdmin, (req, res) => {
  execute('DELETE FROM users WHERE username = ?', [req.body.username]);
  res.json({ success: true });
});

app.post('/api/users/regenerate-key', authAdmin, (req, res) => {
  const newKey = uuidv4();
  execute('UPDATE users SET licenseKey = ? WHERE username = ?', [newKey, req.body.username]);
  res.json({ success: true, licenseKey: newKey });
});

app.post('/api/users/extend-trial', authAdmin, (req, res) => {
  const { username, days = 7 } = req.body;
  const user = queryOne('SELECT trialEndsAt FROM users WHERE username = ?', [username]);
  const baseDate = user && user.trialEndsAt ? new Date(user.trialEndsAt) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  execute('UPDATE users SET trialEndsAt = ?, status = ? WHERE username = ?', [baseDate.toISOString(), 'trial', username]);
  res.json({ success: true, trialEndsAt: baseDate.toISOString() });
});

app.get('/api/stats', authAdmin, (req, res) => {
  try {
    const total = queryOne('SELECT COUNT(*) as count FROM users');
    const active = queryOne('SELECT COUNT(*) as count FROM users WHERE status = ?', ['active']);
    const trial = queryOne('SELECT COUNT(*) as count FROM users WHERE status = ?', ['trial']);
    const expired = queryOne('SELECT COUNT(*) as count FROM users WHERE status = ?', ['expired']);
    const inactive = queryOne('SELECT COUNT(*) as count FROM users WHERE status = ?', ['inactive']);
    res.json({
      success: true,
      stats: {
        total: total.count,
        active: active.count,
        trial: trial.count,
        expired: expired.count,
        inactive: inactive.count
      }
    });
  } catch (e) {
    res.json({ success: false, error: "Erro ao obter estatisticas" });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log('PNCP Licencas API rodando na porta ' + PORT);
    console.log('Admin Key: pncpAdmin2026!');
  });
}).catch(err => {
  console.error('Erro ao inicializar banco:', err);
  process.exit(1);
});