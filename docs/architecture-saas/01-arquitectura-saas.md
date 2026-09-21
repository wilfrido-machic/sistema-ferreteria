# 01 — Visión y Arquitectura Multi-tenant

**Producto:** Sistema Integral de Gestión — Ferretería (evolución a SaaS B2B)  
**Audiencia:** equipo técnico, arquitecto de software, producto  
**Estado del repositorio analizado:** carpeta de trabajo vacía al 20-sep-2026 (sin código, esquemas ni vistas). Este documento define la **arquitectura objetivo** y las decisiones que deben gobernar la construcción y cualquier migración posterior.  
**Principios de diseño:** latencia de mostrador < 150 ms en búsqueda de SKU; aislamiento fuerte de datos por inquilino; costo de infraestructura predecible; cumplimiento FEL (SAT Guatemala) sin bloquear la fila de caja.

---

## 1. Contexto y tesis de producto

El sistema deja de ser un instalable por ferretería y pasa a ser una **plataforma multiempresa**. Cada inquilino (tenant) es una razón social o grupo comercial que opera una o más sucursales, con su propio NIT emisor FEL, catálogo, kardex, cajas y usuarios.

### 1.1 Problemas que la arquitectura debe resolver

| Problema | Impacto en mostrador / negocio | Respuesta arquitectónica |
| --- | --- | --- |
| Catálogos de 20k–200k SKU (tornillería, eléctrico, plomería) | Búsqueda lenta mata la venta | Redis + índices `pg_trgm` / FTS; API de búsqueda dedicada; payload mínimo POS |
| Certificación FEL síncrona | Timeout de Infile/SAT congela la caja | Ticket interno inmediato + cola asíncrona (ver `02-integracion-infile-fel.md`) |
| Un solo almacén / una sola lista de precios | No refleja sucursales ni mayoreo | Multibodega, listas de precio y crédito por cliente |
| Datos mezclados entre ferreterías | Riesgo legal, churn, incidentes | `tenant_id` obligatorio + RLS PostgreSQL + JWT con claim de tenant |
| Monolito stateful | No escala ni se despliega sin downtime | API stateless, workers, contenedores, cache distribuida |

### 1.2 Límites del producto (qué es y qué no es)

**Es:** ERP ligero + POS + inventario + CxC + FEL para retail/distribución de ferretería en Guatemala (extensible a Centroamérica).  
**No es (Fase 1–3):** marketplace B2C, WMS robotizado, ni core bancario. La plataforma factura suscripciones (Fase 4); las ferreterías facturan a sus clientes vía Infile.

### 1.3 Atributos de calidad (NFR) — contratos no negociables

| ID | Atributo | Objetivo |
| --- | --- | --- |
| NFR-01 | Latencia POS | P95 búsqueda SKU ≤ 150 ms; P95 agregar línea ≤ 80 ms (región GT) |
| NFR-02 | Disponibilidad API | 99.9% mensual (excluye SAT/Infile) |
| NFR-03 | Aislamiento | Ninguna query de negocio sin predicado de tenant; evidencia en auditoría |
| NFR-04 | Consistencia stock | Kardex append-only; saldo derivado; no “update stock” a ciegas |
| NFR-05 | Resiliencia FEL | Venta nunca bloqueada > 2 s por certificador; reintento con backoff |
| NFR-06 | Costo | Costo variable ~ proporcional a tenants activos y transacciones, no a “una VM por ferretería” |
| NFR-07 | RPO / RTO | RPO ≤ 5 min (PITR); RTO ≤ 30 min para API crítica POS |
| NFR-08 | Seguridad | Secretos FEL cifrados por tenant; rotación de llaves; least privilege |

---

## 2. Estrategia de aislamiento de datos

### 2.1 Opciones evaluadas

