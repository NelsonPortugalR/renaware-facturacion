/* Prueba de comportamiento con jsdom.
   Stub de Supabase con datos conocidos: lo que se verifica es la lógica
   derivada (obligaciones, totales, proyección anual), no la red. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/home/claude/node_modules/jsdom");

const NM = "/home/claude/node_modules";
const react = fs.readFileSync(NM + "/react/umd/react.production.min.js", "utf8");
const reactDom = fs.readFileSync(NM + "/react-dom/umd/react-dom.production.min.js", "utf8");

/* ---------------- fixtures ---------------- */
const HOY = new Date().toISOString().slice(0, 10);
const ANIO = +HOY.slice(0, 4);

const personas = [
  // RUC termina en 1 -> grupo "1"
  { id: "p1", nombre: "ANA PRUEBA UNO", codigo_asesor: "1001", ruc: "10296091861",
    cuenta_detraccion: "00401268464", cci: null, banco: "BCP", cuenta_bancaria: "123",
    codigo_division: "wv08", factura_desde: ANIO + "-06-01", regimen: "RMT",
    activo: true, celular: null, correo: null, notas: null },
  // sin RUC: su comisión pendiente debe contar como trabada
  { id: "p2", nombre: "BEA PRUEBA DOS", codigo_asesor: "1002", ruc: null,
    cuenta_detraccion: null, cci: null, banco: null, cuenta_bancaria: null,
    codigo_division: "wv08", factura_desde: null, regimen: "RMT",
    activo: true, celular: null, correo: null, notas: null },
  // inactiva pero facturó: debe seguir apareciendo en Anual
  { id: "p3", nombre: "CARLA PRUEBA TRES", codigo_asesor: "1003", ruc: "10296091869",
    cuenta_detraccion: null, cci: null, banco: null, cuenta_bancaria: null,
    codigo_division: "wv08", factura_desde: null, regimen: "RMT",
    activo: false, celular: null, correo: null, notas: null }
];

function fac(id, pid, nombre, ruc, neto, estado, fecha, sem) {
  const igv = Math.round(neto * 0.18 * 100) / 100;
  const total = Math.round(neto * 1.18 * 100) / 100;
  const detr = total > 700 ? Math.round(total * 0.10 * 100) / 100 : 0;
  return { id, persona_id: pid, asesor: nombre, codigo_asesor: "x", ruc,
    periodo_ind: Math.floor((sem - 1) / 2), semana: ((sem - 1) % 2) + 1,
    etiqueta_semana: String(sem).padStart(2, "0") + "/26",
    serie: null, numero: null, fecha_emision: fecha, descripcion: "d",
    neto, igv, total, detraccion: detr, a_banco: total - detr,
    renta: Math.round(neto * 0.01 * 100) / 100,
    estado, fecha_estimada: true, origen: "fpd" };
}

const facturas = [
  // p1: 1000 neto en junio (detracción aplica: total 1180 > 700)
  fac("f1", "p1", "ANA PRUEBA UNO", "10296091861", 1000, "emitida", ANIO + "-06-12", 24),
  // p1: 500 neto en julio (sin detracción: total 590 < 700)
  fac("f2", "p1", "ANA PRUEBA UNO", "10296091861", 500, "emitida", ANIO + "-07-10", 28),
  // p1: pendiente
  fac("f3", "p1", "ANA PRUEBA UNO", "10296091861", 200, "borrador", ANIO + "-09-04", 36),
  // p2 sin RUC: pendiente trabado
  fac("f4", "p2", "BEA PRUEBA DOS", null, 300, "borrador", ANIO + "-09-04", 36),
  // p3 inactiva pero con factura emitida
  fac("f5", "p3", "CARLA PRUEBA TRES", "10296091869", 800, "emitida", ANIO + "-06-12", 24)
];

