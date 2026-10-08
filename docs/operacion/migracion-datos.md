# Migración de datos históricos

Proceso para importar datos de sistemas previos (Excel/CSV/base anterior) al SGE.
Detalle funcional en [M20](../modulos/M20-migracion-historica/README.md). Usa el
patrón de migración de PTNV (`prisma/legacy/`, dump + extract).

## 1. Principios

- **Repetible e idempotente:** reejecutar no duplica datos (claves naturales:
  CURP, matrícula, folio de recibo).
- **Simulación primero (`dry-run`)** con reporte de errores antes de escribir.
- **Trazabilidad:** cada lote y cada fila quedan registrados.
- **Conciliación:** los totales cuadran con el origen antes de cerrar.

## 2. Proceso (6 pasos)

### 1. Recepción y documentación del origen
Recibir archivos y documentar su estructura; identificar llaves naturales y campos
obligatorios; registrar el diccionario origen → destino.

### 2. Mapeo origen → destino
| Entidad destino | Campo destino | Columna origen |
|---|---|---|
| `students` | `curp` | `CURP` |
| `students` | `nombres` | `NOMBRE(S)` |
| `students` | `fechaNacimiento` | `FECHA_NAC` |
| `charges` | `monto` | `IMPORTE` |
| `payments` | `reciboFolio` | `FOLIO` |

### 3. Script en modo simulación (`dry-run`)
Lee, normaliza y valida **sin escribir**; genera reporte de filas válidas y
rechazadas con motivo. Como en PTNV, la **previsualización y la confirmación
comparten el mismo `plan()`**, y la confirmación **reprocesa el archivo** (el
servidor no confía en lo que el navegador dice que leyó).

### 4. Limpieza y normalización
Normalizar nombres, fechas (ISO), montos (Decimal) y CURP (validar y detectar
duplicados por CURP o nombre + fecha de nacimiento). Resolver ambigüedades con
reglas documentadas.

### 5. Importación real por lotes
Lotes transaccionales; filas rechazadas con motivo; idempotencia por clave
natural (upsert/insert-missing); respaldo previo. Orden sugerido: catálogos →
alumnos/tutores → profesores → cursos/términos/grupos → inscripciones →
calificaciones → cargos → pagos → asistencia. El `Idempotency-Key` se liga al lote.

### 6. Validación y conciliación
Conteos origen vs destino, suma de montos, muestreo con el cliente y acta de
aceptación.

## 3. Llaves naturales (idempotencia)

| Entidad | Llave natural |
|---|---|
| `students` | `curp` (o `matricula`) |
| `teachers` | `email` |
| `charges` | `studentId + conceptId + termId + fechaVencimiento` |
| `payments` | `reciboFolio` |
| `grades` | `assessmentId + enrollmentId` |

## 4. Reporte de errores (ejemplo)

```json
{
  "batchId": "…", "mode": "dry-run",
  "totals": { "read": 1200, "valid": 1180, "rejected": 20 },
  "rejected": [
    { "row": 15, "entity": "Student", "reason": "INVALID_CURP", "value": "XAXX…" },
    { "row": 42, "entity": "Student", "reason": "DUPLICATE_CURP" }
  ]
}
```

## 5. Respaldo residual (modelo anterior)

Si el histórico proviene del **modelo viejo** (como en PTNV), se convierte con un
script de extracción en `prisma/legacy/` que mapea tablas antiguas a las nuevas,
conservando consecutivos y reconstruyendo altas/salidas. Queda como referencia y
se actualizan los fixtures con `npm run legacy:extract`.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Datos sucios/duplicados | `dry-run` + reglas de limpieza |
| Duplicación al reejecutar | Llaves naturales + upsert idempotente |
| Pérdida de datos | Respaldo previo + lotes transaccionales |
| Descuadre de totales | Conciliación y muestreo con el cliente |
