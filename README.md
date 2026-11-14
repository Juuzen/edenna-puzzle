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

Il player occupa il 100% del contenitore e mantiene le proporzioni: ogni puzzle sta in un pannello
quadrato, con la griglia centrata anche se non è quadrata. Per farlo ripartire da zero
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
| `animateRainbow` | `true` | Fa ciclare i colori dei puzzle con `rainbow` |
| `applyShift` | `true` | Sposta e ruota la griglia dei puzzle con `shift` |

Comandi: clic sul cerchio di partenza, il percorso segue il puntatore, clic sull'uscita per confermare
(oppure trascina e rilascia; su touch si trascina). Clic destro / Esc annulla, e un percorso
abbandonato svanisce con una breve dissolvenza. Mentre si traccia, un cerchietto mostra la
posizione del puntatore (e il suo riflesso nei puzzle simmetrici); si attenua quando il puntatore
è troppo lontano dalle linee per essere seguito.
Da tastiera: Invio per partire, frecce o WASD per muovere, Invio sull'uscita per confermare.
Nei puzzle sfalsati (`shift`) la tastiera non traccia: resta solo Esc per annullare e la board esce
dall'ordine di tabulazione.

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
`--ep-error`, `--ep-c-<colore>`, `--ep-bridge` per lo spessore del mirino del ponte…). Ogni puzzle può avere sfondo e colori propri (`background`, `palette`)
e l'effetto **arcobaleno** (`rainbow`): durante il gioco i colori di simboli e sfondo ciclano, partendo
ciascuno dal proprio colore base. Il player lo anima (`PuzzlePlayer`, prop `animateRainbow`, attiva per
default); `PuzzleBoard` resta statica a meno di `animateRainbow`, così editor e miniature mostrano i
colori base.

### Sfalsamento

Come nei pannelli finali di *The Witness*, la griglia può apparire spostata e ruotata pur restando
ferma (`shift`). Il giocatore traccia dove la griglia starebbe dritta, cioè dove la vede in Modifica,
mentre linea, cursore e griglia si vedono spostati: con 90° di rotazione, muovere il puntatore a
destra fa scendere la linea. Ciò che esce dal pannello rientra dal lato opposto (effetto Pacman). Il
player lo applica (`applyShift`, attivo per default); `PuzzleBoard` lo applica solo con `applyShift`,
così in Modifica e nelle miniature la griglia resta dritta, segnalata da un piccolo segno.

## Formato JSON

```json
{
  "format": "edenna-puzzle",
  "version": 1,
  "id": "p12",
  "title": "Anomalia",
  "background": {"colors":["#eef1f5","#c9d6e8"],"angle":135},
  "palette": {"line":"#979faa","path":"#256be4","success":"#12816f"},
  "rainbow": {"elements":{"period":8},"background":{"period":12}},
  "shift": {"x":0.5,"y":-0.25,"rotation":15},
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

`rainbow` (facoltativo) fa ciclare i colori durante il gioco (Prova nell'editor e player), con due livelli
indipendenti: `elements` (quadrati, stelle, triangoli, poliomini, eliminatori, esagoni e ponti) e
`background` (il pannello, tinta unita o gradiente, anche quello predefinito). Un livello presente è
attivo; `period` è la durata di un ciclo completo in secondi (1–16, default 8). Griglia e percorso non
cambiano. È solo visivo: regole, solver e validazione usano sempre il `color` base. Il colore base è il
punto di partenza: ogni colore ha una fase fissa nel ciclo, a 36° dalle altre (rosso, arancio, giallo,
bianco, verde, ciano, nero, blu, magenta; esagoni e ponti hanno una fase tutta loro, fra blu e magenta),
quindi due simboli dello stesso colore restano identici e due di colore diverso restano distinguibili in
ogni istante. I colori sono `oklch()` con la tinta animata da
CSS (`@property`, nessun loop JS): i simboli hanno luminosità fissa (almeno 3:1 sul pannello del tema),
lo sfondo conserva la propria luminosità, quindi il contrasto con griglia e percorso resta stabile.
Nell'editor il pannello Aspetto mostra quel contrasto nel punto peggiore del ciclo. Con
`prefers-reduced-motion` il ciclo rallenta molto (almeno 120 s). Le funzioni sono esportate:
`rainbowStyle`, `rainbowBackgroundCss`, `syncRainbowClock` (allinea più elementi animati allo stesso
orologio), `rainbowWorstContrast`.

`shift` (facoltativo) sposta e ruota la griglia solo a livello visivo, nel player (Prova nell'editor e
Gioca): `x` e `y` in celle (positivi verso destra e verso il basso, fino a ±12), `rotation` in gradi in
senso orario attorno al centro della griglia (normalizzata in [0, 360)). Gli zeri si omettono. Input,
regole, solver e validazione non lo leggono: il puntatore lavora sulla griglia dritta. Il pannello resta
fermo; ciò che ne esce rientra dal lato opposto, e con rotazioni oblique le parti rientrate possono
sovrapporsi alla griglia. Nei puzzle sfalsati la tastiera non traccia. `hasShift(puzzle)` dice se un
puzzle è sfalsato.

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
- Nuovo effetto **arcobaleno** (`rainbow`): i colori di simboli e sfondo ciclano durante il gioco,
  ciascuno dal proprio colore base; nell'editor restano fermi e un indicatore lo segnala.
- Nuovo **sfalsamento** (`shift`): la griglia appare spostata e ruotata, con avvolgimento ai bordi,
  mentre si traccia sulla griglia dritta. Tutti i puzzle stanno in un pannello quadrato.
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
