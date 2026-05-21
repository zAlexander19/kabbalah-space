# KSpace-AI — Diseño

**Fecha:** 2026-05-21
**Rama de trabajo:** `feat/gcal-sync` (rama activa actual)
**Idioma:** español rioplatense

## 1. Objetivo

Reemplazar el stub fake del endpoint `/evaluate` por una IA real (Gemini, presentada al usuario como **KSpace-AI**), y agregar un módulo de "compañera del árbol" dentro del Calendario que:

- Detecta las sefirot **flojas** del mes corriente (promedio (score_usuario + score_ia)/2 < 5).
- Muestra una **lectura observacional** en el tope del Calendario, generada por LLM con contexto del usuario.
- Felicita al usuario cuando agrega una actividad taggeada a una sefirá floja, usando un **template** simple.

El tono es **observacional, no invasivo**: la IA muestra el estado sin obligar a corregirlo, ni moralizar.

## 2. Componentes

### Backend

**`backend/llm.py` — `KSpaceAi` (nuevo)**
Wrapper async sobre Gemini 2.5 Flash. Dos funciones públicas:

- `evaluate_reflection(sefira_nombre: str, texto: str, user_score: float) -> tuple[float, str]`
  Prompt: "El usuario reflexionó sobre la sefirá {sefira}, autopuntaje {score}/10. Texto: '{texto}'. Devolvé en JSON: `{ score: 1-10, feedback: '...'}`. El feedback son 2-3 frases en tono contemplativo, en español rioplatense. No moralices."
  Retorna `(ai_score, feedback)`. Si Gemini falla (timeout, rate limit, API key faltante) → fallback al stub actual (`user_score ± random(-1.5..1.5)`) y feedback genérico hardcodeado. El caller nunca se entera del error.

- `generate_calendar_reading(sefirot_debiles: list[tuple[str, float]]) -> str | None`
  Prompt: "Estas sefirot tienen promedio bajo este mes: {lista nombre: score}. Generá una observación breve (máx 3 frases) en español rioplatense, sin moralizar, mencionando solo el estado y sugiriendo tipos de actividades de cada sefirá. Tono respetuoso, no obligatorio."
  Retorna el texto generado. Si falla, retorna `None` → el endpoint responde con `null` y el frontend oculta la card.

**Config (`backend/config.py`)**

- `llm_provider: "gemini" | "stub"` (default `"stub"`).
- `gemini_api_key: str = ""`. Si vacío → fuerza stub aunque `llm_provider == "gemini"`.

**Modelo de usuario (`backend/models.py`)**

Agregar columna `ksai_enabled: bool = True` (default on) a `Usuario`. Si el usuario lo desactiva, el backend salta todas las llamadas al LLM y devuelve fallbacks.

**Endpoint `POST /evaluate` (modificación)**

- Si `user.ksai_enabled and llm_provider == "gemini"` → `KSpaceAi.evaluate_reflection()`.
- Si no → comportamiento actual (stub).
- Schema de response **igual** que hoy: `{ ai_score: float, feedback: str }`.

**Endpoint nuevo `GET /ia/calendario/lectura`**

Auth requerido. Sin params. Lógica:

1. Si `not user.ksai_enabled` → `{ status: "disabled", message: "Activá KSpace-AI en tu perfil para ver la lectura." }`.
2. Calcular promedio `(score_usuario + score_ia)/2` por sefirá para el mes corriente (UTC). Si para una sefirá uno de los dos scores es null, usar solo el otro; si ambos son null, esa sefirá no entra al cálculo.
3. Filtrar sefirot con promedio < 5.
4. Si no hay reflexiones en el mes → `{ status: "no_data", ... }` con mensaje template "Aún sin reflexiones este mes. Cuando reflexiones, KSpace-AI empezará a leer tu árbol.".
5. Si hay reflexiones pero ninguna floja → `{ status: "balanced", ... }` con mensaje template "Tu árbol está balanceado este mes.".
6. Si hay flojas → llamar `KSpaceAi.generate_calendar_reading(weak)`. Si devuelve texto: `{ status: "weak", weak_sefirot: [...], message: <LLM> }`. Si falla: `{ status: "weak", weak_sefirot: [...], message: null }` y el frontend renderiza solo los chips sin texto narrativo.

