const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error abriendo DB', err.message);
        return;
    }
    
    db.run("ALTER TABLE users ADD COLUMN nombre_completo TEXT", (err) => {
        if (err) {
           console.log("Columna ya existe o error:", err.message);
        } else {
           console.log("Columna added successfully");
        }
        db.close();
    });
});
