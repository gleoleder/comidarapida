// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                      SISTEMA POS - script.js                                 ║
// ║                         Versión 2.3                                          ║
// ║                                                                              ║
// ║  Sistema de Punto de Venta para restaurante con integración a Google Sheets ║
// ║  Funcionalidades:                                                            ║
// ║  - Gestión de productos y categorías desde Google Sheets                    ║
// ║  - Carrito de compras con acompañamientos                                   ║
// ║  - Procesamiento de pagos y cálculo de cambio                               ║
// ║  - Estadísticas y reportes basados en ID_Venta                              ║
// ║  - Generación de tickets para impresión                                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 1: CONFIGURACIÓN DE GOOGLE API                   ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Aquí se cargan las credenciales desde config.js y se configuran los       ║
// ║  parámetros necesarios para conectar con la API de Google Sheets.          ║
// ╚════════════════════════════════════════════════════════════════════════════╝

const CLIENT_ID = CONFIG.CLIENT_ID;           // ID de cliente de Google OAuth
const API_KEY = CONFIG.API_KEY;               // Clave de API de Google
const SPREADSHEET_ID = CONFIG.GOOGLE_SHEET_ID; // ID del documento de Sheets
const SHEETS = CONFIG.SHEETS;                 // Nombres de las hojas

// URL para descubrir la API de Google Sheets
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// Permisos que solicita la aplicación:
// - spreadsheets: Leer y escribir en Google Sheets
// - userinfo.profile: Obtener nombre del usuario
// - userinfo.email: Obtener email del usuario
const SCOPES =
    'https://www.googleapis.com/auth/spreadsheets ' +
    'https://www.googleapis.com/auth/userinfo.profile ' +
    'https://www.googleapis.com/auth/userinfo.email';


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 2: VARIABLES DE ESTADO DE AUTENTICACIÓN          ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Variables que controlan el estado de la conexión con Google               ║
// ╚════════════════════════════════════════════════════════════════════════════╝

let tokenClient;           // Cliente de tokens OAuth de Google
let gapiInited = false;    // Indica si la API de Google está inicializada
let gisInited = false;     // Indica si Google Identity Services está listo
let usuarioGoogle = false; // Indica si hay un usuario conectado
let emailUsuario = '';     // Email del usuario conectado


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 3: DATOS DEL MENÚ                                ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Variables que almacenan los datos del menú cargados desde Google Sheets   ║
// ║  - CATEGORIES: Objeto con las categorías (milanesas, pollos, etc.)         ║
// ║  - PRODUCTS: Objeto con arrays de productos por categoría                  ║
// ║  - SIDE_OPTIONS: Array con las opciones de acompañamiento                  ║
// ╚════════════════════════════════════════════════════════════════════════════╝

let CATEGORIES = {};       // Categorías del menú
let PRODUCTS = {};         // Productos organizados por categoría
let SIDE_OPTIONS = [];     // Opciones de acompañamiento (arroz, fideo, etc.)
let dataLoaded = false;    // Indica si los datos ya fueron cargados


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 4: ESTADO DE LA APLICACIÓN                       ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Variables que controlan el estado actual de la aplicación                 ║
// ╚════════════════════════════════════════════════════════════════════════════╝

let cart = [];                              // Array de productos en el carrito
let currentCategory = '';                   // Categoría actualmente seleccionada
let orderNumber = 1;                        // Número del próximo pedido
let salesHistory = [];                      // Historial de ventas
let pendingProduct = null;                  // Producto esperando selección de acompañamiento
let paymentInfo = { received: 0, change: 0 }; // Info del pago actual
let salesChart = null;                      // Instancia del gráfico de ventas
let categoryChart = null;                   // Instancia del gráfico de categorías
let lastDetailId = 0;                       // Último ID usado en Detalle_Ventas


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 5: INICIALIZACIÓN DE GOOGLE API                  ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones que se ejecutan cuando se carga la página para inicializar     ║
// ║  la conexión con Google                                                    ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Callback que se ejecuta cuando la librería GAPI de Google se ha cargado
 * Inicia la carga del cliente de la API
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Inicializa el cliente de la API de Google Sheets
 * Configura la clave de API y los documentos de descubrimiento
 */
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC]
        });
        gapiInited = true;
        console.log('✅ Google API inicializada');
        checkReady();
    } catch (e) {
        console.error('❌ Error GAPI:', e);
        showToast('Error al inicializar Google API', 'error');
    }
}

/**
 * Callback que se ejecuta cuando Google Identity Services se ha cargado
 * Configura el cliente de tokens para OAuth
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleTokenResponse
    });
    gisInited = true;
    console.log('✅ Google Identity Services cargado');
    checkReady();
}

/**
 * Verifica si tanto GAPI como GIS están listos
 * Si hay un token guardado, intenta restaurar la sesión
 */
function checkReady() {
    if (gapiInited && gisInited) {
        console.log('🍗 Sistema POS listo');
        const savedToken = localStorage.getItem('pos_google_token');
        if (savedToken) {
            // Hay un token guardado, intentar restaurar sesión
            gapi.client.setToken({ access_token: savedToken });
            verificarToken();
        } else {
            // No hay sesión, mostrar estado vacío
            showEmptyState();
        }
    }
}

/**
 * Muestra un estado vacío cuando no hay conexión a Google
 * Indica al usuario que debe conectarse
 */
