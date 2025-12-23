// ╔════════════════════════════════════════════════════════════════════════════╗
// ║                    ARCHIVO DE CONFIGURACIÓN - config.js                      ║
// ║                         Sistema POS v2.3                                     ║
// ║                                                                              ║
// ║  Este archivo contiene todas las configuraciones necesarias para conectar   ║
// ║  el sistema con Google Sheets. Aquí se definen:                             ║
// ║  - ID del documento de Google Sheets                                        ║
// ║  - Credenciales de la API de Google                                         ║
// ║  - Nombres de las 5 hojas que componen la base de datos                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

const CONFIG = {
    
    // ══════════════════════════════════════════════════════════════════════════
    // ID DEL DOCUMENTO DE GOOGLE SHEETS
    // ══════════════════════════════════════════════════════════════════════════
    // Este ID se encuentra en la URL de tu Google Sheet:
    // https://docs.google.com/spreadsheets/d/[ESTE_ES_EL_ID]/edit
    // ══════════════════════════════════════════════════════════════════════════
    GOOGLE_SHEET_ID: '1AmFocVwvywXz6LOwggkFscXjEhx_FZvZCVmb-1ihm5I',
    
    // ══════════════════════════════════════════════════════════════════════════
    // CREDENCIALES DE GOOGLE API
    // ══════════════════════════════════════════════════════════════════════════
    // Estas credenciales se obtienen desde la consola de Google Cloud Platform.
    // CLIENT_ID: Identifica la aplicación ante Google
    // API_KEY: Clave para acceder a la API de Google Sheets
    // ══════════════════════════════════════════════════════════════════════════
    CLIENT_ID: '488089624210-ns62tr4g9rqov3k2b85965c4p4fto028.apps.googleusercontent.com',
    API_KEY: 'AIzaSyDsIk-N9hDAzZN7vc9b2rUIhcA7D8ViOFk',
    
    // ══════════════════════════════════════════════════════════════════════════
    // NOMBRES DE LAS 5 HOJAS DE LA BASE DE DATOS
    // ══════════════════════════════════════════════════════════════════════════
    // Estos nombres deben coincidir EXACTAMENTE con los nombres de las hojas
    // en tu documento de Google Sheets (incluyendo mayúsculas/minúsculas)
    //
    // CATEGORIAS:      Almacena las categorías de productos (milanesas, pollos, etc.)
    // PRODUCTOS:       Almacena todos los productos con sus precios
    // ACOMPAÑAMIENTOS: Almacena las guarniciones disponibles (arroz, fideo, etc.)
    // VENTAS:          Almacena el encabezado de cada venta realizada
    // DETALLE_VENTAS:  Almacena el detalle de productos de cada venta
    // ══════════════════════════════════════════════════════════════════════════
    SHEETS: {
        CATEGORIAS: 'Categorias',
        PRODUCTOS: 'Productos', 
        ACOMPAÑAMIENTOS: 'Acompañamientos',
        VENTAS: 'Ventas',
        DETALLE_VENTAS: 'Detalle_Ventas'
    }
};
