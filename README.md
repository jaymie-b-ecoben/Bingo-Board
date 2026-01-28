# Bingo Board – Goal Bingo Game

**[Repository](https://github.com/jaymie-b-ecoben/Bingo-Board)** · A modern, full-featured bingo board for personal goals. Add your goals, generate a card, and mark tiles as you complete them. Complete a row, column, or diagonal to score a Bingo.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

## Table of Contents

- [About](#about)
- [Features](#features)
- [How to Play](#how-to-play)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Technologies Used](#technologies-used)
- [Documentation](#documentation)
- [About the Developer](#about-the-developer)
- [Contributing](#contributing)
- [License](#license)

## About

**Bingo Board** is a goal-tracking bingo game that runs entirely in the browser. You define a pool of goals (or use sample goals), generate a random board, and mark tiles as you complete them. Win by completing 1 or more Bingos, or go for a full blackout. The game includes a built-in music player, strikes (edit/skip/replace tiles), pause/resume, and the ability to save cards and download your board as an image after a win.

No server or database required — everything is stored in the browser (localStorage).

## Features

- **Goal pool** — Add your own goals (one per line) or use sample goals. Save and load goal pools.
- **Customizable board** — Board size (3×3, 4×4, 5×5), win condition (1–5 Bingos or Blackout), optional center “Free” space.
- **Strikes** — Long-press a tile to use a strike: edit the goal, skip it (counts as marked), or replace with a random goal from your pool. Three strikes per game.
- **Pause & resume** — Pause the timer; no moves allowed until you resume. Clear pause banner when paused.
- **Scoring** — +10 per mark, −8 per unmark, +75 per Bingo line.
- **Save Card** — Save your current board with a name and view saved cards from the home screen.
- **Download Card** — After a win, download an image of your board (filename: `Bingo Board - YYYY-MM-DD.png`).
- **Music player** — Built-in player: play tracks from the `music/` folder, upload MP3s, or add YouTube links. Background music option.
- **Responsive design** — Works on desktop and mobile. No build step.

## How to Play

1. **Goal pool** — Add your goals (one per line) in the text area, or click **Use sample** to fill with example goals.
2. **Settings** — Choose board size (3×3, 4×4, or 5×5), win condition (1 Bingo, 2 Bingos, etc., or Blackout), and whether to use a center “Free” space.
3. **Generate** — Click **Generate** to create your board, then click **Start** to begin.
4. **Play** — Tap a tile to mark it complete. Complete a full row, column, or diagonal to score a Bingo.
5. **Strikes** — Long-press a tile to use a strike: edit the goal, skip it (counts as marked), or replace it with a random goal from your pool. You get 3 strikes per game.
6. **Pause** — Use **Pause** to stop the timer; resume to continue. You cannot make moves while paused.
7. **After a win** — Use **Download Card** to save an image of your board, or **Save Card** to store the card with a name for later.

Click the **?** button anytime for the in-app guide.

## Installation

### For non-programmers

1. On GitHub, click the green **Code** button, then **Download ZIP**.
2. Unzip the folder on your computer.
3. Open the folder and double-click **`index.html`** to open the game in your browser.
4. (Optional) Add MP3 files to the **`music/`** folder and edit **`music/music-list.json`** for titles and artists.

### For programmers

```bash
git clone https://github.com/jaymie-b-ecoben/Bingo-Board.git
cd Bingo-Board
```

- Open **`index.html`** in a browser (double-click or `open index.html`), or
- Run a local server, e.g.:
  ```bash
  npx serve .
  ```
  Then open the URL shown (e.g. `http://localhost:3000`).

## Project Structure

| Path                 | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `index.html`         | Main app: setup, game board, game over, and music player UI |
| `css/styles.css`     | All styles                                                  |
| `js/game.js`         | Bingo game logic (board, scoring, strikes, save/load)       |
| `js/music-player.js` | Music player (playlist, background music)                   |
| `js/background.js`   | Background canvas                                           |
| `music/`             | MP3 files and `music-list.json` for the player              |

## Technologies Used

- **HTML5** — Structure and semantics
- **CSS3** — Layout, responsive design, styling
- **JavaScript** — Game logic, music player, localStorage persistence

No frameworks, no build step. Data is stored in the browser (localStorage).

## Documentation

- In-app **?** button opens a **How to play** guide (play, strikes, scoring, save & share).
- This README covers installation, structure, and usage.

## About the Developer

Developed with ♥ by **Jaymie**.

## Contributing

Open an [issue](https://github.com/jaymie-b-ecoben/Bingo-Board/issues) or submit a [pull request](https://github.com/jaymie-b-ecoben/Bingo-Board/pulls) on [GitHub](https://github.com/jaymie-b-ecoben/Bingo-Board).

## License

This project is open source. Use and modify as you like. Developed with ♥ by Jaymie.
