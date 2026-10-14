# renaware-facturacion

Módulo **Facturación** de la plataforma de Equipo Arequipa. Controla qué está
pendiente de facturar y que ninguna declaración mensual se pase de fecha.
Meta: cero multas.

La facturación en sí es manual. Este sistema no emite comprobantes: lleva el
registro, calcula lo que se debe y avisa antes de que venza.

## Qué hace

- **Resumen** — facturado del año, pendiente por facturar, cuánto está trabado
  por falta de RUC, y declaraciones vencidas.
- **Por facturar** — las comisiones pendientes agrupadas por asesor. Se marcan
  con un check al emitir la factura. Bloquea a quien no tiene RUC, y a quien
  supera S/700 sin cuenta de detracción.
- **Declaraciones** — matriz del año por asesor y vista mes a mes:
  SIRE → presentar el 621 → pagar IGV (1011) y renta (3121) por separado.
  Todo reversible.
- **Padrón** — datos de cada asesor: RUC, cuentas, código de división,
  desde cuándo declara. Activar y desactivar.
- **Anual** — ingresos del ejercicio, gastos cargados a mano, y proyección de
  renta a tasas RMT (10% hasta 15 UIT, 29.5% encima) descontando los pagos
  a cuenta.

## Reglas que respeta

- IGV 18%, pago a cuenta de renta 1% mensual, régimen RMT.
- Detracción 10%, sólo cuando el total **con IGV** pasa de S/700.
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
`fact_facturas`, `fact_declaraciones`, `fact_vencimientos`, `fact_config`
y `fact_gastos_anuales`. El acceso es el mismo de la plataforma
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
node prueba.js    # sintaxis + 28 aserciones de comportamiento en jsdom
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
- 73 personas sin RUC bloquean S/ 37,575 en comisiones pendientes. Es el
  cuello de botella real, más que las multas.
