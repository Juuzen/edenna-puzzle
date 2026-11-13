# edenna-puzzle

Editor e visualizzatore di puzzle a linea nello stile di *The Witness*, in React + TypeScript.
È un porting moderno di [windmill-client](https://github.com/thefifthmatt/windmill-client)
(AngularJS + Closure, 2016), pensato per essere incluso in Edenna OS.

- **Motore** in TypeScript puro (`src/engine`): modello, validazione, solver, import/export. Nessuna dipendenza, gira anche in Node/Electron.
- **`<PuzzlePlayer>`**: puzzle giocabile con mouse, touch e tastiera.
- **`<PuzzleEditor>`**: editor completo con annulla/ripeti, prova, solver, JSON modificabile a mano.
- **`<PuzzleLibrary>`**: gestione di più raccolte con nome, export intero o selettivo, import con scelta.
- **Formato JSON** leggibile e versionato.

## Avvio

```bash
npm install
npm run dev        # demo: raccolta + editor + modalità gioco su http://localhost:5173
npm test           # test del motore e degli esempi
npm run build      # build della demo in dist/app
npm run build:lib  # build della libreria in dist/lib (JS + CSS + .d.ts)
```

La demo salva le raccolte nel `localStorage` del browser e parte dai puzzle in [`examples/`](examples/)
(raccolta «Esempi»).

## Uso in un'altra app (es. Edenna OS)

```tsx
import { PuzzlePlayer, parsePuzzle } from 'edenna-puzzle';
import 'edenna-puzzle/style.css';
import raw from './puzzles/altrove-b12.json';

const { puzzle } = parsePuzzle(raw);

<PuzzlePlayer
  puzzle={puzzle}
  onSolve={(result, paths) => apriPorta(puzzle.data?.stanza)}
  onFail={(result) => log('tentativo fallito', result.errors.length)}
/>;
```

Il player occupa il 100% del contenitore e mantiene le proporzioni. Per farlo ripartire da zero
basta cambiargli `key`. Props principali:

| Prop | Default | |
|---|---|---|
| `puzzle` | — | Il puzzle da giocare |
| `onSolve(result, paths)` | | Soluzione corretta |
| `onFail(result, paths)` | | Tentativo sbagliato (con i simboli in errore) |
| `onStart()` | | Inizio di un tracciamento (suoni, log…) |
| `revealErrors` | `true` | Fa lampeggiare i simboli non soddisfatti |
| `lockOnSolve` | `true` | Blocca il puzzle dopo la soluzione |
| `disabled` | `false` | |
| `captureRadius` | `0.25` | Distanza (in celle) dalle linee entro cui il percorso segue il puntatore; al centro delle celle viene ignorato |
| `cancelFadeMs` | `400` | Durata della dissolvenza di un percorso abbandonato |

Comandi: clic sul cerchio di partenza, il percorso segue il puntatore, clic sull'uscita per confermare
(oppure trascina e rilascia; su touch si trascina). Clic destro / Esc annulla, e un percorso
abbandonato svanisce con una breve dissolvenza. Mentre si traccia, un cerchietto mostra la
posizione del puntatore (e il suo riflesso nei puzzle simmetrici); si attenua quando il puntatore
è troppo lontano dalle linee per essere seguito.
Da tastiera: Invio per partire, frecce o WASD per muovere, Invio sull'uscita per confermare.

Per validare soluzioni lato server o in Electron senza React:

```ts
import { parsePuzzle, validate, solve } from 'edenna-puzzle/engine';
validate(puzzle, [path]).valid;
```

### Raccolte

`<PuzzleLibrary>` è controllato: lo stato (lista di `PuzzleCollection`) vive in chi lo usa, che decide
anche dove salvarlo.

```tsx
const [collections, setCollections] = useState<PuzzleCollection[]>([{ name: 'Stanza B', puzzles }]);
const [active, setActive] = useState({ collection: 0, puzzle: 0 });

<PuzzleLibrary collections={collections} onChange={setCollections} active={active} onActiveChange={setActive} />;
```

Permette di creare, rinominare, duplicare ed eliminare raccolte; aggiungere, duplicare, riordinare ed
eliminare puzzle; selezionarne più di uno per esportarli, copiarli in un'altra raccolta o eliminarli.
«Importa…» apre `<ImportDialog>`: si scelgono i puzzle del file e la destinazione (aggiungi alla
raccolta attiva, sostituiscine il contenuto, nuova raccolta). Le stesse operazioni sono disponibili
come funzioni pure (`applyImport`, `withFreshIds`, `moveItem`, `ensureIds`…).

**Id interni.** Ogni raccolta (`c1`, `c2`…) e ogni puzzle (`p1`, `p2`…) ha un `id` interno, univoco
(per i puzzle su tutte le raccolte) e generato in modo deterministico: il prossimo è il massimo esistente
+ 1. Non si mostra né si modifica: serve a editor, libreria e viewer per riferire un puzzle senza
ambiguità. `ensureIds` li assegna dove mancano o sono duplicati; ogni puzzle che entra in una raccolta
(nuovo, duplicato, copiato, importato) riceve un id nuovo con `withFreshIds`, quindi l'import non ha
conflitti. Con `<PuzzleEditor value>` controllato, il cambio di `id` fa ricaricare l'editor.

### Colori

Un solo aspetto (bianco clinico e blu aziendale), definito come variabili CSS su `:root` in
[`theme.css`](src/components/theme.css) (`--ep-panel`, `--ep-line`, `--ep-path`, `--ep-success`,
`--ep-error`, `--ep-c-<colore>`, `--ep-bridge` per lo spessore del mirino del ponte…). Ogni puzzle può avere sfondo e colori propri (`background`, `palette`).

## Formato JSON

```json
{
  "format": "edenna-puzzle",
  "version": 1,
  "id": "p12",
  "title": "Anomalia",
  "background": {"colors":["#eef1f5","#c9d6e8"],"angle":135},
  "palette": {"line":"#979faa","path":"#256be4","success":"#12816f"},
  "width": 3,
  "height": 3,
  "symmetry": "none",
  "points": [
    {"x":0,"y":3,"type":"start"},
    {"x":3,"y":0,"type":"end"},
    {"x":1,"y":1,"type":"hexagon"}
  ],
  "edges": [
    {"x":1,"y":2,"dir":"h","type":"gap"},
    {"x":2,"y":0,"dir":"v","type":"missing"},
    {"x":0,"y":1,"dir":"v","type":"hexagon"}
  ],
  "cells": [
    {"x":0,"y":0,"type":"square","color":"black"},
    {"x":1,"y":0,"type":"star","color":"orange"},
    {"x":2,"y":0,"type":"polyomino","shape":["##","#."],"rotatable":true},
    {"x":0,"y":1,"type":"polyomino","shape":["#"],"negative":true},
    {"x":1,"y":1,"type":"eliminator"},
    {"x":2,"y":2,"type":"triangle","count":2}
  ],
  "data": {"stanza": "B-12"}
}
```

**Coordinate.** La griglia ha `width` × `height` celle (max 12). I punti (incroci) vanno da `(0,0)` a
`(width,height)`, con `y` che cresce verso il basso. La cella `(x,y)` ha in alto a sinistra il punto `(x,y)`.
Un lato `"h"` in `(x,y)` collega i punti `(x,y)`–`(x+1,y)`; un lato `"v"` collega `(x,y)`–`(x,y+1)`.
Un solo elemento per posizione.

| Dove | `type` | Campi | Regola |
|---|---|---|---|
| punto | `start` | | Da qui parte il percorso |
| punto | `end` | `dir?` (`up`/`down`/`left`/`right`) | Uscita. Va sul bordo o accanto a un lato `missing`; senza `dir` la direzione è automatica |
| punto | `hexagon` | | Il percorso deve passare per quel punto |
| punto | `bridge` | | Incrocio interno a 4 lati percorribili; il percorso può passarci due volte, sempre dritto; mai nei puzzle simmetrici |
| lato | `hexagon` | | Il percorso deve percorrere quel lato |
| lato | `gap` | | Lato spezzato, non percorribile |
| lato | `missing` | | Lato assente (non disegnato) |
| cella | `square` | `color` | Nella stessa regione solo quadrati di un colore |
| cella | `star` | `color` | Nella regione esattamente due simboli di quel colore (stella compresa) |
| cella | `polyomino` | `shape`, `rotatable?`, `negative?`, `color?` | La regione deve potersi comporre con i suoi poliomini. `shape` è una lista di righe con `#` pieno e `.` vuoto. Rotabili: solo rotazioni, mai specchiature. I negativi sottraggono area |
| cella | `eliminator` | `color?` | Annulla un altro simbolo della sua regione (che deve essere sbagliato) |
| cella | `triangle` | `count` (1–3), `color?` | Il percorso tocca esattamente `count` lati della cella |

`symmetry`: `none`, `horizontal`, `vertical`, `rotational`. Con una simmetria il giocatore traccia
due percorsi speculari contemporaneamente; partenze e uscite vengono sempre messe in coppia.

`title` è facoltativo; `id` è l'id interno descritto sopra (nei file importati viene riassegnato).

`background` (facoltativo) colora il pannello al posto del colore predefinito: `colors` con un colore (tinta unita) o
due (gradiente lineare), in formato `#rrggbb`; `angle` in gradi come in CSS (`0` verso l'alto, `90`
verso destra, `180` verso il basso, default).

`palette` (facoltativo, vale solo insieme a `background`) cambia i colori della griglia (`line`, anche
uscite e cerchio di partenza), del percorso in tracciamento (`path`) e di quello risolto (`success`).
I simboli restano quelli predefiniti. Nell'editor ogni colore mostra il contrasto con lo sfondo (nel punto
peggiore del gradiente) e propone colori consigliati: griglia almeno 2:1 (discreta ma visibile),
percorsi almeno 3:1 (WCAG 1.4.11) e staccati dalla griglia, percorso risolto distinguibile da quello in
tracciamento. Gli stessi calcoli sono esportati dal motore: `contrastRatio`, `checkColor`,
`suggestColors`, `suggestPalette`.

