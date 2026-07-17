import pytest
from sqlalchemy.future import select

from main import seed_sefirot_contenido
from models import Sefira
from sefirot_contenido_seed import SEFIROT_CONTENIDO_SEED

pytestmark = pytest.mark.asyncio


async def _get(db_session, sid: str) -> Sefira:
    result = await db_session.execute(select(Sefira).where(Sefira.id == sid))
    return result.scalars().one()


async def test_backfills_null_content_from_constant(db_session, seed_sefirot):
    # seed_sefirot crea filas (keter, jesed, tiferet) sin contenido rico.
    jesed_antes = await _get(db_session, "jesed")
    assert jesed_antes.esencia is None

    await seed_sefirot_contenido(db_session)

    jesed = await _get(db_session, "jesed")
    assert jesed.esencia == SEFIROT_CONTENIDO_SEED["jesed"]["esencia"]
    assert jesed.palabras_clave == SEFIROT_CONTENIDO_SEED["jesed"]["palabras_clave"]
    assert jesed.que_observa == SEFIROT_CONTENIDO_SEED["jesed"]["que_observa"]

    keter = await _get(db_session, "keter")
    assert keter.esencia == SEFIROT_CONTENIDO_SEED["keter"]["esencia"]

    tiferet = await _get(db_session, "tiferet")
    assert tiferet.esencia == SEFIROT_CONTENIDO_SEED["tiferet"]["esencia"]


async def test_does_not_clobber_existing_content(db_session, seed_sefirot):
    # Primera pasada: rellena las filas nulas.
    await seed_sefirot_contenido(db_session)

    # Simula una edición de admin (o una fila ya sembrada por la migración).
    jesed = await _get(db_session, "jesed")
    jesed.esencia = "Contenido editado a mano por un admin"
    jesed.palabras_clave = ["Custom"]
    await db_session.commit()

    # Segunda pasada: no debe pisar el valor custom.
    await seed_sefirot_contenido(db_session)

    jesed_despues = await _get(db_session, "jesed")
    assert jesed_despues.esencia == "Contenido editado a mano por un admin"
    assert jesed_despues.palabras_clave == ["Custom"]


async def test_empty_string_is_not_treated_as_null(db_session, seed_sefirot):
    # Un campo vaciado explícitamente a "" no es None: no se debe rellenar.
    jesed = await _get(db_session, "jesed")
    jesed.esencia = ""
    await db_session.commit()

    await seed_sefirot_contenido(db_session)

    jesed_despues = await _get(db_session, "jesed")
    assert jesed_despues.esencia == ""
