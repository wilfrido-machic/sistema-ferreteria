# 03 — Evolución operativa de módulos core

**Alcance:** inventario/kardex, POS, precios, cotizaciones, caja y cuentas por cobrar.  
**Base de análisis:** el repositorio de aplicación está vacío; se especifican módulos **canónicos de un SIG de ferretería** (mostrador, bodega, crédito a instaladores) alineados a la arquitectura del documento 01. Cuando exista código legado, este archivo es el backlog de *gap analysis*.

---

## 1. Inventario y Kardex

### 1.1 Multialmacén / multibodega por sucursal

**Modelo:** `tenant → branches → warehouses`. Una sucursal tiene al menos un almacén `POS` (piso de venta) y puede tener `BODEGA`, `TRANSITO`, `GARANTIA`.

Reglas:

- Toda existencia vive en `(tenant_id, warehouse_id, product_id, lot_id?)`.  
- El POS de una sucursal descuenta por defecto el almacén `is_sellable = true` de esa sucursal.  
- Traslado `warehouse A → B`: dos líneas de kardex (`TRANSFER_OUT`, `TRANSFER_IN`) con el mismo `transfer_id`; el stock en tránsito es un almacén o un estado, no un “limbo” numérico.  
- Conteo físico: documento de ajuste con motivo y usuario bodeguero; nunca edición directa del saldo.

**UX bodega:** pistola / código de barras; filtro por sucursal; no mostrar costos al cajero.

### 1.2 Unidades de medida fraccionadas (crítico ferretería)

La unidad **canónica de stock** es la `base_unit` del producto (p. ej. metro, libra, galón, unidad). Las unidades de venta son conversiones exactas.

Ejemplos de negocio:

| Producto | Base | Venta POS | Factor a base |
| --- | --- | --- | --- |
| Manguera PVC | metro | metro | 1 |
| Manguera rollo 50 m | metro | rollo | 50 |
| Alambre | libra | libra / quintal | 1 / 100 |
| Tela metálica | yarda | yarda / pliego (si pliego definido) | catálogo |
| Thinner | galón | galón / litro | 1 / 0.264… **solo si el tenant define el factor** |
| Tornillo | unidad | unidad / caja 100 | 1 / 100 |
| Lámina | pliego | pliego | 1 |

**Invariantes:**

- Kardex **siempre** en unidad base (decimal `numeric(18,6)`).  
- El cajero elige unidad comercial; el sistema convierte.  
- **Prohibido** mezclar factores mágicos en el cliente POS: `product_units` es la fuente.  
- Precio puede estar definido por unidad comercial (precio/metro ≠ precio/rollo).  
- Cortes (metro 3.40 de un rollo): permite `qty` decimal; política `allow_fractional` por producto.  
- Quintal = 100 lb **si** el tenant usa convención guatemalteca; factor editable, no hardcode universal.

Tabla `product_units`: `product_id`, `unit_code`, `to_base_factor`, `is_default_pos`, `barcode` opcional (el código de barras de la caja no es el de la unidad suelta).

### 1.3 Stock de seguridad, reorden y proveedores

Por `(product_id, warehouse_id)`:

| Parámetro | Uso |
| --- | --- |
| `min_qty` (seguridad) | Alerta roja; no necesariamente bloquea venta |
| `reorder_point` | Dispara sugerido de compra |
| `reorder_qty` / `max_qty` | Cantidad sugerida / no sobre-stock |
| `lead_time_days` | Cálculo simple: demanda media × lead time |

Job `notify.reorder` (cada 15 min o nocturno):

- Productos bajo punto de reorden.  
- Agrupación por **proveedor preferido** (`product_suppliers.is_preferred`).  
- Salida: borrador de OC o lista “a pedir” para el admin (Fase 3: OC completa).

No se auto-compra sin confirmación humana en ferretería SMB.

### 1.4 Kardex (libro de movimientos)

Cada movimiento:

`id, tenant_id, warehouse_id, product_id, qty_base (+/-), unit_cost, reason, ref_type, ref_id, user_id, occurred_at`

Reasons: `SALE`, `SALE_RETURN`, `PURCHASE`, `ADJUSTMENT`, `TRANSFER_IN/OUT`, `PRODUCTION_SPLIT` (corte que genera merma).

Saldo: tabla `inventory_balances` actualizada **en la misma transacción** que el insert del kardex (`qty = qty + delta` con `CHECK (qty >= 0)` salvo almacenes que permitan negativo controlado).

Costo: promedio ponderado por almacén (default ferretería) o PEPS opcional Fase 3+.

---

## 2. Punto de venta (POS)

### 2.1 Atajos de teclado (no negociable)

El valor del producto en mostrador es velocidad. El POS web debe funcionar **sin mouse** en el camino feliz.

| Tecla | Acción |
| --- | --- |
| **F2** | Foco a búsqueda de producto / código de barras |
| **F4** | Cobrar / confirmar venta (abre panel de pago) |
| **Esc** | Cancelar línea, cerrar modal, o abortar cobro (con confirmación si hay total > 0) |
| Enter | Agregar hit único de búsqueda |
| F3 (recomendado) | Cambiar lista de precios / tipo cliente |
| F6 | Datos receptor FEL (NIT / CF) |
| F8 | Suspender / recuperar venta |
| F9 | Apertura/cierre de turno (según permiso) |
| F10 | Reimprimir último ticket |

