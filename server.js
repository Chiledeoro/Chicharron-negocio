// server.js
// Servidor de la app "Chicharron de Chile".
// Guarda todos los datos (lotes, ventas, gastos, clientes, pagos) en Postgres,
// en un solo registro tipo "expediente completo" (una columna JSONB).
// Ahora tambien maneja usuarios con dos roles:
//   - admin: puede hacer todo (capturar, editar, eliminar)
//   - usuario: puede capturar (agregar cosas nuevas) pero NO editar ni eliminar nada existente

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Cambia esto en las variables de entorno de Railway (JWT_SECRET) por algo unico y secreto.
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto-por-algo-secreto-en-railway';

// El primer usuario admin se crea solo al arrancar, usando estas variables de entorno.
// Configuralas en Railway -> Variables. Si no las configuras, usa estos valores por default
// (cambia la contrasena en cuanto puedas entrar).
const ADMIN_USER_DEFAULT = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_DEFAULT = process.env.ADMIN_PASSWORD || 'chicharron123';

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

// Listas que se protegen de edicion/eliminacion cuando el usuario no es admin.
// Se identifican los registros por su "id" y se compara contra lo que ya habia guardado.
const LISTAS_PROTEGIDAS = ['lotes', 'ventas', 'gastos', 'clientes', 'pagos'];

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      usuario TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'usuario',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows: usuariosExistentes } = await pool.query('SELECT id FROM usuarios LIMIT 1');
  if (usuariosExistentes.length === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD_DEFAULT, 10);
    await pool.query(
      'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4)',
      ['Administrador', ADMIN_USER_DEFAULT, hash, 'admin']
    );
    console.log(`Usuario admin creado: "${ADMIN_USER_DEFAULT}". Cambia la contrasena en cuanto puedas.`);
  }
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Autenticacion ----------

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
}

function requiereLogin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No has iniciado sesion.' });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Tu sesion ya no es valida, entra de nuevo.' });
  }
}

function requiereAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto.' });
  }
  next();
}

app.post('/api/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: 'Escribe usuario y contraseña.' });
    }
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const u = rows[0];
    const coincide = await bcrypt.compare(password, u.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const token = generarToken(u);
    res.json({ token, nombre: u.nombre, usuario: u.usuario, rol: u.rol });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'No se pudo iniciar sesion.' });
  }
});

app.get('/api/yo', requiereLogin, (req, res) => {
  res.json({ nombre: req.usuario.nombre, usuario: req.usuario.usuario, rol: req.usuario.rol });
});

// ---------- Gestion de usuarios (solo admin) ----------

app.get('/api/usuarios', requiereLogin, requiereAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nombre, usuario, rol, creado_en FROM usuarios ORDER BY creado_en ASC');
    res.json(rows);
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'No se pudo obtener la lista de usuarios.' });
  }
});

app.post('/api/usuarios', requiereLogin, requiereAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, rol } = req.body;
    if (!nombre || !usuario || !password) {
      return res.status(400).json({ error: 'Faltan datos (nombre, usuario o contraseña).' });
    }
    const rolFinal = rol === 'admin' ? 'admin' : 'usuario';
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, usuario, rol',
      [nombre, usuario, hash, rolFinal]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un usuario con ese nombre de acceso.' });
    }
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
});

app.put('/api/usuarios/:id', requiereLogin, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, usuario, password, rol } = req.body;
    if (!nombre || !usuario) {
      return res.status(400).json({ error: 'Faltan datos (nombre o usuario).' });
    }
    const rolFinal = rol === 'admin' ? 'admin' : 'usuario';

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE usuarios SET nombre = $1, usuario = $2, rol = $3, password_hash = $4 WHERE id = $5',
        [nombre, usuario, rolFinal, hash, id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nombre = $1, usuario = $2, rol = $3 WHERE id = $4',
        [nombre, usuario, rolFinal, id]
      );
    }

    const { rows } = await pool.query('SELECT id, nombre, usuario, rol FROM usuarios WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un usuario con ese nombre de acceso.' });
    }
    console.error('Error al editar usuario:', err);
    res.status(500).json({ error: 'No se pudo editar el usuario.' });
  }
});

app.delete('/api/usuarios/:id', requiereLogin, requiereAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (String(req.usuario.id) === String(id)) {
      return res.status(400).json({ error: 'No te puedes eliminar a ti mismo.' });
    }
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
  }
});

// ---------- Datos de la app ----------

app.get('/api/estado', requiereLogin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM app_data WHERE id = 1');
    res.json(rows[0] ? rows[0].data : ESTADO_VACIO);
  } catch (err) {
    console.error('Error al leer datos:', err);
    res.status(500).json({ error: 'No se pudo leer la informacion.' });
  }
});

// Revisa que un usuario que no es admin solo haya agregado cosas nuevas,
// sin modificar ni borrar nada que ya existiera.
function soloAgrego(anterior, nuevo) {
  for (const lista of LISTAS_PROTEGIDAS) {
    const listaAnterior = Array.isArray(anterior[lista]) ? anterior[lista] : [];
    const listaNueva = Array.isArray(nuevo[lista]) ? nuevo[lista] : [];
    const mapaNuevo = new Map(listaNueva.map(item => [item.id, item]));

    for (const itemViejo of listaAnterior) {
      const itemNuevo = mapaNuevo.get(itemViejo.id);
      if (!itemNuevo) {
        return `Se eliminó un registro de "${lista}" que ya existía.`;
      }
      if (JSON.stringify(itemViejo) !== JSON.stringify(itemNuevo)) {
        return `Se modificó un registro de "${lista}" que ya existía.`;
      }
    }
  }
  return null;
}

app.post('/api/estado', requiereLogin, async (req, res) => {
  try {
    const datosNuevos = req.body;

    if (req.usuario.rol !== 'admin') {
      const { rows } = await pool.query('SELECT data FROM app_data WHERE id = 1');
      const datosActuales = rows[0] ? rows[0].data : ESTADO_VACIO;
      const problema = soloAgrego(datosActuales, datosNuevos);
      if (problema) {
        return res.status(403).json({ error: `Tu cuenta no puede editar ni eliminar información existente. ${problema}` });
      }
    }

    await pool.query(
      `INSERT INTO app_data (id, data, actualizado_en) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, actualizado_en = now()`,
      [datosNuevos]
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
