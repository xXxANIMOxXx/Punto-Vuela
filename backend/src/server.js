const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'punto_vuela_secret_key_123';

app.use(cors());
app.use(express.json());

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    const { dni, support_number } = req.body;
    if (!dni || !support_number) {
        return res.status(400).json({ error: 'DNI y número de soporte son requeridos' });
    }

    try {
        const hashedPassword = await bcrypt.hash(support_number, 10);
        db.run(`INSERT INTO users (dni, support_number) VALUES (?, ?)`, [dni, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'El DNI ya está registrado' });
                }
                return res.status(500).json({ error: 'Error al registrar usuario' });
            }
            res.status(201).json({ message: 'Usuario registrado exitosamente', userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Login de usuario
app.post('/api/auth/login', (req, res) => {
    const { dni, support_number } = req.body;
    if (!dni || !support_number) {
        return res.status(400).json({ error: 'DNI y número de soporte son requeridos' });
    }

    db.get(`SELECT * FROM users WHERE dni = ?`, [dni], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = await bcrypt.compare(support_number, user.support_number);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ id: user.id, dni: user.dni }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, user: { id: user.id, dni: user.dni } });
    });
});

// Obtener todas las citas (para calendario)
app.get('/api/appointments', (req, res) => {
    // Si queremos filtrar por fecha: ?date=YYYY-MM-DD
    const { date } = req.query;
    let query = `SELECT id, date, time FROM appointments`;
    let params = [];

    if (date) {
        query += ` WHERE date = ?`;
        params.push(date);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener citas' });
        }
        res.json(rows); // Devuelve la lista de citas ocupadas
    });
});

// Obtener mis citas (opcional, para UI)
app.get('/api/appointments/me', authenticateToken, (req, res) => {
    db.all(`SELECT id, date, time FROM appointments WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener tus citas' });
        res.json(rows);
    });
});

// Crear una cita
app.post('/api/appointments', authenticateToken, (req, res) => {
    const { date, time } = req.body;
    const userId = req.user.id;

    if (!date || !time) {
        return res.status(400).json({ error: 'Fecha y hora son requeridas' });
    }

    // Verificar si ya está ocupada
    db.get(`SELECT id FROM appointments WHERE date = ? AND time = ?`, [date, time], (err, row) => {
        if (err) return res.status(500).json({ error: 'Error interno al verificar disponibilidad' });
        if (row) return res.status(400).json({ error: 'Este hueco ya está ocupado' });

        // Insertar cita
        db.run(`INSERT INTO appointments (date, time, user_id) VALUES (?, ?, ?)`, [date, time, userId], function(err) {
            if (err) return res.status(500).json({ error: 'Error al crear la cita' });
            res.status(201).json({ id: this.lastID, date, time });
        });
    });
});

// Anular una cita
app.delete('/api/appointments/:id', authenticateToken, (req, res) => {
    const appointmentId = req.params.id;
    const userId = req.user.id;

    db.run(`DELETE FROM appointments WHERE id = ? AND user_id = ?`, [appointmentId, userId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al anular la cita' });
        if (this.changes === 0) return res.status(403).json({ error: 'No tienes permiso o la cita no existe' });
        res.json({ message: 'Cita anulada correctamente' });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
