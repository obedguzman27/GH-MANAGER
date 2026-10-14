  // ====================================================================
  // MÓDULO: FACTURAS (INVOICES)
  // ====================================================================
  const INV_KEY = 'gh-invoices';
  const COL_KEY = 'gh-colonias';
  const CLI_KEY = 'gh-clientes';
  const TRB_KEY = 'gh-trabajos';
  let invDocs = [], invColonias = [], invClientes = [], invTrabajos = [], invEnVista = null, invFilaC = 0;

  const INV_COL_DEFAULT = [
    'Hamlet at Carothers Crossing','Idle Reserve','Briley Downs','Fairhaven',
    'Kings Landing','Garrett Farms','Parkhaven','Hartmann Landing','Spring Branch',
    'Riley Farms','Northridge Park',"Marlon's Creek",'Brush Creek','Shelton Square',
    'The Estates at Highland Reserves','The Greens at Legacy Townhomes',
    'Tiger Hill Townhomes','Twin Lakes','Highland Reserve','Hickory Cove',
    'Glenview Farms','Bradshaw Farms Reserve','Campbell Place','Timberwalk'
  ];
  const INV_CLI_DEFAULT = ['Airtron'];
  const INV_TRB_DEFAULT = [
    'Trim install','Rough-in installation','Unit installation',
    'Duct work','Thermostat installation','Filter replacement',
    'Maintenance service','System inspection','Repair service',
    'Coil cleaning','Refrigerant recharge','Fan motor replacement'
  ];
  const invFmt = n => { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  // Días en inglés para la columna DAY de la factura (el invoice siempre se ve en inglés)
  const INV_DIAS_SEMANA = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  // Fecha en números para los documentos (MM/DD/YYYY), nunca en letras
  // Fecha con guiones para la columna DATE de la factura: 09-19-2026
  function invFechaGuion(fechaISO) {
    if (!fechaISO) return '';
    const p = String(fechaISO).slice(0, 10).split('-');
    if (p.length !== 3) return fechaISO;
    return `${p[1]}-${p[2]}-${p[0]}`;
  }
  function invFechaNum(fechaISO) {
    if (!fechaISO) return '';
    const p = String(fechaISO).slice(0, 10).split('-');
    if (p.length !== 3) return fechaISO;
    return `${p[1]}/${p[2]}/${p[0]}`;
  }
  function invDiaDeFecha(fechaISO) {
    if (!fechaISO) return '';
    const [y, m, d] = fechaISO.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay(); // 0=domingo
    return dow === 0 ? 'Sunday' : INV_DIAS_SEMANA[dow - 1];
  }

