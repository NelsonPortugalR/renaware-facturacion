/* Prueba de comportamiento con jsdom.
   Stub de Supabase con datos conocidos: lo que se verifica es la lógica
   derivada (agenda, cálculo del comprobante, obligaciones, totales,
   proyección anual), no la red. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/home/claude/node_modules/jsdom");

const NM = "/home/claude/node_modules";
const react = fs.readFileSync(NM + "/react/umd/react.production.min.js", "utf8");
const reactDom = fs.readFileSync(NM + "/react-dom/umd/react-dom.production.min.js", "utf8");

/* ---------------- fixtures ---------------- */
const HOY = new Date().toISOString().slice(0, 10);
const ANIO = +HOY.slice(0, 4);
const dISO = (off) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
const AYER = dISO(-3), PRONTO = dISO(5);

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
    activo: false, celular: null, correo: null, notas: null },
  /* propio: mismo RUC que el emisor Portugal Research, como en la base real */
  { id: "p4", nombre: "PORTUGAL PRUEBA", codigo_asesor: "83428", ruc: "20600022653",
    cuenta_detraccion: "00101993892", cci: "1", banco: "BCP", cuenta_bancaria: "1",
    codigo_division: "wv08", factura_desde: ANIO + "-06-01", regimen: "RMT",
    activo: true, celular: null, correo: null, notas: null }
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
  fac("f5", "p3", "CARLA PRUEBA TRES", "10296091869", 800, "emitida", ANIO + "-06-12", 24),
  // propio: junio quedó vencido y sin declaración cargada -> es un hueco
  fac("f6", "p4", "PORTUGAL PRUEBA", "20600022653", 2000, "emitida", ANIO + "-06-15", 24),
  // año anterior: el cronograma cargado no lo cubre, pero venció igual
  fac("f7", "p4", "PORTUGAL PRUEBA", "20600022653", 500, "emitida",
      (ANIO - 1) + "-12-31", 1)
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

/* --- lo propio de Nelson: emisores, receptores, reglas, deudas --- */
const EMI_PRI = "e-pri", EMI_NAT = "e-nat";
const REC_RW = "r-rw", REC_BROS = "r-bros", REC_PRI = "r-pri";

const emisores = [
  { id: EMI_PRI, ruc: "20600022653", nombre: "Portugal Research International",
    tipo: "empresa", relacion: "propio", persona_id: null, regimen: "RMT",
    serie_default: "E001", ultimo_correlativo: "E001-560 (19/10/2026)", activo: true,
    banco: "BCP", cuenta_bancaria: "1", cci: "1", cuenta_detraccion: "00101993892" },
  { id: EMI_NAT, ruc: "10449906662", nombre: "PORTUGAL ROMAN NELSON",
    tipo: "persona", relacion: "propio", persona_id: null, regimen: "4ta",
    serie_default: "E001", ultimo_correlativo: "RxH E001-481", activo: true,
    banco: null, cuenta_bancaria: null, cci: null, cuenta_detraccion: null }
];
const receptores = [
  { id: REC_RW, ruc: "20100131863", razon_social: "RENA WARE DEL PERU S.A.", activo: true },
  { id: REC_BROS, ruc: "20611129875", razon_social: "BROS CONSULTORES S.A.C.", activo: true },
  { id: REC_PRI, ruc: "20600022653", razon_social: "PORTUGAL RESEARCH INTERNATIONAL S.A.C.",
    activo: true }
];
const reglas = [
  { emisor_id: EMI_PRI, receptor_id: REC_RW, tipo_comprobante: "factura", lleva_igv: true,
    detraccion_pct: 0.10, detraccion_umbral: 700, codigo_bien: "037", retencion_pct: null,
    glosa_plantilla: "PB XX/26 servicio fijo" },
  { emisor_id: EMI_PRI, receptor_id: REC_BROS, tipo_comprobante: "factura", lleva_igv: true,
    detraccion_pct: 0.12, detraccion_umbral: null, codigo_bien: "037", retencion_pct: null,
    glosa_plantilla: "FACILITADOR PEPSICO" },
  { emisor_id: EMI_NAT, receptor_id: REC_PRI, tipo_comprobante: "rxh", lleva_igv: false,
    detraccion_pct: null, detraccion_umbral: null, codigo_bien: null, retencion_pct: 0.08,
    glosa_plantilla: "Servicio de gerenciamiento empresarial" }
];
const obligaciones = [
  { id: "o1", emisor_id: EMI_PRI, tipo: "fraccionamiento", referencia: "RI 0230174741237",
    descripcion: "Art. 36", monto_total: 2577, cuotas: 9 },
  { id: "o2", emisor_id: EMI_PRI, tipo: "deuda_igv", referencia: "junio 2026",
    descripcion: "IGV prorrogado", monto_total: 1931, cuotas: 1 }
];
const cuotas = [
  { obligacion_id: "o1", numero: 1, vence: AYER,   monto: 302,  pagada_en: null },
  { obligacion_id: "o1", numero: 2, vence: PRONTO, monto: 297,  pagada_en: null },
  { obligacion_id: "o2", numero: 1, vence: AYER,   monto: 1931, pagada_en: null }
];

