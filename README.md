# renaware-facturacion

Módulo **Facturación** de la plataforma de Equipo Arequipa. Controla qué está
pendiente de facturar y que ninguna declaración mensual se pase de fecha.
Meta: cero multas.

La facturación en sí es manual. Este sistema no emite comprobantes: lleva el
registro, calcula lo que se debe y avisa antes de que venza.

## Qué hace

- **Agenda** — la pantalla de cero multas. Todo lo que tiene fecha en una sola
  lista ordenada por vencimiento: cuotas de fraccionamiento (tributo 8021),
  IGV con vencimiento prorrogado y declaraciones mensuales. Arranca filtrada
  en **Lo mío** y no es un detalle: las declaraciones del equipo son más de
  cien y tapaban por completo las dos deudas propias. "Mío" es lo que emiten
  los RUC con `relacion = 'propio'`. Las declaraciones de hace más de 60 días
  no entran: son el atraso histórico y se cierran en bloque desde su pestaña.
- **Deuda** — cada fraccionamiento y cada IGV con su cronograma entero: qué
  cuota se pagó y cuándo, cuál está vencida, cuánto falta. Desde ahí se agrega
  una deuda, se registra un pago (NPS, 1662, **cuenta de detracción**, tarjeta,
  al presentar) y se **fracciona el saldo**: el cronograma del RI se pega tal
  cual del PDF y se muestra lo entendido antes de guardar. La deuda original
  queda como `fraccionada` y deja de contar; lo que se debe pasa a ser el nuevo
  cronograma. El aviso del Art. 36 sale sólo en fraccionamientos; una deuda de
  IGV vencida no se pierde, acumula interés moratorio.
- **Ajustes** — lo que se configura una vez: las reglas de emisión por par
  emisor-receptor (alta y edición) y quién lleva la contabilidad de cada quien.
  Las reglas no calculan nada acá: la aritmética vive en `calcular()`, que usan
  el formulario de facturas que vienen y el chequeo del IGV mensual.
- **Resumen** — facturado del año, pendiente por facturar, cuánto está trabado
  por falta de RUC, y declaraciones vencidas.
- **Por facturar** — las comisiones pendientes agrupadas por asesor, separadas
  en **con RUC** (se factura hoy) y **sin RUC** (falta un dato, es otro
  trabajo). Arriba dice hasta qué semana llega el reporte de Aurora. Lo propio
  ya no sale de ese reporte: se anota a mano con "agregar una factura que
  viene", que calcula detracción y retención con la regla del par.
- **Declaraciones** — matriz del año y vista mes a mes. Cada casilla de la
  matriz muestra **el día en que vence** esa declaración, no sólo el estado:
  sin eso no sirve para recordarle a nadie. Cuatro grupos:
  SIRE → presentar el 621 → pagar IGV (1011) y renta (3121) por separado.
  Cada mes abre el **detalle del 0621**: ventas e IGV precargados de las
  facturas, y de la constancia del contador las compras, el crédito fiscal
  (casilla 178, total), el saldo a favor de los dos meses, las retenciones, los
  ingresos netos, el pago a cuenta, la retención de 4ta (3042, va en el PLAME)
  y los otros gastos. Chequea en vivo que el IGV declarado salga de
  ventas − crédito − saldo anterior − retenciones, y que el pago a cuenta sea
  el 1% de los ingresos. Todo reversible.
- **Padrón** — la misma `eq_personas` que usa el resto de la plataforma, no una
  copia: DNI, contacto, ubicación, patrocinador e ingreso se comparten; acá se
  le suman RUC, cuentas y desde cuándo declara. No se agregan asesores a mano:
  entran cuando aparecen en un reporte con detalle para facturar.
- **Anual** — de sólo lectura: se arma sumando los meses. Régimen MYPE para
  todos. Descuenta los pagos a cuenta **pagados**, no los declarados: un 0621
  presentado no es un pago, y los 0621 dicen "importe pagado 0,00" porque el
  pago va aparte. Avisa cuántos meses están sin compras cargadas y cuánto hay
  declarado sin pagar.

## Reglas que respeta

- IGV 18%, pago a cuenta de renta 1% mensual, régimen RMT.
- La detracción **depende del receptor**, no es una sola: Rena Ware 10% sólo
  cuando el total con IGV pasa de S/700; Bros Consultores 12% sin umbral.
  Lo define `fact_reglas_emision` por par emisor-receptor; si no hay regla,
  se cae al genérico de `fact_config`.
- Recibo por honorarios: sin IGV, con retención de 8% de cuarta categoría.
  Es otro mecanismo, no una detracción.
- Una factura anulada no se borra: se declaró, y lo que la cancela es la nota
  de crédito, que entra en negativo. Excluirla además sería restar dos veces.
