// server.js
// Servidor de la app "Chicharron de Chile".
// Guarda todos los datos (lotes, ventas, gastos, clientes, pagos) en Postgres,
// en un solo registro tipo "expediente completo" (una columna JSONB).
// Esto es exactamente el mismo modelo de datos que ya usaba la version de Claude,
// solo que ahora vive en una base de datos propia en vez del guardado de Claude.

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway te da esta variable automaticamente cuando conectas un servicio de Postgres.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

const ESTADO_VACIO = {
  lotes: [],
  ventas: [],
  gastos: [],
  pagos: [],
  clientes: [],
  ultimosPrecios: {},
  temaOscuro: false,
  lotesCerrados: []
};

// Crea la tabla si no existe. Guardamos todo en una sola fila (id = 1),
// igual que hacia el guardado de Claude: un solo "expediente" con todo adentro.
async function iniciarBaseDeDatos() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { rows } = await pool.query('SELECT id FROM app_data WHERE id = 1');
  if (rows.length === 0) {
    await pool.query('INSERT INTO app_data (id, data) VALUES (1, $1)', [ESTADO_VACIO]);
  }
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Devuelve todos los datos guardados
app.get('/api/estado', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM app_data WHERE id = 1');
    res.json(rows[0] ? rows[0].data : ESTADO_VACIO);
  } catch (err) {
    console.error('Error al leer datos:', err);
    res.status(500).json({ error: 'No se pudo leer la informacion.' });
  }
});

// Guarda todos los datos (reemplaza el expediente completo)
app.post('/api/estado', async (req, res) => {
  try {
    const datos = req.body;
    await pool.query(
      `INSERT INTO app_data (id, data, actualizado_en) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, actualizado_en = now()`,
      [datos]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al guardar datos:', err);
    res.status(500).json({ error: 'No se pudo guardar la informacion.' });
  }
});

// Cualquier otra ruta regresa la app (para que funcione bien al recargar)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

iniciarBaseDeDatos()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Chicharron de Chile corriendo en el puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error('No se pudo iniciar la base de datos:', err);
    process.exit(1);
  });