function showEmptyState() {
    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.innerHTML = '<div class="empty-products"><div class="empty-icon">🔌</div><p>Conecta con Google para cargar el menú</p></div>';
    }
    const nav = document.getElementById('categoryNav');
    if (nav) {
        nav.innerHTML = '<div class="connect-message">Presiona "Conectar" arriba para comenzar</div>';
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 6: AUTENTICACIÓN CON GOOGLE                      ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para manejar el inicio y cierre de sesión con Google           ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Maneja el click en el botón de conectar/desconectar Google
 * Si está conectado, cierra sesión. Si no, inicia el proceso de login
 */
function handleGoogleAuth() {
    if (!gapiInited || !gisInited) {
        showToast('Esperando Google API...', 'warning');
        return;
    }
    if (usuarioGoogle) {
        logoutGoogle();
    } else {
        // Solicita un token de acceso mostrando el popup de Google
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

/**
 * Callback que se ejecuta cuando Google devuelve un token
 * Guarda el token y carga los datos
 */
function handleTokenResponse(resp) {
    if (resp.error) {
        console.error('❌ Error auth:', resp);
        showToast('Error de autenticación', 'error');
        return;
    }
    
    // Guardar token en el cliente y en localStorage
    gapi.client.setToken(resp);
    localStorage.setItem('pos_google_token', resp.access_token);
    usuarioGoogle = true;
    
    // Actualizar UI y cargar datos
    updateGoogleStatus(true);
    obtenerEmailUsuario();
    loadAllDataFromSheets();
    showToast('¡Conectado a Google!', 'success');
}

/**
 * Cierra la sesión de Google
 * Revoca el token y limpia todos los datos
 */
function logoutGoogle() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
    }
    
    // Limpiar token
    gapi.client.setToken('');
    localStorage.removeItem('pos_google_token');
    
    // Resetear estado
    usuarioGoogle = false;
    emailUsuario = '';
    CATEGORIES = {};
    PRODUCTS = {};
    SIDE_OPTIONS = [];
    salesHistory = [];
    dataLoaded = false;
    
    // Actualizar UI
    updateGoogleStatus(false);
    document.getElementById('userEmail').textContent = '';
    showEmptyState();
    clearStats();
    showToast('Desconectado de Google', 'warning');
}

/**
 * Verifica si el token guardado sigue siendo válido
 * Si no es válido, cierra la sesión
 */
async function verificarToken() {
    try {
        // Intenta hacer una petición simple para verificar el token
        await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        usuarioGoogle = true;
        updateGoogleStatus(true);
        obtenerEmailUsuario();
        loadAllDataFromSheets();
        console.log('✅ Token válido');
    } catch (e) {
        console.log('⚠️ Token expirado');
        logoutGoogle();
    }
}

/**
 * Obtiene el email del usuario conectado desde la API de Google
 */
async function obtenerEmailUsuario() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token }
        });
        const data = await res.json();
        emailUsuario = data.email || '';
        document.getElementById('userEmail').textContent = emailUsuario ? '👤 ' + emailUsuario : '';
    } catch (e) {
        console.error('Error obteniendo email:', e);
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 7: CARGA DE DATOS DESDE GOOGLE SHEETS            ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para cargar categorías, productos, acompañamientos y ventas     ║
// ║  desde las diferentes hojas de Google Sheets                               ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Función principal que carga todos los datos desde Google Sheets
 * Llama a las funciones individuales de carga en secuencia
 */
async function loadAllDataFromSheets() {
    if (!usuarioGoogle) {
        showEmptyState();
        return;
    }

    try {
        showLoading('Cargando datos...');
        
        // Cargar cada tipo de dato en secuencia
        await loadCategoriesFromSheet();
        console.log('✅ Categorías:', Object.keys(CATEGORIES));
        
        await loadProductsFromSheet();
        console.log('✅ Productos cargados');
        
        await loadSidesFromSheet();
        console.log('✅ Acompañamientos:', SIDE_OPTIONS.length);
        
        await loadSalesFromSheet();
        console.log('✅ Ventas:', salesHistory.length);
        
        dataLoaded = true;
        
        // Establecer la primera categoría como activa
        const categoryKeys = Object.keys(CATEGORIES);
        if (categoryKeys.length > 0) {
            currentCategory = categoryKeys[0];
        }
        
        // Renderizar la interfaz
        renderCategories();
        renderProducts(currentCategory);
        updateStats();
        
        hideLoading();
        showToast('¡Datos cargados!', 'success');
        
    } catch (e) {
        console.error('❌ Error:', e);
        hideLoading();
        showToast('Error: ' + e.message, 'error');
    }
}

/**
 * Carga las categorías desde la hoja "Categorias"
 * Estructura esperada: ID_Categoria | Nombre | Icono | Orden | Activo
 */
async function loadCategoriesFromSheet() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.CATEGORIAS + '!A2:E100'
        });
        
        const rows = response.result.values || [];
        CATEGORIES = {};
        
        rows.forEach((row, index) => {
            const id = (row[0] || '').toString().trim().toLowerCase();
            const nombre = row[1] || id;
            const icono = row[2] || '📦';
            const orden = parseInt(row[3]) || (index + 1);
            const activo = (row[4] || 'TRUE').toString().toUpperCase().trim();
            
            // Solo agregar categorías activas
            if (id && activo === 'TRUE') {
                CATEGORIES[id] = { name: nombre, icon: icono, order: orden };
            }
        });
        
        // Si no hay categorías, usar valores por defecto
        if (Object.keys(CATEGORIES).length === 0) {
            CATEGORIES = {
                milanesas: { name: 'Milanesas', icon: '🥩', order: 1 },
                pollos: { name: 'Pollos', icon: '🍗', order: 2 },
                extras: { name: 'Extras', icon: '🍟', order: 3 },
                bebidas: { name: 'Bebidas', icon: '🥤', order: 4 }
            };
        }
    } catch (e) {
        console.error('Error categorías:', e);
        // Usar categorías por defecto en caso de error
        CATEGORIES = {
            milanesas: { name: 'Milanesas', icon: '🥩', order: 1 },
            pollos: { name: 'Pollos', icon: '🍗', order: 2 },
            extras: { name: 'Extras', icon: '🍟', order: 3 },
            bebidas: { name: 'Bebidas', icon: '🥤', order: 4 }
        };
    }
}

/**
 * Carga los productos desde la hoja "Productos"
 * Estructura: ID_Producto | Nombre | Precio | ID_Categoria | Tiene_Acompañamiento | Activo
 */
async function loadProductsFromSheet() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.PRODUCTOS + '!A2:F500'
        });
        
        const rows = response.result.values || [];
        PRODUCTS = {};
        
        // Inicializar un array vacío para cada categoría
        Object.keys(CATEGORIES).forEach(cat => { PRODUCTS[cat] = []; });
        
        rows.forEach((row, index) => {
            const id = parseInt(row[0]) || (index + 1);
            const nombre = (row[1] || '').toString().trim();
            const precio = parseFloat(row[2]) || 0;
            const categoria = (row[3] || '').toString().trim().toLowerCase();
            const tieneAcomp = (row[4] || 'FALSE').toString().toUpperCase().trim() === 'TRUE';
            const activo = (row[5] || 'TRUE').toString().toUpperCase().trim();
            
            // Solo agregar productos activos con nombre
            if (nombre && activo === 'TRUE') {
                if (!PRODUCTS[categoria]) PRODUCTS[categoria] = [];
                PRODUCTS[categoria].push({
                    id: id,
                    name: nombre,
                    price: precio,
                    hasSide: tieneAcomp,
                    category: categoria
                });
            }
        });
    } catch (e) {
        console.error('Error productos:', e);
    }
}

/**
 * Carga los acompañamientos desde la hoja "Acompañamientos"
 * Estructura: ID_Acompañamiento | Nombre | Orden | Activo
 */
async function loadSidesFromSheet() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.ACOMPAÑAMIENTOS + '!A2:D50'
        });
        
        const rows = response.result.values || [];
        SIDE_OPTIONS = [];
        
        rows.forEach((row, index) => {
            const id = parseInt(row[0]) || (index + 1);
            const nombre = (row[1] || '').toString().trim();
            const orden = parseInt(row[2]) || (index + 1);
            const activo = (row[3] || 'TRUE').toString().toUpperCase().trim();
            
            if (nombre && activo === 'TRUE') {
                SIDE_OPTIONS.push({ id, name: nombre, order: orden });
            }
        });
        
        // Ordenar por el campo "orden"
        SIDE_OPTIONS.sort((a, b) => a.order - b.order);
        
        // Valores por defecto si no hay acompañamientos
        if (SIDE_OPTIONS.length === 0) {
            SIDE_OPTIONS = [
                { id: 1, name: 'Arroz Blanco', order: 1 },
                { id: 2, name: 'Fideo', order: 2 },
                { id: 3, name: 'Ensalada', order: 3 }
            ];
        }
    } catch (e) {
        console.error('Error acompañamientos:', e);
    }
}

