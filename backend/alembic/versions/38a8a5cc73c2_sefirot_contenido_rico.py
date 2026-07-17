"""sefirot contenido rico

Revision ID: 38a8a5cc73c2
Revises: b4e38fa0ea77
Create Date: 2026-07-17 11:54:50.213384

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38a8a5cc73c2'
down_revision: Union[str, Sequence[str], None] = 'b4e38fa0ea77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# id -> {esencia, palabras_clave, que_observa}. Transcripción verbatim de
# frontend/src/espejo/sefirotContent.ts (palabrasClave -> palabras_clave).
SEED = {
    "keter": {
        "esencia": "La Corona: la voluntad primigenia, anterior a toda forma. El punto donde tu deseo más profundo todavía no tiene nombre, pero ya empuja.",
        "palabras_clave": ["Voluntad", "Propósito", "Origen"],
        "que_observa": "Mirá qué te mueve de raíz: eso que querés antes de saber por qué. La dirección que tu vida toma cuando nadie te está mirando.",
    },
    "jojma": {
        "esencia": "La Sabiduría: el destello, la intuición que llega antes del razonamiento. La chispa que abre una posibilidad nueva.",
        "palabras_clave": ["Intuición", "Chispa", "Visión"],
        "que_observa": "Prestá atención a tus insights repentinos y a cuánto confiás en ellos. Cómo aparece lo nuevo en vos antes de que lo entiendas.",
    },
    "bina": {
        "esencia": "El Entendimiento: la vasija que da estructura a la chispa. Donde la intuición se vuelve idea comprensible y forma.",
        "palabras_clave": ["Comprensión", "Estructura", "Reflexión"],
        "que_observa": "Observá cómo procesás y ordenás lo que sentís. Tu capacidad de darle forma y sentido a lo que todavía es difuso.",
    },
    "jesed": {
        "esencia": "La Misericordia: la generosidad que se expande, el amor que da sin medir. El impulso de abrirte hacia los demás.",
        "palabras_clave": ["Amor", "Generosidad", "Entrega"],
        "que_observa": "Mirá cómo das y hasta dónde. Tu apertura hacia los otros y el equilibrio entre entregar y entregarte de más.",
    },
    "gevura": {
        "esencia": 'La Severidad: el rigor, el límite, el juicio que contiene. La fuerza que dice "hasta acá" y sostiene la forma.',
        "palabras_clave": ["Límite", "Disciplina", "Fuerza"],
        "que_observa": "Observá tus límites y tu disciplina. Dónde ponés freno, cómo te sostenés y si tu rigor cuida o aprieta demasiado.",
    },
    "tiferet": {
        "esencia": "La Belleza: el equilibrio entre dar y contener, el corazón del árbol. La armonía que integra la misericordia y la severidad.",
        "palabras_clave": ["Equilibrio", "Armonía", "Corazón"],
        "que_observa": "Mirá tu centro: cómo balanceás lo que das y lo que retenés. La coherencia entre lo que sentís, pensás y hacés.",
    },
    "netzaj": {
        "esencia": "La Victoria: la perseverancia, el impulso que insiste. La fuerza que sostiene el deseo en el tiempo y no afloja.",
        "palabras_clave": ["Perseverancia", "Impulso", "Pasión"],
        "que_observa": "Observá tu constancia frente a lo que querés. Cómo sostenés el esfuerzo cuando la motivación inicial ya pasó.",
    },
    "hod": {
        "esencia": "El Esplendor: la inteligencia práctica, la palabra y la forma. Donde la idea se organiza para poder comunicarse y concretarse.",
        "palabras_clave": ["Comunicación", "Método", "Detalle"],
        "que_observa": "Mirá cómo comunicás y ordenás lo cotidiano. Tu relación con los detalles, la palabra justa y los métodos que usás.",
    },
    "yesod": {
        "esencia": "El Fundamento: la imaginación y el motor psíquico, el puente entre lo interno y lo que se manifiesta. Tu mundo íntimo en movimiento.",
        "palabras_clave": ["Imaginación", "Vínculo", "Cimiento"],
        "que_observa": "Observá tu mundo interior y cómo conecta con el afuera. Tus vínculos, tu sexualidad, la base sobre la que apoyás todo.",
    },
    "maljut": {
        "esencia": "El Reino: la acción física, el mundo material, lo concreto. Donde todo lo anterior finalmente se vuelve realidad tangible.",
        "palabras_clave": ["Acción", "Cuerpo", "Presencia"],
        "que_observa": "Mirá cómo habitás lo material y lo cotidiano. Tu cuerpo, tu casa, tu dinero, y qué de vos se hace realmente presente en el mundo.",
    },
}


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sefirot", sa.Column("esencia", sa.Text(), nullable=True))
    op.add_column("sefirot", sa.Column("que_observa", sa.Text(), nullable=True))
    op.add_column("sefirot", sa.Column("palabras_clave", sa.JSON(), nullable=True))

    # Semilla: UPDATE de las filas existentes por id (prod ya tiene las 10).
    sefirot = sa.table(
        "sefirot",
        sa.column("id", sa.String),
        sa.column("esencia", sa.Text),
        sa.column("que_observa", sa.Text),
        sa.column("palabras_clave", sa.JSON),
    )
    bind = op.get_bind()
    for sid, c in SEED.items():
        bind.execute(
            sefirot.update()
            .where(sefirot.c.id == sid)
            .values(
                esencia=c["esencia"],
                que_observa=c["que_observa"],
                palabras_clave=c["palabras_clave"],
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("sefirot", "palabras_clave")
    op.drop_column("sefirot", "que_observa")
    op.drop_column("sefirot", "esencia")
