# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Autori di puzzle in Edenna OS**: progettano stanze ed enigmi con l'editor, li provano, li verificano col solver e li esportano in JSON.
- **Giocatori dentro Edenna OS**: risolvono i puzzle col player (mouse, touch, tastiera) per aprire porte o stanze.
- Gli sviluppatori che integrano la libreria sono un pubblico tecnico secondario (non confermato come utente primario).

## Product Purpose
Editor e visualizzatore di puzzle a linea nello stile di *The Witness*, in React + TypeScript. Porting moderno di windmill-client (AngularJS + Closure, 2016), pensato per essere incluso in Edenna OS. Successo: un autore crea e valida un puzzle, un giocatore lo risolve in modo fluido, e la soluzione si collega a un evento di Edenna OS.

## Positioning
Due cose insieme: (1) libreria React integrabile, con motore in TypeScript puro senza dipendenze (`src/engine`), componenti riusabili (`PuzzlePlayer`, `PuzzleEditor`, `PuzzleLibrary`) e formato JSON leggibile e versionato; (2) strumenti di authoring completi: annulla/ripeti, prova, solver, JSON modificabile a mano, raccolte con nome, import/export selettivo.

## Operating Context
- Demo con raccolte salvate nel `localStorage`, che parte dagli esempi in `examples/`.
- Il player riempie il contenitore mantenendo le proporzioni; i callback (`onSolve`, `onFail`, `onStart`) collegano il puzzle all'app ospite.
- Build separate: demo (`dist/app`) e libreria (`dist/lib`, JS + CSS + .d.ts).

## Capabilities and Constraints
- Stack esistente: Vite, React (peer dep >=18), TypeScript, Vitest.
- Il motore deve restare senza dipendenze e girare anche in Node/Electron.
- Simboli e validazione seguono le regole di *The Witness* (es. ponte: si attraversa solo dritto).
- Ogni interazione deve funzionare con mouse, touch e tastiera.
- Interfaccia, messaggi e documentazione in italiano.

## Brand Commitments
- Licenza Apache-2.0 con NOTICE: mantenere l'attribuzione a windmill-client.
- Nessun marchio o identità visiva propria confermata finora.

## Evidence on Hand
- Puzzle di esempio in `examples/` (raccolta «Esempi»), coperti da test (`src/engine/examples.test.ts`).
- Test del motore, del tracciamento e delle operazioni sulle raccolte.
- Assenti: utenti reali, testimonianze, metriche. Non inventarli.

## Product Principles
1. Il motore è la fonte di verità: la UI non reimplementa regole di gioco.
2. Fedeltà alle regole di *The Witness* prima delle comodità.
3. Il JSON resta leggibile, versionato e modificabile a mano.
4. Il componente si integra senza sorprese: riempie il contenitore, espone callback chiari.
5. Mouse, touch e tastiera sono cittadini di pari livello.

## Accessibility & Inclusion
Accessibilità tastiera e touch richiesta per ogni interazione. Nessuno standard formale (es. WCAG) confermato.
