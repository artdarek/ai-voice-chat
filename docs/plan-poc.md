# Voice AI Chat PoC

## Context

Budujemy PoC głosowego czatu z AI. Użytkownik mówi przez mikrofon, słyszy odpowiedzi AI w czasie rzeczywistym, a w tle wyświetla się tekstowy transkrypt. **Całość komunikacji z OpenAI musi przechodzić przez nasz backend** — frontend nie łączy się z OpenAI bezpośrednio.

---

## Architektura

```
Browser (Mic/Speaker)
    |                           FastAPI Backend
    |←──────WebSocket──────────→|
    |  - audio PCM16 (base64)   |←──────WebSocket──────→ OpenAI Realtime API
    |  - JSON events            |  (relay bidirectional)  wss://api.openai.com/v1/realtime
    |  - transkrypt / audio     |
```

**Backend** pełni rolę WebSocket relay:
- Akceptuje połączenie WS od przeglądarki
- Otwiera WS do OpenAI Realtime API (z kluczem API tylko po stronie serwera)
- Przekazuje wiadomości bidirectionally

Brak ephemeral tokenów, brak WebRTC, klucz API nigdy nie trafia do przeglądarki.

---

## Struktura plików

```
aichat/
├── main.py                    # FastAPI: WebSocket relay + static files
├── requirements.txt
├── .env.example               # OPENAI_API_KEY template
└── static/
    ├── index.html
    ├── style.css
    ├── app.js                 # Logika UI + WebSocket + audio pipeline
    └── audio-processor.js     # AudioWorklet: Float32→PCM16 (osobny moduł worklet)
```

---

## Uruchomienie

```bash
make setup   # jednorazowo: tworzy venv, instaluje zależności, kopiuje .env
make run     # uruchamia serwer na http://localhost:8000
```

Lub ręcznie:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # + wpisz OPENAI_API_KEY
uvicorn main:app --reload --port 8000
```

---

## Implementacja

### `requirements.txt`

```
fastapi
uvicorn[standard]
python-dotenv
websockets
```

### `main.py` — WebSocket relay

```python
import os, asyncio, websockets
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o-realtime-preview-2024-12-17"
OPENAI_WS_URL = f"wss://api.openai.com/v1/realtime?model={MODEL}"

app = FastAPI()

@app.websocket("/ws")
async def relay(websocket: WebSocket):
    await websocket.accept()
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1",
    }
    async with websockets.connect(OPENAI_WS_URL, additional_headers=headers) as openai_ws:
        async def browser_to_openai():
            async for msg in websocket.iter_text():
                await openai_ws.send(msg)

        async def openai_to_browser():
            async for msg in openai_ws:
                if isinstance(msg, bytes):
                    await websocket.send_bytes(msg)
                else:
                    await websocket.send_text(msg)

        _, pending = await asyncio.wait(
            [asyncio.create_task(browser_to_openai()),
             asyncio.create_task(openai_to_browser())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()

# StaticFiles OSTATNI — po rejestracji routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")
```

---

### `static/audio-processor.js` — AudioWorklet

Osobny plik JS ładowany przez `audioContext.audioWorklet.addModule()`.

```javascript
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input.length) return true;
    const float32 = input[0];
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage({ type: 'audio', data: int16.buffer }, [int16.buffer]);
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
```

---

### `static/app.js` — kluczowe fragmenty

**Inicjalizacja sesji po otwarciu WS:**
```javascript
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      modalities: ['audio', 'text'],
      voice: 'alloy',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: { type: 'server_vad', threshold: 0.5,
                        prefix_padding_ms: 300, silence_duration_ms: 600 }
    }
  }));
};
```

**Przechwytywanie mikrofonu → AudioWorklet → WS:**
```javascript
const audioContext = new AudioContext({ sampleRate: 24000 });
await audioContext.audioWorklet.addModule('audio-processor.js');
const source = audioContext.createMediaStreamSource(micStream);
const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

workletNode.port.onmessage = ({ data }) => {
  if (data.type === 'audio' && ws.readyState === WebSocket.OPEN) {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(data.data)));
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
  }
};
source.connect(workletNode);
```

**Odtwarzanie audio AI (response.audio.delta → Web Audio API):**
```javascript
let nextPlayTime = 0;

function playAudioChunk(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

  const buf = audioContext.createBuffer(1, float32.length, 24000);
  buf.getChannelData(0).set(float32);
  const src = audioContext.createBufferSource();
  src.buffer = buf;
  src.connect(audioContext.destination);
  const start = Math.max(nextPlayTime, audioContext.currentTime);
  src.start(start);
  nextPlayTime = start + buf.duration;
}
```

**Obsługa zdarzeń z WS:**

| Zdarzenie | Akcja |
|---|---|
| `session.created` / `session.updated` | Status: "Connected" |
| `input_audio_buffer.speech_started` | Utwórz placeholder bąbelka użytkownika (`…`) |
| `conversation.item.input_audio_transcription.completed` | Wypełnij bąbelek użytkownika transkryptem |
| `response.audio.delta` | `playAudioChunk(data.delta)` |
| `response.audio_transcript.delta` | Streamuj tekst do bąbelka AI |
| `response.audio_transcript.done` | Finalizuj bąbelek AI |
| `response.done` | Status: "Connected - speak now" |

**Mute — wyłącz track bez zrywania połączenia:**
```javascript
micStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
```

---

## UI (`index.html` + `style.css`)

- Ciemny motyw
- Przycisk **Connect** → inicjuje WS + mikrofon
- Przycisk **Mute** (po połączeniu)
- Wskaźnik statusu (kolor + pulsowanie)
- Panel transkryptu z bąbelkami (user po prawej, assistant po lewej)
- Placeholder bąbelka użytkownika (`pending`) tworzony przy `speech_started` — AI response zawsze pojawia się poniżej
- Streaming AI z klasą `.streaming` (podświetlona ramka + migający kursor)

---

## Checklist weryfikacyjna

- [ ] `http://localhost:8000` serwuje index.html
- [ ] WS connect do `/ws` — w logach backendu widać połączenie z OpenAI
- [ ] `session.created` pojawia się w console przeglądarki
- [ ] Mowa użytkownika pojawia się w transkrypcie (whisper-1)
- [ ] AI odpowiada głosowo (Web Audio) + tekstowo (streaming bąbelek)
- [ ] Kolejność bąbelków: użytkownik zawsze przed odpowiedzią AI
- [ ] Mute wycisza mikrofon bez zrywania połączenia
- [ ] Disconnect czyści WS, AudioContext, media tracks

---

## Krytyczne uwagi

1. **`StaticFiles` ostatni** w `main.py` — inaczej swallowuje `/ws`
2. **AudioContext sampleRate: 24000** — wymagane przez OpenAI Realtime API
3. **AudioWorklet w osobnym pliku** (`audio-processor.js`) — nie może być inline
4. **`nextPlayTime` do kolejkowania audio** — bez tego chunki audio nakładają się
5. **`getUserMedia` tylko na localhost/HTTPS** — produkcja wymaga TLS
6. **Server VAD** — OpenAI automatycznie wykrywa koniec wypowiedzi, brak push-to-talk
7. **`extra_headers` → `additional_headers`** — zmiana API w websockets >= 14.0
8. **Placeholder bąbelka użytkownika** — tworzony przy `speech_started`, aby zachować właściwą kolejność w transkrypcie
