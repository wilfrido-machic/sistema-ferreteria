import { navigate } from "../router.js";

export function renderLogin() {
  return `
    <div class="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div class="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Multi-tenant · Mixco</p>
        <h1 class="font-display mt-2 text-3xl font-extrabold text-stone-900">SIG Ferretería</h1>
        <p class="mt-1 text-sm text-stone-500">Ferretería Laguna — acceso de demostración al backoffice y POS.</p>
        <form id="login-form" class="mt-6 space-y-3">
          <div>
            <label class="label">Usuario</label>
            <input class="field" name="user" value="cajero" />
          </div>
          <div>
            <label class="label">PIN / contraseña</label>
            <input class="field" name="pin" type="password" value="1234" />
          </div>
          <button class="btn-primary w-full py-2.5" type="submit">Entrar al sistema</button>
        </form>
        <p class="mt-4 text-center text-xs text-stone-400">Demo local · datos en este navegador (localStorage)</p>
      </div>
    </div>`;
}

export function bindLogin() {
  document.getElementById("login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    sessionStorage.setItem("sig-auth", "1");
    navigate("/dashboard");
  });
}
