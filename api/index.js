const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Połączenie z bazą MySQL (IceHost) używając zmiennych środowiskowych Vercel
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql.icehost.pl',
  user: process.env.DB_USER || 'u194178_AI0Egj6KTR',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 's194178_pl',
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10
});

// Zamiast query string (?action=login), zrobimy obsługę bezpośrednio w głównym endpoincie Vercel
// Vercel przekieruje wszystko z /api do tego pliku, więc możemy używać app.all('/') i sprawdzać req.query.action

app.all('/api', async (req, res) => {
  const action = req.query.action;
  
  if (!action) {
    return res.status(400).json({ error: "Brak podanej akcji." });
  }

  try {
    // LOGOWANIE
    if (action === 'login') {
      const code = req.body.code;
      if (!code) return res.status(400).json({ error: "Brak kodu." });

      const [rows] = await pool.query(
        "SELECT uuid FROM ac_login_codes WHERE code = ? AND used = 0 AND expires_at > NOW()",
        [code]
      );

      if (rows.length > 0) {
        const uuid = rows[0].uuid;
        const token = require('crypto').randomBytes(32).toString('hex');
        
        await pool.query(
          "UPDATE ac_login_codes SET code = ?, used = 1 WHERE uuid = ? AND code = ?",
          [token, uuid, code]
        );
        
        return res.json({ success: true, token, uuid });
      } else {
        return res.json({ error: "Nieprawidłowy lub przeterminowany kod." });
      }
    }

    // WERYFIKACJA TOKENU DLA KOLEJNYCH ZAPYTAŃ
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Brak tokenu dostępu." });
    }

    const [userRows] = await pool.query(
      "SELECT uuid FROM ac_login_codes WHERE code = ?",
      [token]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const uuid = userRows[0].uuid;

    // DASHBOARD
    if (action === 'dashboard') {
      const data = {
        player: { uuid, name: "Gracz" },
        economy: { vpln: 0, coc: 0, pxc: 0, vxc: 0 },
        market: {
          COC: { price: 1000, trend: 0, history: [] },
          PXC: { price: 25000, trend: 0, history: [] },
          VXC: { price: 1000000, trend: 0, history: [] }
        },
        history: []
      };

      // Gracz (VPLN)
      const [walletRows] = await pool.query("SELECT player_name, balance FROM ac_player_wallets WHERE uuid = ?", [uuid]);
      if (walletRows.length > 0) {
        data.player.name = walletRows[0].player_name;
        data.economy.vpln = parseFloat(walletRows[0].balance);
      }

      // Saldo Crypto
      const [balanceRows] = await pool.query("SELECT currency, amount FROM ac_crypto_balances WHERE uuid = ?", [uuid]);
      balanceRows.forEach(row => {
        const cur = row.currency.toLowerCase();
        if (data.economy[cur] !== undefined) {
          data.economy[cur] = parseFloat(row.amount);
        }
      });

      // Rynek
      for (const c of ['COC', 'PXC', 'VXC']) {
        const [marketRows] = await pool.query(
          "SELECT price FROM ac_market_history WHERE currency = ? ORDER BY timestamp DESC LIMIT 20",
          [c]
        );
        
        if (marketRows.length > 0) {
          data.market[c].price = parseFloat(marketRows[0].price);
          const history = marketRows.map(r => parseFloat(r.price)).reverse();
          data.market[c].history = history;
          
          if (marketRows.length > 1) {
            const oldPrice = parseFloat(marketRows[1].price);
            const newPrice = parseFloat(marketRows[0].price);
            if (oldPrice > 0) {
              data.market[c].trend = ((newPrice - oldPrice) / oldPrice) * 100;
            }
          }
        }
      }

      // Transakcje (Inwestycje)
      const [historyRows] = await pool.query(
        "SELECT currency, amount_vpln as vpln_amount, amount_crypto as crypto_amount, 'BUY' as type, timestamp FROM ac_investments WHERE uuid = ? ORDER BY timestamp DESC LIMIT 10",
        [uuid]
      );
      data.history = historyRows;

      return res.json(data);
    }

    // INVEST / SELL
    if (action === 'invest' || action === 'sell') {
      const currency = req.body.currency;
      const amount = parseFloat(req.body.amount || 0);

      if (amount <= 0) {
        return res.json({ error: "Błędna kwota" });
      }

      // Upewniamy się, że tabela istnieje, aby zapobiec błędom na Vercel
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crypto_web_actions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36) NOT NULL,
            action_type VARCHAR(16) NOT NULL,
            currency VARCHAR(16) NOT NULL,
            amount DOUBLE NOT NULL,
            status VARCHAR(16) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(
        "INSERT INTO crypto_web_actions (uuid, action_type, currency, amount, status) VALUES (?, ?, ?, ?, 'PENDING')",
        [uuid, action.toUpperCase(), currency, amount]
      );

      return res.json({ success: true, msg: "Zlecenie przyjęte. Poczekaj chwilę w grze." });
    }

    return res.status(400).json({ error: "Nieznana akcja" });

  } catch (error) {
    console.error("Database Error:", error);
    return res.status(500).json({ error: "Wystąpił błąd serwera: " + error.message, stack: error.stack });
  }
});

module.exports = app;