| Modelo | Descripción | Pros | Contras |
| --- | --- | --- | --- |
| **A. DB compartida + `tenant_id` + RLS** | Un cluster PostgreSQL; todas las tablas de negocio llevan `tenant_id`; políticas RLS; pooling único | Costo bajo, migraciones simples, Redis/cache simples, analytics cross-tenant (SuperAdmin) con rol bypass controlado | Ruido de vecino si un tenant es enorme; disciplina estricta de queries; dump “por tenant” más elaborado |
| **B. Esquema por inquilino** (`tenant_abc.*`) | Un schema PostgreSQL por ferretería | Dump/restore por tenant fácil; menor riesgo de leak por olvido de `WHERE` | Migraciones N veces; connection storms; RLS no aplica igual; poolers (PgBouncer) se complican; costo operativo alto desde el tenant #50 |
| **C. Base de datos por inquilino** | Un database o cluster por cliente | Aislamiento máximo; compliance “data residency” extremo | Inviable para SMB ferretería; costo y ops explosivos |
| **D. Híbrido por plan** | Shared+RLS para planes Starter/Pro; schema o DB dedicada para Enterprise | Monetiza aislamiento | Dos caminos de código, dos pipelines de migración |

### 2.2 Decisión: Modelo A como estándar (shared + RLS), con escape hatch Enterprise

**Decisión arquitectónica DA-01:** *Shared database, shared schema, `tenant_id` UUID en todas las tablas de negocio, Row-Level Security en PostgreSQL, y pooling con `SET` / `set_config` del tenant en cada transacción.*

**Justificación (producto + costo + POS):**

1. **Segmento SMB:** decenas o cientos de ferreterías, no 5 holdings. El modelo C mata el margen SaaS.
2. **Mostrador:** un pool de conexiones caliente (PgBouncer transaction mode + API stateless) es más predecible que 200 schemas con 200 search_path.
3. **Catálogo Redis:** clave `t:{tenantId}:catalog:{sku}` es natural; schema-per-tenant no aporta a cache.
4. **FEL y workers:** jobs con `tenant_id` en el payload; un worker consume la cola de todos los inquilinos con fairness (ver §6.3).
5. **Fuga de datos:** RLS es la red de seguridad cuando un desarrollador olvida el filtro. No sustituye el filtro en aplicación; lo duplica.
6. **Enterprise:** si un grupo exige DB dedicada, se provisiona un **logical tenant shard** (misma app, distinto `DATABASE_URL` por `tenant_id` en el router de conexiones). El código no cambia: el `TenantContext` apunta a otro DSN.

**No se elige schema-per-tenant en el camino feliz** porque las migraciones de kardex/FEL (las más frecuentes en Fases 2–3) se volverían un riesgo de release.

### 2.3 Contrato de tenant en el modelo de datos

Toda tabla de negocio:

```sql
tenant_id UUID NOT NULL REFERENCES tenants(id)
```

Reglas:

- **Tablas de plataforma** (sin RLS de tenant, o RLS de “solo SuperAdmin”): `tenants`, `platform_users`, `subscriptions`, `plans`, `audit_platform`.
- **Tablas de inquilino** (RLS `tenant_id = current_setting('app.tenant_id')::uuid`): productos, stock, ventas, FEL, usuarios de ferretería, etc.
- **Prohibido** el valor sentinela `tenant_id = 0` o NULL. El SuperAdmin consulta con rol `platform_admin` que usa `BYPASSRLS` o políticas explícitas `USING (true)` **solo** en ese rol.
- Claves primarias: `id UUID` (evitar colisiones en sincronización offline/POS). Unicidad de negocio: `(tenant_id, sku)`, `(tenant_id, nit)`, etc.

### 2.4 Row-Level Security — patrón canónico

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY; -- aplica también al owner de la tabla

CREATE POLICY products_tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

En cada request HTTP:

