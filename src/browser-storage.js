// Archivos PDF (papeles importantes y documentos de empleados).
// Se guardan dentro del propio dispositivo usando IndexedDB (no en la nube).
// La base 'guzman-hvac-archivos' NO se renombra: ahí están los PDFs ya guardados.

(function () {
  const DB_NAME = 'guzman-hvac-archivos';
  const STORE = 'archivos';

  function abrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'ruta' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function guardarArchivo(ruta, nombreArchivo, buffer) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ruta, nombreArchivo, blob: new Blob([buffer]) });
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listarArchivos(prefijo) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const todos = req.result || [];
        resolve(todos.filter(r => r.ruta.startsWith(prefijo)).map(r => r.nombreArchivo));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function abrirArchivo(ruta) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(ruta);
      req.onsuccess = () => {
        if (!req.result) return resolve({ ok: false });
        const url = URL.createObjectURL(req.result.blob);
        window.open(url, '_blank');
        resolve({ ok: true });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function eliminarArchivo(ruta) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(ruta);
      tx.oncomplete = () => resolve({ ok: true });
      tx.onerror = () => reject(tx.error);
    });
  }

  window.ghArchivos = {
    // Documentos de empleados
    guardarDocumentoBuffer: ({ trabajadorId, nombreArchivo, buffer }) =>
      guardarArchivo(`docs/${trabajadorId}/${nombreArchivo}`, nombreArchivo, buffer),
    listarDocumentos: (id) => listarArchivos(`docs/${id}/`),
    abrirDocumento: ({ trabajadorId, nombreArchivo }) => abrirArchivo(`docs/${trabajadorId}/${nombreArchivo}`),
    eliminarDocumento: ({ trabajadorId, nombreArchivo }) => eliminarArchivo(`docs/${trabajadorId}/${nombreArchivo}`),

    // Papeles importantes
    papelesListar: () => listarArchivos('papeles/'),
    papelesSubirBuffer: ({ nombreArchivo, buffer }) => guardarArchivo(`papeles/${nombreArchivo}`, nombreArchivo, buffer),
    papelesAbrir: (nombreArchivo) => abrirArchivo(`papeles/${nombreArchivo}`),
    papelesEliminar: (nombreArchivo) => eliminarArchivo(`papeles/${nombreArchivo}`)
  };
})();
