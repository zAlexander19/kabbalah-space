# Diseño — Contenido de sefirot editable desde el admin

**Fecha:** 2026-07-17
**Rama:** `feat/admin-contenido-sefirot` (desde `feat/activacion-arbol`)
**Estado:** aprobado para escribir plan

## Contexto

La feature F1 de "Activación del Árbol" agregó una card "Sobre esta dimensión"
alimentada por un archivo estático del frontend
(`frontend/src/espejo/sefirotContent.ts`) con, por sefirá: `esencia`,
`palabrasClave` (array) y `queObserva`. El usuario quiere poder **editar ese
contenido rico desde el Panel de Administrador**, sin tocar código.

Alcance acordado: **solo el contenido rico** (esencia, palabras clave, qué
observar). No se editan por ahora el nombre ni la descripción corta del header.

Enfoque acordado (opción A): mover el contenido a la base de datos, exponer un
CRUD admin siguiendo el patrón existente de "Preguntas", y que el frontend lea el
contenido por API en vez del archivo estático (que queda como semilla + fallback).

## Estado actual relevante
- `Sefira` (`backend/models.py`): `id`, `nombre`, `pilar`, `descripcion` (Text).
  No tiene los campos de contenido rico.
- Admin backend (`backend/admin/routers.py`, `schemas.py`, `deps.py`): CRUD de
  preguntas protegido por `require_admin`; schemas Pydantic con
  `ConfigDict(from_attributes=True)`.
- Admin frontend (`frontend/src/admin/`): `AdminModule.tsx` con tabs
  `stats | preguntas | usuarios`; `components/PreguntasPanel.tsx` es el patrón de
  edición; `api.ts` centraliza las llamadas.
- Consumo actual: `SefiraInfoCard.tsx` importa `SEFIROT_CONTENIDO` del archivo
  estático y hace lookup por `sefira_id`.

---

## 1. Storage (backend)

Agregar tres columnas a `Sefira` (1:1 con la sefirá, estructura chica y fija — no
amerita tabla aparte):

```python
esencia = Column(Text, nullable=True)
que_observa = Column(Text, nullable=True)
palabras_clave = Column(JSON, nullable=True)   # lista de strings
```

- `JSON` se importa de `sqlalchemy` (hoy no está en el import de `models.py`); es
  el tipo genérico portable (SQLite en dev, Postgres en prod).
- **Migración Alembic** (`alembic revision`): (a) agrega las 3 columnas; (b) data
  migration que siembra las 10 sefirot con el texto actual de
  `sefirotContent.ts`. Los textos se embeben en la migración (dict id→contenido)
  para que el admin arranque con esos borradores y no se pierda nada.
- `palabras_clave` default lógico: lista vacía si viene null.

---

## 2. API (backend)

### Admin (protegido por `require_admin`) — en `backend/admin/routers.py`
- `GET /admin/sefirot` → lista de las 10 sefirot con su contenido
  (`id`, `nombre`, `esencia`, `palabras_clave`, `que_observa`), ordenadas por
  `nombre` (consistente con el resto).
- `PATCH /admin/sefirot/{sefira_id}` → actualiza los 3 campos. 404 si la sefirá
  no existe. Actualiza solo los campos presentes en el body.

Schemas nuevos en `backend/admin/schemas.py`:
```python
class SefiraContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nombre: str
    esencia: Optional[str] = None
    palabras_clave: list[str] = []
    que_observa: Optional[str] = None

class SefiraContentUpdateIn(BaseModel):
    esencia: Optional[str] = None
    palabras_clave: Optional[list[str]] = None
    que_observa: Optional[str] = None
```
(`palabras_clave` en el Out normaliza null→`[]`.)

### Público — en `backend/main.py`
- `GET /sefirot/contenido` → **sin auth** (la card es alcanzable antes de
  loguear). Devuelve las 10 sefirot con su contenido. Forma: lista de
  `{id, esencia, palabras_clave, que_observa}` (misma info que consume la card).
  Es el reemplazo de la fuente estática del front.

