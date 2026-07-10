import { useEffect } from 'react';

/**
 * Páginas legales (Privacidad / Términos) standalone, ruteadas por pathname
 * desde main.tsx (/privacidad, /terminos). No dependen de auth ni del shell
 * de la app: son públicas y crawleables (Google las lee para la verificación
 * OAuth). Contenido fiel a lo que realmente hace la app.
 */

const CONTACT_EMAIL = 'evonova.001@gmail.com';
const UPDATED = '10 de julio de 2026';

type Doc = 'privacy' | 'terms';

export default function LegalPage({ doc }: { doc: Doc }) {
  useEffect(() => {
    document.title =
      doc === 'privacy'
        ? 'Política de Privacidad · Kabbalah Space'
        : 'Términos y Condiciones · Kabbalah Space';
  }, [doc]);

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-300 font-body">
      <header className="border-b border-stone-800/60">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="font-serif text-lg text-amber-100/90 tracking-tight">
            Kabbalah <span className="italic">Space</span>
          </a>
          <a
            href="/"
            className="text-xs uppercase tracking-[0.16em] text-stone-400 hover:text-amber-200 transition-colors"
          >
            ← Volver
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {doc === 'privacy' ? <Privacy /> : <Terms />}

        <footer className="mt-16 pt-8 border-t border-stone-800/60 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.16em] text-stone-500">
          <a href="/privacidad" className="hover:text-amber-200 transition-colors">Privacidad</a>
          <a href="/terminos" className="hover:text-amber-200 transition-colors">Términos</a>
          <a href="/" className="hover:text-amber-200 transition-colors">Inicio</a>
          <span className="ml-auto normal-case tracking-normal text-stone-600">
            Kabbalah Space © 2026
          </span>
        </footer>
      </main>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-serif text-3xl md:text-4xl text-amber-100/90 font-light tracking-tight mb-2">
      {children}
    </h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-xl text-amber-100/85 font-light tracking-tight mt-9 mb-3">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-stone-300/90 mb-3">{children}</p>;
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-sm leading-relaxed text-stone-300/90 mb-2 pl-1">{children}</li>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 mb-3 marker:text-amber-300/50">{children}</ul>;
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-200/90 hover:text-amber-100 underline">
      {CONTACT_EMAIL}
    </a>
  );
}

