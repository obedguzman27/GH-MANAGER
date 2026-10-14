// Reemplazo de window.electronAPI para cuando la app corre en el navegador
// (iPhone / cualquier PC sin la versión de escritorio).
// Guarda los PDFs dentro del propio dispositivo usando IndexedDB.
// NOTA: esto es almacenamiento LOCAL al teléfono/navegador. Cuando se conecte
// el backend en la nube (Fase 2), estas funciones se reemplazarán para que
// los documentos también se sincronicen entre dispositivos.

(function () {
  // Si ya existe window.electronAPI (estamos en la app de Windows), no hacer nada.
  if (window.electronAPI) return;

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

  window.electronAPI = {
    // Documentos de empleados
    guardarDocumentoBuffer: ({ trabajadorId, nombreArchivo, buffer }) =>
      guardarArchivo(`docs/${trabajadorId}/${nombreArchivo}`, nombreArchivo, buffer),
    guardarDocumento: async () => ({ ok: false }), // requiere ruta de archivo local (solo Windows)
    listarDocumentos: (id) => listarArchivos(`docs/${id}/`),
    abrirDocumento: ({ trabajadorId, nombreArchivo }) => abrirArchivo(`docs/${trabajadorId}/${nombreArchivo}`),
    eliminarDocumento: ({ trabajadorId, nombreArchivo }) => eliminarArchivo(`docs/${trabajadorId}/${nombreArchivo}`),

    // Papeles importantes
    papelesListar: () => listarArchivos('papeles/'),
    papelesSubirBuffer: ({ nombreArchivo, buffer }) => guardarArchivo(`papeles/${nombreArchivo}`, nombreArchivo, buffer),
    papelesSubir: async () => ({ ok: false }), // requiere ruta de archivo local (solo Windows)
    papelesAbrir: (nombreArchivo) => abrirArchivo(`papeles/${nombreArchivo}`),
    papelesEliminar: (nombreArchivo) => eliminarArchivo(`papeles/${nombreArchivo}`)
  };
})();