// cronograma: grupo "1" vence el 19 del mes siguiente; grupo "9" el 23
const venc = [];
for (let m = 1; m <= 12; m++) {
  ["0","1","2-3","4-5","6-7","8-9"].forEach((g, i) => {
    const sig = m === 12 ? { a: ANIO + 1, m: 1 } : { a: ANIO, m: m + 1 };
    venc.push({ anio: ANIO, mes: m, grupo: g,
      vence: sig.a + "-" + String(sig.m).padStart(2, "0") + "-" +
             String(16 + i).padStart(2, "0") });
  });
}

const TABLAS = {
  eq_personas: personas,
  fact_facturas: facturas,
  fact_declaraciones: [],
  fact_vencimientos: venc,
  fact_gastos_anuales: [],
  fact_config: { id: "vigente", igv: 0.18, detraccion: 0.10,
    detraccion_umbral: 700, renta: 0.01, uit: 5500 }
};

/* ---------------- stub de supabase ---------------- */
function stubSupabase() {
  function consulta(tabla) {
    const api = {};
    const res = () => Promise.resolve({
      data: tabla === "fact_config" ? TABLAS[tabla] : TABLAS[tabla], error: null });
    ["select","order","eq","in","update","upsert"].forEach(m => {
      api[m] = () => api;
    });
    api.maybeSingle = res;
    api.then = (f, r) => res().then(f, r);
    return api;
  }
  return {
    createClient: () => ({
      auth: {
        getSession: () => Promise.resolve({
          data: { session: { user: { id: "u1", email: "prueba@equipo.pe" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
        signInWithPassword: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({})
      },
      from: consulta
    })
  };
}

/* ---------------- montar ---------------- */
const RAIZ = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");

/* 1. sintaxis: node --check sobre el script inline */
{
  const { execFileSync } = require("child_process");
  const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop()
    .replace(/^<script>/, "").replace(/<\/script>$/, "");
  const tmp = "/tmp/rwfact-sintaxis.js";
  fs.writeFileSync(tmp, inline);
  try { execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); }
  catch (e) {
    console.error("FALLA DE SINTAXIS:\n" + e.stderr.toString());
    process.exit(1);
  }
  console.log("sintaxis: OK (" + inline.length + " bytes)");
}
/* Ojo: hay que reemplazar con función, no con string. El fuente de React
   contiene "$$typeof" y String.replace interpreta "$$" como un "$" literal,
   lo que corrompe el bundle. */
const meter = (re, codigo) => { html = html.replace(re, () => "<script>" + codigo + "<\/script>"); };
meter(/<script src="[^"]*\/react\.production[^"]*"[^>]*><\/script>/, react);
meter(/<script src="[^"]*react-dom\.production[^"]*"[^>]*><\/script>/, reactDom);
meter(/<script src="[^"]*supabase-js[^"]*"[^>]*><\/script>/,
      "var TABLAS = " + JSON.stringify(TABLAS) + ";\n" +
      "window.supabase = (" + stubSupabase.toString() + ")();");
if (/cdnjs|jsdelivr/.test(html)) { console.error("FALLO: quedaron scripts externos sin reemplazar"); process.exit(1); }

fs.writeFileSync("/tmp/vista.html", html);  // para la revisión visual
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
  url: "https://prueba.local/" });

const fallas = [];
let n = 0;
function ok(nombre, cond, detalle) {
  n++;
  if (!cond) fallas.push(nombre + (detalle ? "  → " + detalle : ""));
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  const doc = dom.window.document;
  /* sólo lo renderizado: body.textContent arrastraría el fuente de los <script> */
  const txt = () => doc.getElementById("raiz").textContent.replace(/\s+/g, " ");
  const T = txt();

  /* --- carga y sesión --- */
  ok("entra con sesión activa (no muestra login)", !/Contraseña/.test(T));
  ok("muestra el correo de la sesión", /prueba@equipo\.pe/.test(T));
  ok("renderiza las 5 pestañas",
    ["Resumen","Por facturar","Declaraciones","Padrón","Anual"]
      .every(t => T.indexOf(t) >= 0));

  /* --- resumen: totales ---
     emitidas: 1000 y 500 (p1) + 800 (p3) = 2300 neto -> total 2714
     borradores: 200 (p1) + 300 (p2) = 500 neto -> total 590
     trabado sin ruc: 300 neto -> 354 */
  ok("facturado = S/ 2,714", T.indexOf("S/ 2,714") >= 0);
  ok("pendiente = S/ 590", T.indexOf("S/ 590") >= 0);
  ok("trabado sin RUC = S/ 354", T.indexOf("S/ 354") >= 0);
  ok("cuenta 1 persona sin RUC", /1 personas|1 persona/.test(T));

  /* --- por facturar --- */
  const irA = async (nombre) => {
    const tabs = [...doc.querySelectorAll("button.tab")];
    const b = tabs.find(x => x.textContent.indexOf(nombre) === 0);
    if (!b) throw new Error("no encontré la pestaña " + nombre);
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await pausa(60);   // React 18 agrupa y recién pinta en el microtask
  };
  await irA("Por facturar");
  const T2 = txt();
  ok("lista a la persona sin RUC como bloqueada", /sin RUC/.test(T2));
  ok("muestra ambas comisiones pendientes",
    /ANA PRUEBA UNO/.test(T2) && /BEA PRUEBA DOS/.test(T2));
  const checks = [...doc.querySelectorAll('input[type=checkbox]')];
  ok("hay 2 casillas", checks.length === 2, "hay " + checks.length);
  ok("la casilla de quien no tiene RUC está deshabilitada",
    checks.some(c => c.disabled), "ninguna deshabilitada");
  ok("la casilla de quien sí tiene RUC está habilitada",
    checks.some(c => !c.disabled));

  /* --- declaraciones --- */
  await irA("Declaraciones");
  const T3 = txt();
  ok("arma la matriz del año", /grupo 1/.test(T3) || /grupo 9/.test(T3));
  ok("incluye a quien tiene RUC", /ANA PRUEBA UNO/.test(T3));
  ok("excluye a quien no tiene RUC", !/BEA PRUEBA DOS/.test(T3));
  ok("excluye a la inactiva de las obligaciones mensuales",
    !/CARLA PRUEBA TRES/.test(T3));
  ok("tiene leyenda de estados",
    /cerrada/.test(T3) && /vencida/.test(T3) && /mes en curso/.test(T3));

  /* --- padrón --- */
  await irA("Padrón");
  const T4 = txt();
  ok("padrón muestra a las tres", /ANA PRUEBA/.test(T4) && /BEA PRUEBA/.test(T4)
    && /CARLA PRUEBA/.test(T4));
  ok("marca a la desactivada", /desactivado/.test(T4));
  ok("muestra el grupo del cronograma", /grupo 1/.test(T4));

  /* --- anual --- */
  await irA("Anual");
  const T5 = txt();
  ok("anual incluye a la inactiva que facturó", /CARLA PRUEBA TRES/.test(T5));
  ok("anual marca que está inactiva", /inactivo/.test(T5));
  /* ingreso neto total = 1000 + 500 + 800 = 2300; impuesto 10% = 230 */
  ok("ingreso neto del año = 2,300", T5.indexOf("S/ 2,300") >= 0);
  ok("impuesto proyectado = 230", T5.indexOf("S/ 230") >= 0);
  ok("dice que la anual sigue siendo obligatoria",
    /obligatoria/.test(T5));
  ok("muestra la UIT vigente", /5,500/.test(T5));

  ok("saldo por regularizar descuenta los pagos a cuenta",
    T5.indexOf("S/ 215") >= 0);
  ok("anual cuenta sólo a quienes facturaron", /2 asesores/.test(T5));

  /* --- resultado --- */
  console.log("pruebas: " + n + " · fallas: " + fallas.length);
  if (fallas.length) {
    fallas.forEach(f => console.log("  ✗ " + f));
    process.exit(1);
  }
  console.log("todo OK");
}, 1500);
