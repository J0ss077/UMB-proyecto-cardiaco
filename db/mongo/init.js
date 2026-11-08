// Colecciones del flujo crudo de dispositivos y sus índices.
//
// Se ejecuta una sola vez, cuando el volumen de MongoDB se inicializa: el
// entrypoint de la imagen recorre /docker-entrypoint-initdb.d. El script es
// idempotente para que volver a ejecutarlo, o reiniciar el contenedor, no
// falle. La ingesta del backend escribe en estas colecciones; el script solo
// deja el esquema listo.
//
// La base es la misma que usa el backend en compose.yaml. Se selecciona de
// forma explícita porque el intérprete de los scripts de inicialización
// arranca en otra base.

const database = db.getSiblingDB("hta");

// El flujo crudo es de solo anexado: la ingesta inserta y un reintento no
// reescribe el documento existente. Una lectura se consulta por paciente o por
// dispositivo, siempre en orden de tiempo.
const collections = ["raw_readings", "wearable_events"];

for (const name of collections) {
    if (!database.getCollectionNames().includes(name)) {
        database.createCollection(name);
    }
    database.getCollection(name).createIndex({ patient_id: 1, measured_at: 1 }, { name: "patient_time" });
    database.getCollection(name).createIndex({ device_id: 1, measured_at: 1 }, { name: "device_time" });
}

print("Colecciones del flujo crudo listas: " + collections.join(", "));