/**
 * Carga las ventas desde las hojas "Ventas" y "Detalle_Ventas"
 * IMPORTANTE: Las estadísticas se basan en ID_Venta, no en fechas
 * Estructura Ventas: ID_Venta | Fecha | Hora | Total | Pago_Recibido | Cambio | Usuario | Timestamp
 * Estructura Detalle: ID_Detalle | ID_Venta | ID_Producto | Nombre_Producto | ... | Subtotal | ID_Categoria
 */
async function loadSalesFromSheet() {
    try {
        // Cargar encabezados de ventas
        const ventasResponse = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.VENTAS + '!A2:H50000'
        });

        // Cargar detalles de ventas
        const detalleResponse = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.DETALLE_VENTAS + '!A2:J100000'
        });

        const ventasRows = ventasResponse.result.values || [];
        const detalleRows = detalleResponse.result.values || [];

        console.log('📋 Ventas encontradas:', ventasRows.length);
        console.log('📋 Detalles encontrados:', detalleRows.length);

        // Crear un mapa de detalles agrupados por ID_Venta
        const detallesPorVenta = {};
        detalleRows.forEach(row => {
            const idVenta = parseInt(row[1]) || 0;
            if (idVenta > 0) {
                if (!detallesPorVenta[idVenta]) detallesPorVenta[idVenta] = [];
                detallesPorVenta[idVenta].push({
                    id: parseInt(row[2]) || 0,
                    name: row[3] || 'Producto',
                    sideId: row[4] ? parseInt(row[4]) : null,
                    side: row[5] || null,
                    quantity: parseInt(row[6]) || 1,
                    price: parseFloat(row[7]) || 0,
                    category: (row[9] || 'otros').toLowerCase()
                });
            }
        });

        // Construir el historial de ventas basándose en ID_Venta
        salesHistory = [];
        
        ventasRows.forEach(row => {
            const idVenta = parseInt(row[0]) || 0;
            if (idVenta <= 0) return; // Saltar filas sin ID válido
            
            const fechaStr = row[1] || '';
            const horaStr = row[2] || '';
            const total = parseFloat(row[3]) || 0;
            const received = parseFloat(row[4]) || 0;
            const change = parseFloat(row[5]) || 0;
            
            // Obtener los items de esta venta
            const items = detallesPorVenta[idVenta] || [];
            
            // Si no hay items en detalle, crear uno genérico
            if (items.length === 0 && total > 0) {
                items.push({
                    id: 0,
                    name: 'Venta #' + idVenta,
                    quantity: 1,
                    price: total,
                    category: 'otros'
                });
            }

            // Agregar al historial usando ID_Venta como identificador principal
            salesHistory.push({
                orderNumber: idVenta,  // ID_Venta es el identificador principal
                date: fechaStr,
                time: horaStr,
                total: total,
                received: received,
                change: change,
                items: items
            });
        });

        // Actualizar el número de orden para el próximo pedido
        if (salesHistory.length > 0) {
            orderNumber = Math.max(...salesHistory.map(s => s.orderNumber)) + 1;
        }
        
        // Actualizar el último ID de detalle
        if (detalleRows.length > 0) {
            lastDetailId = Math.max(...detalleRows.map(r => parseInt(r[0]) || 0));
        }

        updateOrderNumber();
        saveState();
        
        console.log('✅ Ventas procesadas:', salesHistory.length);
        
    } catch (e) {
        console.error('Error cargando ventas:', e);
        salesHistory = [];
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 8: SINCRONIZACIÓN Y CONFIGURACIÓN                ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para sincronizar datos y configurar las hojas de Google Sheets  ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Sincroniza todos los datos desde Google Sheets
 * Se llama cuando el usuario presiona el botón "Sincronizar Datos"
 */
async function syncFromGoogleSheets() {
    if (!usuarioGoogle) {
        showToast('Conecta Google primero', 'warning');
        return;
    }

    try {
        showLoading('Sincronizando...');
        
        // Recargar todos los datos
        await loadCategoriesFromSheet();
        await loadProductsFromSheet();
        await loadSidesFromSheet();
        await loadSalesFromSheet();
        
        // Verificar que la categoría actual siga existiendo
        const categoryKeys = Object.keys(CATEGORIES);
        if (categoryKeys.length > 0 && !CATEGORIES[currentCategory]) {
            currentCategory = categoryKeys[0];
        }
        
        // Actualizar la interfaz
        renderCategories();
        renderProducts(currentCategory);
        updateStats();
        
        hideLoading();
        showToast('✅ Sincronizado: ' + salesHistory.length + ' ventas', 'success');
    } catch (error) {
        hideLoading();
        showToast('Error: ' + error.message, 'error');
    }
}

/**
 * Configura las hojas de Google Sheets con los encabezados correctos
 * Crea las hojas que no existan y agrega los encabezados
 */
async function setupGoogleSheet() {
    if (!usuarioGoogle) {
        showToast('Conecta Google primero', 'warning');
        return;
    }

    try {
        showLoading('Configurando...');
        
        // Obtener las hojas existentes
        const sheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        const hojasExistentes = sheet.result.sheets.map(s => s.properties.title);
        
        // Crear las hojas que falten
        for (const nombreHoja of Object.values(SHEETS)) {
            if (!hojasExistentes.includes(nombreHoja)) {
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: SPREADSHEET_ID,
                    resource: { requests: [{ addSheet: { properties: { title: nombreHoja } } }] }
                });
            }
        }

        // Definir los encabezados para cada hoja
        const headers = {
            [SHEETS.CATEGORIAS]: ['ID_Categoria', 'Nombre', 'Icono', 'Orden', 'Activo'],
            [SHEETS.PRODUCTOS]: ['ID_Producto', 'Nombre', 'Precio', 'ID_Categoria', 'Tiene_Acompañamiento', 'Activo'],
            [SHEETS.ACOMPAÑAMIENTOS]: ['ID_Acompañamiento', 'Nombre', 'Orden', 'Activo'],
            [SHEETS.VENTAS]: ['ID_Venta', 'Fecha', 'Hora', 'Total', 'Pago_Recibido', 'Cambio', 'Usuario', 'Timestamp'],
            [SHEETS.DETALLE_VENTAS]: ['ID_Detalle', 'ID_Venta', 'ID_Producto', 'Nombre_Producto', 'ID_Acompañamiento', 'Nombre_Acompañamiento', 'Cantidad', 'Precio_Unitario', 'Subtotal', 'ID_Categoria']
        };

        // Escribir los encabezados en cada hoja
        for (const [hoja, cols] of Object.entries(headers)) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: hoja + '!A1:' + String.fromCharCode(64 + cols.length) + '1',
                valueInputOption: 'RAW',
                resource: { values: [cols] }
            });
        }

        hideLoading();
        showToast('¡Configurado!', 'success');
    } catch (e) {
        hideLoading();
        showToast('Error: ' + e.message, 'error');
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 9: GUARDAR VENTAS EN GOOGLE SHEETS               ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Función para guardar una nueva venta en las hojas Ventas y Detalle_Ventas ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Guarda una venta completada en Google Sheets
 * Inserta una fila en "Ventas" y múltiples filas en "Detalle_Ventas"
 * @param {Object} sale - Objeto con los datos de la venta
 * @returns {boolean} - true si se guardó correctamente
 */
async function saveToGoogleSheets(sale) {
    if (!usuarioGoogle) return false;

    try {
        // 1. Guardar el encabezado de la venta
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEETS.VENTAS + '!A:H',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [[
                    sale.orderNumber,           // ID_Venta
                    sale.date,                  // Fecha
                    sale.time,                  // Hora
                    sale.total.toFixed(2),      // Total
                    sale.received.toFixed(2),   // Pago_Recibido
                    sale.change.toFixed(2),     // Cambio
                    emailUsuario || 'sistema',  // Usuario
                    new Date().toISOString()    // Timestamp
                ]]
            }
        });

        // 2. Guardar el detalle de cada producto
        const detalleRows = sale.items.map(item => {
            lastDetailId++;
            return [
                lastDetailId,                              // ID_Detalle
                sale.orderNumber,                          // ID_Venta
                item.id,                                   // ID_Producto
                item.name,                                 // Nombre_Producto
                item.sideId || '',                         // ID_Acompañamiento
                item.side || '',                           // Nombre_Acompañamiento
                item.quantity,                             // Cantidad
                item.price.toFixed(2),                     // Precio_Unitario
                (item.price * item.quantity).toFixed(2),   // Subtotal
                item.category                              // ID_Categoria
            ];
        });

        if (detalleRows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: SHEETS.DETALLE_VENTAS + '!A:J',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: detalleRows }
            });
        }

        return true;
    } catch (error) {
        console.error('Error guardando:', error);
        return false;
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 10: ACTUALIZACIÓN DE INTERFAZ                    ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para actualizar elementos visuales de la interfaz               ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Actualiza el indicador de estado de conexión con Google
 * @param {boolean} ok - true si está conectado
 */
function updateGoogleStatus(ok) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const btnText = document.getElementById('btnGoogleText');
    const btn = document.getElementById('btnGoogle');

    if (dot) dot.classList.toggle('connected', ok);
    if (text) text.textContent = ok ? 'Conectado' : 'Desconectado';
    if (btnText) btnText.textContent = ok ? 'Desconectar' : 'Conectar';
    if (btn) btn.classList.toggle('connected', ok);
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 11: NAVEGACIÓN ENTRE SECCIONES                   ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Función para cambiar entre la vista de Ventas y Estadísticas              ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Cambia la sección visible (Ventas o Estadísticas)
 * @param {string} section - 'pos' para ventas, 'stats' para estadísticas
 */
function showSection(section) {
    // Remover clase active de todos los tabs y secciones
    document.getElementById('tabPOS').classList.remove('active');
    document.getElementById('tabStats').classList.remove('active');
    document.getElementById('posSection').classList.remove('active');
    document.getElementById('statsSection').classList.remove('active');

    if (section === 'pos') {
        // Mostrar sección de ventas
        document.getElementById('tabPOS').classList.add('active');
        document.getElementById('posSection').classList.add('active');
    } else {
        // Mostrar sección de estadísticas
        document.getElementById('tabStats').classList.add('active');
        document.getElementById('statsSection').classList.add('active');
        updateStats(); // Actualizar estadísticas al entrar
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 12: RENDERIZADO DE CATEGORÍAS Y PRODUCTOS        ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para mostrar las categorías y productos en la interfaz          ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Renderiza los botones de categorías en la navegación
 */
function renderCategories() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;

    const keys = Object.keys(CATEGORIES);
    if (keys.length === 0) {
        nav.innerHTML = '<div class="connect-message">No hay categorías</div>';
        return;
    }

    // Ordenar categorías por el campo "order"
    const sorted = keys.sort((a, b) => (CATEGORIES[a].order || 99) - (CATEGORIES[b].order || 99));

    let html = '';
    sorted.forEach(key => {
        const cat = CATEGORIES[key];
        const isActive = key === currentCategory ? 'active' : '';
        html += `<button class="category-btn ${isActive}" onclick="changeCategory('${key}')">
            <span class="category-icon">${cat.icon}</span>
            <span class="category-text">${cat.name}</span>
        </button>`;
    });
    
    nav.innerHTML = html;
}

/**
 * Cambia la categoría activa y muestra sus productos
 * @param {string} category - ID de la categoría
 */
function changeCategory(category) {
    currentCategory = category;
    renderCategories();
    renderProducts(category);
}

/**
 * Renderiza las tarjetas de productos de una categoría
 * @param {string} category - ID de la categoría
 */
function renderProducts(category) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const items = PRODUCTS[category] || [];
    
    if (items.length === 0) {
        grid.innerHTML = '<div class="empty-products"><div class="empty-icon">📦</div><p>No hay productos</p></div>';
        return;
    }

    let html = '';
    items.forEach(product => {
        html += `<div class="product-card" onclick="handleProductClick(${product.id})">
            <div class="product-name">${product.name}</div>
            <div class="product-price">Bs. ${product.price.toFixed(2)}</div>
        </div>`;
    });

    grid.innerHTML = html;
}

/**
 * Maneja el click en un producto
 * Si tiene acompañamiento, muestra el modal de selección
 * Si no, lo agrega directamente al carrito
 */
function handleProductClick(productId) {
    let product = null;
    
    // Buscar el producto en todas las categorías
    for (const cat in PRODUCTS) {
        product = PRODUCTS[cat].find(p => p.id === productId);
        if (product) break;
    }
    
    if (!product) return;

    if (product.hasSide && SIDE_OPTIONS.length > 0) {
        showSideModal(product);
    } else {
        addToCart(product, null, null);
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 13: MODAL DE ACOMPAÑAMIENTO                      ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para mostrar y manejar el modal de selección de acompañamiento  ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Muestra el modal para seleccionar acompañamiento
 * @param {Object} product - El producto que requiere acompañamiento
 */
function showSideModal(product) {
    pendingProduct = product;
    document.getElementById('sideModalProduct').textContent = product.name + ' - Bs. ' + product.price.toFixed(2);

    let html = '';
    SIDE_OPTIONS.forEach(side => {
        html += `<div class="side-option" onclick="selectSide(${side.id}, '${side.name.replace(/'/g, "\\'")}')">${side.name}</div>`;
    });
    document.getElementById('sideOptions').innerHTML = html;
    document.getElementById('sideModal').classList.add('active');
}

/**
 * Cierra el modal de acompañamiento
 */
function closeSideModal() {
    document.getElementById('sideModal').classList.remove('active');
    pendingProduct = null;
}

/**
 * Callback cuando se selecciona un acompañamiento
 * Agrega el producto pendiente al carrito con el acompañamiento seleccionado
 */
function selectSide(sideId, sideName) {
    if (pendingProduct) {
        addToCart(pendingProduct, sideId, sideName);
        closeSideModal();
    }
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 14: GESTIÓN DEL CARRITO                          ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para agregar, modificar y eliminar productos del carrito        ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Agrega un producto al carrito
 * Si el producto ya existe (mismo producto + mismo acompañamiento), incrementa la cantidad
 * @param {Object} product - El producto a agregar
 * @param {number} sideId - ID del acompañamiento (null si no tiene)
 * @param {string} sideName - Nombre del acompañamiento (null si no tiene)
 */
function addToCart(product, sideId, sideName) {
    // Crear un ID único para el item (producto + acompañamiento)
    const cartItemId = sideName ? product.id + '-' + sideId : product.id.toString();
    
    // Buscar si ya existe en el carrito
    const existing = cart.find(item => item.cartItemId === cartItemId);

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({
            cartItemId,
            id: product.id,
            name: product.name,
            price: product.price,
            sideId,
            side: sideName,
            quantity: 1,
            category: product.category
        });
    }

    updateCart();
    showToast(product.name + ' agregado', 'success');
}

/**
 * Modifica la cantidad de un item en el carrito
 * @param {string} cartItemId - ID único del item
 * @param {number} change - Cambio en la cantidad (+1 o -1)
 */
function updateQuantity(cartItemId, change) {
    const item = cart.find(i => i.cartItemId === cartItemId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(cartItemId);
        } else {
            updateCart();
        }
    }
}

/**
 * Elimina un item del carrito
 * @param {string} cartItemId - ID único del item a eliminar
 */
function removeFromCart(cartItemId) {
    cart = cart.filter(item => item.cartItemId !== cartItemId);
    updateCart();
}

/**
 * Limpia todo el carrito (previa confirmación)
 */
function clearCart() {
    if (cart.length > 0 && confirm('¿Limpiar el carrito?')) {
        cart = [];
        updateCart();
    }
}

/**
 * Actualiza la visualización del carrito en la interfaz
 */
function updateCart() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    const total = calculateTotal();

    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart"><div class="empty-icon">🍽️</div><p>Agrega productos</p></div>';
        document.getElementById('btnPay').disabled = true;
    } else {
        let html = '';
        cart.forEach(item => {
            html += `<div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    ${item.side ? `<div class="cart-item-side">+ ${item.side}</div>` : ''}
                    <div class="cart-item-price">Bs. ${item.price.toFixed(2)} c/u</div>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateQuantity('${item.cartItemId}', -1)">−</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity('${item.cartItemId}', 1)">+</button>
                    <button class="btn-remove" onclick="removeFromCart('${item.cartItemId}')">✕</button>
                </div>
            </div>`;
        });
        container.innerHTML = html;
        document.getElementById('btnPay').disabled = false;
    }

    // Actualizar totales mostrados
    document.getElementById('subtotal').textContent = 'Bs. ' + total.toFixed(2);
    document.getElementById('total').textContent = 'Bs. ' + total.toFixed(2);
}

