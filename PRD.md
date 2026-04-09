# PRD – GOGGINS AI COACH
**Versión:** 2.0 (MVP para hackathon ElevenLabs × Enzo Ventures – Madrid, 9 abril 2026)

---

## Hook (5 segundos para convencer al jurado)

> **"Cuando estás en el rep 10 de 12 y quieres rendirte, no puedes mirar una pantalla. Tus manos están ocupadas, estás sudando, tienes los ojos cerrados. Construimos el único coach que puede ayudarte en ese momento exacto: uno que habla contigo, escucha lo que le dices, y suena como David Goggins."**

---

## 1. El Momento (Criterio 02 — Moment clarity)

**Momento elegido:** El instante en que un atleta quiere abandonar a mitad de un set.

**Por qué existe este momento:**
Estás en el rep 8 de 12. Los brazos tiemblan. Tu cabeza te dice que pares. Abrir el móvil es imposible. Poner música no sirve. No hay nadie contigo.

**Por qué voz es la ÚNICA solución aquí:**

| Interfaz | Durante esfuerzo físico máximo |
|----------|-------------------------------|
| Pantalla / app visual | ❌ Manos ocupadas, no puedes tocar |
| Música / playlist | ❌ No te escucha, no se adapta |
| Texto / notificaciones | ❌ No puedes leer mientras haces el ejercicio |
| **Voz conversacional** | ✅ Habla contigo, te escucha, responde en tiempo real |

La voz no es mejor que la pantalla aquí. **Es la única opción que funciona.**

---

## 2. Visión del Producto

**GOGGINS AI COACH** es un agente de voz que entrena con el usuario durante el momento más difícil de cualquier serie: cuando la mente quiere parar antes que el cuerpo. Usando la voz clonada de David Goggins con ElevenLabs, el agente mantiene una **conversación real** durante el set: escucha lo que dices, responde a tus quejas, te cuenta los reps, y te empuja hasta el final.

Cuando terminas el set, se calla. Nada de pantallas, nada de botones. Solo voz.

---

## 3. Flujo del Usuario (simplificado para MVP)

```
1. Usuario abre la app web
2. Pulsa "EMPEZAR SET" (un solo botón grande)
3. El agente Goggins activa micrófono + voz
4. Conversación en tiempo real durante todo el set:
   → Goggins habla, motiva, pregunta
   → Usuario puede responder, quejarse, pedir más
   → Goggins ESCUCHA y reacciona a lo que le dices
5. Usuario dice "done" / "listo" / "terminé"
   → Goggins suelta UNA frase épica final
   → Silencio. Set completado.
6. Timer de descanso (30s visual)
7. Opción de repetir para otro set
```

**Scope del MVP:** Un ejercicio (flexiones o sentadillas). Un set perfecto. Una conversación que impacte.

---

## 4. Ejemplos de Conversación Real (Criterio 01 — Feels like a conversation)

Estos ejemplos demuestran que es una **conversación**, no un monólogo.

### Ejemplo A — Usuario que se queja
```
GOGGINS: "¡Vamos, eso es el 7! ¡Cinco más, soldier!"
USUARIO: "No puedo más, me duelen los brazos"
GOGGINS: "¿Que te duelen los brazos? [laughs] ¡Bien! Eso significa que están trabajando.
          El dolor es el precio de entrada. Dame tres más. Solo tres."
USUARIO: "Okay... uno... dos..."
GOGGINS: "¡ESO! ¡Dos! ¡Uno más y eres otro nivel! ¡VAMOS!"
USUARIO: "Done"
GOGGINS: "Eso es lo que hace un soldier. Cuando el cuerpo dice para, tú decides seguir. Descansa."
```

### Ejemplo B — Usuario que pregunta
```
GOGGINS: "¡Cuarto rep! ¡Sigue, no te pares ahora!"
USUARIO: "¿Cuántos me quedan?"
GOGGINS: "Ocho más. Ocho. ¿Eso es mucho para ti? Stay hard."
USUARIO: "Uf..."
GOGGINS: "Ese 'uf' no me vale. Dime que puedes. Dímelo."
USUARIO: "Puedo."
GOGGINS: "¡Entonces DEMUÉSTRAMELO! ¡Rep cinco, ahora!"
```

### Ejemplo C — Usuario que rompe mentalmente
```
GOGGINS: "¡Rep diez! ¡Casi estás!"
USUARIO: "Para. Para ya. No puedo."
GOGGINS: "Para. [pausa] ¿Sabes qué es quedarse a dos reps del final?
          Es exactamente donde empieza el crecimiento. Dos reps. Solo dos.
          Puedes rendirte si quieres. Pero tú sabes la verdad."
USUARIO: "...okay. Dos más."
GOGGINS: "Eso. ESO es mental toughness."
```