---

## 3. Frontend — admin

Nueva tab "Contenido" en `AdminModule.tsx` (`Tab = 'stats' | 'preguntas' |
'usuarios' | 'contenido'`), render de `SefirotContentPanel.tsx`.

`SefirotContentPanel.tsx` (espejando `PreguntasPanel.tsx`):
- Carga `GET /admin/sefirot`.
- Lista las 10 sefirot; por cada una un bloque editable:
  - `esencia` → textarea.
  - `palabras_clave` → input de texto **separado por comas** (se parsea a array
    al guardar; se muestra unido por ", ").
  - `que_observa` → textarea.
  - Botón **Guardar** por sefirá → `PATCH /admin/sefirot/{id}`, con estado
    guardando/guardado y manejo de error, al estilo de los otros paneles admin.

`frontend/src/admin/api.ts`: agregar
- `getSefirotContent(): Promise<SefiraContentOut[]>`
- `updateSefiraContent(id, patch): Promise<SefiraContentOut>`
y los tipos correspondientes (`admin/` types).

---

## 4. Frontend — consumo público (la card)

`SefiraInfoCard.tsx` deja de importar `SEFIROT_CONTENIDO` directamente y usa un
hook nuevo `useSefirotContenido()`:
- Hace `GET /sefirot/contenido` **una sola vez**, cacheado a nivel módulo
  (singleton promise), y expone un lookup por `sefira_id`.
- **Fallback:** mientras el fetch no resolvió, o si falla, la card usa el valor de
  `sefirotContent.ts` para ese id. Así no hay parpadeo de card vacía y funciona
  aunque el endpoint no responda.
- Tras un fetch OK, la card muestra el contenido de la base (lo editado en admin).

`sefirotContent.ts` **se conserva** como semilla (fuente de la migración) y como
fallback del front. Es aceptable tener esa duplicación: post-seed arrancan
idénticos y el archivo solo cubre el arranque/errores.

---

## 5. Data flow

Admin edita y guarda → `PATCH /admin/sefirot/{id}` → fila actualizada en `sefirot`
→ `GET /sefirot/contenido` devuelve el contenido nuevo → `SefiraInfoCard` lo
muestra en la próxima carga del módulo Espejo (el hook cachea por sesión; un
reload trae lo último).

---

## 6. Manejo de errores
- `PATCH` admin: `require_admin` (403 si no admin), 404 si `sefira_id` no existe,
  validación Pydantic de `palabras_clave` como lista de strings.
- `GET /sefirot/contenido`: siempre devuelve las 10 (contenido puede venir
  parcialmente null si el admin lo vació; la card ya no renderiza la sección si
  no hay `esencia`/contenido — se respeta el guard existente `if (!contenido)`).
- Front admin: error de guardado se muestra inline, sin perder lo tipeado.

---

## 7. Testing
- **Backend** (espejando `backend/tests/` de admin):
  - `GET /admin/sefirot` requiere admin (403 sin rol) y lista las 10 con contenido.
  - `PATCH /admin/sefirot/{id}` actualiza y persiste; 404 para id inexistente;
    403 para no-admin.
  - `GET /sefirot/contenido` (público) devuelve el contenido sembrado, sin auth.
  - La migración siembra las 10 (verificable vía el GET tras seed).
- **Frontend:** `npm run build` limpio; verificación manual del panel (editar →
  guardar → ver reflejado en la card).

---

## No-objetivos (YAGNI)
- No se edita nombre ni descripción corta del header (solo contenido rico F1).
- No hay versionado/historial de ediciones de contenido.
- No se elimina `sefirotContent.ts` (queda como semilla + fallback).
- No se agrega i18n del contenido.

## Verificación
- Backend: `pytest` (nuevos tests admin + público).
- Frontend: build + smoke manual (editar en admin, ver en la card).
- `graphify update .` tras los cambios.
