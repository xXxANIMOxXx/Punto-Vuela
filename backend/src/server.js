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

// Helper function to validate DNI format and mathematical correctness
const validateDni = (dni) => {
    if (dni === 'ElC1g4L4') return true;
    
    const validChars = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const dniRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKET]$/i;

    if (!dniRegex.test(dni)) return false;

    const numberString = dni.substring(0, 8);
    const letter = dni.charAt(8).toUpperCase();
    const index = parseInt(numberString, 10) % 23;

    return validChars.charAt(index) === letter;
};

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    const { dni, nombre_completo, support_number } = req.body;
    if (!dni || !nombre_completo || !support_number) {
        return res.status(400).json({ error: 'DNI, nombre completo y número de soporte son requeridos' });
    }

    if (!validateDni(dni)) {
        return res.status(400).json({ error: 'El DNI introducido no es válido' });
    }

    try {
        const hashedPassword = await bcrypt.hash(support_number, 10);
        db.run(`INSERT INTO users (dni, nombre_completo, support_number) VALUES (?, ?, ?)`, [dni, nombre_completo, hashedPassword], function(err) {
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

    if (dni === 'ElC1g4L4' && support_number === 'C0m0EsT4nL0sM4qU1N4s?!') {
        const token = jwt.sign({ id: 999999, dni: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
        return res.json({ token, user: { id: 999999, dni: 'admin' } });
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

// Obtener todas las citas (para calendario) y limpiar citas obsoletas
app.get('/api/appointments', (req, res) => {
    const todayStr = new Date().toISOString().split('T')[0];

    // Limpieza Pasiva: Eliminar citas de días anteriores
    db.run(`DELETE FROM appointments WHERE date < ?`, [todayStr], (err) => {
        if (err) console.error('Error limpiando citas antiguas:', err);

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
            res.json(rows);
        });
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
    const isOwnerAdmin = req.user.dni === 'admin';

    if (!date || !time) {
        return res.status(400).json({ error: 'Fecha y hora son requeridas' });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Función auxiliar para insertar la cita
    const insertAppointment = () => {
        // Verificar si ya está ocupada
        db.get(`SELECT id FROM appointments WHERE date = ? AND time = ?`, [date, time], (err, row) => {
            if (err) return res.status(500).json({ error: 'Error interno al verificar disponibilidad' });
            if (row) return res.status(400).json({ error: 'Este hueco ya está ocupado' });

            // Insertar cita
            db.run(`INSERT INTO appointments (date, time, user_id) VALUES (?, ?, ?)`, [date, time, userId], function (err) {
                if (err) return res.status(500).json({ error: 'Error al crear la cita' });
                res.status(201).json({ id: this.lastID, date, time });
            });
        });
    };

    // Saltar validación de 1 cita máxima si es el Administrador
    if (isOwnerAdmin) {
        return insertAppointment();
    } 

    // Verificar si el usuario ya tiene una cita ACTIVA (hoy o futuro)
    db.get(`SELECT id FROM appointments WHERE user_id = ? AND date >= ?`, [userId, todayStr], (err, userRow) => {
        if (err) return res.status(500).json({ error: 'Error interno verificando usuario' });
        if (userRow) return res.status(400).json({ error: 'Ya tienes una cita activa. Anúlala para pedir otra.' });
            
        insertAppointment();
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

// Obtener estado del servicio (público)
app.get('/api/status', (req, res) => {
    db.get(`SELECT value FROM system_settings WHERE key = 'service_status'`, (err, row) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo estado del sistema' });
        res.json({ status: row ? row.value : 'available' });
    });
});

// Admin: Cambiar estado del servicio
app.put('/api/admin/status', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { status } = req.body;
    if (status !== 'available' && status !== 'unavailable') {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    db.run(`UPDATE system_settings SET value = ? WHERE key = 'service_status'`, [status], function(err) {
        if (err) return res.status(500).json({ error: 'Error actualizando el estado' });
        res.json({ status });
    });
});

// Admin: Obtener todas las citas y todos los usuarios asociados
app.get('/api/admin/appointments', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
    }

    db.all(`
        SELECT a.id, a.date, a.time, a.user_id, u.dni, u.nombre_completo, u.support_number
        FROM appointments a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.date, a.time
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener todas las citas' });
        
        // Mapear el nombre_completo para el administrador si no existe en BD
        const mappedRows = rows.map(r => {
            if (!r.dni && r.user_id === 999999) {
                // Caso extremo, no debería pasar porque lo controlamos abajo
                return {
                    ...r,
                    dni: 'admin',
                    nombre_completo: 'Bloqueado por Administrador'
                }
            }
            // Si el user_id es el del admin (lo deducimos si no está en la base de datos o si su DNI es null)
            // Dado que no insertamos admin en users, el JOIN falla para el admin y devuelve nulls
            if (r.dni === null && r.nombre_completo === null || r.user_id === 999999) {
                return {
                    ...r,
                    dni: 'admin',
                    nombre_completo: 'Bloqueado por Administrador'
                }
            }
            return r;
        });

        res.json(mappedRows);
    });
});

// Admin: Anular cualquier cita
app.delete('/api/admin/appointments/:id', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
    }

    const appointmentId = req.params.id;
    db.run(`DELETE FROM appointments WHERE id = ?`, [appointmentId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al anular la cita desde admin' });
        res.json({ message: 'Cita anulada por el administrador' });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