function Privacy() {
  return (
    <article>
      <Title>Política de Privacidad</Title>
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500 mb-8">
        Última actualización: {UPDATED}
      </p>

      <P>
        Esta Política de Privacidad describe cómo Kabbalah Space ("nosotros", "la aplicación")
        recopila, usa y protege tu información cuando usás nuestro servicio en{' '}
        <strong className="text-stone-200">kabbalahspace.com</strong>. Al usar la aplicación,
        aceptás las prácticas descritas en este documento.
      </P>

      <H2>1. Información que recopilamos</H2>
      <P>Recopilamos únicamente lo necesario para que la aplicación funcione:</P>
      <UL>
        <LI>
          <strong className="text-stone-200">Datos de tu cuenta de Google.</strong> Al iniciar sesión
          con Google recibimos tu nombre, dirección de correo, foto de perfil e identificador de cuenta.
          Usamos esto para crear y autenticar tu cuenta.
        </LI>
        <LI>
          <strong className="text-stone-200">Contenido que creás.</strong> Tus reflexiones, respuestas
          a las preguntas guía, puntuaciones y actividades del calendario. Este contenido es tuyo y solo
          se usa para brindarte el servicio.
        </LI>
        <LI>
          <strong className="text-stone-200">Datos de Google Calendar (opcional).</strong> Si activás la
          sincronización, accedemos a tu Google Calendar para crear, leer y actualizar los eventos
          correspondientes a las actividades que cargás en la app. Solo accedemos a lo necesario para
          esa sincronización.
        </LI>
        <LI>
          <strong className="text-stone-200">Información de suscripción.</strong> Los pagos los procesa
          Lemonsqueezy (nuestro proveedor de pagos). No almacenamos datos de tu tarjeta; solo guardamos
          el estado de tu suscripción (activa, cancelada, plan).
        </LI>
        <LI>
          <strong className="text-stone-200">Datos técnicos.</strong> Zona horaria, preferencias de
          correo y registros básicos de uso para operar y proteger el servicio.
        </LI>
      </UL>

      <H2>2. Cómo usamos tu información</H2>
      <UL>
        <LI>Para operar tu cuenta, el árbol de reflexión y el calendario.</LI>
        <LI>Para sincronizar tus actividades con Google Calendar, si lo activás.</LI>
        <LI>Para procesar tu suscripción Premium a través de Lemonsqueezy.</LI>
        <LI>Para enviarte los correos que hayas habilitado (resúmenes, recordatorios).</LI>
        <LI>
          Si usás las funciones de análisis con IA (Premium), el texto de tus reflexiones se envía al
          modelo de lenguaje de Google (Gemini) para generar la devolución. No se usa para entrenar
          modelos.
        </LI>
      </UL>

      <H2>3. Uso de datos de las APIs de Google (Uso Limitado)</H2>
      <P>
        El uso y la transferencia por parte de Kabbalah Space de la información recibida de las APIs de
        Google se ajustará a la{' '}
        <a
          href="https://developers.google.com/terminos/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-200/90 hover:text-amber-100 underline"
        >
          Política de Datos de Usuario de los Servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado. En concreto:
      </P>
      <UL>
        <LI>
          Solo usamos el acceso a tu Google Calendar para brindar y mejorar la función de
          sincronización de actividades que vos solicitás.
        </LI>
        <LI>No vendemos ni transferimos estos datos a terceros con fines publicitarios.</LI>
        <LI>No usamos los datos de Google Calendar para entrenar modelos de inteligencia artificial.</LI>
        <LI>
          Ningún ser humano lee tus datos de Google Calendar, salvo que nos des tu consentimiento
          explícito, sea necesario por seguridad, para cumplir la ley, o de forma agregada y anonimizada.
        </LI>
      </UL>

      <H2>4. Dónde se guardan tus datos</H2>
      <P>
        Tus datos se almacenan en servidores de DigitalOcean. Los tokens de acceso a Google Calendar se
        guardan cifrados. Usamos conexiones seguras (HTTPS) en toda la aplicación.
      </P>

      <H2>5. Terceros con los que compartimos datos</H2>
      <UL>
        <LI><strong className="text-stone-200">Google</strong> — autenticación y sincronización de calendario.</LI>
        <LI><strong className="text-stone-200">Lemonsqueezy</strong> — procesamiento de pagos y suscripciones.</LI>
        <LI><strong className="text-stone-200">Resend</strong> — envío de correos.</LI>
        <LI><strong className="text-stone-200">Google Gemini</strong> — análisis con IA de tus reflexiones (solo Premium).</LI>
        <LI><strong className="text-stone-200">DigitalOcean</strong> — alojamiento e infraestructura.</LI>
      </UL>

      <H2>6. Tus derechos y la eliminación de datos</H2>
      <P>
        Podés desconectar Google Calendar en cualquier momento desde la app, revocando nuestro acceso.
        Podés solicitar el acceso, la corrección o la eliminación total de tu cuenta y tus datos
        escribiéndonos a <Mail />. Al eliminar tu cuenta, borramos tu contenido y revocamos los accesos
        vinculados.
      </P>

      <H2>7. Retención</H2>
      <P>
        Conservamos tus datos mientras tu cuenta esté activa. Si pedís la eliminación, los borramos
        salvo lo que debamos conservar por obligaciones legales o contables.
      </P>

      <H2>8. Menores</H2>
      <P>El servicio está destinado a personas mayores de 18 años. No recopilamos conscientemente datos de menores.</P>

      <H2>9. Cambios a esta política</H2>
      <P>
        Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su fecha de
        actualización.
      </P>

      <H2>10. Contacto</H2>
      <P>Ante cualquier duda sobre privacidad, escribinos a <Mail />.</P>
    </article>
  );
}

