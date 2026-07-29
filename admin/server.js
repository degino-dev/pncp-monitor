const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new Database('licencas.db');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = "pncpAdmin2026!";

app.use(cors());
app.use(express.json());

// === BANCO DE DADOS ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome TEXT NOT NULL,
    email TEXT,
    licenseKey TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'trial',
    trialEndsAt DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// === MIDDLEWARE ADMIN ===
function authAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).json({ success: false, error: "Acesso negado" });
  next();
}

// === ENDPOINTS PÚBLICOS ===

// POST /api/register — Cadastro (gera 7 dias grátis)
app.post('/api/register', (req, res) => {
  const { username, password, nome, email } = req.body;
  if (!username || !password || !nome) {
    return res.json({ success: false, error: "Campos obrigatórios: username, password, nome" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const licenseKey = uuidv4();
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 7);

  try {
    db.prepare(`INSERT INTO users (username, password, nome, email, licenseKey, status, trialEndsAt)
                VALUES (?, ?, ?, ?, ?, 'trial', ?)`).run(username, hash, nome, email || '', licenseKey, trialEnds.toISOString());
    
    res.json({
      success: true,
      user: { username, nome, email: email || '', licenseKey, status: 'trial', trialEndsAt: trialEnds.toISOString() }
    });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.json({ success: false, error: "Usuário já existe." });
    }
    res.json({ success: false, error: "Erro ao cadastrar: " + e.message });
  }
});

// POST /api/login — Login + validação de licença
app.post('/api/login', (req, res) => {
  const { username, password, licenseKey } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.json({ success: false, error: "Usuário não encontrado." });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, error: "Senha incorreta." });
  }

  if (user.licenseKey !== licenseKey) {
    return res.json({ success: false, error: "Chave de licença inválida." });
  }

  const agora = new Date();

  // Verifica trial expirado
  if (user.status === 'trial') {
    const trialEnd = new Date(user.trialEndsAt);
    if (agora > trialEnd) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run('expired', user.id);
      return res.json({ success: false, error: "Período de teste expirou (7 dias). Renove sua licença." });
    }
  }

  if (user.status === 'expired') {
    return res.json({ success: false, error: "Licença expirada. Contate o administrador." });
  }

  if (user.status === 'inactive') {
    return res.json({ success: false, error: "Licença desativada. Contate o administrador." });
  }

  // Login OK
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
});

// GET /api/validate-key — Valida chave (para sessão offline)
app.get('/api/validate-key', (req, res) => {
  const { key } = req.query;
  const user = db.prepare('SELECT username, status, trialEndsAt FROM users WHERE licenseKey = ?').get(key);

  if (!user) return res.json({ success: false, error: "Chave inválida." });

  if (user.status === 'trial' && new Date() > new Date(user.trialEndsAt)) {
    db.prepare('UPDATE users SET status = ? WHERE licenseKey = ?').run('expired', key);
    return res.json({ success: false, error: "Trial expirado." });
  }

  if (user.status !== 'active' && user.status !== 'trial') {
    return res.json({ success: false, error: "Licença não está ativa." });
  }

  res.json({ success: true, user });
});

// === ENDPOINTS ADMIN (protegidos) ===

// GET /api/users — Listar todos
app.get('/api/users', authAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, nome, email, licenseKey, status, trialEndsAt, createdAt FROM users ORDER BY createdAt DESC').all();
  res.json({ success: true, users });
});

// POST /api/users/activate — Ativar licença
app.post('/api/users/activate', authAdmin, (req, res) => {
  const { username } = req.body;
  db.prepare('UPDATE users SET status = ?, trialEndsAt = NULL WHERE username = ?').run('active', username);
  res.json({ success: true });
});

// POST /api/users/deactivate — Desativar
app.post('/api/users/deactivate', authAdmin, (req, res) => {
  const { username } = req.body;
  db.prepare('UPDATE users SET status = ? WHERE username = ?').run('inactive', username);
  res.json({ success: true });
});

// POST /api/users/delete — Excluir
app.post('/api/users/delete', authAdmin, (req, res) => {
  const { username } = req.body;
  db.prepare('DELETE FROM users WHERE username = ?').run(username);
  res.json({ success: true });
});

// POST /api/users/regenerate-key — Regenerar chave
app.post('/api/users/regenerate-key', authAdmin, (req, res) => {
  const { username } = req.body;
  const newKey = uuidv4();
  db.prepare('UPDATE users SET licenseKey = ? WHERE username = ?').run(newKey, username);
  res.json({ success: true, licenseKey: newKey });
});

// POST /api/users/extend-trial — Estender trial
app.post('/api/users/extend-trial', authAdmin, (req, res) => {
  const { username, days = 7 } = req.body;
  const user = db.prepare('SELECT trialEndsAt FROM users WHERE username = ?').get(username);
  const baseDate = user?.trialEndsAt ? new Date(user.trialEndsAt) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  db.prepare('UPDATE users SET trialEndsAt = ?, status = ? WHERE username = ?').run(baseDate.toISOString(), 'trial', username);
  res.json({ success: true, trialEndsAt: baseDate.toISOString() });
});

// GET /api/stats — Estatísticas
app.get('/api/stats', authAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const active = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('active').count;
  const trial = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('trial').count;
  const expired = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('expired').count;
  const inactive = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = ?').get('inactive').count;
  res.json({ success: true, stats: { total, active, trial, expired, inactive } });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 PNCP Licenças API rodando na porta ${PORT}`);
  console.log(`📊 Painel Admin: x-admin-key = pncpAdmin2026!`);
});