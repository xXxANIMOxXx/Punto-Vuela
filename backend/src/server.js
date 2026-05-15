require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_for_dev_key';

const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// Limitar intentos de login (Protección Fuerza Bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // Límite de 10 intentos por IP
    message: { error: 'Demasiados intentos de inicio de sesión, por favor inténtalo de nuevo en 15 minutos.' }
});

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

// Helper function to validate DNI/NIE format and mathematical correctness
const validateDni = (dni) => {
    const validChars = 'TRWAGMYFPDXBNJZSQVHLCKET';
    const dniRegex = /^[XYZ0-9][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKET]$/i;

    if (!dniRegex.test(dni)) return false;

    let numberString = dni.substring(0, 8).toUpperCase();
    const letter = dni.charAt(8).toUpperCase();
    
    // Convertir letra inicial de NIE a número
    numberString = numberString.replace('X', '0').replace('Y', '1').replace('Z', '2');
    
    const index = parseInt(numberString, 10) % 23;

    return validChars.charAt(index) === letter;
};

// Registro de usuario
app.post('/api/auth/register', async (req, res) => {
    const { dni, nombre_completo, telefono, support_number } = req.body;
    if (!dni || !nombre_completo || !telefono || !support_number) {
        return res.status(400).json({ error: 'DNI/NIE, nombre completo, teléfono y contraseña son requeridos' });
    }

    if (!validateDni(dni)) {
        return res.status(400).json({ error: 'El DNI o NIE introducido no es válido' });
    }

    try {
        const hashedPassword = await bcrypt.hash(support_number, 10);
        db.run(`INSERT INTO users (dni, nombre_completo, telefono, support_number) VALUES (?, ?, ?, ?)`, [dni, nombre_completo, telefono, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'El DNI / NIE ya está registrado' });
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
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { dni, support_number } = req.body;
    if (!dni || !support_number) {
        return res.status(400).json({ error: 'DNI/NIE y contraseña son requeridos' });
    }

    db.get(`SELECT * FROM users WHERE dni = ?`, [dni], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = await bcrypt.compare(support_number, user.support_number);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Si es el admin (ID 999999), añadir su flag especial y un tiempo de expiración mayor
        let tokenOptions = { expiresIn: '2h' };
        let tokenPayload = { id: user.id, dni: user.dni };
        
        if (user.id === 999999 || user.dni === 'ElC1g4L4') {
            tokenPayload = { id: 999999, dni: 'admin' };
            tokenOptions = { expiresIn: '8h' };
        }

        const token = jwt.sign(tokenPayload, JWT_SECRET, tokenOptions);
        res.json({ token, user: tokenPayload });
    });
});

// Obtener todas las citas (para calendario)
app.get('/api/appointments', (req, res) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { date } = req.query;

    let query = `SELECT id, date, time, motivo FROM appointments WHERE date >= ?`;
    let params = [todayStr];

    if (date) {
        query = `SELECT id, date, time, motivo FROM appointments WHERE date = ?`;
        params = [date];
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener citas' });
        }
        res.json(rows);
    });
});

