# Seguridad y OWASP Top 10

Controles de seguridad del SGE, alineados al estándar PTNV. Complementa
[M12](../modulos/M12-pruebas-seguridad-despliegue/README.md).

## 1. OWASP Top 10 (2021)

| Riesgo | Control |
|---|---|
| **A01 Broken Access Control** | `authenticate` + `requiresPermission` en cada endpoint; alcance por registro (`scopeOf`/`withinScope`) en el servicio; RBAC/ABAC **fail-closed**; 403 auditado como `ACCESS_DENIED`. |
| **A02 Cryptographic Failures** | HTTPS; bcryptjs para contraseñas; JWT firmados; secretos en `.env`; datos sensibles fuera de la bitácora. |
| **A03 Injection** | Prisma/consultas parametrizadas; validación Zod con whitelist; nunca concatenar SQL. |
| **A04 Insecure Design** | Reglas de negocio explícitas y probadas (cupo, empalme, ponderaciones, intentos); límites de intentos; políticas ABAC. |
| **A05 Security Misconfiguration** | `helmet`; CORS restringido (`WEB_ORIGIN`); sin debug en producción; `showFab=false` en el UI kit; sin seed en arranque. |
| **A06 Vulnerable Components** | Dependencias con lockfile (`pnpm-lock.yaml`) e imágenes fijadas; `pnpm audit --prod --audit-level high` en CI (ver §10). |
| **A07 Auth Failures** | Política de contraseña; bloqueo temporal tras 5 fallos; refresh rotado y revocable; *rate limiting* por IP en login (solo fallidos) y recuperación de contraseña → `429 RATE_LIMITED`. |
| **A08 Data Integrity Failures** | Validación de archivos (tipo/tamaño); migraciones versionadas; idempotencia; transacciones serializables en operaciones críticas. |
| **A09 Logging Failures** | Bitácora de escrituras y accesos denegados; logs sin datos sensibles; monitoreo de auth. |
| **A10 SSRF** | Sin peticiones a URLs provistas por el usuario; proveedores externos con endpoints fijos (S3, Resend/SMTP, Ably). |

## 2. Autenticación y sesión

- JWT access + refresh **rotado**; bcryptjs; bloqueo tras 5 intentos; *rate limiting* por IP (`RATE_LIMIT_*`, `TRUST_PROXY`).
- `authenticate` relee la BD: usuario activo, roles, excepciones.
- Ver [`../api/autenticacion.md`](../api/autenticacion.md).

## 3. Autorización

- `requiresPermission`/`requiresAnyPermission`; scoping en el servicio.
- Excepciones con vigencia (`expiresAt`); un permiso sensible solo lo otorga ADMIN.
- Matriz en [`roles-permisos.md`](roles-permisos.md).

## 4. Carga de archivos (M06, M18)

- Solo PDF/JPG/PNG; máximo según `UPLOAD_MAX_BYTES` (5 MB en M06).
- `multer` con **memoryStorage** y límite de tamaño; validar tipo por contenido.
- Almacenamiento **privado** con nombre aleatorio: S3 o disco local
  ([D-023](../../DECISIONES.md)); descarga solo por endpoint autorizado (nunca una
  URL pública). En producción sin almacenamiento configurado → 503
  `STORAGE_NOT_CONFIGURED`.

## 5. Cabeceras y transporte

`helmet` + HSTS, CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`; CORS solo al origen del frontend.

## 6. Entrada y salida

- Zod con whitelist en el backend; React escapa por defecto (evitar
  `dangerouslySetInnerHTML`).
- CSRF: si se usan cookies para el refresh, `SameSite=Strict/Lax`.

## 7. Secretos y datos

- `.env` nunca versionado; `.env.example` documenta las claves.
- **Importante (heredado de PTNV):** nunca versionar credenciales reales
  (AWS/Resend/Ably/contraseñas); rotarlas si estuvieron en un `.env` commiteado.
- Datos personales (CURP, contacto, domicilio) tratados como sensibles; minimizar
  exposición y respaldos cifrados.

## 8. Integridad de operaciones críticas

- Transacciones **Serializable con reintento** para operaciones que compiten
  (inscripciones, pagos, calificaciones) → 409 `CONCURRENT_UPDATE` tras choques.
- Candado optimista donde aplique.
- Idempotencia con `Idempotency-Key` en altas susceptibles de duplicarse.

## 9. Verificación automática (M12)

| Control | Prueba |
|---|---|
| Todo endpoint protegido responde 401 sin token y con token inválido | `api/tests/e2e/m12-seguridad.spec.ts` (barrido generado del OpenAPI: 196 operaciones) |
| Solo salud y acceso son públicos | mismo spec (lista cerrada de 6 operaciones) |
| Una cuenta sin permiso recibe 403 y queda `ACCESS_DENIED` en bitácora | mismo spec (barrido de administración con rol `STUDENT`) |
| Cabeceras de seguridad y sin `X-Powered-By` | mismo spec; en la web, `nginx.conf` |
| Errores sin stack ni nombres internos | mismo spec |
| Límite de peticiones | `api/tests/unit/rate-limit.spec.ts` |
| CORS por lista y comodines | `api/tests/unit/cors.spec.ts` |
| Cobertura ≥ 70 % en reglas de negocio | `pnpm --dir api test:coverage` (c8; hoy 81.8 % de líneas) |

## 10. Riesgos aceptados

- **`xlsx` (SheetJS 0.18.5):** GHSA-4r6h-8v6p-xvw6 y GHSA-5pgg-2g8v-p4x9 afectan
  al **leer** archivos; la API solo **escribe** hojas de cálculo (reportes y
  exportaciones) y nunca procesa un `.xlsx` del usuario. Están en
  `pnpm.auditConfig.ignoreGhsas` de `api/package.json`; si algún día se importa
  Excel, hay que cambiar de librería antes.
- **CSP:** desactivada en la API (solo responde JSON y Swagger) y sin política en
  la web (el UI kit usa estilos en línea). Pendiente evaluar una CSP para el SPA.
- **Límite de peticiones en memoria:** vale para una instancia; con varias
  réplicas hay que moverlo a un almacén compartido.

## 11. Checklist por módulo

- [ ] Endpoint valida entrada (Zod) y whitelist.
- [ ] Verifica permiso + alcance (y políticas ABAC si aplica).
- [ ] Registra escritura en bitácora con `previousState`/`newState`.
- [ ] No expone datos sensibles ni stack traces.
- [ ] Usa el envelope de error estándar.
- [ ] Tiene pruebas de control de acceso positivas y negativas.