const TABLAS = {
  eq_personas: personas,
  fact_facturas: facturas,
  fact_declaraciones: [],
  fact_vencimientos: venc,
  fact_gastos_anuales: [],
  fact_emisores: emisores,
  fact_receptores: receptores,
  fact_reglas_emision: reglas,
  fact_obligaciones: obligaciones,
  fact_obligacion_cuotas: cuotas,
  fact_config: { id: "vigente", igv: 0.18, detraccion: 0.10,
    detraccion_umbral: 700, renta: 0.01, uit: 5500 }
};

/* ---------------- stub de supabase ---------------- */
function stubSupabase() {
  function consulta(tabla) {
    const api = {};
    const res = () => Promise.resolve({ data: TABLAS[tabla], error: null });
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
  ok("renderiza las 8 pestañas",
    ["Agenda","Deuda","Por facturar","Emitir","Declaraciones","Padrón","Anual","Resumen"]
      .every(t => T.indexOf(t) >= 0));

  /* --- agenda: arranca acá, es la pantalla de cero multas --- */
  ok("arranca en la agenda", /Vencido/.test(T));
  ok("muestra la cuota de fraccionamiento", /Cuota 1 de 9/.test(T));
  ok("cita el número de RI", /RI 0230174741237/.test(T));
  ok("muestra el IGV prorrogado", /IGV junio 2026/.test(T));
  ok("pone el código de tributo del fraccionamiento", /tributo 8021/.test(T));
  /* vencido = 302 + 1931 = 2,233 */
  ok("suma lo vencido", T.indexOf("S/ 2,233") >= 0);
  ok("avisa del riesgo de perder el fraccionamiento",
    /se pierde el fraccionamiento/.test(T));
  ok("ofrece marcar la cuota como pagada", /marcar pagada/.test(T));
  ok("la cuota que vence pronto entra en esta semana", /Esta semana/.test(T));

  /* --- la agenda arranca en lo propio: las declaraciones del equipo no
         pueden tapar las deudas de Nelson (eran 108 contra 2) --- */
  ok("ofrece los tres ámbitos", /Lo mío/.test(T) && /Del equipo/.test(T) && /Todo/.test(T));
  ok("en lo propio no se cuela ninguna declaración del equipo",
    !/ANA PRUEBA UNO/.test(T) && !/BEA PRUEBA DOS/.test(T),
    "se coló alguien del equipo");
  ok("en lo propio sí sale la declaración propia",
    /PORTUGAL PRUEBA/.test(T));

  /* lo que pidió Nelson: avisar de los meses ya vencidos de los que no hay
     nada cargado, y de los RUC propios sin un solo comprobante */
  ok("avisa de los meses vencidos sin declaración cargada",
    /meses vencidos sin declaración cargada/.test(T) ||
    /mes vencido sin declaración cargada/.test(T));
  ok("nombra el mes y a quién", /junio|julio|agosto|setiembre/.test(T));
  ok("aclara que no es una deuda sino un dato que falta",
    /no se sabe/.test(T));
  /* un periodo de un año que el cronograma no cubre venció igual: lo que no
     se sabe es el día, y eso hay que decirlo en vez de callarlo */
  ok("cuenta los periodos sin fila de cronograma",
    /día exacto hay que confirmarlo en SUNAT/.test(T));
  ok("y los nombra", /diciembre/.test(T));
  ok("avisa de los RUC propios sin comprobantes",
    /sin ningún comprobante cargado/.test(T));
  ok("nombra el RUC mudo", /10449906662/.test(T));
  ok("en lo propio quedan las tres deudas", /Cuota 1 de 9/.test(T) &&
    /Cuota 2 de 9/.test(T) && /IGV junio 2026/.test(T));

  const chip = async (nombre) => {
    const b = [...doc.querySelectorAll("button.chip")]
      .find(x => x.textContent.indexOf(nombre) === 0);
    if (!b) throw new Error("no encontré el filtro " + nombre);
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await pausa(60);
  };
  await chip("Del equipo");
  const TQ = txt();
  ok("el ámbito del equipo sí trae las declaraciones", /Declarar/.test(TQ));
  ok("y explica por qué figuran pendientes", /nunca se registraron/.test(TQ));
  ok("el ámbito del equipo no repite las deudas propias", !/Cuota 1 de 9/.test(TQ));
  ok("el ámbito del equipo no trae lo propio", !/PORTUGAL PRUEBA/.test(TQ));
  await chip("Lo mío");

  /* --- cálculo del comprobante: la aritmética que debe cuadrar al céntimo --- */
  const calcular = dom.window.calcular;
  const reglaDe = dom.window.reglaDe;
  const cfg = TABLAS.fact_config;
  ok("expone calcular() y reglaDe()",
    typeof calcular === "function" && typeof reglaDe === "function");

  if (typeof calcular === "function") {
    const rBros = reglaDe(reglas, EMI_PRI, REC_BROS);
    const bros = calcular(rBros, 3000, cfg);
    /* contra la factura real E001-560 */
    ok("Bros: total 3,540", bros.total === 3540, "dio " + bros.total);
    ok("Bros: detracción 12% sin umbral = 424.80", bros.detraccion === 424.8,
      "dio " + bros.detraccion);
    ok("Bros: al banco 3,115.20", bros.banco === 3115.2, "dio " + bros.banco);

    const rRW = reglaDe(reglas, EMI_PRI, REC_RW);
    const chico = calcular(rRW, 500, cfg);
    ok("Rena Ware: total 590 no llega al umbral, sin detracción",
      chico.total === 590 && chico.detraccion === 0,
      "total " + chico.total + " detr " + chico.detraccion);
    const grande = calcular(rRW, 1000, cfg);
    ok("Rena Ware: total 1,180 pasa el umbral, detracción 118",
      grande.total === 1180 && grande.detraccion === 118,
      "detr " + grande.detraccion);

    const rRxh = reglaDe(reglas, EMI_NAT, REC_PRI);
    const rxh = calcular(rRxh, 1000, cfg);
    ok("RxH: no lleva IGV", rxh.igv === 0 && rxh.total === 1000);
    ok("RxH: retención 8% = 80", rxh.retencion === 80, "dio " + rxh.retencion);
    ok("RxH: no lleva detracción", rxh.detraccion === 0);
    ok("RxH: al banco 920", rxh.banco === 920, "dio " + rxh.banco);

    /* sin regla cargada cae al genérico y no revienta */
    const gen = calcular(null, 1000, cfg);
    ok("sin regla usa lo genérico (IGV 18%, detracción 10% sobre 700)",
      gen.total === 1180 && gen.detraccion === 118);
  }

  const irA = async (nombre) => {
    const tabs = [...doc.querySelectorAll("button.tab")];
    const b = tabs.find(x => x.textContent.indexOf(nombre) === 0);
    if (!b) throw new Error("no encontré la pestaña " + nombre);
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await pausa(60);   // React 18 agrupa y recién pinta en el microtask
  };

  /* --- deuda: el cronograma entero, pagado y no pagado --- */
  await irA("Deuda");
  const TD = txt();
  ok("deuda arranca en lo mío", /Mías/.test(TD) && /Del equipo/.test(TD));
  ok("deudas: saldo total 2,530", TD.indexOf("S/ 2,530") >= 0);
  ok("deudas: vencido sin pagar 2,233", TD.indexOf("S/ 2,233") >= 0);
  ok("deudas: lista las dos obligaciones",
    /Fraccionamiento/.test(TD) && /IGV junio 2026/.test(TD));
  ok("deudas: muestra el cronograma completo", /1 \/ 9/.test(TD) && /2 \/ 9/.test(TD));
  ok("deudas: cita el RI", /RI 0230174741237/.test(TD));
  ok("deudas: marca cuál está vencida", /vencida/.test(TD));
  ok("deudas: marca cuál está pendiente", /pendiente/.test(TD));
  ok("deudas: avisa del Art. 36", /Art\. 36/.test(TD));
  /* el Art. 36 es de fraccionamientos: una deuda de IGV no puede llevarlo */
  ok("deudas: el IGV vencido no habla de perder el fraccionamiento",
    (TD.match(/Art\. 36/g) || []).length === 1, "aparece más de una vez");
  ok("deudas: el IGV vencido habla de interés moratorio",
    /interés moratorio/.test(TD));
  ok("deudas: dice cómo se paga", /Formulario 1662/.test(TD) && /8021/.test(TD));
  ok("deudas: deja marcar una cuota como pagada",
    [...doc.querySelectorAll("button.btn.sec.sm")].some(b => b.textContent === "pagada"));

  /* --- emitir: ya no calcula, administra las reglas --- */
  await irA("Emitir");
  const TE = txt();
  ok("emitir ya no trae la calculadora",
    !/Cae al banco/.test(TE) && !/Neto \(sin IGV\)/.test(TE));
  ok("emitir separa mías del equipo", /Mías/.test(TE) && /Del equipo/.test(TE));
  ok("emitir lista las reglas propias", /Portugal Research International/.test(TE));
  ok("emitir muestra la detracción de Bros al 12%", /12% siempre/.test(TE));
  ok("emitir muestra el umbral de Rena Ware", /10% > 700/.test(TE));
  ok("emitir muestra la retención del recibo", /8%/.test(TE));
  ok("emitir ofrece cargar una regla nueva", /cargar nueva regla/.test(TE));
  {
    const b = [...doc.querySelectorAll("button.btn.sec")]
      .find(x => x.textContent === "cargar nueva regla");
    b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    const TF = txt();
    ok("el formulario pide emisor y receptor", /Emisor/.test(TF) && /Receptor/.test(TF));
    ok("el formulario pide la detracción", /Detracción %/.test(TF));
    /* el umbral recién aparece cuando hay un % de detracción: hasta entonces
       no tiene sentido preguntarlo */
    ok("el umbral no se pregunta sin detracción", !/sin importar el monto/.test(TF));
    ok("el formulario ofrece el recibo por honorarios",
      /Recibo por honorarios/.test(TF));
  }

  /* --- resumen: totales ---
     emitidas: 1000 y 500 (p1) + 800 (p3) = 2300 neto -> total 2714
     borradores: 200 (p1) + 300 (p2) = 500 neto -> total 590
     trabado sin ruc: 300 neto -> 354 */
  await irA("Resumen");
  const TR = txt();
  ok("facturado = S/ 5,664", TR.indexOf("S/ 5,664") >= 0);
  ok("pendiente = S/ 590", TR.indexOf("S/ 590") >= 0);
  ok("trabado sin RUC = S/ 354", TR.indexOf("S/ 354") >= 0);
  ok("cuenta 1 persona sin RUC", /1 personas|1 persona/.test(TR));

  /* --- por facturar: separa lo accionable de lo trabado --- */
  await irA("Por facturar");
  const T2 = txt();
  ok("ofrece con RUC / sin RUC", /Con RUC/.test(T2) && /Sin RUC/.test(T2));
  ok("avisa que falta la fecha del reporte de Aurora",
    /último reporte de Aurora/.test(T2));
  ok("arranca en los que sí se pueden facturar",
    /ANA PRUEBA UNO/.test(T2) && !/BEA PRUEBA DOS/.test(T2));
  const checks = [...doc.querySelectorAll('input[type=checkbox]')];
  ok("hay 1 casilla, la de quien tiene RUC", checks.length === 1, "hay " + checks.length);
  ok("esa casilla está habilitada", checks.some(c => !c.disabled));
  await chip("Sin RUC");
  const T2b = txt();
  ok("sin RUC muestra a quien falta el dato", /BEA PRUEBA DOS/.test(T2b));
  ok("sin RUC dice cuánto está trabado y dónde se arregla",
    /trabados por falta de dato/.test(T2b) && /Padrón/.test(T2b));
  await chip("Con RUC");

  /* la casilla para anotar a mano lo que viene: lo propio ya no sale de Aurora */
  {
    const b = [...doc.querySelectorAll("button.lk")]
      .find(x => x.textContent === "agregar una factura que viene");
    ok("ofrece anotar una factura que viene", !!b);
    if (b) {
      b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await pausa(80);
      const TN = txt();
      ok("el formulario pide emisor, receptor, neto y glosa",
        /Emisor/.test(TN) && /Receptor/.test(TN) &&
        /Neto \(sin IGV\)/.test(TN) && /Glosa/.test(TN));
      ok("dice de dónde sale el monto", /que te manda Javier/.test(TN));
      ok("la fecha es estimada hasta emitirla",
        /se corrige al marcarla como emitida/.test(TN));
      b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await pausa(60);
    }
  }

  /* --- padrón: una sola base con la del equipo --- */

  /* --- declaraciones --- */
  await irA("Declaraciones");
  ok("declaraciones separa mías del equipo", /Mías/.test(txt()));
  await chip("Todas");
  const T3 = txt();
  ok("arma la matriz del año", /grupo 1/.test(T3) || /grupo 9/.test(T3));
  ok("incluye a quien tiene RUC", /ANA PRUEBA UNO/.test(T3));
  ok("excluye a quien no tiene RUC", !/BEA PRUEBA DOS/.test(T3));
  ok("excluye a la inactiva de las obligaciones mensuales",
    !/CARLA PRUEBA TRES/.test(T3));
  ok("tiene leyenda de estados",
    /cerrada/.test(T3) && /vencida/.test(T3) && /mes en curso/.test(T3));

  /* --- el detalle del 0621: lo que se declara mes a mes --- */
  {
    const tabs = [...doc.querySelectorAll("button.chip")];
    const mes = tabs.find(x => x.textContent.indexOf("Trabajar un mes") === 0);
    mes.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await pausa(80);
    const abrir = [...doc.querySelectorAll("button.lk")]
      .find(x => x.textContent === "detalle del 0621");
    ok("cada mes ofrece el detalle del 0621", !!abrir);
    if (abrir) {
      abrir.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await pausa(80);
      const TF = txt();
      ok("pide las casillas del IGV",
        /Ventas sin IGV \(100\)/.test(TF) && /Crédito fiscal \(178\)/.test(TF)
        && /IGV a pagar \(188\)/.test(TF));
      ok("pide el saldo a favor de los dos meses",
        /Saldo a favor anterior \(145\)/.test(TF) &&
        /Saldo a favor siguiente \(184\)/.test(TF));
      ok("pide la renta y su retención",
        /Ingresos netos \(301\)/.test(TF) && /Pago a cuenta \(324\)/.test(TF)
        && /Retención 4ta \(3042\)/.test(TF));
      ok("aclara que la 4ta va en el PLAME", /PLAME/.test(TF));
      ok("pide los otros gastos y aclara que no repiten compras",
        /Otros gastos/.test(TF) && /No repite las compras/.test(TF));
      ok("precarga las ventas desde las facturas", /de tus facturas/.test(TF));
      ok("ofrece el IGV prorrogado", /IGV Justo/.test(TF));
      ok("pregunta de dónde salió el dato", /Constancia \+ detalle/.test(TF));
      /* ANA tiene 1000 de neto en junio -> IGV 180, renta 10.
         Con crédito fiscal vacío el chequeo no corre; el de renta sí. */
      ok("chequea la renta contra el 1% de los ingresos",
        /1% de los ingresos netos/.test(TF));
    }
  }

  /* --- padrón --- */
  await irA("Padrón");
  const T4 = txt();
  ok("padrón muestra a las tres", /ANA PRUEBA/.test(T4) && /BEA PRUEBA/.test(T4)
    && /CARLA PRUEBA/.test(T4));
  ok("marca a la desactivada", /desactivado/.test(T4));
  ok("muestra el grupo del cronograma", /grupo 1/.test(T4));
  {
    const abrir = [...doc.querySelectorAll("button.btn.sec.sm")]
      .find(x => x.textContent === "Abrir");
    ok("cada fila del padrón se puede abrir", !!abrir);
    if (abrir) {
      abrir.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await pausa(80);
      const TP = txt();
      ok("la ficha trae los datos de la base del equipo",
        /DNI/.test(TP) && /Distrito/.test(TP) && /Patrocinador/.test(TP));
      ok("la ficha dice que la base es compartida",
        /misma base que usa el resto de la plataforma/.test(TP));
    }
  }

  /* --- anual --- */
  await irA("Anual");
  const T5 = txt();
  ok("anual incluye a la inactiva que facturó", /CARLA PRUEBA TRES/.test(T5));
  ok("anual marca que está inactiva", /inactivo/.test(T5));
  /* ingreso neto total = 1000 + 500 + 800 = 2300; impuesto 10% = 230 */
  ok("ingreso neto del año = 4,300", T5.indexOf("S/ 4,300") >= 0);
  ok("impuesto proyectado = 430", T5.indexOf("S/ 430") >= 0);
  ok("dice que la anual sigue siendo obligatoria",
    /obligatoria/.test(T5));
  ok("muestra la UIT vigente", /5,500/.test(T5));

  /* El saldo descuenta sólo los pagos a cuenta PAGADOS. En las pruebas no hay
     ninguno pagado, así que no descuenta nada: 230, no 215. Un 0621 presentado
     no es un pago. */
  ok("el saldo no descuenta lo declarado pero no pagado",
    T5.indexOf("S/ 430") >= 0);
  ok("avisa de los pagos a cuenta declarados y no pagados",
    /declarados pero no pagados/.test(T5));
  ok("anual cuenta sólo a quienes facturaron", /3 contribuyentes/.test(T5));
  ok("anual avisa de los meses sin compras cargadas",
    /sin compras ni gastos cargados/.test(T5));
  ok("anual dice que no se escribe nada ahí", /no se escribe nada/.test(T5));

  /* --- resultado --- */
  console.log("pruebas: " + n + " · fallas: " + fallas.length);
  if (fallas.length) {
    fallas.forEach(f => console.log("  ✗ " + f));
    process.exit(1);
  }
  console.log("todo OK");
}, 1500);
