import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { evmNetwork } from './config/network.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Public endpoint to expose EVM network config
app.get('/api/config/network', (_req, res) => {
  return res.json(evmNetwork);
});

app.post('/api/signature', async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid dataUrl' });
    }
    const [meta, base64] = dataUrl.split(',');
    const ext = meta.includes('image/png') ? 'png' : meta.includes('image/jpeg') ? 'jpg' : 'png';
    const buffer = Buffer.from(base64, 'base64');

    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `signature_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);

    // Persist game metadata
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const storePath = path.join(dataDir, 'games.json');
    let store = {};
    try {
      const raw = await fs.promises.readFile(storePath, 'utf8');
      store = JSON.parse(raw || '{}');
    } catch {}
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    store[id] = { filename, createdAt: Date.now() };
    await fs.promises.writeFile(storePath, JSON.stringify(store, null, 2));

    // Serve uploaded files as static content via /uploads mount
    // Return game URL and static file URL
    return res.json({ id, filename, url: `/uploads/${filename}`, gameUrl: `/game/${id}` });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

// Static serving for uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Static pages routes
app.get('/leaderboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/leaderboard.html'));
});

app.get('/me', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/me.html'));
});

app.get('/rules', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/rules.html'));
});

// Dynamic game page
app.get('/game/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Game Id: ${req.params.id}</title>
    <style>
      #loadingIndicator {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 10px;
        background-color: rgba(255, 255, 255, 0.8);
        z-index: 1000;
        pointer-events: none;
      }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; margin: 0; padding: 2rem; }
      .wrap { max-width: 720px; margin: 0 auto; }
      img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
      a { color: #0366d6; text-decoration: none; }
      .nav { max-width: 720px; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .nav a { color: #0366d6; text-decoration: none; }
      .nav a.active { font-weight: 600; }
      .nav .links { display: flex; gap: .75rem; }
      .nav .wallet { display: flex; gap: .5rem; align-items: center; }
      .btn { padding: .4rem .7rem; border: 1px solid #ccc; border-radius: 6px; background: #f8f8f8; cursor: pointer; }
      .answer { margin-top: 1rem; }
      .answer input { width: 100%; padding: .6rem; font-family: inherit; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; }
      .answer .row { margin-top: .5rem; display: flex; gap: .5rem; }
      .hidden { display: none !important; }
      .spinner {
        border: 4px solid #f3f3f3; /* Light grey */
        border-top: 4px solid #3498db; /* Blue */
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .row .spinner2 {
        width: 20px;
        height: 20px;
        border: 2px solid #ddd;
        border-top-color: #0366d6;
        border-radius: 50%;
        animation: spin .8s linear infinite;
      }
    </style>
  </head>
  <body data-page-name="game" data-game-id="${req.params.id}">
    <div class="nav">
      <div class="links">
        <a href="/">Home</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/rules">Rules</a>
      </div>
      <div class="wallet">
         <a href="/me"><span id="addr" style="opacity:.8"></span></a>
        <button id="connectBtn" class="btn">Connect wallet</button>
      </div>
    </div>
    <div class="wrap">
      <h1>Game Id: ${req.params.id}</h1>
      <div id="logoutContainer" class="hidden">
        <p>Please connect your wallet first</p>
      </div>
      <div id="loginContainer" class="hidden">
        <div id="emptyContainer" class="hidden">
          <p>Game not found</p>
        </div>
        <div id="loadingIndicator" class="hidden">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
        <div id="gameContainer" class="hidden">
          <img id="picture" src="" alt="Game image" class="hidden" />
          <div id="timer" class="hidden">
          </div>
          <div id="task" class="hidden">
          </div>
          <div id="players" class="hidden">
          </div>
          <div id="answers" class="answer" style="display:none;">
            <label for="answer" style="display:block; margin-bottom:.5rem;">Guess what is drawn in the picture</label>
            <input type="text" id="answer" placeholder="Type your answer..." maxlength="30"/>
            <div class="row">
              <button id="clearAnswer" class="btn" type="button">Clear</button>
              <button id="submitAnswer" class="btn" type="button">Submit answer</button>
              <div id="answerProgress" class="spinner2 hidden" aria-label="Loading"></div>
            </div>
          </div>
        </div>
      </div>  
    </div>
    <script type="module" src="/wallet.js"></script>
    <script>(function(){
      const area = document.getElementById('answer');
      const clearBtn = document.getElementById('clearAnswer');
      const submitBtn = document.getElementById('submitAnswer');
      if (clearBtn) clearBtn.addEventListener('click', () => { if (area) area.value=''; });
      if (submitBtn) submitBtn.addEventListener('click', async () => {
        try {
          if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
          const value = (area && area.value || '').trim();
          if (!value) { alert('Please enter an answer'); return; }
          WalletUI.answer(value);
        } catch(e) { alert(e.message); }
      });
    })();</script>
  </body>
</html>`);
  } catch {
    return res.status(500).send('Failed to load game');
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
