"""HTML shell common to all premium emails. Templo Digital aesthetic:
gold-on-black, sober serif title, terse copy.

Inline CSS only — most email clients strip <style> tags.
"""
from typing import Optional

FOOTER_TEXT = (
    "Recibes este correo porque eres parte de Kabbalah Space Premium. "
    "Puedes ajustar tus preferencias o darte de baja en cualquier momento."
)


def render_shell(
    *,
    preview: str,
    title: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    preferences_url: str = "",
) -> str:
    """Wrap body content in the Templo Digital HTML shell.

    Args:
        preview: short text shown as inbox preview (first ~80 chars)
        title: H1 title at the top of the email
        body_html: the content section (paragraphs, lists, etc.)
        cta_label: optional button label
        cta_url: optional button href (required if cta_label is set)
        preferences_url: link to "Mi cuenta → Suscripción" for opt-out
    """
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr>
          <td align="center" style="padding: 24px 32px 8px;">
            <a href="{cta_url}" style="display:inline-block;background:linear-gradient(135deg,#fde68a,#fbbf24,#f59e0b);color:#1c1917;text-decoration:none;padding:12px 28px;border-radius:9999px;font-family:Georgia,serif;font-size:14px;letter-spacing:0.02em;box-shadow:0 4px 16px rgba(233,195,73,0.35);">{cta_label}</a>
          </td>
        </tr>
        """

    return f"""<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#070709;font-family:Georgia,'Times New Roman',serif;color:#d6d3d1;">
  <!-- preview -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">{preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070709;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#15181d;border:1px solid rgba(120,113,108,0.35);border-radius:24px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 8px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(254,243,199,0.6);">Kabbalah Space</p>
              <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:24px;line-height:1.3;color:#fef3c7;font-weight:400;">{title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#d6d3d1;">
              {body_html}
            </td>
          </tr>
          {cta_block}
          <tr>
            <td style="padding:24px 32px 32px;border-top:1px solid rgba(68,64,60,0.6);">
              <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;color:rgba(168,162,158,0.7);line-height:1.6;">{FOOTER_TEXT}</p>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;">
                <a href="{preferences_url}" style="color:rgba(254,243,199,0.7);text-decoration:underline;">Gestionar preferencias</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>
"""
