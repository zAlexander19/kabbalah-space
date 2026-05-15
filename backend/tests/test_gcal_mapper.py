"""Tests for the pure Actividad -> Google event payload mapper."""
from datetime import datetime, timezone

from models import Actividad, Sefira
from gcal_mapper import actividad_to_event, SEFIRA_COLOR_ID


def _act(**kwargs) -> Actividad:
    base = dict(
        id="act-1",
        usuario_id="u-1",
        titulo="Meditacion matutina",
        descripcion="Foco en el aliento",
        inicio=datetime(2026, 5, 15, 8, 0, tzinfo=timezone.utc),
        fin=datetime(2026, 5, 15, 9, 0, tzinfo=timezone.utc),
        estado="pendiente",
        serie_id=None,
        rrule=None,
        gcal_event_id=None,
        sync_status="pending",
    )
    base.update(kwargs)
    return Actividad(**base)


def _sef(id: str, nombre: str) -> Sefira:
    return Sefira(id=id, nombre=nombre, pilar="centro", descripcion="")


def test_single_activity_basic_fields():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed")])
    assert event["summary"] == "Meditacion matutina"
    assert event["start"]["dateTime"] == "2026-05-15T08:00:00+00:00"
    assert event["end"]["dateTime"] == "2026-05-15T09:00:00+00:00"
    assert "recurrence" not in event


def test_description_includes_sefirot_tagline():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed"), _sef("tiferet", "Tiféret")])
    assert "Foco en el aliento" in event["description"]
    assert "— Sefirot: Jésed, Tiféret" in event["description"]


def test_description_when_actividad_descripcion_is_none():
    event = actividad_to_event(_act(descripcion=None), [_sef("keter", "Kéter")])
    assert event["description"] == "— Sefirot: Kéter"


def test_series_master_includes_rrule_in_recurrence():
    act = _act(serie_id="series-1", rrule="FREQ=WEEKLY;BYDAY=MO")
    event = actividad_to_event(act, [_sef("jesed", "Jésed")])
    assert event["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]


def test_color_id_from_first_sefira():
    event = actividad_to_event(_act(), [_sef("jesed", "Jésed")])
    assert event["colorId"] == SEFIRA_COLOR_ID["jesed"]


def test_color_id_falls_back_when_sefira_unmapped():
    event = actividad_to_event(_act(), [_sef("unknown-sef", "Unknown")])
    # Falls back to a default colorId rather than raising
    assert "colorId" in event
