# Trwala Pamiec Rozmowy Po Disconnect/Refresh (Local-First)

## Podsumowanie
Celem jest:
1. zachowanie historii czatu w UI po refreshu i powrocie na strone,
2. odtworzenie kontekstu rozmowy dla modelu po ponownym `Connect`,
3. pelne wyczyszczenie historii i pamieci przez ikone kosza.

Wybrany kierunek:
- pamiec lokalna w przegladarce (`localStorage`),
- render historii od razu przy starcie strony (przed `Connect`),
- po reconnect model dostaje 1 wiadomosc kontekstowa z ostatnich 20 wiadomosci,
- kosz czysci UI + pamiec + kontekst kolejnych sesji.

---

## Zakres zmian (decision-complete)

### 1. Frontend: model danych pamieci
W `services/website/js` dodac warstwe pamieci:

- Stale klucze:
  - `LS_CHAT_HISTORY_KEY = 'chat_history_v1'`
- Limit:
  - `MAX_HISTORY_MESSAGES = 20` (do modelu),
  - `MAX_PERSISTED_MESSAGES = 200` (do UI; ochrona przed nieograniczonym wzrostem).

- Struktura pojedynczego wpisu:
```json
{
  "id": "string-uuid-or-timestamp",
  "role": "user|assistant",
  "text": "string",
  "createdAt": "ISO-8601 string"
}
```

- Funkcje:
  - `loadChatHistory(): ChatMessage[]`
  - `saveChatHistory(history: ChatMessage[]): void`
  - `appendToHistory(role, text): void`
  - `clearChatHistory(): void`
  - `renderHistory(history): void`
  - `buildModelMemoryMessage(historyLast20): string`

Walidacja:
- jesli `localStorage` ma niepoprawny JSON lub zly format, fallback do `[]` bez crasha.

---

### 2. Frontend: render historii po zaladowaniu strony
W sekwencji inicjalizacji (po `initSettings`) dodac:
- `const history = loadChatHistory();`
- `renderHistory(history);`
- ukrycie `empty-state`, jesli historia niepusta.

Render ma odtwarzac babelki jak obecnie:
- `role=user` -> `addBubble('user', text)`
- `role=assistant` -> `addBubble('assistant', text)`

---

### 3. Frontend: zapisywanie wiadomosci do pamieci
Podpiac zapis tylko dla wiadomosci finalnych (nie token po tokenie):

- User (tekst):
  - w `sendTextMessage()` po `addBubble('user', text)` -> `appendToHistory('user', text)`.
- User (mowa):
  - w `conversation.item.input_audio_transcription.completed` zapisywac tylko, gdy finalny transcript niepusty.
- Assistant:
  - zapisywac po zakonczeniu odpowiedzi (`response.audio_transcript.done`) na bazie tresci finalnego babelka AI.
  - nie zapisywac delty z `response.audio_transcript.delta`.

Edge case:
- jesli rozlaczenie nastapi w trakcie streamingu AI, niedomkniety bablek nie trafia do pamieci.

---

### 4. Frontend: odtwarzanie pamieci modelu po Connect
W `ws.onopen` (po obecnym `session.update` z `voice`) dodac replay:

1. wczytaj historie,
2. wez ostatnie 20 wiadomosci,
3. jesli istnieja:
   - wyslij **jedna** wiadomosc `conversation.item.create` jako `role: "user"` z `content: [{ type: "input_text", text: "<zbudowany kontekst>" }]`,
   - **bez** `response.create` (to tylko kontekst, bez odpowiedzi modelu).

Format tekstu kontekstu (deterministyczny):
- naglowek: "Context from previous chat session:"
- linie: `User: ...`, `Assistant: ...`
- ograniczenie dlugosci:
  - max ~8k znakow (przyciecie od najstarszych tresci), aby nie ryzykowac zbyt duzego payloadu.

---

### 5. UI: ikonka kosza i pelne czyszczenie
W `services/website/index.html` dodac przycisk (np. obok ustawien):

- `id="btn-clear-chat"`
- aria-label/title: "Clear chat memory"

W `services/website/style.css` dodac styl spojny z obecnymi `btn-icon`.

W `app.js`/`main.js` obsluga klikniecia:
1. jesli aktywne polaczenie: `disconnect()`,
2. wyczysc `localStorage` historii,
3. usun wszystkie babelki z `#transcript`,
4. pokaz `empty-state`,
5. zresetuj stan runtime (`currentAiBubble`, `pendingUserBubble`, itp.),
6. status na "Disconnected".

---

## Zmiany w interfejsach/public API
Brak zmian backend API (`/settings`, `/ws` pozostaja bez zmian).

Zmiany frontend:
- nowy element DOM: `#btn-clear-chat`,
- nowy kontrakt localStorage:
  - `chat_history_v1` (JSON array `ChatMessage[]`).

---

## Scenariusze testowe i akceptacyjne

### A. Trwalosc UI
1. Po kilku wiadomosciach zrob refresh.
2. Oczekiwane: historia widoczna od razu, bez `Connect`.

### B. Pamiec modelu po reconnect
1. Napisz "Mam kota o imieniu Filemon".
2. Disconnect -> Connect.
3. Zapytaj "Jak ma na imie moj kot?".
4. Oczekiwane: model pamieta kontekst (z replay).

### C. Czyszczenie koszem
1. Miej historie w oknie.
2. Kliknij kosz.
3. Oczekiwane: UI puste + po refresh nadal puste + po Connect model nie ma dawnego kontekstu.

### D. Odpornosc na uszkodzony localStorage
1. Recznie wpisz niepoprawny JSON pod `chat_history_v1`.
2. Odswiez.
3. Oczekiwane: brak crasha, start z pusta historia.

### E. Limit historii
1. Wygeneruj >200 wiadomosci.
2. Oczekiwane: w localStorage trzymane maksymalnie 200, do modelu wysylane ostatnie 20.

---

## Zalozenia i domyslne decyzje
- Pamiec tylko lokalnie (bez serwera i bez kont uzytkownikow).
- Historia renderowana natychmiast po wejsciu na strone.
- Replay do modelu jako 1 wiadomosc kontekstowa (bez `response.create`).
- Kosz czysci wszystko: UI + localStorage + kontekst kolejnych reconnectow.
- Bez zmian w backendzie na tym etapie.
