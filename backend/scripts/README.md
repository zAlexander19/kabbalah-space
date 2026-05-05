# Backend scripts

One-off utilities for seeding and maintenance. Run from the `backend/` directory with the virtualenv active and the API stopped (or pointing at the same DB).

## Seeds

| Script | Qué hace |
|---|---|
| `seed_preguntas.py` | Carga las preguntas guía de cada sefirá. Idempotente: salta preguntas cuyo texto ya existe para la sefirá. |
| `seed_evolucion_demo.py` | Inserta ~15 registros para *Jésed* a lo largo de los últimos 12 meses, para que "Mi Evolución" muestre una curva con datos reales. |

## Cómo correr

```bash
cd backend
source venv/bin/activate          # o venv\Scripts\Activate.ps1 en Windows
python scripts/seed_preguntas.py
python scripts/seed_evolucion_demo.py
```