1. Resolver tenant (subdominio / header / claim JWT).
2. Autenticar usuario y verificar `user.tenant_id == resolved_tenant` (salvo SuperAdmin).
3. Abrir transacción: `SELECT set_config('app.tenant_id', $1, true);` (tercer parámetro `true` = local a la transacción).
4. Ejecutar queries. Nunca reutilizar una conexión con `app.tenant_id` de otro request sin reset (PgBouncer transaction pooling + `DISCARD ALL` / reset query).

**Amenaza a mitigar:** *session pooling* que deja `app.tenant_id` sucio. Mitigación: **transaction pooling** + `SET` local + test de integración que falla el CI si una prueba cruza tenants.

### 2.5 Resolución de tenant (identificación)

Orden de precedencia (debe ser idéntico en API, WS y workers):

1. **Claim JWT** `tid` (fuente de verdad post-login).
2. **Host:** `{slug}.app.example.com` o path `/t/{slug}/` (POS embebido).
3. **Header** `X-Tenant-Slug` o `X-Tenant-Id` — solo para apps nativas/POS kiosko detrás de mTLS o API key de sucursal; **nunca** como único factor en el browser público.

Login: el usuario se autentica contra `users` filtrado por tenant resuelto. Un email puede existir en varios tenants (contador que atiende 3 ferreterías): el login pide tenant (selector) o usa subdominio.

### 2.6 Sharding futuro (sin reescribir el dominio)

Cuando un nodo PostgreSQL deje de cumplir NFR-01:

- Shard por **hash de `tenant_id`** (N shards).
- El API Gateway / Tenant Router resuelve `tenant_id → shard DSN` (cache Redis).
- **No** shard por sucursal: las consultas de “stock consolidado del tenant” cruzarían shards.

---

## 3. Arquitectura lógica (clean / hexagonal)

```
┌─────────────────────────────────────────────────────────────────┐
│  Clientes: POS Web (atajos F2/F4/Esc) │ Backoffice │ SuperAdmin │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS + JWT
┌───────────────────────────────▼─────────────────────────────────┐
│  API Gateway / BFF  (rate limit, tenant resolve, WAF)           │
└───────────────────────────────┬─────────────────────────────────┘
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ POS Command   │     │ Query/Read      │     │ Platform Admin   │
│ API (write)   │     │ API (search)    │     │ API              │
└───────┬───────┘     └────────┬────────┘     └────────┬─────────┘
        │                      │                       │
        │              ┌───────▼────────┐              │
        │              │ Redis (catalog,│              │
        │              │ sessions, locks│              │
        │              └───────▲────────┘              │
        ▼                      │                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Domain: Sales │ Inventory │ Cash │ Credit │ Billing (ports)     │
│ Persistence: PostgreSQL + RLS                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ outbox / queue
                    ┌───────────▼───────────┐
                    │ Workers: FEL Infile   │
                    │ Stock projection      │
                    │ Notifications         │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │ BillingProvider (Infile)
                    │ Object storage (XML/PDF)
                    └───────────────────────┘
```

### 3.1 Capas (obligatorias en Fase 1)

| Capa | Responsabilidad | Prohibiciones |
| --- | --- | --- |
| **Interface** (HTTP, jobs) | Auth, DTO, status codes | SQL, llamadas Infile directas |
| **Application** | Casos de uso (`CheckoutSale`, `ReceivePurchase`) | Framework HTTP |
| **Domain** | Entidades, invariantes (stock ≥ 0 en unidad base, límite de crédito) | I/O |
| **Infrastructure** | Postgres, Redis, Infile, S3, mail | Reglas de IVA “a ojo” (van al domain/billing) |

El adaptador FEL implementa `BillingProviderInterface` (documento 02). El dominio emite `SaleCompleted`; el worker certifica.

### 3.2 CQRS ligero (no event sourcing completo)

- **Writes** POS: comandos transaccionales cortos (insert sale + details + kardex + cash movement).
- **Reads** catálogo: réplica o mismas tablas + Redis. Búsqueda **no** pasa por el agregado de venta.
- Kardex es **log de hechos**; el saldo es proyección (`inventory_balances`) actualizada en la misma transacción o vía worker idempotente.

