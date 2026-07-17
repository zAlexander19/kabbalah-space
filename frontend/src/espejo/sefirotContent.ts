export type SefiraContenido = {
  /** 2-3 frases que expanden la descripción corta. */
  esencia: string;
  /** Etiquetas cortas (2-4) que evocan la dimensión. */
  palabrasClave: string[];
  /** Qué invita a mirar de tu vida esta dimensión. */
  queObserva: string;
};

// Contenido inicial redactado (rioplatense). Reemplazable cuando el usuario
// entregue sus textos definitivos — es la única fuente de este contenido.
export const SEFIROT_CONTENIDO: Record<string, SefiraContenido> = {
  keter: {
    esencia:
      'La Corona: la voluntad primigenia, anterior a toda forma. El punto donde tu deseo más profundo todavía no tiene nombre, pero ya empuja.',
    palabrasClave: ['Voluntad', 'Propósito', 'Origen'],
    queObserva:
      'Mirá qué te mueve de raíz: eso que querés antes de saber por qué. La dirección que tu vida toma cuando nadie te está mirando.',
  },
  jojma: {
    esencia:
      'La Sabiduría: el destello, la intuición que llega antes del razonamiento. La chispa que abre una posibilidad nueva.',
    palabrasClave: ['Intuición', 'Chispa', 'Visión'],
    queObserva:
      'Prestá atención a tus insights repentinos y a cuánto confiás en ellos. Cómo aparece lo nuevo en vos antes de que lo entiendas.',
  },
  bina: {
    esencia:
      'El Entendimiento: la vasija que da estructura a la chispa. Donde la intuición se vuelve idea comprensible y forma.',
    palabrasClave: ['Comprensión', 'Estructura', 'Reflexión'],
    queObserva:
      'Observá cómo procesás y ordenás lo que sentís. Tu capacidad de darle forma y sentido a lo que todavía es difuso.',
  },
  jesed: {
    esencia:
      'La Misericordia: la generosidad que se expande, el amor que da sin medir. El impulso de abrirte hacia los demás.',
    palabrasClave: ['Amor', 'Generosidad', 'Entrega'],
    queObserva:
      'Mirá cómo das y hasta dónde. Tu apertura hacia los otros y el equilibrio entre entregar y entregarte de más.',
  },
  gevura: {
    esencia:
      'La Severidad: el rigor, el límite, el juicio que contiene. La fuerza que dice "hasta acá" y sostiene la forma.',
    palabrasClave: ['Límite', 'Disciplina', 'Fuerza'],
    queObserva:
      'Observá tus límites y tu disciplina. Dónde ponés freno, cómo te sostenés y si tu rigor cuida o aprieta demasiado.',
  },
  tiferet: {
    esencia:
      'La Belleza: el equilibrio entre dar y contener, el corazón del árbol. La armonía que integra la misericordia y la severidad.',
    palabrasClave: ['Equilibrio', 'Armonía', 'Corazón'],
    queObserva:
      'Mirá tu centro: cómo balanceás lo que das y lo que retenés. La coherencia entre lo que sentís, pensás y hacés.',
  },
  netzaj: {
    esencia:
      'La Victoria: la perseverancia, el impulso que insiste. La fuerza que sostiene el deseo en el tiempo y no afloja.',
    palabrasClave: ['Perseverancia', 'Impulso', 'Pasión'],
    queObserva:
      'Observá tu constancia frente a lo que querés. Cómo sostenés el esfuerzo cuando la motivación inicial ya pasó.',
  },
  hod: {
    esencia:
      'El Esplendor: la inteligencia práctica, la palabra y la forma. Donde la idea se organiza para poder comunicarse y concretarse.',
    palabrasClave: ['Comunicación', 'Método', 'Detalle'],
    queObserva:
      'Mirá cómo comunicás y ordenás lo cotidiano. Tu relación con los detalles, la palabra justa y los métodos que usás.',
  },
  yesod: {
    esencia:
      'El Fundamento: la imaginación y el motor psíquico, el puente entre lo interno y lo que se manifiesta. Tu mundo íntimo en movimiento.',
    palabrasClave: ['Imaginación', 'Vínculo', 'Cimiento'],
    queObserva:
      'Observá tu mundo interior y cómo conecta con el afuera. Tus vínculos, tu sexualidad, la base sobre la que apoyás todo.',
  },
  maljut: {
    esencia:
      'El Reino: la acción física, el mundo material, lo concreto. Donde todo lo anterior finalmente se vuelve realidad tangible.',
    palabrasClave: ['Acción', 'Cuerpo', 'Presencia'],
    queObserva:
      'Mirá cómo habitás lo material y lo cotidiano. Tu cuerpo, tu casa, tu dinero, y qué de vos se hace realmente presente en el mundo.',
  },
};
