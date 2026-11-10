# 180 — Darts Scorer

A touch-first darts scorer for an iPad mounted next to the board. Plain HTML/CSS/JS, no build step, works offline once installed.

## Features
- 501 or 301, straight in, double out
- 1–10 players, best of 1/3/5/7/9/11 legs (first thrower rotates each leg)
- Big number pad + 6 customisable quick-score buttons (default 60, 80, 100, 120, 140, 180)
- Always-visible scoreboard: remaining, legs, average, last score
- Automatic busts (over the remaining score, leaving 1, or a score that can't be finished on a double); impossible scores such as 179 are rejected
- "Game shot?" check that asks how many darts the checkout took, so averages stay accurate
- Checkout suggestions from 170 down
- Unlimited undo, including undoing a leg or match win
- Stats: 3-dart average, darts thrown, high score, 100+/140+/180s, best checkout
- Remembers recent players, quick scores and the game in progress, and keeps the screen awake during a game

## Run locally
```bash
python3 -m http.server 8180
```
Then open http://localhost:8180.

## Put it on the iPad
The iPad needs to load the files from a web server. Use HTTPS so offline mode works.

1. Host the folder somewhere with HTTPS, for example GitHub Pages, Netlify Drop or Cloudflare Pages. It's all static files.
2. On the iPad, open the URL in **Safari**, tap **Share → Add to Home Screen**.
3. Launch it from the home screen. It runs full-screen and keeps working without wifi.

Quick test without hosting: run the server above on your Mac, then open `http://<your-mac-ip>:8180` on the iPad over the same wifi. Offline mode won't work this way.

## Files
- `index.html`: app shell
- `app.js`: setup screen, game screen, scoring and storage
- `checkout.js`: valid-score table and checkout routes
- `styles.css`: layout for landscape and portrait iPad
- `sw.js`, `manifest.webmanifest`, `icons/`: home-screen and offline support
