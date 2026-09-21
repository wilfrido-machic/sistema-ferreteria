# 02 — Módulo de Facturación Electrónica FEL (Infile)

**Régimen:** Factura Electrónica en Línea (FEL) — SAT Guatemala  
**Certificador de referencia:** Infile S.A. (API REST feel.com.gt)  
**Principio de producto:** la fila del mostrador no espera a SAT. La venta es un hecho comercial interno inmediato; el DTE es un hecho fiscal asíncrono con conciliación.

Fuentes normativas de diseño: [Documentación técnica FEL SAT](https://portal.sat.gob.gt/portal/documentacion-tecnica-del-regimen-fel/), proceso general FEL, reglas y validaciones SAT, y contrato de consumo Infile (firma XML + certificación v2 + anulación v2 + proceso unificado).

---

## 1. Objetivos del módulo

1. Emitir DTE válidos: Factura (`FACT`), Factura especial (`FESP`), Nota de crédito (`NCRE`), Nota de débito (`NDEB` si el tenant la usa), Anulación.
2. Desacoplar el dominio de ventas del certificador concreto (`BillingProviderInterface`).
3. No bloquear POS: ticket interno en < 2 s; UUID/serie/número cuando Infile responda.
4. Guardar XML certificado, representación gráfica (PDF + QR) y trazas de error SAT/certificador.
5. Cifrar credenciales FEL **por tenant** (y por establecimiento si Infile lo exige).

---

## 2. Capa de abstracción (`BillingProviderInterface`)

El dominio nunca importa URLs de Infile. El puerto vive en Domain/Application; el adaptador en Infrastructure.

### 2.1 Contrato (lenguaje-agnóstico)

```csharp
public interface IBillingProvider
{
    string ProviderCode { get; } // "INFILE"

    Task<NitLookupResult> LookupReceiverAsync(
        TenantId tenantId, string nit, CancellationToken ct);

    Task<CertificationResult> CertifyAsync(
        CertificationRequest request, CancellationToken ct);

    Task<VoidResult> VoidAsync(
        VoidRequest request, CancellationToken ct);

    Task<DocumentStatus> GetStatusAsync(
        TenantId tenantId, string providerDocumentId, CancellationToken ct);
}
```

`CertificationRequest` es **ya el DTE canónico interno**, no el JSON de Infile:

- `IssuerProfile` (NIT, nombre, código establecimiento SAT, departamento/municipio, frases)
- `Receiver` (NIT o CF, nombre, correo)
- `DocumentType` (`FACT | FESP | NCRE | NDEB | …`)
- `Lines[]` (bien/servicio, cantidades en unidad comercial, montos gravados)
- `Totals` (IVA 12%, descuentos, total)
- `References[]` (obligatorio en NCRE: UUID y fechas del DTE origen)
- `IdempotencyKey` (UUID de `electronic_invoices.id` o `sales.id`)
- `CopyEmail`

### 2.2 Adaptadores

| Adaptador | Uso |
| --- | --- |
| `InfileBillingProvider` | Producción y homologación (mismas URLs Infile; credenciales de prueba vs productivas) |
| `FakeBillingProvider` | CI y demo: genera UUID falso, XML mínimo, no red |
| `RecordingBillingProvider` | Staging: proxy que graba request/response sin llaves |

Intercambio futuro (Digifact, otro certificador SAT): nuevo adaptador, **mismo** XML de negocio generado por `DteXmlBuilder` alineado a XSD SAT. Si un certificador exige XML distinto, el builder sigue siendo SAT-XSD; el adaptador solo firma/transporta.

### 2.3 Responsabilidades internas (pipeline)

```
SaleConfirmed
    → FiscalMapper (venta → DteDraft)
    → TaxEngine (IVA 12%, frases, CF vs NIT)
    → DteXmlBuilder (XSD SAT)
    → Outbox fel.certify
    → InfileBillingProvider
         A) Proceso unificado: POST .../procesounificado/transaccion/v2/xml
         B) Flujo partido: firmar + certificar v2
    → Persist UUID, serie, numero, XML, PDF
    → Notificar POS (websocket / poll)
```

**Recomendación:** usar **proceso unificado** Infile en el camino feliz (menos round-trips). Mantener flujo partido como fallback si el unificado falla con error de transporte (no con error de validación SAT).

---

## 3. Endpoints Infile (referencia de implementación)

Homologación y producción Infile **comparten host**; el aislamiento es por credenciales del emisor.

| Propósito | Método | URL |
| --- | --- | --- |
| Firma XML | POST | `https://signer-emisores.feel.com.gt/sign_solicitud_firmas/firma_xml` |
| Certificar DTE | POST | `https://certificador.feel.com.gt/fel/certificacion/v2/dte/` |
| Anular DTE | POST | `https://certificador.feel.com.gt/fel/anulacion/v2/dte/` |
| Unificado firma+certifica | POST | `https://certificador.feel.com.gt/fel/procesounificado/transaccion/v2/xml` |
| Consulta NIT receptor | POST | `https://consultareceptores.feel.com.gt/rest/action` |

### 3.1 Headers de certificación

- `usuario` — Usuario API Infile  
- `llave` — Llave API  
- `identificador` — **clave de idempotencia** (usar `electronic_invoices.id` o hash estable `tid+saleId+intent`)  
- `Content-Type: application/json`

Cuerpo típico certificación:

```json
{
  "nit_emisor": "12345678",
  "correo_copia": "facturacion@ferreteria.com",
  "xml_dte": "<Base64 del XML firmado>"
}
```

Firma (flujo partido): `llave`, `archivo` (XML base64), `codigo`, `alias`, `es_anulacion`.

### 3.2 Credenciales por tenant (nunca env global único)

| Campo persistido (cifrado) | Uso |
| --- | --- |
| `sign_user` / alias | UsuarioFirma |
| `sign_key` | LlaveFirma / token signer |
| `api_user` | UsuarioApi (suele coincidir con sign_user) |
| `api_key` | Llave API certificador |
| `issuer_nit` | NIT emisor (debe coincidir con XML) |
| `establishment_code` | Código establecimiento SAT (sucursal) |
| `copy_email` | Correo copia DTE |

Almacén: `tenant_fel_credentials` + opcional override `branch_fel_credentials` si cada sucursal es establecimiento FEL distinto (caso frecuente: casa matriz + sucursal con código 1, 2, …).

Cifrado: DEK por tenant, KEK en KMS (ver DA en documento 01). Auditoría de unwrap (quién/qué pod usó la llave).

---

## 4. Mapeo venta → DTE

### 4.1 Emisor

Desde `tenants` + `branches` + perfil fiscal:

| XML / casilla SAT (conceptual) | Origen |
| --- | --- |
| NIT emisor | `tenants.tax_id` (sin guiones, dígito verificador según reglas SAT) |
| Nombre comercial / razón social | `tenants.legal_name` / `trade_name` |
| Código establecimiento | `branches.sat_establishment_code` |
| Dirección, depto, municipio | `branches.address_*` |
| Afiliación IVA | `tenants.iva_affiliation` (general, pequeño contribuyente, etc.) |
| Frases | Tabla `tax_phrases` por régimen y tipo DTE |

### 4.2 Receptor

| Escenario mostrador | Receptor FEL |
| --- | --- |
| Cliente pide factura con NIT | Consulta Infile RTU → nombre oficial; guardar en `customers` |
| Consumidor final | NIT especial **CF** según reglas vigentes SAT / Infile; nombre “Consumidor Final”; respetar **techo de monto** para CF (validar en TaxEngine; si excede, forzar NIT) |
| Cliente crédito con NIT | Igual que factura NIT; `customers.nit` obligatorio para crédito fiscal útil |

El POS puede cachear últimos NIT (Redis) pero **una** consulta RTU al certificar reduce rechazos por nombre distinto al padrón.

### 4.3 Ítems e IVA 12%

En Guatemala el precio de góndola suele ser **IVA incluido**. El motor fiscal:

1. Precio línea (después de descuento) = total con IVA.  
2. Base = total / 1.12 (régimen general IVA 12%).  
3. Monto IVA = total − base.  
4. Redondeo: **una sola política** (decimal SAT, tipicamente 2 decimales por impuesto y por línea, ajuste de redondeo en última línea o en totales según reglas y validaciones vigentes).  
5. Bien vs Servicio: ferretería casi siempre `B` (bien); servicios de corte/instalación pueden ser `S` — afecta frases y reportes, no el POS.

Campos por línea:

| Campo interno | DTE |
| --- | --- |
| `sku` / descripción | `BienOServicio`, descripción |
| `qty` en unidad comercial | cantidad |
| `unit.code` | unidad de medida (catálogo interno mapeado a unidad SAT si aplica) |
| `taxable_amount` | gravable |
| `vat_amount` | impuesto IVA |
| `discount` | descuento línea (el total SAT es precio − descuento) |

### 4.4 Totales

`GranTotal` = suma líneas. Impuestos consolidados en `TotalImpuestos`. Descuentos globales del POS se prorratean a líneas **antes** de armar XML (SAT es estricto con coherencia de casillas).

### 4.5 Frases tributarias

No hardcodear en el POS. Catálogo `tax_phrases (tenant_id, iva_regime, dte_type, phrase_type, scene, text)`.

Ejemplos de grupos (el texto legal exacto se carga desde configuración homologada, no desde este markdown):

- Sujeto a pagos: frases de agente retenedor ISR/IVA cuando el emisor aplica.  
- Emisor no agente: frases tipo 4 / no afecto según el caso.  
- Pequeño contribuyente: tipo DTE `FPEQ` y frases asociadas — **solo** si el tenant está en ese régimen.

El Administrador elige régimen al onboarding; el TaxEngine selecciona el set. Un error de frase = rechazo certificador: tratar como **error de configuración**, no reintento infinito.

### 4.6 Tipos DTE en ferretería

| Código | Cuándo lo dispara el sistema |
| --- | --- |
| `FACT` | Venta mostrador / mayoreo estándar |
| `FESP` | Factura especial (escenarios de compra a no contribuyentes / reglas SAT de FESP — módulo de compras, no POS típico) |
| `NCRE` | Devolución o descuento posterior; referencia al UUID de la `FACT` original |
| Anulación | Error de emisión mismo día / plazos SAT; no sustituye NCRE cuando ya hay crédito fiscal del cliente |

**Regla de producto:** si el cliente se llevó mercancía y hay devolución parcial → **NCRE**, no anulación. Anulación: duplicado, NIT mal digitado detectado inmediatamente, venta no entregada.

---

## 5. Contingencia y resiliencia

### 5.1 Estados de `electronic_invoices`

```
draft → queued → certifying → certified
                      ↘ retry_wait → certifying …
                      ↘ rejected_fiscal (no retry automático)
                      ↘ failed_transport (retry)
                      ↘ needs_manual
certified → void_requested → voided
```

### 5.2 Cola y backoff

- Publicación **outbox** atómica con la venta.  
- Worker: timeout HTTP 20–30 s.  
- Backoff exponencial con jitter: 2s, 5s, 15s, 60s, 5min, 15min, 1h… tope 24 h.  
- **Retry automático** solo si: 5xx, timeout, conexión, “SAT no disponible”.  
- **No retry** si: validación 4xx de esquema, NIT emisor inválido, frase incorrecta, XML mal formado, “DTE ya certificado con este identificador” → **recuperar** el DTE existente (idempotencia), no reenviar otro XML.

Fairness: un tenant no puede saturar el worker (leaky bucket por `tid`).

### 5.3 Ticket interno (no bloquear mostrador)

Al `POST /sales`:

1. Persistir `sales` + `sale_details` + kardex + movimiento de caja.  
2. `sales.fiscal_status = pending_fel`.  
3. Imprimir **ticket de control interno**: sucursal, correlativo interno, fecha, ítems, total, leyenda *“Documento interno — Factura electrónica en proceso de certificación”*.  
4. Responder al POS en P95 < 2 s.  
5. Cuando `certified`: segunda impresión o reimpresión térmica con serie, número, UUID, QR; o envío de PDF por correo/WhatsApp.

Configuración por tenant: `fel_mode = async` (default POS) | `sync_wait` (máx 8 s, solo backoffice o mayoristas que exigen UUID en el acto).

### 5.4 Conservación XML/PDF/QR

Tras certificación exitosa Infile/SAT:

| Artefacto | Almacenamiento |
| --- | --- |
| UUID, serie, número autorización, fecha certificación | columnas en `electronic_invoices` |
| XML certificado (firmas emisor+certificador) | object storage + `xml_url` |
| PDF representación gráfica + QR (UUID / URL consulta SAT) | `pdf_url` |
| Payload crudo respuesta | `sat_response` JSONB (sin secretos) |

Retención: cumplir conservación electrónica exigida a emisores FEL (años según ley vigente); lifecycle S3 (hot 90 días, cold después). El tenant descarga desde backoffice; el POS solo necesita PDF corto o QR.

### 5.5 Idempotencia y duplicados

- `Idempotency-Key` del POS = `sale_id`.  
- Header Infile `identificador` = mismo UUID.  
- Unique index `(tenant_id, sale_id, dte_type, purpose)` donde `purpose=issue`.  
- Si el cajero reintenta F4: la API devuelve la venta ya creada, no un segundo DTE.

### 5.6 Modo degradado (certificador caído horas)

- Seguir vendiendo con ticket interno.  
- Banner en POS: “FEL diferido — N documentos en cola”.  
- Tope opcional de plan: si cola > N o edad > T, **avisar** al admin; no apagar el POS salvo decisión explícita del tenant (compliance `block_pos_if_fel_lag`).  
- Playbook: no “inventar” serie SAT local. El número fiscal **solo** lo asigna la certificación.

---

## 6. Anulaciones y notas de crédito

| Operación | Precondiciones | Provider |
| --- | --- | --- |
| Anulación | DTE certificado; plazo y motivo SAT; documento no usado en formas que lo impidan | `VoidAsync` → API anulación Infile (XML de anulación firmado) |
| NCRE | DTE origen certificado; montos ≤ original; ítems coherentes | `CertifyAsync` tipo `NCRE` + complemento de referencias |

El POS “F5 devolución” crea `sales` tipo `return` + job NCRE. Stock reingresa **al confirmar** la devolución interna; el NCRE puede ir atrasado igual que la FACT.

---

## 7. Seguridad

- TLS solo; certificate pinning opcional en worker.  
- Secretos fuera de logs; redactar `llave` en tracing.  
- Separación de privilegios: cajero emite FACT; contador/admin anula.  
- Impersonación SuperAdmin **no** usa llaves FEL del tenant salvo break-glass auditado.

---

## 8. Homologación vs producción

| Ambiente | Qué cambia | Qué no cambia |
| --- | --- | --- |
| Pruebas Infile | Credenciales de laboratorio, NIT de prueba | URLs (según guía Infile vigente) |
| Producción | Credenciales reales, establecimiento activo SAT | Código del adaptador |

Checklist go-live tenant:

1. NIT activo, establecimiento, afiliación IVA, no omiso.  
2. Casos de prueba SAT/certificador: FACT NIT, FACT CF, descuento, NCRE, anulación.  
3. Frases revisadas por contador.  
4. PDF con QR verificable.  
5. `FakeBillingProvider` apagado.

---

## 9. Criterios de aceptación (QA)

- Venta POS OK con Infile en timeout simulado: ticket interno + job `retry_wait`.  
- Mismo `identificador` no crea dos UUID.  
- CF sobre el umbral: API 422, no XML inválido.  
- NCRE sin UUID origen: rechazado en dominio.  
- Credenciales en DB no legibles en claro (prueba de dump).  
- Aislamiento: tenant A no certifica con llave de B.

---

*Documento 2/5 — Integración FEL Infile. Versión 1.0 — 20 de septiembre de 2026.*