/**
 * Calcula el total del carrito
 * @returns {number} - Suma de (precio * cantidad) de todos los items
 */
function calculateTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 15: PROCESAMIENTO DE PAGOS                       ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para manejar el modal de pago y procesar la transacción         ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Muestra el modal de pago
 */
function showPaymentModal() {
    if (cart.length === 0) return;

    const total = calculateTotal();
    document.getElementById('paymentTotal').textContent = 'Bs. ' + total.toFixed(2);
    document.getElementById('amountReceived').value = '';
    document.getElementById('changeAmount').textContent = 'Bs. 0.00';
    document.getElementById('changeDisplay').classList.remove('insufficient');
    document.getElementById('btnConfirmPay').disabled = true;
    document.getElementById('paymentModal').classList.add('active');

    // Enfocar el campo de monto recibido
    setTimeout(() => document.getElementById('amountReceived').focus(), 100);
}

/**
 * Cierra el modal de pago
 */
function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
}

/**
 * Establece un monto rápido predefinido
 * @param {number|string} amount - Monto a establecer o 'exact' para el monto exacto
 */
function setQuickAmount(amount) {
    const total = calculateTotal();
    document.getElementById('amountReceived').value = amount === 'exact' ? total.toFixed(2) : amount;
    calculateChange();
}

/**
 * Calcula y muestra el cambio a devolver
 */
