"""Seed demo evolution data for Jésed: ~15 records spread across the last
12 months with varying scores, so 'Mi Evolución' shows a meaningful curve.

Run from the backend/ directory:
    python scripts/seed_evolucion_demo.py
"""
import os
import sqlite3
import uuid

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "kabbalah.db",
)

# (year, month, day, puntuacion_usuario, puntuacion_ia, reflexion_texto)
DATA: list[tuple[int, int, int, int, int, str]] = [
    (2025, 5,  10, 4, 5, "Empiezo a observarme. Cuesta dar sin esperar."),
    (2025, 6,  3,  5, 4, "Esta semana me sentí más restringido que generoso."),
    (2025, 6,  22, 5, 6, "Aparecieron pequeños gestos espontáneos."),
    (2025, 7,  15, 5, 6, "Algo se está abriendo aunque sea de a poco."),
    (2025, 8,  9,  6, 5, "Doy mucho pero me cuesta recibir."),
    (2025, 9,  4,  4, 6, "Vuelta al trabajo, me siento agotado para los demás."),
    (2025, 9,  28, 5, 6, "Reconstruyendo la apertura con calma."),
    (2025, 10, 18, 6, 7, "Algo cambió. Empiezo a sentir el placer del dar."),
    (2025, 11, 7,  7, 7, "Mi jésed y mi mirada externa están alineadas."),
    (2025, 12, 14, 6, 7, "Las fiestas me sobrecargaron, bajé un poco."),
    (2026, 1,  6,  7, 8, "Año nuevo, energía nueva. Me siento expansivo."),
    (2026, 2,  11, 8, 8, "Pico claro. Estoy disfrutando dar sin condiciones."),
    (2026, 2,  25, 7, 8, "Sostengo la apertura sin esfuerzo."),
    (2026, 3,  9,  7, 7, "Asentando lo aprendido."),
    (2026, 3,  28, 8, 7, "Confianza creciente."),
]


def main() -> None:
    c = sqlite3.connect(DB_PATH)
    cur = c.cursor()

    inserted = 0
    for year, month, day, user, ia, texto in DATA:
        cur.execute(
            "INSERT INTO registros_diario (id, sefira_id, reflexion_texto, puntuacion_usuario, puntuacion_ia, fecha_registro) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid.uuid4()),
                'jesed',
                texto,
                user,
                ia,
                f"{year:04d}-{month:02d}-{day:02d} 10:00:00.000000",
            )
        )
        inserted += 1

    c.commit()

    # Sanity print
    total = cur.execute(
        "SELECT COUNT(*) FROM registros_diario WHERE sefira_id = 'jesed'"
    ).fetchone()[0]

    c.close()
    print(f"Inserted {inserted} demo records for jesed.")
    print(f"Jesed now has {total} total records in registros_diario.")


if __name__ == "__main__":
    main()
