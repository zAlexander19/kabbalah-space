"""Pure mapper from Kabbalah Actividad to Google Calendar event payload.

No I/O, no DB, no FastAPI imports. Just data transformation. The caller
provides the Sefira rows already loaded (gcal_sync does the JOIN).
"""
from __future__ import annotations

from typing import Iterable

from models import Actividad, Sefira


# Google Calendar provides 11 fixed colorIds ("1" through "11").
# Tabla de mapeo sefira -> colorId mas cercano visualmente. Documentado
# en el spec, seccion 7 (Riesgos). Si una sefira no esta aca, cae al default.
SEFIRA_COLOR_ID: dict[str, str] = {
    "keter":   "8",   # Graphite -- gris claro
    "jojma":   "8",   # Graphite -- gris medio
    "bina":    "8",   # Graphite -- gris oscuro
    "jesed":   "9",   # Blueberry -- azul
    "gevura":  "11",  # Tomato -- rojo
    "tiferet": "5",   # Banana -- amarillo/dorado
    "netzaj":  "10",  # Basil -- verde
    "hod":     "6",   # Tangerine -- naranja
    "yesod":   "3",   # Grape -- violeta
    "maljut":  "7",   # Sage -- verde grisaceo (cercano al ambar profundo)
}

DEFAULT_COLOR_ID = "8"


def actividad_to_event(actividad: Actividad, sefirot: Iterable[Sefira]) -> dict:
    """Build the Google Calendar event payload from an Actividad.

    - Single activity (no serie_id, no rrule): plain event.
    - Series master (rrule set): includes RRULE in event.recurrence.
    - Override of a series instance (handled by the caller, not here):
      caller adds recurringEventId + originalStartTime before sending.
    """
    sefirot_list = list(sefirot)
    sefirot_names = ", ".join(s.nombre for s in sefirot_list) if sefirot_list else "—"

    body = (actividad.descripcion or "").strip()
    if body:
        description = f"{body}\n\n— Sefirot: {sefirot_names}"
    else:
        description = f"— Sefirot: {sefirot_names}"

    first_sefira_id = sefirot_list[0].id if sefirot_list else ""
    color_id = SEFIRA_COLOR_ID.get(first_sefira_id, DEFAULT_COLOR_ID)

    event: dict = {
        "summary": actividad.titulo,
        "description": description,
        "start": {"dateTime": _iso(actividad.inicio)},
        "end":   {"dateTime": _iso(actividad.fin)},
        "colorId": color_id,
    }
    if actividad.rrule:
        event["recurrence"] = [f"RRULE:{actividad.rrule}"]

    return event


def _iso(dt) -> str:
    """ISO 8601 with timezone. Falls back to UTC if naive."""
    if dt.tzinfo is None:
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()
