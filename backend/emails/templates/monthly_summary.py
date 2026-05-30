"""Monthly summary email template."""
from typing import Optional

from .base import render_shell


SECTION_LABEL_STYLE = (
    "margin:24px 0 8px;color:rgba(254,243,199,0.75);"
    "font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;"
)


def render_monthly_summary(
    *,
    nombre: str,
    month_label: str,
    sefirot_breakdown: list[tuple[str, int]],
    reflexiones_count: int,
    delta_vs_prev_month: int,
    insight: Optional[str],
    app_url: str,
    preferences_url: str,
) -> str:
    total_actividades = sum(c for _, c in sefirot_breakdown)

    # Activity breakdown table — labeled and contextualized
    if sefirot_breakdown:
        sefirot_items = "".join(
            f'<tr>'
            f'<td style="padding:6px 12px 6px 0;color:#fef3c7;font-family:Georgia,serif;">{name}</td>'
            f'<td style="padding:6px 0;color:#d6d3d1;text-align:right;font-family:Arial,sans-serif;font-size:14px;tabular-nums:1;">{count}</td>'
            f'</tr>'
            for name, count in sefirot_breakdown
        )
        sefirot_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Actividades por dimensión</p>'
            f'<p style="margin:0 0 4px;font-size:13px;color:rgba(168,162,158,0.85);">'
            f'Cuántas actividades del calendario asociaste a cada sefirá este mes.'
            f'</p>'
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
            f'style="margin:8px 0 0;width:100%;font-size:14px;border-top:1px solid rgba(120,113,108,0.25);">'
            f'{sefirot_items}'
            f'</table>'
            f'<p style="margin:8px 0 0;font-size:13px;color:rgba(168,162,158,0.85);">'
            f'Total: <strong style="color:#fef3c7;">{total_actividades}</strong> '
            f'actividad{"es" if total_actividades != 1 else ""} en {len(sefirot_breakdown)} '
            f'sefirá{"s" if len(sefirot_breakdown) != 1 else ""}.'
            f'</p>'
        )

        # Mini narrative pulling top + bottom out of the table
        top_nombre, top_count = sefirot_breakdown[0]
        narrative = (
            f'<p style="margin:14px 0 0;">'
            f'La dimensión más presente fue <strong style="color:#fef3c7;">{top_nombre}</strong> '
            f'({top_count} actividad{"es" if top_count != 1 else ""}).'
        )
        if len(sefirot_breakdown) >= 2:
            bottom_nombre, bottom_count = sefirot_breakdown[-1]
            if bottom_count <= 2 and bottom_nombre != top_nombre:
                narrative += (
                    f' La más quieta fue <strong style="color:#fef3c7;">{bottom_nombre}</strong> '
                    f'({bottom_count} actividad{"es" if bottom_count != 1 else ""}).'
                )
        narrative += '</p>'
        sefirot_block += narrative
    else:
        sefirot_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Actividades por dimensión</p>'
            f'<p style="margin:0;color:rgba(168,162,158,0.85);font-style:italic;">'
            f'No registraste actividades en el calendario este mes.'
            f'</p>'
        )

    # Reflections section — labeled separately
    if reflexiones_count > 0:
        reflexiones_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Reflexiones</p>'
            f'<p style="margin:0;">'
            f'Escribiste <strong style="color:#fef3c7;">{reflexiones_count}</strong> '
            f'reflexión{"es" if reflexiones_count != 1 else ""} sobre las preguntas guía este mes.'
            f'</p>'
        )
    else:
        reflexiones_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Reflexiones</p>'
            f'<p style="margin:0;color:rgba(168,162,158,0.85);font-style:italic;">'
            f'No registraste reflexiones escritas este mes.'
            f'</p>'
        )

    # Comparison vs previous month — labeled with units
    delta_block = ""
    if delta_vs_prev_month != 0 and total_actividades > 0:
        if delta_vs_prev_month > 0:
            delta_phrase = (
                f'<strong style="color:rgba(134,239,172,0.95);">'
                f'+{delta_vs_prev_month} actividad{"es" if delta_vs_prev_month != 1 else ""}'
                f'</strong> respecto al mes anterior.'
            )
        else:
            absd = abs(delta_vs_prev_month)
            delta_phrase = (
                f'<strong style="color:rgba(253,186,116,0.95);">'
                f'−{absd} actividad{"es" if absd != 1 else ""}'
                f'</strong> respecto al mes anterior.'
            )
        delta_block = (
            f'<p style="{SECTION_LABEL_STYLE}">Comparación</p>'
            f'<p style="margin:0;">{delta_phrase}</p>'
        )

    insight_block = (
        f'<div style="margin:24px 0 0;padding:16px;background:rgba(254,243,199,0.05);'
        f'border-left:2px solid rgba(254,243,199,0.4);border-radius:4px;">'
        f'<p style="margin:0;font-style:italic;color:rgba(254,243,199,0.9);">{insight}</p>'
        f'</div>'
        if insight else ""
    )

    body = (
        f'<p style="margin:0;">Hola {nombre},</p>'
        f'<p style="margin:12px 0 0;">Este es tu resumen de <strong>{month_label}</strong> '
        f'en Kabbalah Space:</p>'
        + sefirot_block + reflexiones_block + delta_block + insight_block
    )

    return render_shell(
        preview=f"Tu mes en el árbol — {month_label}",
        title="Tu mes en el árbol",
        body_html=body,
        cta_label="Ver Mi Evolución",
        cta_url=f"{app_url}/evolucion",
        preferences_url=preferences_url,
    )