function calculateChange() {
    const total = calculateTotal();
    const received = parseFloat(document.getElementById('amountReceived').value) || 0;
    const change = received - total;

    const changeDisplay = document.getElementById('changeDisplay');
    const changeAmount = document.getElementById('changeAmount');
    const btnConfirm = document.getElementById('btnConfirmPay');

    if (received < total) {
        // Monto insuficiente
        changeDisplay.classList.add('insufficient');
        changeAmount.textContent = 'Falta: Bs. ' + Math.abs(change).toFixed(2);
        btnConfirm.disabled = true;
    } else {
        // Monto suficiente
        changeDisplay.classList.remove('insufficient');
        changeAmount.textContent = 'Bs. ' + change.toFixed(2);
        btnConfirm.disabled = false;
    }

    paymentInfo = { received, change };
}

/**
 * Confirma el pago y procesa la venta
 * Guarda en Google Sheets y muestra el modal de éxito
 */
async function confirmPayment() {
    closePaymentModal();

    const total = calculateTotal();
    const now = new Date();

    // Crear objeto de venta
    const sale = {
        orderNumber: orderNumber,
        items: cart.slice(),
        total: total,
        received: paymentInfo.received,
        change: paymentInfo.change,
        date: now.toLocaleDateString('es-BO'),
        time: now.toLocaleTimeString('es-BO'),
        timestamp: now.toISOString()  // Para control de turnos
    };

    // Guardar en historial local
    salesHistory.push(sale);
    saveState();
    
    // Preparar ticket para impresión
    prepareTicket(sale);

    // Mostrar información en modal de éxito
    document.getElementById('successTotal').textContent = 'Bs. ' + total.toFixed(2);
    document.getElementById('successReceived').textContent = 'Bs. ' + paymentInfo.received.toFixed(2);
    document.getElementById('successChange').textContent = 'Bs. ' + paymentInfo.change.toFixed(2);

    const syncStatus = document.getElementById('syncStatus');
    
    // Guardar en Google Sheets si está conectado
    if (usuarioGoogle) {
        syncStatus.innerHTML = '⏳ Guardando...';
        const saved = await saveToGoogleSheets(sale);
        syncStatus.innerHTML = saved ? '✅ Guardado en la nube' : '⚠️ Error en nube';
        syncStatus.style.color = saved ? '#00c853' : '#ff9100';
    } else {
        syncStatus.innerHTML = '💾 Guardado local';
        syncStatus.style.color = '#64748b';
    }

    document.getElementById('successModal').classList.add('active');

    // Incrementar número de orden
    orderNumber++;
    updateOrderNumber();
    saveState();
    updateStats();
    updateLastSaleInfo();  // Actualizar panel de última venta
}

/**
 * Prepara el ticket para impresión con los datos de la venta
 * @param {Object} sale - Datos de la venta
 */