`data` è un oggetto libero che l'editor conserva
così com'è: utile per collegare il puzzle a stanze, eventi o porte.

Per le stelle contano i colori "effettivi": poliomini gialli (blu se negativi), eliminatori bianchi,
triangoli arancioni, se non hanno un `color` esplicito. È lo stesso comportamento dell'originale.

**Raccolte.** Più puzzle in un file:
`{"format": "edenna-puzzle-set", "name": "Stanza B", "description": "…", "puzzles": [ ... ]}`
(`name`, `id` e `description` facoltativi) oppure un semplice array. `parseCollection` / `serializeCollection`
leggono e scrivono anche i metadati; `parsePuzzleSet` / `serializePuzzleSet` solo i puzzle.

**Lettura tollerante.** `parsePuzzle` scarta elementi non validi, fuori griglia o duplicati e li
elenca in `warnings`; solo dimensioni non valide o JSON malformato sono errori.

## Differenze rispetto a windmill-client

- Le regole sono le stesse, ma la verifica è stata riscritta. I **poliomini** sono risolti come copertura
  esatta con molteplicità sull'intera griglia (prima i negativi, poi i positivi): niente più il limite
  "più Y insieme ai poliomini non supportato", e i negativi si sovrappongono correttamente invece di
  annullarsi solo per conteggio. Se area positiva e negativa coincidono la regione è valida, come
  nel gioco e nell'originale.
