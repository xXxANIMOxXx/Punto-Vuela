const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error abriendo la base de datos', err.message);
        process.exit(1);
    }
});

db.run(`ALTER TABLE users ADD COLUMN telefono TEXT;`, (err) => {
    if (err) {
        if (err.message.includes('duplicate column name')) {
            console.log('La columna telefono ya existe.');
        } else {
            console.error('Error al añadir la columna telefono:', err.message);
        }
    } else {
        console.log('Columna telefono añadida correctamente.');
    }
    db.close();
});