- "Mío" sale de `fact_emisores.relacion = 'propio'`, no de una lista en el
  código: Portugal Research, el RUC 10 de Nelson, su esposa y su suegro.
- De quien lleva la contabilidad por fuera (`eq_personas.contabilidad`) no se
  piden las casillas del 0621: no vamos a tener ese dato. Con esa gente sólo se
  controla la fecha y si avisó que ya declaró.
- Un NPS no es un pago. Se guarda como `estado = 'nps'` y sólo pasa a `pagado`
  con la constancia.
- **La obligación mensual nace del RUC, no de haber facturado.** Quien tiene RUC
  y no vendió igual presenta el 621 en cero; no presentarlo es multa aunque no
  se deba nada. Por eso el mes se divide en "facturaron" y "declaran en cero".
- La declaración anual la debe todo el que facturó en el ejercicio, aunque hoy
  esté desactivado. Es otra obligación, no la suma de las mensuales.
- Fraccionamiento Art. 36: tributo 8021, se paga con NPS o Form. 1662 citando
  el número de RI. Dos cuotas consecutivas impagas y se pierde.
- Cronograma SUNAT por último dígito del RUC (`fact_vencimientos`).
- La declaración anual sigue siendo obligatoria para quien facturó en el
  ejercicio, aunque hoy esté desactivado o haya suspendido actividades.
- El mes en curso se muestra pero no cuenta como pendiente: se declara el
  mes siguiente.

## Cómo está hecho

Un solo `index.html`, sin build. React y supabase-js entran por CDN,
`React.createElement` va aliasado a `h`, el CSS es propio (sin Tailwind).
Misma convención que el cotizador.

Backend: Supabase `kiexpdaaoegbtesqmaff`, tablas `eq_personas`,
`fact_facturas`, `fact_declaraciones`, `fact_vencimientos`, `fact_config`,
`fact_gastos_anuales`, `fact_emisores`, `fact_receptores`,
`fact_reglas_emision`, `fact_obligaciones` y `fact_obligacion_cuotas`. El acceso es el mismo de la plataforma
(correo y contraseña de `perfiles`); los datos los protege RLS, por eso la
clave publicable del archivo puede ser pública.

### Modelo de datos, lo que no es obvio

- `fact_facturas.estado`: `borrador` = comisión pendiente de facturar;
  `emitida` / `enviada` / `cobrada` = ya facturada.
- `fact_facturas.igv` y `.total` son **columnas generadas** desde `neto`.
  No se pasan en un INSERT.
- Las semanas de Rena Ware arrancan jueves. Semana N empieza el
  `2025-12-25 + (N-1)*7`; su `periodo_ind` es `(N-1)/2` y la `semana`
  dentro del período es `((N-1) % 2) + 1`.
- `fecha_estimada = true` marca las fechas deducidas de los reportes FPD
  semanales (lo que desaparece del pendiente fue facturado), no confirmadas
  contra la factura real. Al marcar una comisión como facturada, la fecha
  real reemplaza la estimada y el flag se apaga.

## Desarrollo

Se parchea por reemplazo de texto con aserciones de conteo exacto, igual que
el cotizador. Después de cualquier cambio:

```bash
cd pruebas
node prueba.js    # sintaxis + 142 aserciones de comportamiento en jsdom
node ver.js       # render real en Chromium, escritorio y celular
```

`prueba.js` monta la página con un stub de Supabase y datos de prueba, así
que verifica la lógica derivada (obligaciones, totales, proyección anual)
sin tocar la base real. Deja el HTML montado en `/tmp/vista.html`, que es lo
que abre `ver.js`.

## Despliegue

Cloudflare Pages conectado a este repo. Directorio raíz, sin comando de
build. Cada push a `main` publica.

Cuando la URL exista hay que registrarla en `plataforma_modulos`:

```sql
update plataforma_modulos set url = 'https://<proyecto>.pages.dev'
where id = 'facturacion';
```

Desde ahí los avisos de vencimiento que ya genera `hoy_items()` en la
pantalla de inicio llevan a este módulo.

## Pendiente

- Endurecer RLS: hoy las tablas `fact_*` son accesibles a cualquier cuenta
  autenticada. El módulo declara `['admin','gestor']` y las políticas
  deberían decir lo mismo.
- Decidir si las credenciales de los asesores (portal Rena Ware y Clave SOL)
  se guardan en la base y bajo qué protección.
- 79 personas sin RUC bloquean unos S/ 40,500 en comisiones pendientes. Es el
  cuello de botella real, más que las multas.
- Anulaciones: `fact_facturas` tiene el estado `anulada` pero nada registra las
  notas de crédito de anulación. Abril tuvo varias; infla la proyección anual.
- Universidad de Piura y Grupo Empresarial Viaje están cargados como receptores
  pero sin reglas: hay que definirles detracción.