function prepareTicket(sale) {
    document.getElementById('ticketDate').textContent = 'Fecha: ' + sale.date;
    document.getElementById('ticketTime').textContent = 'Hora: ' + sale.time;
    document.getElementById('ticketNumber').textContent = '#' + sale.orderNumber.toString().padStart(4, '0');

    let html = '';
    sale.items.forEach(item => {
        html += `<div class="ticket-item">
            <div class="ticket-item-row">
                <span>${item.quantity}x ${item.name}</span>
                <span>Bs. ${(item.price * item.quantity).toFixed(2)}</span>
            </div>
            ${item.side ? `<div class="ticket-item-side">+ ${item.side}</div>` : ''}
        </div>`;
    });
    document.getElementById('ticketItems').innerHTML = html;

    document.getElementById('ticketTotal').textContent = 'Bs. ' + sale.total.toFixed(2);
    document.getElementById('ticketReceived').textContent = 'Bs. ' + sale.received.toFixed(2);
    document.getElementById('ticketChange').textContent = 'Bs. ' + sale.change.toFixed(2);
}

/**
 * Envía el ticket a la impresora
 */
function printTicket() { 
    window.print(); 
}

/**
 * Cierra el modal de éxito y reinicia el carrito para una nueva venta
 */
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('active');
    cart = [];
    paymentInfo = { received: 0, change: 0 };
    updateCart();
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 16: ESTADÍSTICAS - CÁLCULOS                       ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para calcular estadísticas                                       ║
// ║  IMPORTANTE: Las estadísticas se basan en ID_Venta                          ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Limpia todas las estadísticas (cuando no hay datos)
 */
function clearStats() {
    document.getElementById('kpiSales').textContent = 'Bs. 0.00';
    document.getElementById('kpiOrders').textContent = '0';
    document.getElementById('kpiAvg').textContent = 'Bs. 0.00';
    document.getElementById('kpiProducts').textContent = '0';
    
    if (salesChart) { salesChart.destroy(); salesChart = null; }
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    
    document.getElementById('topProductsBody').innerHTML = '<tr><td colspan="5" class="no-data">📊 No hay datos</td></tr>';
    document.getElementById('salesHistoryBody').innerHTML = '<tr><td colspan="7" class="no-data">🧾 No hay ventas</td></tr>';
}

/**
 * FUNCIÓN PRINCIPAL DE ESTADÍSTICAS
 * Calcula todos los KPIs y actualiza gráficos y tablas
 * Basado en ID_Venta para evitar errores con fechas
 */
function updateStats() {
    console.log('📊 Actualizando estadísticas...');
    console.log('📋 Total en historial:', salesHistory.length);
    
    if (salesHistory.length === 0) {
        clearStats();
        return;
    }

    // Obtener ventas (todas, basadas en ID_Venta)
    const filtered = getFilteredSales();
    console.log('📋 Ventas a procesar:', filtered.length);

    // ══════════════════════════════════════════════════════════════════════════
    // CÁLCULO DE KPIs (Indicadores Clave de Rendimiento)
    // ══════════════════════════════════════════════════════════════════════════
    
    let totalSales = 0;    // Suma de todos los totales de venta
    let totalItems = 0;    // Cantidad total de productos vendidos

    filtered.forEach(sale => {
        // Sumar el total de cada venta
        totalSales += sale.total || 0;
        
        // Contar los items vendidos
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                totalItems += item.quantity || 1;
            });
        }
    });

    const totalOrders = filtered.length;  // Número de pedidos
    const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;  // Ticket promedio

    // ══════════════════════════════════════════════════════════════════════════
    // MOSTRAR KPIs EN LA INTERFAZ
    // ══════════════════════════════════════════════════════════════════════════
    
    document.getElementById('kpiSales').textContent = 'Bs. ' + totalSales.toFixed(2);
    document.getElementById('kpiOrders').textContent = totalOrders;
    document.getElementById('kpiAvg').textContent = 'Bs. ' + avgTicket.toFixed(2);
    document.getElementById('kpiProducts').textContent = totalItems;

    console.log('💰 Total:', totalSales.toFixed(2), '| Pedidos:', totalOrders);

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUIR GRÁFICAS Y TABLAS
    // ══════════════════════════════════════════════════════════════════════════
    
    buildSalesChart(filtered);
    buildCategoryChart(filtered);
    buildTopProducts(filtered);
    buildSalesHistory(filtered);
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 17: GRÁFICAS DE ESTADÍSTICAS                     ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para crear y actualizar los gráficos con Chart.js               ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Construye el gráfico de barras de ventas por ID_Venta
 * Muestra las últimas 20 ventas para visualizar tendencia
 * @param {Array} filteredSales - Array de ventas a graficar
 */
function buildSalesChart(filteredSales) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;

    // IMPORTANTE: Destruir gráfica anterior para evitar superposición
    if (salesChart) {
        salesChart.destroy();
        salesChart = null;
    }

    // Ordenar ventas por ID_Venta y tomar las últimas 20
    const sortedSales = [...filteredSales]
        .sort((a, b) => a.orderNumber - b.orderNumber)
        .slice(-20);

    // Preparar datos para la gráfica
    const labels = sortedSales.map(s => '#' + s.orderNumber);
    const data = sortedSales.map(s => s.total || 0);

    // Crear nueva gráfica
    salesChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['Sin datos'],
            datasets: [{
                label: 'Total Venta (Bs.)',
                data: data.length > 0 ? data : [0],
                backgroundColor: 'rgba(255, 111, 0, 0.8)',
                borderColor: 'rgba(255, 111, 0, 1)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => 'Bs. ' + ctx.raw.toFixed(2)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: value => 'Bs. ' + value }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

/**
 * Construye el gráfico de dona de ventas por categoría
 * @param {Array} filteredSales - Array de ventas a graficar
 */
function buildCategoryChart(filteredSales) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    // IMPORTANTE: Destruir gráfica anterior
    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    // Agrupar ventas por categoría
    const byCategory = {};
    
    // Inicializar con categorías existentes
    Object.keys(CATEGORIES).forEach(cat => {
        byCategory[cat] = 0;
    });

    // Sumar ventas de cada categoría
    filteredSales.forEach(sale => {
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                const cat = (item.category || 'otros').toLowerCase();
                if (!byCategory[cat]) byCategory[cat] = 0;
                byCategory[cat] += (item.price || 0) * (item.quantity || 1);
            });
        }
    });

    // Preparar datos para la gráfica
    const labels = [];
    const data = [];
    const colors = ['#ff6f00', '#ffc107', '#00c853', '#2979ff', '#9c27b0', '#e91e63', '#00bcd4'];

    Object.keys(byCategory).forEach((cat, index) => {
        const catInfo = CATEGORIES[cat];
        labels.push(catInfo ? catInfo.icon + ' ' + catInfo.name : cat);
        data.push(byCategory[cat]);
    });

    // Crear nueva gráfica
    categoryChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['Sin datos'],
            datasets: [{
                data: data.length > 0 ? data : [1],
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.label + ': Bs. ' + ctx.raw.toFixed(2)
                    }
                }
            }
        }
    });
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 18: TABLAS DE ESTADÍSTICAS                       ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para construir las tablas de productos más vendidos e historial ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Construye la tabla de productos más vendidos
 * Ordena por cantidad vendida de mayor a menor
 * @param {Array} filteredSales - Array de ventas a analizar
 */