Response schema:
```json
{
  "status": "weak" | "balanced" | "no_data" | "disabled",
  "weak_sefirot": [{ "id": "tiferet", "nombre": "Tiféret", "score": 4.2 }],
  "message": "Tu Tiféret está en 4.2 este mes..." | null
}
```

**Endpoint nuevo `POST /ia/calendario/felicitacion`**

Auth requerido. Body: `{ "actividad_id": "..." }`. Lógica:

1. Buscar la actividad. 404 si no existe o no pertenece al user.
2. Obtener las sefirot taggeadas vía `ActividadSefira`.
3. Para cada sefirá taggeada, calcular el promedio del mes corriente (como en `/ia/calendario/lectura`). Quedarse con la **más floja** (menor promedio) que sea **< 5**. Si ninguna está floja → `{ "show": false }`.
4. Contar las actividades del mes corriente para esa sefirá (incluyendo la recién creada).
5. Devolver:
```json
{
  "show": true,
  "sefira_nombre": "Tiféret",
  "count": 2,
  "message": "Bien, agregaste 2 actividades a tu Tiféret. Te lo agradecerá."
}
```
   Pluralización: `count == 1` → "1 actividad", `count > 1` → "N actividades". Sin niveles ni cambios de tono según el conteo. Mismo template siempre.

**Endpoint nuevo `PATCH /usuarios/me/ksai`**

Auth requerido. Body: `{ "enabled": true | false }`. Toggle del flag en `Usuario.ksai_enabled`. Response: el user actualizado o el flag.

### Frontend

**`<CalendarioIaLectura />` (nuevo)**

Ubicación: dentro del `CalendarModule`, entre el header de la semana (Mayo / Semana del 18 al 24) y el grid del calendario.

Comportamiento:

- Mount → `fetch /ia/calendario/lectura`.
- Loading: skeleton sutil (sin spinner).
- `status: "weak"` → card con el texto del LLM (o null fallback) + chips horizontales con `[NOMBRE score]` pintados con el color de cada sefirá. Botón × cierra la card por la sesión (sessionStorage flag, vuelve mañana). Si la card está cerrada por la sesión, no se renderiza.
- `status: "balanced"` → card más chica, texto único: "Tu árbol está balanceado este mes." Sin chips. Cerrable también.
- `status: "no_data"` → card más chica, mensaje no_data. Cerrable.
- `status: "disabled"` → card mínima con CTA "Activar KSpace-AI" que linkea al perfil. Cerrable.
- Si el endpoint falla con error de red → no renderizar nada (silencioso).

**Toast de felicitación (nuevo)**

Después de un POST `/actividades` con 201, disparar `POST /ia/calendario/felicitacion` con el `actividad_id` devuelto.

- Si `show: true` → toast top-right, fade in/out, 4s, con el color de la sefirá felicitada en el borde izquierdo.
- Si `show: false` o error → no renderizar nada.
- No bloquea ni interrumpe el flujo de creación.
- Si el usuario crea actividades en bulk (recurrentes), solo se dispara el toast para la primera instancia para no spammear.

**Nota en el editor de reflexión**

En `ReflectionEditor`, debajo del textarea, texto chico color stone-500:

> "Tu reflexión es evaluada por KSpace-AI."

Si `user.ksai_enabled` es false, el texto cambia a:

> "KSpace-AI desactivado. Activalo en tu perfil para evaluación automática."

**Setting en perfil**

Toggle "Evaluación KSpace-AI" — on/off. Cuando el usuario lo cambia, `PATCH /usuarios/me/ksai`. Cambio instantáneo, sin guardar/cancel. Texto auxiliar: "Cuando está activado, tus reflexiones son evaluadas automáticamente por KSpace-AI y el Calendario muestra una lectura mensual del estado de tu árbol."

