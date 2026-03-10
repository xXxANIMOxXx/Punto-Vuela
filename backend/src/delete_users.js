const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error abriendo DB', err.message);
        return;
    }
    
    const dnisToDelete = ['77701640G', '11111111A', '22222222B'];
    
    // Disable foreign keys temporarily if needed or just let it cascade if set. 
    // Here we'll delete the appointments first to avoid constraint issues, then the users.
    db.serialize(() => {
        dnisToDelete.forEach(dni => {
            db.run(`DELETE FROM appointments WHERE user_id IN (SELECT id FROM users WHERE dni = ?)`, [dni], (err) => {
                if(err) console.error(err);
            });
            db.run(`DELETE FROM users WHERE dni = ?`, [dni], function(err) {
                if(err) console.error(err);
                else console.log(`Usuario con DNI ${dni} borrado. Cambios: ${this.changes}`);
            });
        });
    });
    
    // Close after a brief delay to ensure statements execute
    setTimeout(() => db.close(), 1000);
});