function buildTopProducts(filteredSales) {
    const tbody = document.getElementById('topProductsBody');
    if (!tbody) return;

    // Agrupar productos y sumar cantidades
    const products = {};

    filteredSales.forEach(sale => {
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                const key = item.name || 'Producto';
                if (!products[key]) {
                    products[key] = {
                        name: key,
                        category: item.category || 'otros',
                        quantity: 0,
                        revenue: 0
                    };
                }
                products[key].quantity += item.quantity || 1;
                products[key].revenue += (item.price || 0) * (item.quantity || 1);
            });
        }
    });

    // Ordenar por cantidad (de mayor a menor) y tomar top 10
    const sorted = Object.values(products)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">📊 No hay datos disponibles</td></tr>';
        return;
    }

    // Construir HTML de la tabla
    let html = '';
    sorted.forEach((product, index) => {
        const cat = CATEGORIES[product.category];
        const catDisplay = cat ? cat.icon + ' ' + cat.name : product.category;
        
        // Clases para destacar los primeros 3 lugares
        const rankClass = index < 3 ? 'rank-' + (index + 1) : 'rank-default';

        html += `<tr>
            <td><span class="rank-badge ${rankClass}">${index + 1}</span></td>
            <td><strong>${product.name}</strong></td>
            <td>${catDisplay}</td>
            <td><strong>${product.quantity}</strong></td>
            <td><strong>Bs. ${product.revenue.toFixed(2)}</strong></td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

/**
 * Construye la tabla de historial de ventas
 * Ordena por ID_Venta de más reciente a más antigua
 * @param {Array} filteredSales - Array de ventas a mostrar
 */
function buildSalesHistory(filteredSales) {
    const tbody = document.getElementById('salesHistoryBody');
    if (!tbody) return;

    if (filteredSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">🧾 No hay ventas registradas</td></tr>';
        return;
    }

    // Ordenar por ID_Venta descendente (más recientes primero)
    const sorted = [...filteredSales].sort((a, b) => b.orderNumber - a.orderNumber);

    let html = '';
    const limit = Math.min(sorted.length, 50); // Máximo 50 registros

    for (let i = 0; i < limit; i++) {
        const sale = sorted[i];
        
        // Contar items en la venta
        let itemCount = 0;
        if (sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                itemCount += item.quantity || 1;
            });
        }

        html += `<tr>
            <td><strong>#${(sale.orderNumber || 0).toString().padStart(4, '0')}</strong></td>
            <td>${sale.date || '-'}</td>
            <td>${sale.time || '-'}</td>
            <td>${itemCount} items</td>
            <td><strong>Bs. ${(sale.total || 0).toFixed(2)}</strong></td>
            <td>Bs. ${(sale.received || 0).toFixed(2)}</td>
            <td>Bs. ${(sale.change || 0).toFixed(2)}</td>
        </tr>`;
    }

    tbody.innerHTML = html;
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 19: EXPORTACIÓN DE DATOS                         ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Función para exportar las ventas a un archivo CSV                         ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Exporta las ventas filtradas a un archivo CSV
 * El archivo se descarga automáticamente
 */
function exportToCSV() {
    const filtered = getFilteredSales();

    if (filtered.length === 0) {
        showToast('No hay datos para exportar', 'warning');
        return;
    }

    // Crear encabezados del CSV
    let csv = 'Pedido,Fecha,Hora,Productos,Total,Recibido,Cambio\n';

    // Agregar cada venta como una fila
    filtered.forEach(sale => {
        const items = sale.items ? sale.items.map(i => 
            i.name + (i.side ? ' + ' + i.side : '') + ' x' + i.quantity
        ).join('; ') : '';

        csv += `${sale.orderNumber},${sale.date},${sale.time},"${items}",${sale.total.toFixed(2)},${(sale.received || 0).toFixed(2)},${(sale.change || 0).toFixed(2)}\n`;
    });

    // Crear blob y descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ventas_' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV descargado', 'success');
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 20: FUNCIONES DE UTILIDAD                        ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones auxiliares: notificaciones, loading, fecha/hora, etc.           ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Muestra una notificación toast en el centro de la pantalla
 * Con transparencia del 40% y transición suave
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - 'success', 'error' o 'warning'
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMessage');

    if (!toast || !icon || !text) return;

    // Resetear clases y agregar la nueva
    toast.className = 'toast show';
    
    // Establecer ícono según el tipo
    if (type === 'error') {
        toast.classList.add('error');
        icon.textContent = '❌';
    } else if (type === 'warning') {
        toast.classList.add('warning');
        icon.textContent = '⚠️';
    } else {
        icon.textContent = '✅';
    }

    text.textContent = message;
    
    // Ocultar después de 3 segundos
    setTimeout(() => toast.classList.remove('show'), 1000);
}

/**
 * Muestra el overlay de carga
 * @param {string} text - Texto a mostrar
 */
function showLoading(text = 'Cargando...') {
    const loadingText = document.getElementById('loadingText');
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingText) loadingText.textContent = text;
    if (loadingOverlay) loadingOverlay.classList.add('active');
}

/**
 * Oculta el overlay de carga
 */
function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('active');
}

/**
 * Actualiza la fecha y hora mostrada en el header
 */
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    const el = document.getElementById('datetime');
    if (el) el.textContent = now.toLocaleDateString('es-BO', options);
}

/**
 * Actualiza el número de orden mostrado en el carrito
 */
function updateOrderNumber() {
    const el = document.getElementById('orderNumber');
    if (el) el.textContent = '#' + orderNumber.toString().padStart(4, '0');
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 21: PERSISTENCIA DE DATOS (localStorage)         ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para guardar y cargar datos en el almacenamiento local          ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Carga el estado guardado desde localStorage
 * Se ejecuta al iniciar la aplicación
 */
function loadState() {
    // Cargar número de orden
    const savedOrder = localStorage.getItem('pos_orderNumber');
    if (savedOrder) orderNumber = parseInt(savedOrder);

    // Cargar historial de ventas
    const savedHistory = localStorage.getItem('pos_salesHistory');
    if (savedHistory) {
        try { salesHistory = JSON.parse(savedHistory); }
        catch (e) { salesHistory = []; }
    }

    // Cargar último ID de detalle
    const savedDetailId = localStorage.getItem('pos_lastDetailId');
    if (savedDetailId) lastDetailId = parseInt(savedDetailId);
}

/**
 * Guarda el estado actual en localStorage
 * Se ejecuta después de cada venta
 */
function saveState() {
    localStorage.setItem('pos_orderNumber', orderNumber);
    localStorage.setItem('pos_salesHistory', JSON.stringify(salesHistory));
    localStorage.setItem('pos_lastDetailId', lastDetailId);
}


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 22: INICIALIZACIÓN                               ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Código que se ejecuta cuando la página termina de cargar                  ║
// ╚════════════════════════════════════════════════════════════════════════════╝

document.addEventListener('DOMContentLoaded', function() {
    console.log('🍗 Iniciando Sistema POS v2.3...');
    
    // Cargar estado guardado
    loadState();
    
    // Inicializar interfaz
    updateCart();
    updateOrderNumber();
    initShiftTime();
    updateDateTime();
    updateLastSaleInfo();
    
    // Actualizar reloj cada segundo
    setInterval(updateDateTime, 1000);
    
    // Mostrar estadísticas si hay datos locales
    if (salesHistory.length > 0) {
        updateStats();
    }

    console.log('✅ Sistema listo');
    console.log('📋 Ventas en localStorage:', salesHistory.length);
});


// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    SECCIÓN 23: PANEL DE RESUMEN DEL TURNO                   ║
// ╠════════════════════════════════════════════════════════════════════════════╣
// ║  Funciones para el nuevo panel de resumen que reemplaza los filtros         ║
// ╚════════════════════════════════════════════════════════════════════════════╝

/**
 * Inicializa la hora de inicio del turno
 * Si no hay una guardada, usa la hora actual
 */
function initShiftTime() {
    let shiftStart = localStorage.getItem('pos_shiftStart');
    
    if (!shiftStart) {
        shiftStart = new Date().toISOString();
        localStorage.setItem('pos_shiftStart', shiftStart);
    }
    
    const shiftDate = new Date(shiftStart);
    const timeStr = shiftDate.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    
    const shiftEl = document.getElementById('shiftStartTime');
    if (shiftEl) shiftEl.textContent = timeStr;
}

/**
 * Actualiza la información de la última venta en el panel
 */
function updateLastSaleInfo() {
    const lastSaleNumber = document.getElementById('lastSaleNumber');
    const lastSaleTotal = document.getElementById('lastSaleTotal');
    const lastSaleTime = document.getElementById('lastSaleTime');
    const lastSaleItems = document.getElementById('lastSaleItems');
    
    if (salesHistory.length === 0) {
        if (lastSaleNumber) lastSaleNumber.textContent = '---';
        if (lastSaleTotal) lastSaleTotal.textContent = 'Bs. 0.00';
        if (lastSaleTime) lastSaleTime.textContent = '--:--';
        if (lastSaleItems) lastSaleItems.textContent = '0';
        return;
    }
    
    // Obtener la última venta
    const lastSale = salesHistory[salesHistory.length - 1];
    
    if (lastSaleNumber) lastSaleNumber.textContent = '#' + (lastSale.orderNumber || '---').toString().padStart(4, '0');
    if (lastSaleTotal) lastSaleTotal.textContent = 'Bs. ' + (lastSale.total || 0).toFixed(2);
    if (lastSaleTime) lastSaleTime.textContent = lastSale.time || '--:--';
    
    // Contar items
    let itemCount = 0;
    if (lastSale.items && lastSale.items.length > 0) {
        lastSale.items.forEach(item => {
            itemCount += item.quantity || 1;
        });
    }
    if (lastSaleItems) lastSaleItems.textContent = itemCount;
}

/**
 * Genera un reporte resumido del día actual
 * Muestra un toast con el resumen
 */
function generateDailyReport() {
    const today = new Date().toLocaleDateString('es-BO');
    
    // Filtrar ventas de hoy
    const todaySales = salesHistory.filter(sale => sale.date === today);
    
    if (todaySales.length === 0) {
        showToast('No hay ventas registradas hoy', 'warning');
        return;
    }
    
    // Calcular totales
    let totalVentas = 0;
    let totalItems = 0;
    
    todaySales.forEach(sale => {
        totalVentas += sale.total || 0;
        if (sale.items) {
            sale.items.forEach(item => {
                totalItems += item.quantity || 1;
            });
        }
    });
    
    const promedio = totalVentas / todaySales.length;
    
    // Crear alerta con el reporte
    const mensaje = `📊 REPORTE DEL DÍA\n\n` +
        `📅 Fecha: ${today}\n` +
        `🧾 Pedidos: ${todaySales.length}\n` +
        `🍗 Productos vendidos: ${totalItems}\n` +
        `💰 Total: Bs. ${totalVentas.toFixed(2)}\n` +
        `📈 Promedio: Bs. ${promedio.toFixed(2)}`;
    
    alert(mensaje);
    showToast('Reporte generado', 'success');
}

/**
 * Muestra los productos más vendidos del turno actual
 */
function showTopSelling() {
    if (salesHistory.length === 0) {
        showToast('No hay ventas para analizar', 'warning');
        return;
    }
    
    // Contar productos vendidos
    const productCount = {};
    
    salesHistory.forEach(sale => {
        if (sale.items) {
            sale.items.forEach(item => {
                const name = item.name || 'Desconocido';
                if (!productCount[name]) {
                    productCount[name] = { quantity: 0, revenue: 0 };
                }
                productCount[name].quantity += item.quantity || 1;
                productCount[name].revenue += (item.price || 0) * (item.quantity || 1);
            });
        }
    });
    
    // Ordenar por cantidad
    const sorted = Object.entries(productCount)
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 5);
    
    if (sorted.length === 0) {
        showToast('No hay productos vendidos', 'warning');
        return;
    }
    
    // Crear mensaje
    let mensaje = '🏆 TOP 5 MÁS VENDIDOS\n\n';
    
    sorted.forEach((item, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▪️';
        mensaje += `${medal} ${item[0]}\n   Cantidad: ${item[1].quantity} | Bs. ${item[1].revenue.toFixed(2)}\n\n`;
    });
    
    alert(mensaje);
    showToast('Top productos mostrado', 'success');
}

/**
 * Confirma y cierra el turno actual
 * Reinicia el contador de hora de inicio
 */
function confirmCloseTurn() {
    const shiftStart = localStorage.getItem('pos_shiftStart');
    const startTime = shiftStart ? new Date(shiftStart).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const endTime = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    
    // Calcular ventas del turno
    const shiftDate = shiftStart ? new Date(shiftStart) : new Date();
    let shiftSales = 0;
    let shiftOrders = 0;
    
    salesHistory.forEach(sale => {
        // Si la venta fue después del inicio del turno
        if (sale.timestamp && new Date(sale.timestamp) >= shiftDate) {
            shiftSales += sale.total || 0;
            shiftOrders++;
        }
    });
    
    const confirmMsg = `🔒 ¿CERRAR TURNO?\n\n` +
        `⏰ Turno: ${startTime} - ${endTime}\n` +
        `🧾 Pedidos del turno: ${shiftOrders}\n` +
        `💰 Ventas del turno: Bs. ${shiftSales.toFixed(2)}\n\n` +
        `¿Confirmar cierre de turno?`;
    
    if (confirm(confirmMsg)) {
        // Reiniciar hora del turno
        const newShiftStart = new Date().toISOString();
        localStorage.setItem('pos_shiftStart', newShiftStart);
        
        // Actualizar display
        initShiftTime();
        
        showToast('Turno cerrado correctamente', 'success');
        
        // Mostrar resumen final
        alert(`✅ TURNO CERRADO\n\n` +
            `📊 Resumen:\n` +
            `• Pedidos: ${shiftOrders}\n` +
            `• Total: Bs. ${shiftSales.toFixed(2)}\n\n` +
            `🆕 Nuevo turno iniciado a las ${new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`);
    }
}

/**
 * Función auxiliar para obtener ventas filtradas
 * Ahora retorna todas las ventas ya que los filtros fueron removidos
 */
function getFilteredSales() {
    return salesHistory;
}
