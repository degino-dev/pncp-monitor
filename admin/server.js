const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = "pncpAdmin2026!";

// =========================================================
// CONEXÃO MONGODB ATLAS
// =========================================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://walteremanuel_db_user:oEY8KMaKvhIZEljT@cluster0.fsea6qz.mongodb.net/?appName=Cluster0";
const DB_NAME = "pncp_monitor";

let db;
let client;

async function conectarMongo() {
  client = new MongoClient(MONGO_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    tls: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true
  });
  
  await client.connect();
  db = client.db(DB_NAME);
  
  await db.collection('usuarios').createIndex({ username: 1 }, { unique: true });
  await db.collection('usuarios').createIndex({ licenseKey: 1 }, { unique: true });
  
  console.log('Conectado ao MongoDB Atlas!');
}

app.use(cors());
app.use(express.json());

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
    const existente = await db.collection('usuarios').findOne({ username });
    if (existente) {
      return res.json({ success: false, error: "Usuario ja existe." });
    }
    const hash = bcrypt.hashSync(password, 10);
    const licenseKey = uuidv4();
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    await db.collection('usuarios').insertOne({
      username,
      password: hash,
      nome,
      email: email || '',
      licenseKey,
      status: 'trial',
      trialEndsAt: trialEnds.toISOString(),
      createdAt: new Date().toISOString()
    });
    res.json({
      success: true,
      user: { username, nome, email: email || '', licenseKey, status: 'trial', trialEndsAt: trialEnds.toISOString() }
    });
  } catch (e) {
    if (e.message && e.message.includes('E11000')) {
      return res.json({ success: false, error: "Usuario ja existe." });
    }
    res.json({ success: false, error: "Erro ao cadastrar: " + (e.message || e) });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.collection('usuarios').findOne({ username });
    if (!user) return res.json({ success: false, error: "Usuario nao encontrado." });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, error: "Senha incorreta." });
    }
    const agora = new Date();
    if (user.status === 'trial') {
      const trialEnd = new Date(user.trialEndsAt);
      if (agora > trialEnd) {
        await db.collection('usuarios').updateOne({ username }, { $set: { status: 'expired' } });
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

app.get('/api/validate-key', async (req, res) => {
  try {
    const { key } = req.query;
    const user = await db.collection('usuarios').findOne({ licenseKey: key });
    if (!user) return res.json({ success: false, error: "Chave invalida." });
    if (user.status === 'trial' && new Date() > new Date(user.trialEndsAt)) {
      await db.collection('usuarios').updateOne({ licenseKey: key }, { $set: { status: 'expired' } });
      return res.json({ success: false, error: "Trial expirado." });
    }
    if (user.status !== 'active' && user.status !== 'trial') {
      return res.json({ success: false, error: "Licenca nao esta ativa." });
    }
    res.json({ success: true, user: { username: user.username, status: user.status, trialEndsAt: user.trialEndsAt } });
  } catch (e) {
    res.json({ success: false, error: "Erro interno" });
  }
});

// === ENDPOINTS ADMIN ===

app.get('/api/users', authAdmin, async (req, res) => {
  try {
    const users = await db.collection('usuarios')
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, users });
  } catch (e) {
    res.json({ success: false, error: "Erro ao listar usuarios" });
  }
});

app.post('/api/users/activate', authAdmin, async (req, res) => {
  await db.collection('usuarios').updateOne(
    { username: req.body.username },
    { $set: { status: 'active', trialEndsAt: null } }
  );
  res.json({ success: true });
});

app.post('/api/users/deactivate', authAdmin, async (req, res) => {
  await db.collection('usuarios').updateOne(
    { username: req.body.username },
    { $set: { status: 'inactive' } }
  );
  res.json({ success: true });
});

app.post('/api/users/delete', authAdmin, async (req, res) => {
  await db.collection('usuarios').deleteOne({ username: req.body.username });
  res.json({ success: true });
});

app.post('/api/users/regenerate-key', authAdmin, async (req, res) => {
  const newKey = uuidv4();
  await db.collection('usuarios').updateOne(
    { username: req.body.username },
    { $set: { licenseKey: newKey } }
  );
  res.json({ success: true, licenseKey: newKey });
});

app.post('/api/users/extend-trial', authAdmin, async (req, res) => {
  const { username, days = 7 } = req.body;
  const user = await db.collection('usuarios').findOne({ username });
  const baseDate = user && user.trialEndsAt ? new Date(user.trialEndsAt) : new Date();
  baseDate.setDate(baseDate.getDate() + days);
  await db.collection('usuarios').updateOne(
    { username },
    { $set: { trialEndsAt: baseDate.toISOString(), status: 'trial' } }
  );
  res.json({ success: true, trialEndsAt: baseDate.toISOString() });
});

app.get('/api/stats', authAdmin, async (req, res) => {
  try {
    const total = await db.collection('usuarios').countDocuments();
    const active = await db.collection('usuarios').countDocuments({ status: 'active' });
    const trial = await db.collection('usuarios').countDocuments({ status: 'trial' });
    const expired = await db.collection('usuarios').countDocuments({ status: 'expired' });
    const inactive = await db.collection('usuarios').countDocuments({ status: 'inactive' });
    res.json({
      success: true,
      stats: { total, active, trial, expired, inactive }
    });
  } catch (e) {
    res.json({ success: false, error: "Erro ao obter estatisticas" });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// INICIALIZA
conectarMongo().then(() => {
  app.listen(PORT, () => {
    console.log('PNCP Licencas API rodando na porta ' + PORT);
    console.log('Banco: MongoDB Atlas');
    console.log('Admin Key: pncpAdmin2026!');
  });
}).catch(err => {
  console.error('Erro ao conectar no MongoDB:', err);
  process.exit(1);
});