---

## 4. Autenticación, sesiones y RBAC

### 4.1 Identidades

| Actor | Ámbito | Autenticación | Notas |
| --- | --- | --- | --- |
| **SuperAdmin de plataforma** | Todos los tenants (ops) | Usuario `platform_users`; MFA obligatorio | Impersonación con ticket de tiempo limitado + audit log |
| **Administrador de ferretería** | Un tenant | Email + password + MFA recomendado | Configura sucursales, FEL, usuarios, listas de precio |
| **Cajero POS** | Tenant + sucursal + caja | PIN de 4–6 dígitos **además** de sesión de dispositivo, o usuario+PIN | PIN solo válido con `device_id` enrolado |
| **Bodeguero / Kardex** | Tenant + almacenes asignados | Usuario+password | No cierra caja; no certifica FEL de venta mostrador |
| **Contador** | Tenant (lectura amplia, escritura fiscal limitada) | Usuario+password + MFA | Notas de crédito, anulación FEL, reportes IVA |

### 4.2 Sesiones (diseño para POS)

- API **stateless**: Access JWT 15 min + Refresh 8–12 h (turno de caja) en HttpOnly Secure cookie (web) o storage cifrado (app caja).
- Claim mínimo: `sub`, `tid` (tenant), `bid` (branch por defecto), `roles[]`, `jti`.
- **Sesión de caja** es un agregado distinto (`cash_registers` / `cash_shifts`): no se confunde con la sesión IAM. Un cajero autenticado **no** vende hasta `OpenShift`.
- Revocación: denylist de `jti` en Redis (logout, despido, robo de token).
- POS kiosko: **device credentials** (rotación) + usuario cajero. El dispositivo no hereda rol Administrador.

### 4.3 Autorización granular (RBAC + permisos)

Roles son **paquetes de permisos**, no `if role == cajero` en el código.

Permisos ilustrativos (catálogo versionado):

| Permiso | SuperAdmin | Admin ferretería | Cajero | Bodeguero | Contador |
| --- | --- | --- | --- | --- | --- |
| `platform.tenants.manage` | ✓ | | | | |
| `pos.sale.create` | | ✓ | ✓ | | |
| `pos.price.override` | | ✓ | opcional | | |
| `pos.shift.open_close` | | ✓ | ✓ | | |
| `inventory.adjust` | | ✓ | | ✓ | |
| `inventory.transfer` | | ✓ | | ✓ | |
| `billing.fel.issue` | | ✓ | ✓ (automático) | | ✓ |
| `billing.fel.void` | | ✓ | | | ✓ |
| `credit.account.manage` | | ✓ | consulta límite | | ✓ |
| `reports.fiscal.read` | | ✓ | | | ✓ |
| `users.manage` | | ✓ | | | |

**Regla de sucursal:** permisos pueden scoparse `ALL_BRANCHES` vs `assigned_branch_ids`. El cajero de sucursal A no abre la caja de B.

### 4.4 Flujo de login multi-tenant

```
1. Usuario abre https://ferrelaguna.app.example.com/pos
2. Gateway extrae slug "ferrelaguna" → tenants.slug (activo, no suspendido)
3. POST /auth/login { email, password }  (tenant ya en contexto)
4. Si MFA → challenge
5. Emite JWT con tid; set_config en requests siguientes
6. POS carga shift abierta o fuerza F-key de apertura de caja
```

Contador multi-ferretería: `GET /auth/tenants` (lista por membership) → elige → token con ese `tid`.

---

## 5. Diseño cloud-native

### 5.1 Contenedores y topología

Servicios (cada uno imagen Docker, healthcheck `/health/live` y `/health/ready`):