## 3. Flujo de datos

```
Usuario escribe reflexión y guarda
  ↓
POST /evaluate { sefira_id, text, score }
  ↓
Backend: if user.ksai_enabled and provider == "gemini":
          KSpaceAi.evaluate_reflection(...) → (ai_score, feedback)
         else:
          stub → (random_score, generic_feedback)
  ↓
RegistroDiario guardado con puntuacion_usuario + puntuacion_ia
  ↓
EvaluationResponse → frontend muestra score + feedback
```

```
Usuario entra al Calendario
  ↓
CalendarioIaLectura fetch GET /ia/calendario/lectura
  ↓
Backend: agrupa RegistroDiario del mes corriente por sefira_id
         calcula promedio (user+ia)/2
         filtra < 5
         si hay flojas → KSpaceAi.generate_calendar_reading()
  ↓
Response { status, weak_sefirot, message }
  ↓
Frontend renderiza la card según status
```

```
Usuario crea actividad (POST /actividades)
  ↓
Frontend recibe 201 con la actividad
  ↓
Frontend dispara POST /ia/calendario/felicitacion { actividad_id }
  ↓
Backend: busca actividad → sefirot taggeadas
         para cada una, promedio del mes
         elige la más floja con promedio < 5
         cuenta actividades del mes para esa sefirá
         arma template
  ↓
Response { show, sefira_nombre, count, message }
  ↓
Frontend muestra toast si show=true
```

## 4. Errores y fallbacks

| Falla | Comportamiento |
|---|---|
| `GEMINI_API_KEY` vacía | Fuerza `llm_provider = "stub"` al iniciar. Logueo de warning. |
| Timeout Gemini en `/evaluate` | Fallback a stub. El usuario ve un ai_score y feedback sin saber que falló. |
| Timeout Gemini en `/ia/calendario/lectura` | Status sigue siendo `weak`, `message: null`. Frontend muestra solo chips. |
| 429 / rate limit Gemini | Mismo fallback que timeout. |
| Actividad inexistente en `/felicitacion` | 404. Frontend no muestra toast. |
| Toggle off + reflexión nueva | `ai_score = null`, feedback hardcodeado: "KSpace-AI desactivado." |
| Toggle off + entrar a Calendario | `status: "disabled"`, card con CTA al perfil. |

## 5. Privacidad

- El usuario sabe que sus reflexiones son evaluadas — nota explícita en el editor.
- El usuario puede desactivar la evaluación con el toggle. Cuando está off, las reflexiones nuevas no son enviadas a Gemini (`score_ia` queda null) y el módulo del Calendario se desactiva.
- Las reflexiones **históricas** ya evaluadas no se borran al desactivar el toggle — el feature es prospectivo. Aclaración en el setting: "Esto afecta solo a las próximas reflexiones."
- No se loguean los textos completos de las reflexiones en logs del backend. Solo se loguea `sefira_id`, `user_id`, `score`, success/fail, latencia.

## 6. Configuración

`.env.example` agrega:
```
GEMINI_API_KEY=
LLM_PROVIDER=gemini  # o "stub" para desarrollo sin API key
```

## 7. Migración

Agregar columna `ksai_enabled BOOLEAN DEFAULT TRUE NOT NULL` a la tabla `usuarios` vía Alembic. Los usuarios existentes quedan opt-in por default; pueden desactivarlo desde el perfil.

## 8. Out of scope (no se hace en esta vuelta)

- Cacheado de la lectura del Calendario (hoy se llama al LLM cada entrada al módulo). Si se vuelve un problema de costo, se cachea por día.
- Insights en Mi Evolución (otros módulos).
- Generación de preguntas guía con IA.
- Modificar el score con bonus por actividades agregadas (decisión explícita del usuario: solo notificar, no tocar el score).
- Plan semanal generado por IA.
- Conversación / chat con la IA.
- Soporte para Claude (si más adelante se decide cambiar, la abstracción `KSpaceAi` lo facilita).
