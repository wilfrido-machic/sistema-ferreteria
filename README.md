# Sistema Integral de Gestión — Ferretería

SaaS B2B para ferreterías (POS, inventario, gastos operativos, cuentas pendientes y FEL Guatemala).

## Cómo ver la aplicación en tu PC

Desde la carpeta del proyecto:

```bash
cd frontend
npm install
npm run dev
```

Abre **http://127.0.0.1:5173/** (no uses `file://` sobre el HTML).

Demo: usuario `cajero` · PIN `1234`.

Si el puerto 5173 está ocupado, cierra otras ventanas de Node o ejecuta `npm run preview` después de `npm run build` (puerto 4173).

## Módulos

- Punto de venta (atajos F2 / F3 / F4 / Esc)
- Inventario
- Cotizaciones, caja y turno
- **Gastos operativos**
- **Cuentas pendientes** (por cobrar / por pagar)
- Clientes / crédito y cola FEL

Los datos de demostración viven en el navegador (`localStorage`).

## Documentación de arquitectura

Carpeta `docs/architecture-saas/`.