| Servicio | Escalado | Estado |
| --- | --- | --- |
| `api` | HPA por CPU/RPS | Stateless |
| `worker-fel` | Cola profundidad | Stateless (idempotencia por `sale_id`) |
| `worker-generic` | Cola | Reportes, email, rebuild de proyección |
| `redis` | Primario + réplica | Sesiones cortas, catálogo, locks, rate limit |
| `postgres` | Primario + réplica lectura | Fuente de verdad |
| `object-store` | Gestionado (S3 compatible) | XML DTE, PDF, logos |

Orquestación: Kubernetes (producción) o Compose (dev). **Doce factores:** config por env; secretos en vault (no `.env` en imagen).

### 5.2 API stateless

- Ningún archivo local de turno, ningún `static Dictionary` de stock.
- Idempotencia HTTP: header `Idempotency-Key` en `POST /sales` (reintento de red del POS no duplica venta).
- Affinity de sesión **no requerida**. WebSockets de “alerta de stock” van a Redis pub/sub.

### 5.3 Redis — catálogo rápido en POS

Estrategia de cache (write-through / invalidation):

| Clave | TTL | Contenido | Invalidación |
| --- | --- | --- | --- |
| `t:{tid}:sku:{code}` | 15 min | Precio listas, stock sucursal, unidad, impuestos | Update producto, kardex sucursal |
| `t:{tid}:search:{norm}` | 60 s | Top 20 hits | Barata; miss va a Postgres `pg_trgm` |
| `t:{tid}:b:{bid}:hot` | 5 min | Top 500 SKU vendidos 30 días (warm) | Job nocturno + touch en venta |
| `lock:sale:{tid}:{idem}` | 30 s | Lock idempotente | TTL |
| `shift:{id}:totals` | turno | Totales de caja en memoria de trabajo | Cierre Z persiste a PG |

Búsqueda: Postgres es autoridad; Redis es acelerador. El POS tolera stock **eventualmente** desfasado 1–2 s; el **commit** de venta relee saldo con `SELECT … FOR UPDATE` del balance de la sucursal o usa constraint de no negativo.

### 5.4 Workers y tareas asíncronas

| Cola | Job | SLA | Backoff |
| --- | --- | --- | --- |
| `fel.certify` | Certificar DTE Infile | P95 < 15 s cuando SAT OK | Exponencial 2s→5m, max 24 h luego `needs_manual` |
| `fel.void` | Anulación | < 30 s | Igual |
| `stock.project` | Reconstruir balance si drift | Noche / on-demand | — |
| `notify.reorder` | Alertas punto de reorden | 15 min | — |
| `media.render` | PDF/QR FEL | Tras certify OK | 3 reintentos |

**Outbox pattern:** el commit de la venta inserta `outbox_events` en la misma transacción. Un publicador mueve a Redis/Rabbit/SQS. Evita “vendí pero no encolé FEL”.

### 5.5 Observabilidad

- TraceId en POS (visible en ticket interno para soporte).
- Métricas: `pos_search_ms`, `sale_commit_ms`, `fel_queue_age_seconds`, `fel_success_ratio`, `rls_policy_violations` (debe ser 0).
- Logs con `tenant_id` y **sin** XML completo ni llaves FEL.

---

## 6. Seguridad y cumplimiento (plataforma)

### 6.1 Secretos FEL por tenant

- Campos cifrados (AES-256-GCM) con **DEK por tenant** envuelta por KEK en KMS/Vault.
- Rotación de DEK sin recertificar histórico (el XML ya guardado no se re-firma).
- Acceso a DEK: solo `worker-fel` y job de rotación. El proceso `api` **no** lee la llave de firma en memoria salvo que se unifique por error — preferir que solo el worker posea el unwrap.

Detalle de credenciales Infile: documento 02.

### 6.2 Multi-tenant en objetos

Prefijo S3: `s3://fel/{tenant_id}/{year}/{uuid}.xml`. Políticas IAM que impiden listar el bucket completo desde la API pública.

### 6.3 Fairness y noisy neighbor

