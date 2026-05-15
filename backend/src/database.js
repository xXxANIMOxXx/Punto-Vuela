const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error abriendo la base de datos', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dni TEXT UNIQUE,
            nombre_completo TEXT,
            telefono TEXT,
            support_number TEXT
        )`, () => {
            db.run(`ALTER TABLE users ADD COLUMN telefono TEXT`, (err) => { /* ignore if already exists */ });
            
            // Insertar admin por defecto si no existe
            const bcrypt = require('bcryptjs');
            const adminHash = bcrypt.hashSync('C0m0EsT4nL0sM4qU1N4s?!', 10);
            db.run(`INSERT OR IGNORE INTO users (id, dni, nombre_completo, telefono, support_number) VALUES (999999, 'ElC1g4L4', 'Administrador Principal', '000000000', ?)`, [adminHash]);
        });

        db.run(`CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            time TEXT,
            user_id INTEGER,
            motivo TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`, () => {
            db.run(`ALTER TABLE appointments ADD COLUMN motivo TEXT`, (err) => { /* ignore if already exists */ });
        });

        db.run(`CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, () => {
            db.run(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('service_status', 'available')`);
            db.run(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('custom_message_active', 'false')`);
            db.run(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('custom_message_text', '')`);
        });
    }
});

module.exports = db;