---

## 5. Requisitos Funcionales (lo buildable en 2.5h)

| # | Feature | Prioridad | Tool ElevenLabs |
|---|---------|-----------|-----------------|
| 1 | Voz clonada Goggins | Must | Voice Cloning (Instant) |
| 2 | Agente conversacional activo durante el set | Must | ElevenLabs Conversational AI + v3 |
| 3 | Detección de "done/listo" → silencio automático | Must | Tool/Trigger en Agent |
| 4 | Audio tags expresivos | Must | `[shouting]`, `[laughs]`, `[intense]`, `[breathing heavy]` |
| 5 | UI mínima: un botón "EMPEZAR SET" | Must | Frontend simple |
| 6 | Timer visual de descanso (30s) | Should | App logic |
| 7 | Soporte para 2-3 sets consecutivos | Should | Session state |

**Eliminado del scope:** workout builder, múltiples ejercicios, storage de audio, soporte bilingüe.

---

## 6. System Prompt del Agente (listo para ElevenLabs)

```
You are David Goggins — the real one. Your voice is hard, direct, intense.
You are talking to someone mid-set, during intense physical effort.

Your job is NOT to monologue. It is to have a CONVERSATION.

Rules:
- Listen to what the user says. React directly to their exact words.
- If they say "I can't" → push them on exactly that, don't ignore it.
- If they ask a question → answer it briefly, then push them forward.
- Count their reps out loud as they do them (they tell you or you estimate).
- Use audio tags to express emotion: [shouting], [intense], [laughs], [breathing heavy], [motivated]
- Keep responses SHORT during effort: 1-2 sentences max, then let them breathe.
- When the user says "done", "listo", "finished", "stop", or "terminé":
  → Respond with ONE powerful closing line. Then go silent. Do not speak again.

Tone: Hard, honest, no sugarcoating. But you LISTEN. You respond to THIS person, not a generic athlete.
Language: English (or match the user's language if they switch).

Opening line when session starts:
"Alright. Set starts now. I'm with you the whole way. Let's go."
```

---

## 7. Requisitos Técnicos

- **Frontend:** Página web única (HTML/React). Un botón grande, timer, y estado del set.
- **Voz:** ElevenLabs Voice Cloning → crear voz "David Goggins" con samples públicos de YouTube.
- **Agente:** ElevenLabs Conversational AI con el system prompt de arriba + voz Goggins.
- **Trigger de inicio:** Botón "EMPEZAR SET" → activa el Agent (WebSocket o SDK).
- **Trigger de fin:** El Agent detecta "done/listo" → cierra turno automáticamente (herramienta custom o instrucción en prompt).
- **Backend:** Sin backend. Todo client-side para el MVP. ElevenLabs gestiona la conversación.

---

## 8. Script de Demo — 3 minutos exactos (Criterio 04 — Demo quality)

### Minuto 0:00–0:30 — El problema
> "Todos hemos estado ahí: rep 9 de 12, los brazos quieren parar, la cabeza quiere parar. Abres el móvil... imposible. Pones música... no te escucha. Nadie te empuja. Hasta ahora."

### Minuto 0:30–1:00 — El momento + por qué voz
> "Elegimos este momento exacto: cuando el atleta quiere rendirse a mitad de un set. Y lo convertimos en una conversación de voz. ¿Por qué voz? Porque durante el esfuerzo físico real, la pantalla es inútil. Voz es el único canal que funciona."

### Minuto 1:00–2:30 — Demo en vivo
- Pulsar "EMPEZAR SET" en la app
- Goggins empieza a hablar
- El presentador "actúa" como si estuviera haciendo flexiones
- En el rep 8, decir en voz alta: **"No puedo más"**
- Goggins responde a esa frase específica (el wow moment)
- Terminar diciendo **"Done"**
- Goggins suelta la frase épica final y se calla automáticamente

### Minuto 2:30–3:00 — Cierre
> "Esto es ElevenLabs Eleven v3: voz clonada de Goggins, conversación en tiempo real, y un agente que ESCUCHA lo que le dices. No es música. No es un bot. Es un compañero de entrenamiento."

---

## 9. Métricas de Éxito

- El jurado siente que **es una conversación**, no un bot leyendo un script.
- El "momento" queda **cristalino** en los primeros 30 segundos de la demo.
- La app funciona en vivo sin fallos durante la demo.
- El "wow moment" ocurre cuando Goggins responde directamente a "no puedo más".