- Rate limit por `tid`: ráfagas POS altas, tope de exportaciones masivas.
- Cola FEL con **fair queuing** (token por tenant) para que un mayorista no retrase a 50 ferreterías chicas.
- Cuotas de plan (Fase 4): sucursales, usuarios, DTE/mes.

---

## 7. Experiencia de mostrador (implicaciones de arquitectura)

El POS no espera a SAT. Contrato UX/técnico:

1. Cajero cierra venta (F4).  
2. API persiste venta `status=confirmed`, kardex, caja; emite ticket **interno** (número de sucursal, no UUID FEL).  
3. UI muestra “Certificando FEL…” no bloqueante; reimpresión cuando llegue UUID.  
4. Si crédito: se valida límite **síncrono** (es invariante de negocio, no I/O externo).  
5. Atajos F2/F4/Esc se implementan en cliente; la API expone comandos idempotentes, no pantallas.

Ver módulos en `03-especificaciones-modulos.md`.

---

## 8. Stack de referencia (opinión de arquitectura)

No es dogma de marca; es el conjunto que cumple NFR con equipo pequeño:

| Pieza | Elección de referencia | Alternativa aceptable |
| --- | --- | --- |
| Lenguaje API | C# (.NET 8+) o Node/Nest o Java | El que el equipo ya opera; **una** API |
| DB | PostgreSQL 16+ | — |
| Cache / cola ligera | Redis 7 | Redis + SQS si cloud AWS |
| App server | Kestrel / Node cluster | — |
| Reverse proxy | Traefik / Nginx / Cloud LB | — |
| Observabilidad | OpenTelemetry + Grafana | — |

El repositorio actual no impone stack. La documentación de datos asume **PostgreSQL** (RLS, `pg_trgm`, UUID).

---

## 9. Decisiones registradas (ADR resumidos)

| ID | Decisión | Estado |
| --- | --- | --- |
| DA-01 | Shared schema + `tenant_id` + RLS | Aprobado |
| DA-02 | JWT stateless + shift de caja como agregado aparte | Aprobado |
| DA-03 | Certificación FEL asíncrona; ticket interno síncrono | Aprobado |
| DA-04 | Kardex append-only; saldo proyectado | Aprobado |
| DA-05 | `BillingProviderInterface`; Infile primer proveedor | Aprobado |
| DA-06 | Shard por tenant solo si el primario no cumple NFR-01 | Diferido |
| DA-07 | Schema-per-tenant no es el default | Rechazado como default |

---

## 10. Riesgos y mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- |
| Bug sin filtro tenant | Media | Crítico | RLS `FORCE`, tests de aislamiento en CI, codeowners |
| Caída Infile/SAT | Alta (eventual) | Alto en fiscal, bajo en fila | Cola, ticket interno, panel de DTE pendientes |
| Drift de stock Redis vs PG | Media | Medio | Commit siempre contra PG; Redis best-effort |
| PIN cajero débil | Alta | Medio | Device binding, lockout, no PIN en admin |
| Vacío de código actual | Cierto | Medio | Este paquete `docs/architecture-saas` es el contrato; no hay deuda oculta que mapear |

---

## 11. Relación con el resto del paquete

| Documento | Contenido |
| --- | --- |
| [02-integracion-infile-fel.md](./02-integracion-infile-fel.md) | Adaptador Infile, payload DTE, contingencia, secretos |
| [03-especificaciones-modulos.md](./03-especificaciones-modulos.md) | Inventario, POS, precios, cotizaciones, caja, CxC |
| [04-modelo-datos.md](./04-modelo-datos.md) | ER Mermaid, tablas, índices `pg_trgm` |
| [05-roadmap-fases.md](./05-roadmap-fases.md) | Fases 1–4 de implementación |

---

*Documento 1/5 — Arquitectura SaaS multi-tenant. Versión 1.0 — 20 de septiembre de 2026.*
