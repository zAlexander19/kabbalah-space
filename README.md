# Kabbalah Space — Inteligencia del Ser

App de auto-conocimiento basada en el Árbol de la Vida cabalístico. Cruza reflexión guiada por sefirá (*Espejo Cognitivo*), gestión de actividades mapeadas a sefirot (*Calendario Cabalístico*) y análisis de evolución temporal (*Mi Evolución*) para que el usuario vea cómo se mueve cada dimensión de su alma a lo largo del tiempo.

> **Estado:** MVP en construcción. Roadmap completo en el [GitHub Project](https://github.com/users/zAlexander19/projects/5).

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind + Framer Motion |
| Backend | FastAPI (async) + SQLAlchemy async |
| BD | SQLite (dev) → PostgreSQL (próximo, ver issue [#5](https://github.com/zAlexander19/kabbalah-space/issues/5)) |
| IA | LLM (stub hoy, real próximo, ver issue [#9](https://github.com/zAlexander19/kabbalah-space/issues/9)) |

## Módulos

```
┌─────────────────────────────────────────────────────────────────┐
│                       Kabbalah Space                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Espejo Cognitivo  ─┐                                           │
│   (reflexión)       │                                           │
│                     ├──► Motor de Análisis ──► Dashboard       │
│  Calendario        ─┤    (fricción,             (heatmap +     │
│   Cabalístico       │     polaridad,             radar +       │
│   (actividades)     │     recomendaciones)       evolución)    │
│                     │                                           │
│  Mi Evolución      ─┘                                           │
│   (curvas mensuales)                                            │
│                                                                 │
│  Panel Administrador (CRUD preguntas guía)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Detalle de diseño de cada módulo en [`docs/superpowers/specs/`](docs/superpowers/specs/).

---

## Prerequisitos

- **Python 3.11+**
- **Node.js 20+** y **npm**
- (Opcional) **Docker** — solo si querés correr Postgres en lugar de SQLite

---

## Quickstart

```bash
# 1. Clonar
git clone https://github.com/zAlexander19/kabbalah-space.git
cd kabbalah-space

# 2. Backend — venv + deps + .env + correr
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # ajustá los valores si querés (defaults son dev-friendly)
uvicorn main:app --reload --port 8000

# 3. (en otra terminal) Frontend — deps + dev server
cd frontend && npm install && npm run dev

# 4. (opcional) Cargar preguntas guía iniciales
cd backend && source venv/bin/activate && python scripts/seed_preguntas.py

# 5. Abrir http://localhost:5173
```

> **Windows PowerShell:** en lugar de `source venv/bin/activate` usar `venv\Scripts\Activate.ps1`. Y en lugar de `cp` usar `Copy-Item .env.example .env`.

---

## Base de datos & migraciones

### SQLite (default, dev rápido)

`backend/kabbalah.db` se crea solo al arrancar `uvicorn`. No requiere setup. La primera vez:

```bash
cd backend && source venv/bin/activate
alembic upgrade head        # aplica todas las migraciones a la BD
```

### Postgres (vía Docker)

Para desarrollo más cercano a producción, levantá el servicio del root:

```bash
docker compose up -d postgres        # arranca postgres:16-alpine en :5432
```

Luego en `backend/.env`:

```
DATABASE_URL=postgresql+asyncpg://kabbalah:kabbalah_dev@localhost:5432/kabbalah
```

Y aplicá las migraciones:

```bash
cd backend && source venv/bin/activate
alembic upgrade head
```

### Migraciones — comandos clave

```bash
# Aplicar todas las migraciones pendientes
alembic upgrade head

# Generar una migración nueva después de cambiar models.py
alembic revision --autogenerate -m "describe el cambio"

# Volver una migración atrás
alembic downgrade -1

# Marcar la BD como "ya migrada" sin correr nada (adopción inicial)
alembic stamp head

# Ver en qué revisión está la BD
alembic current
```

Las migraciones viven en `backend/alembic/versions/`. La inicial (`328674a34f67_initial_schema.py`) crea las 7 tablas del modelo. `alembic/env.py` lee `DATABASE_URL` desde `Settings`, así que apunta a la misma base que la app.

---

## Estructura

```
kabbalah-space/
├── backend/
│   ├── main.py              FastAPI app + endpoints
│   ├── models.py            SQLAlchemy models
│   ├── database.py          engine, session, Base
│   ├── config.py            pydantic-settings (env loader)
│   ├── alembic/             migraciones (env.py async + versions/)
│   ├── alembic.ini          config de alembic (URL viene de Settings)
│   ├── requirements.txt
│   ├── .env.example
│   └── scripts/             seeds y utilidades one-off
├── frontend/
│   └── src/
│       ├── App.tsx          shell + nav
│       ├── espejo/          Módulo 1 — Árbol interactivo + reflexión
│       ├── calendar/        Módulo 2 — Calendario cabalístico
│       ├── evolucion/       Mi Evolución (curvas mensuales)
│       └── shared/          tokens de diseño compartidos
├── docs/superpowers/        specs y plans (un md por feature)
├── docker-compose.yml       Postgres local opcional
└── README.md
```

---

## Roadmap

Las tareas vivas están en el [GitHub Project — Kabbalah Space — MVP Roadmap](https://github.com/users/zAlexander19/projects/5), agrupadas en 6 milestones:

| # | Milestone | Foco |
|---|---|---|
| 0 | Higiene del Repo | gitignore, README, limpieza |
| 1 | Base sólida | Postgres, JWT, multi-usuario |
| 2 | IA Real | LLM real en `/evaluate`, cache, tests |
| 3 | Motor de Análisis | fricción, polaridad, recomendaciones |
| 4 | Dashboard Visual | heatmap, radar, vista integradora |
| 5 | Calidad | suite pytest + CI |

---

## Troubleshooting

**`uvicorn main:app` falla con `ModuleNotFoundError: No module named 'database'`**
Estás corriendo `uvicorn` desde la raíz del repo. `cd backend` primero.

**`vite` se queda colgado en localhost sin estilos**
Tailwind no está compilando. Verificá que `npm install` haya corrido sin errores en `frontend/` y reiniciá el dev server.

**SQLite locked / `database is locked`**
Otro proceso (un seed, un test, otro `uvicorn`) tiene la BD abierta. Cerrá todos y reintentá. Pasarse a Postgres (`docker compose up -d postgres`) elimina este problema.

**`alembic` falla con `Can't locate revision identified by '...'`**
La BD apunta a una revisión que ya no existe en `alembic/versions/`. Solución: borrá `kabbalah.db` y `alembic upgrade head` desde cero, o bajá los archivos de versions correspondientes.

**El Espejo devuelve scores random**
Es esperado por ahora — el endpoint `/evaluate` es un stub. Issue [#9](https://github.com/zAlexander19/kabbalah-space/issues/9) lo conecta a un LLM real.
