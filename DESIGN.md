---
name: edenna-puzzle
description: Editor e player di puzzle a linea: strumenti sobri in grigio caldo con accento giallo attorno a una board clinica bianca e blu.
colors:
  ed-bg: "#f6f5f1"
  ed-side: "#efede6"
  ed-surface: "#ffffff"
  ed-border: "#e2dfd6"
  ed-text: "#23221f"
  ed-muted: "#77736a"
  ed-accent: "#f2c230"
  ed-accent-ink: "#3a2e00"
  ed-accent-hover: "#e9b81f"
  ed-accent-wash: "#fff8dc"
  ed-danger: "#b8323f"
  ed-ok: "#1d7f5a"
  header-ink: "#1b1d22"
  board-panel: "#eef1f5"
  board-panel-edge: "#d5dbe3"
  board-line: "#b9c3cf"
  board-path: "#1f5fd6"
  board-success: "#0f9b8e"
  board-error: "#d4384a"
  board-hexagon: "#2b3442"
  sym-black: "#1c222b"
  sym-white: "#ffffff"
  sym-cyan: "#12b5c9"
  sym-magenta: "#c2358f"
  sym-yellow: "#e9b322"
  sym-red: "#d4384a"
  sym-green: "#2fa652"
  sym-blue: "#2f63d8"
  sym-orange: "#ef7d1a"
typography:
  body:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  title:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "0.02em"
  label:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.08em"
  brand:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.22em"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace"
    fontSize: "13px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "24px"
components:
  button:
    backgroundColor: "{colors.ed-surface}"
    textColor: "{colors.ed-text}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary:
    backgroundColor: "{colors.ed-accent}"
    textColor: "{colors.ed-accent-ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.ed-accent-hover}"
  tool:
    backgroundColor: "{colors.ed-surface}"
    textColor: "{colors.ed-text}"
    rounded: "{rounded.md}"
    padding: "7px 1px 6px"
  tool-active:
    backgroundColor: "{colors.ed-accent-wash}"
  tab-active:
    backgroundColor: "{colors.ed-accent}"
    textColor: "{colors.ed-accent-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
---

# Design System: edenna-puzzle

## Overview

**Creative North Star: "Il Banco del Collaudatore"**

Due mondi che non si mescolano. Fuori dalla board c'è il banco di lavoro dello staff: grigio caldo, sobrio, con un solo accento giallo che segnala ciò che è attivo. Al centro c'è la board, il pezzo sotto collaudo: bianco clinico, linee grigio-azzurre, percorso blu aziendale. Gli strumenti si fanno da parte e lasciano la scena all'enigma.

La densità è quella di uno strumento da lavoro: pannelli laterali compatti (270px e 296px attorno alla board), testo a 14px, etichette piccole in maiuscolo spaziato. Il giallo compare solo dove c'è uno stato (strumento attivo, azione primaria, scheda corrente, focus). La board ha un suo tema, sovrascrivibile per puzzle tramite `background` e `palette`.

L'interfaccia rifiuta lo stile da dashboard aziendale generica: niente card anonime, niente metriche decorative. Ogni elemento serve a costruire o provare un puzzle.

**Key Characteristics:**
- Due temi separati: `--ed-*` (strumenti) e `--ep-*` (board).
- Piatto e tonale: bordi sottili e variazioni di tono, ombre solo per i menu.
- Un solo accento caldo (giallo) per lo stato attivo e l'azione primaria.
- IBM Plex Sans per l'interfaccia, IBM Plex Mono per JSON e valori.
- Movimento minimo e funzionale, con `prefers-reduced-motion` rispettato.

## Colors

Grigio caldo e carta per gli strumenti, bianco clinico e blu per la board, nove colori di simbolo saturi e distinti.

### Primary
- **Giallo Segnalatore** (`ed-accent`): azione primaria, scheda attiva, bordo dello strumento attivo, focus dei campi e cursore di intervallo. Mai come riempimento di superfici estese.
- **Inchiostro Ambra** (`ed-accent-ink`): testo sopra il giallo. Il contrasto con il nero puro non serve, ma il testo scuro caldo sì.

### Secondary
- **Blu del Percorso** (`board-path`): il tracciato del giocatore e il cursore. Vive solo nella board.
- **Verde Chiusura** (`board-success`): il percorso risolto, con bagliore.
- **Rosso Errore** (`board-error`): percorso fallito e alone dei simboli non soddisfatti.

### Neutral
- **Carta Calda** (`ed-bg`) e **Carta Laterale** (`ed-side`): fondo degli strumenti e dei pannelli laterali, appena più scuro.
- **Superficie** (`ed-surface`): campi, pulsanti e righe selezionate.
- **Bordo Sabbia** (`ed-border`): unico separatore, 1px.
- **Inchiostro** (`ed-text`) e **Grigio Sabbia** (`ed-muted`): testo e testo secondario.
- **Nero Intestazione** (`header-ink`): barra superiore della demo.
- **Pannello Clinico**, **Bordo Pannello**, **Linea Griglia**, **Esagono**: neutri freddi della board.
- **Simboli** (`sym-*`): nero, bianco, ciano, magenta, giallo, rosso, verde, blu, arancio. Il bianco ha contorno (`#9aa6b5`) perché poggia su un pannello chiaro.

