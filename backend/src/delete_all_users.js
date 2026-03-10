const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error abriendo DB', err.message);
        return;
    }
    
    db.serialize(() => {
        // El administrador no está en la tabla "users", su id virtual es 999999
        // y lo identificamos así en las citas que él crea en "appointments".
        db.run(`DELETE FROM appointments WHERE user_id != 999999`, [], function(err) {
            if(err) console.error(err);
            else console.log(`Citas de prueba borradas. Filas afectadas: ${this.changes}`);
        });
        
        db.run(`DELETE FROM users`, [], function(err) {
            if(err) console.error(err);
            else console.log(`Usuarios de prueba borrados. Filas afectadas: ${this.changes}`);
        });
    });
    
    setTimeout(() => db.close(), 1000);
});
