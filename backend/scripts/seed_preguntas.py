"""Seed guide questions for each sefirá. Idempotent: skips questions whose text
already exists for that sefirá.

Run from the backend/ directory:
    python scripts/seed_preguntas.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from database import AsyncSessionLocal
from models import PreguntaSefira


PREGUNTAS: dict[str, list[str]] = {
    "maljut": [
        "En tu honestidad radical, ¿qué lugar tienen las cosas materiales para ti?",
        "¿En qué casos eres consciente de los límites objetivos de la naturaleza?",
        "¿Envejecimiento con dignidad? ¿Cuidas tu cuerpo por aprecio o por miedo?",
        "Los proyectos, en todas las áreas de tu vida, ¿terminan bajando a la acción y se materializan?",
        "¿Utilizas correctamente el dinero, lo laboral y lo profesional? ¿Están vinculados a un sentido profundo de trascendencia?",
    ],
    "yesod": [
        "¿Nos expresamos lo más fiel posible a nuestra interioridad?",
        "¿Edificamos en nuestras relaciones?",
        "¿Tenemos relaciones que nos edifican?",
        "¿Oscilo saludablemente en la expansión y restricción de mi Yesod?",
    ],
    "hod": [
        "¿Cómo percibes tu desenvolvimiento lingüístico?",
        "¿Lo que dices va en sincronía con lo que piensas y sientes?",
        "¿Buscas cada vez expresarte mejor?",
        "¿Tus diálogos contigo mismo son edificantes?",
        "¿Los diálogos que brindas y recibes de los otros son edificantes?",
    ],
    "netzaj": [
        "¿Te sientes tranquilo y en paz a la hora de expresar tus sentimientos?",
        "¿Qué podrías implementar para ampliar y profundizar la expresión de tus emociones?",
        "Tu cara, voz, cuerpo... ¿van en concordancia con tus palabras?",
        "¿Eres capaz de canalizar los sentimientos y emociones intensos para algo constructivo?",
        "¿La inadecuada gestión de los sentimientos y emociones te lleva hacia una conducta o cognición que te lastima?",
        "¿Intentas implementar o proyectar de alguna forma tus sentimientos en algún tipo de arte?",
        "¿Has observado que si ejercitas Nétzaj de alguna manera tu perseverancia aumenta?",
    ],
    "tiferet": [
        "Observa tus emociones cuando dialogas con los demás. ¿Qué sientes?",
        "¿Sabes elevar tu autoestima cuando te la quieres o quieren bajar?",
        "¿Sabes ser prudente y reconoces tus límites cuando crees que todo lo puedes?",
        "¿Observas y tomas en cuenta con frecuencia las sensaciones de tu corazón y tu pecho?",
        "Cuándo dialogas contigo mismo, ¿tú eres el protagonista de tu vida o tienes un papel secundario?",
        "¿Sabes gestionar las funciones de las emociones restrictivas o expansivas?",
        "¿Tu yo interior está avanzando hacia tu yo potencial?",
    ],
    "gevura": [
        "¿Mi tendencia es saber implementar y sacar provecho con el poder de la disciplina?",
        "Cuando me relaciono con los otros, ¿tengo tendencia a dominarles o tengo tendencia a ceder?",
        "¿Mi tendencia es a decir no de forma preventiva, a decir no antes de tiempo o a decir no mucho después de cuando lo tenía que decir?",
        "En situaciones inesperadas, ¿mi tendencia es saber recibir o en el fondo siento que no lo merezco, que es poca cosa o que me es indiferente?",
    ],
    "jesed": [
        "¿Sabes dar espontáneamente por el simple placer de dar?",
        "¿Sabes ser misericordioso contigo cuando aparecen los desequilibrios?",
        "¿Tienes con frecuencia en tu día sentimientos, emociones, sensaciones expansivas?",
        "¿Tienes actitud de apertura y receptividad?",
        "¿Sonríes constantemente a los demás?",
        "¿Cuándo te ves en un espejo te sonríes?",
        "¿Tienes predominancia a hablar a los demás con calidez y bondad?",
        "¿Cuándo algo te sale mal, te perdonas?",
    ],
    "bina": [
        "¿Cuestiono mis hábitos y rutinas?",
        "¿Cuestiono por qué creo lo que creo (mis creencias)?",
        "Cuando me siento inseguro o con miedo, ¿de dónde en realidad proviene ese miedo: del suceso que creo o de algo que parece que anteriormente me lastimó?",
        "¿Sé ordenar mis pensamientos?",
        "¿Sé tener un debate interno saludable en el cuál no me pelee con las ideas en mi mente ni tampoco cedo a ellas?",
        "¿Tengo la capacidad de recordar objetivamente los eventos de mi vida?",
    ],
    "jojma": [
        "¿Me estoy enfocando solo en el resultado o estoy disfrutando del proceso?",
        "¿Estoy cultivando mi creatividad?",
        "¿Esto que estoy haciendo también lo sé vincular con el futuro y el pasado?",
        "Esta pregunta, ¿de qué otras formas la puedo responder y dejar otra pregunta en el aire?",
        "¿Cómo puedo tomar esto que parece no tan bueno a mi favor?",
    ],
    "keter": [
        "En esta acción que estoy haciendo, ¿cómo puedo conectar con Kéter?",
        "¿Medito constantemente en lo que me hace falta aprender y experimentar desde el entusiasmo?",
        "¿Estoy alineado y/o trabajando constantemente en alinear mi Tiféret para que se aposenten en esta sefirá mis yoes potenciales?",
    ],
}


async def seed() -> None:
    inserted_total = 0
    skipped_total = 0
    async with AsyncSessionLocal() as session:
        for sefira_id, textos in PREGUNTAS.items():
            existentes = (await session.execute(
                select(PreguntaSefira.texto_pregunta).where(PreguntaSefira.sefira_id == sefira_id)
            )).scalars().all()
            existentes_set = {t.strip() for t in existentes}

            inserted = 0
            skipped = 0
            for texto in textos:
                if texto.strip() in existentes_set:
                    skipped += 1
                    continue
                session.add(PreguntaSefira(sefira_id=sefira_id, texto_pregunta=texto))
                inserted += 1

            print(f"  {sefira_id:8s}  +{inserted:>2d} new  ·  {skipped:>2d} skipped (existed)")
            inserted_total += inserted
            skipped_total += skipped

        await session.commit()

    print()
    print(f"DONE — {inserted_total} questions inserted, {skipped_total} skipped (already present).")


if __name__ == "__main__":
    asyncio.run(seed())
