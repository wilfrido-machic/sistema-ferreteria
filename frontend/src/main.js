import "./styles.css";
import { register, startRouter, currentPath } from "./router.js";
import { renderShell, bindShell } from "./components/layout.js";
import { renderLogin, bindLogin } from "./views/login.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderPos, bindPos, posHotkeys } from "./views/pos.js";
import { renderInventario } from "./views/inventario.js";
import { renderCotizaciones, bindCotizaciones } from "./views/cotizaciones.js";
import { renderCaja, bindCaja } from "./views/caja.js";
import { renderGastos, bindGastos } from "./views/gastos.js";
import { renderCuentas, bindCuentas } from "./views/cuentas.js";
import { renderClientes } from "./views/clientes.js";
import { renderFel, bindFel } from "./views/fel.js";

register("/login", { render: renderLogin, bind: bindLogin, shell: false });
register("/dashboard", { render: renderDashboard, shell: true });
register("/pos", { render: renderPos, bind: bindPos, shell: true });
register("/inventario", { render: renderInventario, shell: true });
register("/cotizaciones", { render: renderCotizaciones, bind: bindCotizaciones, shell: true });
register("/caja", { render: renderCaja, bind: bindCaja, shell: true });
register("/gastos", { render: renderGastos, bind: bindGastos, shell: true });
register("/cuentas", { render: renderCuentas, bind: bindCuentas, shell: true });
register("/clientes", { render: renderClientes, shell: true });
register("/fel", { render: renderFel, bind: bindFel, shell: true });

const app = document.getElementById("app");

function mount() {
  const authed = sessionStorage.getItem("sig-auth") === "1";
  const path = currentPath();
  if (!authed && path !== "/login") {
    location.hash = "#/login";
    return;
  }
  const view = getView(path);
  app.innerHTML = view.shell === false ? view.render() : renderShell(view.render());
  if (view.shell !== false) bindShell();
  view.bind?.();
}

function getView(path) {
  const table = {
    "/login": { render: renderLogin, bind: bindLogin, shell: false },
    "/dashboard": { render: renderDashboard, shell: true },
    "/pos": { render: renderPos, bind: bindPos, shell: true },
    "/inventario": { render: renderInventario, shell: true },
    "/cotizaciones": { render: renderCotizaciones, bind: bindCotizaciones, shell: true },
    "/caja": { render: renderCaja, bind: bindCaja, shell: true },
    "/gastos": { render: renderGastos, bind: bindGastos, shell: true },
    "/cuentas": { render: renderCuentas, bind: bindCuentas, shell: true },
    "/clientes": { render: renderClientes, shell: true },
    "/fel": { render: renderFel, bind: bindFel, shell: true },
  };
  return table[path] || table["/dashboard"];
}

window.addEventListener("route", mount);
window.addEventListener("store:change", () => {
  if (sessionStorage.getItem("sig-auth") === "1") mount();
});

window.addEventListener("keydown", (e) => {
  if (currentPath() === "/pos") posHotkeys(e);
});

startRouter();
