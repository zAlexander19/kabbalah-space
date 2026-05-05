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
- (Opcional) **Docker** para PostgreSQL local cuando se concrete el issue [#5](https://github.com/zAlexander19/kabbalah-space/issues/5)

---

## Quickstart (5 comandos)

```bash
# 1. Clonar
git clone https://github.com/zAlexander19/kabbalah-space.git
cd kabbalah-space

# 2. Backend — venv + deps + correr
cd backend && python -m venv venv && source venv/bin/activate \
  && pip install fastapi "uvicorn[standard]" sqlalchemy aiosqlite python-dateutil pydantic \
  && uvicorn main:app --reload

# 3. (en otra terminal) Frontend — deps + dev server
cd frontend && npm install && npm run dev

# 4. (opcional) Cargar preguntas guía iniciales
cd backend && source venv/bin/activate && python scripts/seed_preguntas.py

# 5. Abrir http://localhost:5173
```

> En Windows PowerShell, en lugar de `source venv/bin/activate` usar `venv\Scripts\Activate.ps1`.
> No hay `requirements.txt` todavía — se agrega en el issue [#5](https://github.com/zAlexander19/kabbalah-space/issues/5).

---

## Estructura

```
kabbalah-space/
├── backend/
│   ├── main.py              FastAPI app + endpoints
│   ├── models.py            SQLAlchemy models
│   ├── database.py          engine, session, Base
│   └── scripts/             seeds y utilidades one-off
├── frontend/
│   └── src/
│       ├── App.tsx          shell + nav
│       ├── espejo/          Módulo 1 — Árbol interactivo + reflexión
│       ├── calendar/        Módulo 2 — Calendario cabalístico
│       ├── evolucion/       Mi Evolución (curvas mensuales)
│       └── shared/          tokens de diseño compartidos
├── docs/
│   └── superpowers/         specs y plans (un md por feature)
└── README.md                este archivo
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
Otro proceso (un seed, un test, otro `uvicorn`) tiene la BD abierta. Cerrá todos y reintentá. Migrar a Postgres (issue [#5](https://github.com/zAlexander19/kabbalah-space/issues/5)) elimina este problema.

**El Espejo devuelve scores random**
Es esperado por ahora — el endpoint `/evaluate` es un stub. Issue [#9](https://github.com/zAlexander19/kabbalah-space/issues/9) lo conecta a un LLM real.