// Obtener mis citas (opcional, para UI)
app.get('/api/appointments/me', authenticateToken, (req, res) => {
    db.all(`SELECT id, date, time, motivo FROM appointments WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener tus citas' });
        res.json(rows);
    });
});

// Crear una cita
app.post('/api/appointments', authenticateToken, (req, res) => {
    const { date, time, motivo } = req.body;
    const userId = req.user.id;
    const isOwnerAdmin = req.user.dni === 'admin';

    if (!date || !time) {
        return res.status(400).json({ error: 'Fecha y hora son requeridas' });
    }

    const finalMotivo = motivo || 'Otros';
    const todayStr = new Date().toISOString().split('T')[0];

    // Función auxiliar para insertar la cita
    const insertAppointment = () => {
        // Verificar si ya está ocupada
        db.get(`SELECT id FROM appointments WHERE date = ? AND time = ?`, [date, time], (err, row) => {
            if (err) return res.status(500).json({ error: 'Error interno al verificar disponibilidad' });
            if (row) return res.status(400).json({ error: 'Este hueco ya está ocupado' });

            // Insertar cita
            db.run(`INSERT INTO appointments (date, time, user_id, motivo) VALUES (?, ?, ?, ?)`, [date, time, userId, finalMotivo], function (err) {
                if (err) return res.status(500).json({ error: 'Error al crear la cita' });
                res.status(201).json({ id: this.lastID, date, time, motivo: finalMotivo });
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
    db.all(`SELECT key, value FROM system_settings`, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo estado del sistema' });
        
        const settings = {};
        if (rows) {
            rows.forEach(r => { settings[r.key] = r.value; });
        }
        
        res.json({ 
            status: settings['service_status'] || 'available',
            customMessageActive: settings['custom_message_active'] === 'true',
            customMessageText: settings['custom_message_text'] || ''
        });
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

// Admin: Actualizar mensaje personalizado
app.put('/api/admin/message', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { active, text } = req.body;

    db.serialize(() => {
        db.run(`UPDATE system_settings SET value = ? WHERE key = 'custom_message_active'`, [active ? 'true' : 'false']);
        db.run(`UPDATE system_settings SET value = ? WHERE key = 'custom_message_text'`, [text || ''], function(err) {
            if (err) return res.status(500).json({ error: 'Error actualizando el mensaje' });
            res.json({ active, text });
        });
    });
});

// Admin: Obtener todas las citas activas y todos los usuarios asociados
app.get('/api/admin/appointments', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
    }

    const now = new Date();
    // Restar 30 minutos a la hora actual.
    // Esto hace que una cita de las "14:00" siga apareciendo hasta las "14:30".
    const adjustedNow = new Date(now.getTime() - 30 * 60000);
    
    // Obtener fecha y hora en formato local (Madrid)
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Madrid' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Madrid' };
    
    // Usamos 'en-CA' (Canadá) porque su formato estándar es YYYY-MM-DD, que es el que usa la BD.
    const adjustedTodayStr = new Intl.DateTimeFormat('en-CA', dateOptions).format(adjustedNow);
    const adjustedTimeStr = new Intl.DateTimeFormat('es-ES', timeOptions).format(adjustedNow);

    db.all(`
        SELECT a.id, a.date, a.time, a.motivo, a.user_id, u.dni, u.nombre_completo, u.support_number, u.telefono
        FROM appointments a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.date > ? OR (a.date = ? AND a.time >= ?)
        ORDER BY a.date, a.time
    `, [adjustedTodayStr, adjustedTodayStr, adjustedTimeStr], (err, rows) => {
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

// Admin: Añadir cita manualmente para un usuario
app.post('/api/admin/appointments/manual', authenticateToken, async (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { dni, nombre_completo, telefono, date, time, motivo } = req.body;
    if (!dni || !nombre_completo || !telefono || !date || !time) {
        return res.status(400).json({ error: 'DNI, Nombre, Teléfono, Fecha y Hora son requeridos.' });
    }

    if (!validateDni(dni)) {
        return res.status(400).json({ error: 'El DNI o NIE introducido no es válido.' });
    }
    
    const finalMotivo = motivo || 'Otros';

    const insertAppointment = (userId) => {
        db.get(`SELECT id FROM appointments WHERE date = ? AND time = ?`, [date, time], (err, row) => {
            if (err) return res.status(500).json({ error: 'Error interno al verificar disponibilidad' });
            if (row) return res.status(400).json({ error: 'Este hueco ya está ocupado' });

            db.run(`INSERT INTO appointments (date, time, user_id, motivo) VALUES (?, ?, ?, ?)`, [date, time, userId, finalMotivo], function (err) {
                if (err) return res.status(500).json({ error: 'Error al crear la cita' });
                res.status(201).json({ id: this.lastID, date, time, motivo: finalMotivo, message: 'Cita creada manualmente.' });
            });
        });
    };

    db.get(`SELECT id FROM users WHERE LOWER(TRIM(dni)) = ?`, [dni.toLowerCase().trim()], async (err, row) => {
        if (err) return res.status(500).json({ error: 'Error interno al buscar usuario' });
        
        if (row) {
            // Usuario existe, le actualizamos el teléfono para asegurarnos de que tenemos el actual, luego creamos la cita.
            db.run(`UPDATE users SET telefono = ? WHERE id = ?`, [telefono, row.id], (updateErr) => {
                if (updateErr) console.error('Error actualizando teléfono del usuario:', updateErr);
                insertAppointment(row.id);
            });
        } else {
            // Usuario no existe, lo creamos con el teléfono como contraseña.
            try {
                const hashedPassword = await bcrypt.hash(telefono, 10);
                db.run(`INSERT INTO users (dni, nombre_completo, telefono, support_number) VALUES (?, ?, ?, ?)`, 
                    [dni, nombre_completo, telefono, hashedPassword], function(insertErr) {
                    if (insertErr) return res.status(500).json({ error: 'Error al registrar al nuevo usuario' });
                    insertAppointment(this.lastID);
                });
            } catch (hashError) {
                return res.status(500).json({ error: 'Error interno al generar contraseña' });
            }
        }
    });
});

// Admin: Exportar histórico completo de citas a CSV
app.get('/api/admin/history/export', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    db.all(`
        SELECT a.id, a.date, a.time, a.motivo, a.user_id, u.dni, u.nombre_completo, u.telefono
        FROM appointments a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.date DESC, a.time DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al exportar histórico' });
        
        // Configurar cabeceras BOM para Excel y forzar descarga
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="historial_citas.csv"');
        
        let csv = '\uFEFFID,Fecha,Hora,Motivo,DNI,Nombre Completo,Teléfono\n';
        rows.forEach(r => {
            const dni = r.user_id === 999999 ? 'admin' : (r.dni || 'Desconocido');
            const nombre = r.user_id === 999999 ? 'Bloqueo Administrador' : (r.nombre_completo || 'N/A');
            const telefono = r.user_id === 999999 ? '' : (r.telefono || 'N/A');
            const motivo = r.motivo || 'Otros';
            csv += `${r.id},${r.date},${r.time},"${motivo}",${dni},"${nombre}",${telefono}\n`;
        });

        res.send(csv);
    });
});

// Admin: Borrar usuario y sus citas por DNI
app.delete('/api/admin/users/:dni', authenticateToken, (req, res) => {
    if (req.user.dni !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const targetDni = req.params.dni.toLowerCase().trim();

    // No permitir borrar al admin
    if (targetDni === 'elc1g4l4' || targetDni === 'admin') {
        return res.status(400).json({ error: 'No se puede borrar al administrador' });
    }

    db.get(`SELECT id FROM users WHERE LOWER(TRIM(dni)) = ?`, [targetDni], (err, row) => {
        if (err) return res.status(500).json({ error: 'Error en la base de datos' });
        if (!row) return res.status(404).json({ error: 'Usuario no encontrado. Comprueba el DNI.' });

        const userId = row.id;

        db.serialize(() => {
            db.run(`DELETE FROM appointments WHERE user_id = ?`, [userId], (err) => {
                if (err) console.error('Error borrando citas del usuario:', err);
            });
            db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
                if (err) return res.status(500).json({ error: 'Error al borrar el usuario' });
                res.json({ message: 'Usuario y sus citas eliminados correctamente' });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