- Gli **eliminatori** provano tutte le combinazioni: ogni Y annulla un simbolo diverso, due Y possono
  annullarsi a vicenda, e un simbolo può essere annullato solo se era davvero sbagliato.
- Il **solver** è un controllo esaustivo per l'editor (dice se la soluzione è unica, multipla o assente,
  con un limite di tempo di 4 s). Non fa parte del player.
- Nuovo simbolo **ponte** (`bridge`): un incrocio che il percorso può attraversare due volte, sempre
  dritto e senza mai ripercorrere un lato. Il secondo passaggio è disegnato sopra il primo.
- Niente server: pubblicazione, login e lista online dell'originale sono stati tolti. Al loro posto
  ci sono file JSON e una raccolta locale nella demo.
- Il tracciamento usa il puntatore in posizione assoluta invece del pointer lock, così funziona
  anche su touch e in modalità kiosk; c'è il controllo da tastiera.

## Struttura

```
src/engine/       motore (types, grid, validate, polyomino, solve, format) + test
src/components/   PuzzleBoard (SVG), PuzzlePlayer, PuzzleEditor, tracciamento, temi
src/demo/         app demo (raccolta, editor, gioco)
examples/         puzzle di esempio, tutti verificati a soluzione unica dai test
```

## Licenza

Apache 2.0, come l'originale. Vedi [LICENSE](LICENSE) e [NOTICE](NOTICE).
