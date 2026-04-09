# GOGGINS AI COACH — Setup en 5 minutos

## Paso 1: Clonar la voz de Goggins en ElevenLabs

1. Ve a **elevenlabs.io** → Voice Lab → Add Voice → **Instant Voice Clone**
2. Sube 2-3 audios de David Goggins (busca en YouTube, descarga con yt-dlp o similar):
   - Clips de 30-60s con voz clara, sin música de fondo
   - Busca: "David Goggins motivation speech", "Goggins Stay Hard"
3. Nómbrala: `David Goggins`
4. **Copia el Voice ID** (lo necesitas para el agente)

---

## Paso 2: Crear el Agente en ElevenLabs

1. Ve a **elevenlabs.io** → Agents → **New Agent**
2. Configura:
   - **Name:** `Goggins Coach`
   - **Voice:** selecciona `David Goggins` (la que acabas de clonar)
   - **Model:** `Eleven v3`
3. Pega este **System Prompt**:

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

4. Guarda el agente → **Copia el Agent ID** (formato: `agent_xxxxxxxxxxxx`)

---

## Paso 3: Configurar la app

```bash
# En la carpeta del proyecto:
cp .env.example .env
```

Edita `.env` y pon tu Agent ID:
```
VITE_AGENT_ID=agent_xxxxxxxxxxxx
```

---

## Paso 4: Arrancar

```bash
npm run dev
```

Abre http://localhost:5173 — la app está lista.

---

## Flujo de la demo (3 minutos)

1. **Pantalla inicial** → ejercicio: PUSH-UPS, 12 reps
2. Pulsa **START SET** → Goggins empieza a hablar
3. "Actúa" haciendo flexiones → di en voz alta **"no puedo más"**
4. Goggins responde directamente a eso ← **este es el wow moment**
5. Di **"Done"** → Goggins suelta la frase épica y se calla
6. Timer de descanso de 30s aparece automáticamente

---

## Troubleshooting

| Problema | Solución |
|---------|----------|
| "AGENT ID MISSING" | Comprueba que `.env` tiene `VITE_AGENT_ID` y reinicia `npm run dev` |
| No se conecta | Revisa que el agente en ElevenLabs está publicado (no en draft) |
| No se escucha la voz | Permite acceso al micrófono en el navegador |
| Voz suena genérica | El Voice ID del agente no apunta a la voz clonada — revisarlo en el dashboard |