function Terms() {
  return (
    <article>
      <Title>Términos y Condiciones</Title>
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500 mb-8">
        Última actualización: {UPDATED}
      </p>

      <P>
        Estos Términos y Condiciones regulan el uso de Kabbalah Space ("la aplicación", "el servicio"),
        disponible en <strong className="text-stone-200">kabbalahspace.com</strong>. Al crear una cuenta
        o usar el servicio, aceptás estos términos.
      </P>

      <H2>1. Qué es Kabbalah Space</H2>
      <P>
        Kabbalah Space es una herramienta de reflexión personal y organización basada en el Árbol de la
        Vida de la cábala. Su contenido tiene fines de desarrollo personal y educativos.{' '}
        <strong className="text-stone-200">
          No constituye asesoramiento médico, psicológico, profesional ni religioso
        </strong>{' '}
        y no reemplaza la consulta con un profesional.
      </P>

      <H2>2. Tu cuenta</H2>
      <P>
        Para usar el servicio te registrás con tu cuenta de Google. Sos responsable de la actividad de
        tu cuenta y de mantener la seguridad de tu acceso de Google.
      </P>

      <H2>3. Planes gratuito y Premium</H2>
      <UL>
        <LI>
          El plan <strong className="text-stone-200">gratuito</strong> incluye el uso del espejo de
          reflexión y del calendario con ciertos límites (por ejemplo, cantidad de actividades activas y
          de reflexiones libres por mes).
        </LI>
        <LI>
          El plan <strong className="text-stone-200">Premium</strong> quita esos límites y habilita
          funciones adicionales (análisis con IA, recurrencias, resúmenes por correo, entre otras). El
          precio es de USD 5,99 por mes o USD 59,99 por año.
        </LI>
        <LI>
          Los pagos y suscripciones se gestionan a través de <strong className="text-stone-200">Lemonsqueezy</strong>,
          que actúa como comerciante registrado (Merchant of Record).
        </LI>
        <LI>
          La suscripción se <strong className="text-stone-200">renueva automáticamente</strong> hasta que
          la canceles. Podés cancelar cuando quieras; conservás el acceso Premium hasta el final del
          período ya pagado.
        </LI>
        <LI>
          Los reembolsos se rigen por la política de Lemonsqueezy y por la ley aplicable.
        </LI>
      </UL>

      <H2>4. Integración con Google Calendar</H2>
      <P>
        La sincronización con Google Calendar es opcional. Al activarla, autorizás a la aplicación a
        crear y administrar eventos en tu calendario correspondientes a tus actividades. Podés revocar
        este acceso en cualquier momento desde la app o desde tu cuenta de Google.
      </P>

      <H2>5. Uso aceptable</H2>
      <P>
        Te comprometés a no usar el servicio para fines ilícitos, a no intentar vulnerar su seguridad ni
        interferir con su funcionamiento, y a no acceder a cuentas ajenas.
      </P>

      <H2>6. Tu contenido</H2>
      <P>
        Las reflexiones, respuestas y actividades que creás son tuyas. Nos otorgás la licencia limitada
        necesaria para almacenarlas y procesarlas con el único fin de brindarte el servicio.
      </P>

      <H2>7. Disponibilidad y garantías</H2>
      <P>
        El servicio se ofrece "tal cual", sin garantías de disponibilidad ininterrumpida. Hacemos
        esfuerzos razonables por mantenerlo funcionando y seguro.
      </P>

      <H2>8. Limitación de responsabilidad</H2>
      <P>
        En la máxima medida permitida por la ley, Kabbalah Space no será responsable por daños
        indirectos o incidentales derivados del uso o la imposibilidad de uso del servicio.
      </P>

      <H2>9. Cambios</H2>
      <P>
        Podemos modificar el servicio o estos términos. Publicaremos la versión vigente en esta página.
        El uso continuado del servicio implica la aceptación de los cambios.
      </P>

      <H2>10. Ley aplicable</H2>
      <P>Estos términos se rigen por las leyes de Chile.</P>

      <H2>11. Contacto</H2>
      <P>Para cualquier consulta sobre estos términos, escribinos a <Mail />.</P>
    </article>
  );
}