### Named Rules
**The Two Worlds Rule.** Strumenti caldi, board fredda. Il giallo non entra nella board e il blu non entra negli strumenti.
**The One Signal Rule.** Il giallo indica uno stato attivo, mai decorazione. Se due cose sulla stessa schermata sono gialle, una non dovrebbe esserlo.

## Typography

**Interface Font:** IBM Plex Sans (con system-ui, Segoe UI)
**Mono Font:** IBM Plex Mono (con ui-monospace, Menlo)

**Character:** Tecnica ma umana, leggibile a piccole dimensioni. Il mono segna ciò che si può copiare o modificare a mano (JSON, valori colore).

### Hierarchy
- **Title** (500, 22px, letter-spacing 0.02em): titolo del puzzle in modalità gioco.
- **Body** (400, 14px, 1.4): tutta l'interfaccia degli strumenti.
- **Label** (600, 11px, 0.08em, maiuscolo): titoli di gruppo e barre delle liste.
- **Brand** (600, 14px, 0.22em): nome del prodotto nella barra superiore.
- **Mono** (400, 13px): editor JSON e valori esadecimali.

### Named Rules
**The Small Caps Label Rule.** I titoli di gruppo sono in maiuscolo spaziato a 11px; mai per frasi intere.

## Layout

L'editor è una griglia a tre colonne: strumenti (270px), stage flessibile con la board, proprietà e JSON (296px), separate da filtri a 1px. La demo ha una barra superiore alta 52px e una colonna raccolta di 252px. Il player riempie il contenitore mantenendo le proporzioni della board. Sotto 1000px l'editor si ricompone; sotto 760px lo fanno raccolta e demo. Ritmo base a multipli di 4px (4, 8, 12, 24).

## Elevation & Depth

Piatto e tonale. La profondità si ottiene con il fondo carta, il pannello laterale appena più scuro e la superficie bianca per ciò che si può toccare. Le ombre compaiono solo per il menu a comparsa (`0 8px 24px rgba(0,0,0,0.14)`) e per il segmento attivo (`0 1px 2px rgba(0,0,0,0.12)`). Nella board l'unica luce è il bagliore del percorso (`drop-shadow` blu mentre si traccia, verde alla soluzione).

### Named Rules
**The Flat-By-Default Rule.** Le superfici sono piatte a riposo. L'ombra appare solo per ciò che galleggia.

## Shapes

Angoli morbidi ma contenuti, tra 4px e 12px. Pulsanti e strumenti a 8px, campi a 7px, righe di lista a 9px, pannelli e finestre a 10–12px. I campioni colore e le miniature sono circolari o a 6px. Bordo pieno a 1px, mai doppio. Lo stato attivo di uno strumento usa bordo giallo più un anello interno di 1px.

## Components

### Buttons
- **Shape:** 8px.
- **Default:** superficie bianca, bordo sabbia, 6px 12px, peso 500. Hover: fondo `#faf8f2`.
- **Primary:** giallo con testo ambra scuro; hover `#e9b81f`.
- **Danger:** stessa forma, testo in rosso errore.
- **Disabled:** opacità 0.45, nessun cursore attivo.

### Tool tiles
- Griglia di tre colonne, icona 30px su pannello clinico, etichetta 11px.
- **Attivo:** bordo giallo, fondo crema (`#fff8dc`), anello interno di 1px.

### Segmented control
- Pulsanti a 7px in un contenitore; l'attivo è bianco con ombra minima.

### Tabs (demo)
- Su barra scura: testo grigio chiaro, hover bianco. Attiva: riempimento giallo con testo ambra, 6px 14px, raggio 7px.

### Lista raccolte
- Righe da 9px con miniatura della board. Attiva: fondo bianco e bordo giallo. Il menu ⋯ appare a piena opacità solo su hover o focus.

### Campi
- Bordo sabbia, raggio 7px, focus con contorno giallo 2px. JSON in mono.
- **Indicatori di contrasto:** pillole verde, ambra o rossa chiare con testo scuro dello stesso tono.

### Board
- Pannello clinico con bordo sottile, griglia grigio-azzurra, partenze piene, esagono scuro, ponte con staffe quadrate. Un simbolo in errore lampeggia con un alone rosso (4 cicli a 0.4s); uno eliminato scende a 0.22 di opacità.

## Do's and Don'ts

### Do:
- **Do** tenere il giallo per lo stato attivo, l'azione primaria e il focus.
- **Do** usare i token `--ed-*` fuori dalla board e `--ep-*` dentro.
- **Do** dare ai simboli bianchi un contorno `#9aa6b5` sul pannello chiaro.
- **Do** rispettare `prefers-reduced-motion`: i lampeggi diventano uno stato fisso.
- **Do** usare IBM Plex Mono per JSON e valori che l'utente può modificare.

### Don't:
- **Don't** costruire un'interfaccia da dashboard aziendale generica: niente card anonime in griglia, niente metriche decorative.
- **Don't** mettere il giallo dentro la board né il blu del percorso negli strumenti.
- **Don't** usare ombre per dare gerarchia ai pannelli a riposo.
- **Don't** aggiungere un secondo accento caldo accanto al giallo.
- **Don't** coprire la board con elementi di interfaccia: lo staff deve vederla intera.
