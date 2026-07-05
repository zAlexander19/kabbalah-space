# Registro solo por Google — Diseño

**Fecha:** 2026-07-05
**Rama:** feat/gcal-sync
**Origen:** el usuario quiere que las cuentas nuevas se creen solo con Google (cuentas reales), para evitar registros con emails falsos.

## Objetivo

El registro de cuentas nuevas es **exclusivamente por Google**. Se elimina el registro con email+contraseña (UI y API). El login con email queda dormido como fallback, pero no se expone en la UI. Las cuentas de email que ya existen (admin `evonova.001`, `zwalt19`) migran a Google mediante account-linking al primer ingreso.

## Decisiones cerradas (vía brainstorming)

- **Solo Google**, sin campos de nombre/email/contraseña en el modal.
- **Google adopta cuentas existentes**: si el email verificado de Google coincide con una cuenta `provider='email'`, se linkea a esa cuenta en vez de tirar `EmailCollisionError`. Seguro porque Google verificó la titularidad del email.
- **`POST /auth/register` se elimina** (404) — sin registro falso ni por API.
- **`POST /auth/login` queda dormido** (endpoint vivo, sin UI) como fallback de emergencia.

## Cambios

### Backend

1. **`auth.py` — `find_or_create_google_user`**: cuando el email coincide con una cuenta existente `provider='email'`, en vez de `EmailCollisionError` se **adopta**: se setea `provider='google'`, `provider_id=<sub>`, se conserva todo (id, `is_admin`, suscripción, datos), y se limpia `password_hash`. Si el email coincide con otra cuenta `provider='google'` distinta (caso imposible por la búsqueda previa por sub, pero defensivo), se mantiene el error.
2. **`main.py`**: eliminar el endpoint `POST /auth/register` y su `register_rate_limit`. Quitar el import de `UserCreate` si queda sin uso. `login` y todo lo demás intactos.

### Frontend

3. **`LoginModal.tsx`**: dejar **solo** "Continuar con Google". Se eliminan: estado `tab`, campos `email/password/nombre`, `validate`, `onSubmit`, el `<form>`, las tabs y el divisor "o". El modal queda: título + copy ("Entrá con tu cuenta de Google para empezar") + botón Google + el aviso existente si Google no está configurado + el manejo de `oauthError`.
4. **`auth/api.ts` y `AuthContext.tsx`**: eliminar `registerEmail` / `registerWithEmail` (quedan sin uso). `loginWithEmail` se conserva (fallback dormido, aunque la UI no lo llame).

### Tests

5. **`conftest.py`**: `register_and_login` deja de usar `POST /auth/register`. Nuevo helper que inserta el `Usuario` directo en la DB (con `hash_password`) y genera el JWT con `create_access_token`. Toda la suite sigue verde sin depender del endpoint.
6. **Tests nuevos**:
   - `POST /auth/register` → 404 (registro falso bloqueado).
   - Login de Google con email que coincide con una cuenta `provider='email'` existente → la adopta (mismo `id`, `provider` pasa a `google`, conserva `is_admin`).

## Prerequisito

Google OAuth configurado — confirmado (`/auth/config` → `google_oauth_enabled: true`). Si Google se deshabilitara, no se podrían crear cuentas nuevas; el modal ya muestra el aviso correspondiente.

## Consecuencia a comunicar

La **primera vez** tras el cambio, el admin y `zwalt19` deben entrar con **"Continuar con Google"** (mismo Gmail), no con la contraseña vieja. A partir de ahí quedan como cuenta Google.

## Fuera de alcance

Verificación por código/link para otros proveedores, borrado del endpoint `/auth/login`, migración masiva de cuentas de test.
