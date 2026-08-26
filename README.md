# 🃏 Burraco Pro – Casino WebGL 3D Edition

Un'applicazione web moderna e interattiva per giocare a **Burraco** in modalità Single Player contro tre avanzati Bot di intelligenza artificiale, realizzata con una raffinata grafica tridimensionale ed animazioni realistiche.

## ✨ Caratteristiche Principali

- **🎮 Gameplay Completo di Burraco**: Regole ufficiali con gestione del Mazzo (Tallone), Pozzetti, Scarti, calate di Gruppi (combinazioni) e Scale (sequenze) sia pulite che sporche.
- **🤖 Bot Sequenziali Realistici**: Gli avversari e il tuo compagno giocano i propri turni calando una combinazione alla volta con un ritardo di 2.5 secondi, permettendoti di seguire visivamente ogni singola mossa come in una partita reale.
- **🖐️ Drag & Drop Precision**: Trascina le carte nella tua mano per riordinarle manualmente in modo deterministico e fluido. Hover ed elevazione 3D dinamici che portano la carta selezionata in primo piano senza coprire le altre.
- **✨ Grafica Premium**: Tavolo da gioco verde casinò con ombreggiature, finiture in mogano tridimensionali, scritte auto-allineanti e contatori di carte in tempo reale.
- **🏆 Punteggio Dinamico**: Calcolo automatico dei punti a fine round (punti carte, bonus Burraco pulito/sporco, penalità pozzetto non preso).

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite
- **Stile**: Tailwind CSS (PostCSS)
- **Animazioni**: CSS Canvas Confetti
- **Testing**: Playwright (Test automatici del browser Chrome reali)

## 🚀 Installazione Locale

Per far girare il gioco sul tuo computer:

1. Clona o scarica la cartella del progetto.
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Avvia il server di sviluppo locale:
   ```bash
   npm run dev
   ```
4. Apri l'indirizzo mostrato nel terminale (solitamente `http://localhost:5173/`).

## 🧪 Testing dei Componenti

Il progetto include uno script di test automatizzato con **Playwright** per convalidare il comportamento del drag-and-drop del mouse, le proporzioni dell'interfaccia e la visibilità dei tasti di gioco in Chrome:
```bash
# Esegue il test suite automatico
node scratch/test_drag.cjs
```
*(Lo script si collega al server, lancia Chrome in background, simula il drag-and-drop reale e verifica la correttezza del riordino delle carte).*