Focus trap en modales; no usar F5 (recarga browser) — interceptar y mapear a “devolución” solo si se documenta al cajero. Preferir F7 devolución para no chocar con refresh.

Rendimiento: cada tecla de búsqueda dispara debounce 80–120 ms contra `GET /catalog/search` (Redis + `pg_trgm`).

### 2.2 Listas de precios

Tres listas estándar (nombres configurables):

1. **Público** (mostrador).  
2. **Mayoreo** (umbral de cantidad o cliente marcado).  
3. **Instalador / contratista** (cuenta de confianza).

Resolución de precio:

```
precio = lista del cliente (si tiene)
        else lista elegida en el ticket (F3)
        else público
then aplicar escala por volumen (product_price_breaks)
then descuento línea si permiso pos.price.override
```

Mayoreo por volumen: `product_price_breaks (product_id, price_list_id, min_qty_base, unit_price)`. Ejemplo: 1–11 unidades público, ≥12 mayoreo.

El precio mostrado **incluye IVA** por defecto (configurable `prices_are_vat_inclusive = true` para GT).

### 2.3 Cotizaciones → venta en un clic

`quotes` no mueve stock. Estados: `draft`, `sent`, `accepted`, `expired`, `converted`, `void`.

**Convertir a venta:**

1. Botón único en POS/backoffice.  
2. Recalcular precios y stock **al convertir** (alerta si precio cambió o no hay existencia).  
3. Copia líneas a `sales` + `sale_details`; `quotes.converted_sale_id`.  
4. TTL de cotización (p. ej. 7–15 días) configurable.

Atajo: desde POS, F2 también busca cotizaciones por número si el prefijo es `COT-`.

### 2.4 Caja chica, turno y cierre Z

Agregados:

- `cash_registers` — dispositivo/caja física por sucursal.  
- `cash_shifts` — turno (apertura → operaciones → cierre).  
- `cash_movements` — ventas efectivo, gastos, retiros, depósitos, fondo.

Flujo:

1. **Apertura:** monto fondo (declarado).  
2. **Entradas/salidas:** retiro a bóveda, gasto menor (caja chica), con motivo y autorización si supera umbral.  
3. **Corte ciego:** el cajero declara efectivo contado **sin** ver el teórico; el sistema guarda desvío.  
4. **Cierre Z:** congela el turno; imprime resumen (efectivo, tarjeta, crédito, vales); ventas posteriores exigen nuevo turno.

Invariante: no hay `POST /sales` en efectivo sin `cash_shift_id` abierto para ese register. Pagos mixtos (efectivo + crédito) generan dos movimientos lógicos.

### 2.5 Cuentas por cobrar (crédito)

Clientes de confianza (instaladores, constructoras, instituciones):

- `customers.credit_enabled`, `credit_limit`, `credit_days`.  
- Al cobrar: método `on_account`.  
- Validación **síncrona:** `saldo_actual + ticket ≤ credit_limit` (bloqueo duro) o `override` con permiso admin.  
- `customer_ledger` append-only: cargos (ventas), abonos (pagos), notas.  
- Estados de cuenta PDF; antigüedad 30/60/90.  
- POS: mostrar “Disponible Q X” al elegir el cliente (F3/F6).

No es un módulo bancario: un pago registra caja o banco simple (`payment_accounts`).

---

## 3. Cross-cutting operativo

| Tema | Especificación |
| --- | --- |
| Códigos | SKU interno + códigos de barras múltiples + código proveedor |
| Impuestos | Motor único (documento 02); POS no recalcula IVA a su aire |
| Offline | Fase 1 online-only; Fase 3+ cola local opcional con sync (fuera del MVP) |
| Impresora | Térmica 80 mm ticket interno; PDF FEL A4 o térmico resumido |
| Permisos | Ver matriz RBAC documento 01 |

---

## 4. Criterios de aceptación por módulo

**Inventario**

- Venta de 2.5 m decrementa 2.5 en kardex base.  
- Venta de 1 caja de 100 tornillos decrementa 100 unidades.  
- Traslado A→B: A baja, B sube, no hay creación de stock.  
- Producto bajo reorden genera alerta agrupada por proveedor.

**POS**

- Camino F2 → Enter → F4 → efectivo → ticket < 3 s percibidos (sin esperar FEL).  
- Esc cierra cobro sin duplicar venta.  
- Cambio de lista instalador altera precio antes de F4.

**Cotización**

- Convertir a venta con stock insuficiente: warning y no descuenta negativo.

**Caja**

- Cierre Z impide más ventas en ese shift.  
- Corte ciego persiste diferencia.

**CxC**

- Cliente sobre límite: 409/422 y mensaje claro, sin venta parcial silenciosa.

---

*Documento 3/5 — Especificaciones de módulos. Versión 1.0 — 20 de septiembre de 2026.*
