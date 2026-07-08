const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// Połączenie z bazą MySQL przez pool (zmienne środowiskowe Vercel)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10
});

// Middleware do weryfikacji JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// 1. LOGOWANIE (POST /api/auth/login)
app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body;
  if (!code || code.length !== 6) {
    return res.status(400).json({ error: 'Nieprawidłowy kod.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, uuid FROM ac_login_codes WHERE code = ? AND used = 0 AND expires_at > NOW()',
      [code]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Kod wygasł lub jest nieprawidłowy.' });
    }

    const record = rows[0];
    await pool.query('UPDATE ac_login_codes SET used = 1 WHERE id = ?', [record.id]);

    const [players] = await pool.query('SELECT player_name FROM ac_player_wallets WHERE uuid = ?', [record.uuid]);
    const name = players.length > 0 ? players[0].player_name : 'Gracz';

    const token = jwt.sign({ uuid: record.uuid, name }, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera.' });
  }
});

// 2. STATYSTYKI PUBLICZNE (GET /api/public/stats)
app.get('/api/public/stats', async (req, res) => {
  try {
    const [topMiners] = await pool.query(
      'SELECT player_name, balance FROM ac_player_wallets ORDER BY balance DESC LIMIT 5'
    );

    const [globalStats] = await pool.query(
      'SELECT COUNT(id) as total_active_cards, SUM(power) as total_network_power FROM ac_crypto_cards WHERE active = 1'
    );

    const [historyRaw] = await pool.query(`
      SELECT recorded_at, SUM(power) as total_power
      FROM ac_card_power_history
      WHERE recorded_at >= NOW() - INTERVAL 2 HOUR
      GROUP BY recorded_at
      ORDER BY recorded_at ASC
    `);

    const historyLabels = historyRaw.map(r => new Date(r.recorded_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    const historyData = historyRaw.map(r => r.total_power);

    res.json({
      topMiners,
      network: {
        activeCards: globalStats[0].total_active_cards || 0,
        totalPower: globalStats[0].total_network_power || 0
      },
      chart: {
        labels: historyLabels,
        data: historyData
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera.' });
  }
});

// 3. DANE ZALOGOWANEGO GRACZA (GET /api/me/data)
app.get('/api/me/data', authenticateToken, async (req, res) => {
  const uuid = req.user.uuid;

  try {
    const [wallets] = await pool.query(
      'SELECT player_name, balance, crystals, playtime FROM ac_player_wallets WHERE uuid = ?',
      [uuid]
    );

    const [cards] = await pool.query(
      'SELECT id, card_type, card_name, power, slot, active FROM ac_crypto_cards WHERE uuid = ?',
      [uuid]
    );

    const [earnings] = await pool.query(
      'SELECT amount, earned_at FROM ac_earnings_history WHERE uuid = ? ORDER BY earned_at DESC LIMIT 50',
      [uuid]
    );

    const wallet = wallets.length > 0 ? wallets[0] : { balance: 0, crystals: 0 };
    const totalPower = cards.filter(c => c.active).reduce((sum, c) => sum + c.power, 0);
    const activeCards = cards.filter(c => c.active).length;

    res.json({
      player: { name: req.user.name, uuid },
      wallet,
      stats: {
        totalPower,
        activeCards,
        totalCards: cards.length
      },
      cards,
      earningsHistory: earnings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Błąd serwera.' });
  }
});

module.exports = app;
