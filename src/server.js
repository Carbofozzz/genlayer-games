import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import { evmNetwork } from './config/network.js';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_KEY = process.env.S3_KEY || "";
const S3_SECRET = process.env.S3_SECRET || "";
const QUIZ_KEY_RAW = process.env.QUIZ_KEY || "";

const QUIZ_KEY = QUIZ_KEY_RAW ? crypto.createHash('sha256').update(QUIZ_KEY_RAW, 'utf8').digest() : null;

const s3 = new AWS.S3({
  endpoint: S3_ENDPOINT,
  accessKeyId: S3_KEY,
  secretAccessKey: S3_SECRET,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

function sealAnswerPlain(obj) {
  const password = QUIZ_KEY_RAW;
  if (!password) throw new Error('No QUIZ_KEY');
  const rounds = 5000;
  const salt = crypto.randomBytes(16);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  let h = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(password, 'utf8'), salt])).digest();
  for (let i = 0; i < rounds - 1; i++) {
    h = crypto.createHash('sha256').update(h).digest();
  }
  const key = h;
  const ct = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    ct[i] = plaintext[i] ^ key[i % key.length];
  }
  return Buffer.concat([salt, ct]).toString('base64');
}

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
    const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'));
    const ext = meta.includes('image/png') ? 'png' : meta.includes('image/jpeg') ? 'jpg' : 'png';
    const buffer = Buffer.from(base64, 'base64');

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const filename = `signature_${id}.${ext}`;
    const s3Key = `signatures/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read'
    };
    const s3UploadResult = await s3.upload(params).promise();
    const s3Url = s3UploadResult.Location;
    return res.json({ id, url: s3Url });
  } catch (e) {
    console.error('Error uploading to S3:', e);
    return res.status(500).json({ error: 'Failed to save file' });
  }
});

app.post('/api/quiz', async (req, res) => {
  try {
    const { question_id, answer_id, answer } = req.body || {};
    if (typeof answer !== 'string') return res.status(400).json({ error: 'Invalid answer' });
    const payload = { question_id: question_id || null, answer_id: answer_id || null, answer: answer, ts: Date.now() };
    const sealed = sealAnswerPlain(payload);
    return res.json({ sealed });
  } catch (e) {
    console.error('Error encode:', e);
    return res.status(500).json({ error: 'Failed to save answer' });
  }
});

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

app.get('/guess', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/guess.html'));
});

app.get('/quiz', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz.html'));
});

app.get('/punch', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/punch.html'));
});

app.get('/draw-match', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/match.html'));
});

app.get('/quiz/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getQuizPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load game', e);
  }
});

app.get('/punch/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getPunchPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load game', e);
  }
});

app.get('/match/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getGuessPage(req, "DrawMatch", "match"));
  } catch {
    return res.status(500).send('Failed to load game');
  }
});

app.get('/guess/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getGuessPage(req, "GuessPicture", "guess"));
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

function getPunchPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>PunchLine Id: ${req.params.id}</title>
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
        .wrap { max-width: 800px; margin: 0 auto; }
        a { color: #0366d6; text-decoration: none; }
        .nav { max-width: 800px; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
        .nav a { color: #0366d6; text-decoration: none; }
        .nav a.active { font-weight: 600; }
        .nav .links { display: flex; gap: .75rem; }
        .nav .wallet { display: flex; gap: .5rem; align-items: center; }
        .btn { padding: .4rem .7rem; border: 1px solid #ccc; border-radius: 6px; background: #f8f8f8; cursor: pointer; }
        .answer { margin-top: 1rem; }
        .answer textarea { width: 100%; height: 200px; padding: .6rem; font-family: inherit; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; }
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
    <body data-page-name="punch" data-game-id="${req.params.id}">
      <div class="nav">
        <div class="links">
          <a href="/">New Game</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/rules">Rules</a>
        </div>
        <div class="wallet">
           <a href="/me"><span id="addr" style="opacity:.8"></span></a>
          <button id="connectBtn" class="btn">Connect wallet</button>
        </div>
      </div>
      <div class="wrap">
        <h1>PunchLine Id: ${req.params.id}</h1>
        <div id="logoutContainer" class="hidden">
          <p>Please connect your wallet first</p>
        </div>
        <div id="loginContainer" class="hidden">
          <div id="emptyContainer" class="hidden">
            <p>Game not found</p>
            <p>If the game was created recently, try refreshing the page.</p>
            <button id="refresh" class="btn" style="margin-top:1rem;">Refresh</button>
          </div>
          <div id="loadingIndicator" class="hidden">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
          <div id="gameContainer" class="hidden">
            <h2 id="game_theme"></h2>
            <div id="timer" class="hidden">
            </div>
            <div id="task" class="hidden">
            </div>
            <div id="players" class="hidden">
            </div>
            <div id="answers" class="answer" style="display:none;">
              <label for="answer" style="display:block; margin-bottom:.5rem;">Come up with a punchline</label>
              <textarea id="answer" placeholder="Type your joke..."></textarea>
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
      <script>
        const area = document.getElementById('answer');
        const clearBtn = document.getElementById('clearAnswer');
        const colorButtons = document.querySelectorAll('.color-btn');
        const submitBtn = document.getElementById('submitAnswer');
        const refreshBtn = document.getElementById('refresh');
        if (clearBtn) clearBtn.addEventListener('click', () => { if (area) area.value=''; });
        if (submitBtn) submitBtn.addEventListener('click', async () => {
          try {
            if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
          } catch (e) { 
            alert(e.message); 
            return; 
          }
          try {
            if (!WalletUI.nickIsSet()) throw new Error('Please provide your Discord nickname first.');
          } catch (e) { 
            alert(e.message); 
            window.location.href = '/me';
            return; 
          }
          try {
            const value = (area && area.value || '').trim();
            if (!value) { alert('Please enter a punch line'); return; }
            WalletUI.joke(value);
          } catch(e) { alert(e.message); }
        });
        if (refreshBtn) refreshBtn.addEventListener('click', async () => {
          try {
            if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
            WalletUI.checkPage();
          } catch(e) { alert(e.message); }
        });
      </script>
    </body>
  </html>`
}

function getQuizPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>AiQuiz Id: ${req.params.id}</title>
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
        .wrap { max-width: 800px; margin: 0 auto; }
        img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
        a { color: #0366d6; text-decoration: none; }
        .nav { max-width: 800px; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
        .nav a { color: #0366d6; text-decoration: none; }
        .nav a.active { font-weight: 600; }
        .nav .links { display: flex; gap: .75rem; }
        .nav .wallet { display: flex; gap: .5rem; align-items: center; }
        .btn { padding: .4rem .7rem; border: 1px solid #ccc; border-radius: 6px; background: #f8f8f8; cursor: pointer; }
        .btn-selected { background-color: #4caf50; color: #fff; }
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
    <body data-page-name="quiz" data-game-id="${req.params.id}">
      <div class="nav">
        <div class="links">
          <a href="/">New Game</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/rules">Rules</a>
        </div>
        <div class="wallet">
           <a href="/me"><span id="addr" style="opacity:.8"></span></a>
          <button id="connectBtn" class="btn">Connect wallet</button>
        </div>
      </div>
      <div class="wrap">
        <h1 id="quiz_title">AiQuiz</h1>
        <div id="logoutContainer" class="hidden">
          <p>Please connect your wallet first</p>
        </div>
        <div id="loginContainer" class="hidden">
          <div id="emptyContainer" class="hidden">
            <p>Game not found</p>
            <p>If the game was created recently, try refreshing the page.</p>
            <button id="refresh" class="btn" style="margin-top:1rem;">Refresh</button>
          </div>
          <div id="loadingIndicator" class="hidden">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
          <div id="gameContainer" class="hidden">
            <div id="stateContainer" class="hidden">
            </div>
            <div id="resultContainer" class="hidden">
            </div>
          </div>
        </div>  
      </div>
      <script type="module" src="/wallet.js"></script>
      <script>
        const refreshBtn = document.getElementById('refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', async () => {
          try {
            if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
            WalletUI.checkPage();
          } catch(e) { alert(e.message); }
        });
      </script>
    </body>
  </html>`
}

function getGuessPage(req, type, mode) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${type} Id: ${req.params.id}</title>
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
      canvas { touch-action: none; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji'; margin: 0; padding: 2rem; }
      .wrap { max-width: 800px; margin: 0 auto; }
      img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
      a { color: #0366d6; text-decoration: none; }
      .nav { max-width: 800px; margin: 0 auto 1rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
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
      .colors {
        margin-top: .75rem;
        display: flex;
        gap: .5rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .color-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid #ccc;
        cursor: pointer;
        box-sizing: border-box;
      }
      .color-btn.active {
        border-color: #000;
        box-shadow: 0 0 0 2px rgba(0,0,0,.15);
      }
    </style>
  </head>
  <body data-page-name="${mode}" data-game-id="${req.params.id}">
    <div class="nav">
      <div class="links">
        <a href="/">New Game</a>
        <a href="/leaderboard">Leaderboard</a>
        <a href="/rules">Rules</a>
      </div>
      <div class="wallet">
         <a href="/me"><span id="addr" style="opacity:.8"></span></a>
        <button id="connectBtn" class="btn">Connect wallet</button>
      </div>
    </div>
    <div class="wrap">
      <h1>${type} Id: ${req.params.id}</h1>
      <div id="logoutContainer" class="hidden">
        <p>Please connect your wallet first</p>
      </div>
      <div id="loginContainer" class="hidden">
        <div id="emptyContainer" class="hidden">
          <p>Game not found</p>
          <p>If the game was created recently, try refreshing the page.</p>
          <button id="refresh" class="btn" style="margin-top:1rem;">Refresh</button>
        </div>
        <div id="loadingIndicator" class="hidden">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
        <div id="gameContainer" class="hidden">
          <p id="game_theme"></p>
          <img id="picture" src="" alt="Game image" class="hidden" />
          <div id="pad">
            <div style="border:1px solid #ddd; border-radius:8px; overflow:hidden; width:100%; max-width:600px;">
              <canvas id="canvas" style="display:block; width:100%; height:450px; background:#fff;"></canvas>
            </div>
            <div class="colors">
              <button class="color-btn active" data-color="#000000" style="background:#000000"></button>
              <button class="color-btn" data-color="#ffffff" style="background:#ffffff"></button>
              <button class="color-btn" data-color="#ff0000" style="background:#ff0000"></button>
              <button class="color-btn" data-color="#FFA500" style="background:#FFA500"></button>
              <button class="color-btn" data-color="#ffff00" style="background:#ffff00"></button>
              <button class="color-btn" data-color="#00aa00" style="background:#00aa00"></button>
              <button class="color-btn" data-color="#00ffff" style="background:#00ffff"></button>
              <button class="color-btn" data-color="#0000ff" style="background:#0000ff"></button>
              <button class="color-btn" data-color="#ff00ff" style="background:#ff00ff"></button>
              <button class="color-btn" data-color="#964B00" style="background:#964B00"></button>
            </div>
            <div class="row" style="margin-top:1rem; margin-bottom:1rem; display:flex; gap:.5rem; flex-wrap: wrap;">
              <button id="clearCanvas" class="btn">Clear</button>
              <button id="saveCanvas" class="btn">Join game</button>
              <div id="canvasProgress" class="spinner2 hidden" aria-label="Loading"></div>
            </div>
          </div>  
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
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@5.1.1/dist/signature_pad.umd.min.js"></script>
    <script>
      const area = document.getElementById('answer');
      const clearBtn = document.getElementById('clearAnswer');
      const colorButtons = document.querySelectorAll('.color-btn');
      const submitBtn = document.getElementById('submitAnswer');
      const canvas = document.getElementById('canvas');
      const clearCanvasBtn = document.getElementById('clearCanvas');
      const submitCanvasBtn = document.getElementById('saveCanvas');
      const progressCanvas = document.getElementById('canvasProgress');
      const refreshBtn = document.getElementById('refresh');

      function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = 450 * ratio;
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        console.log("resizeCanvas")
      }
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      window.resizeCanvas = resizeCanvas;
      let signaturePad;
      function recreatePad() {
        signaturePad = new SignaturePad(canvas, { minWidth: 1.5, maxWidth: 3, penColor: 'black', backgroundColor: 'rgb(255, 255, 255)' });
        console.log("Recreate pad")
      }
      window.recreatePad = recreatePad;

      
      clearCanvasBtn.addEventListener('click', async () => {
        if (signaturePad) signaturePad.clear();
      });
      colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const color = btn.getAttribute('data-color');
          if (signaturePad) signaturePad.penColor = color;
          colorButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      submitCanvasBtn.addEventListener('click', async () => {
        if (signaturePad && signaturePad.isEmpty()) {
          alert('Please draw something first');
          return;
        }
        try {
          if (!WalletUI.isConnected()) throw new Error('Please connect your wallet first');
        } catch (e) { alert(e.message); return; }
        try {
          if (!WalletUI.nickIsSet()) throw new Error('Please provide your Discord nickname first.');
        } catch (e) { 
          alert(e.message); 
          window.location.href = '/me';
          return; 
        }
        clearCanvasBtn.classList.add('hidden');
        submitCanvasBtn.classList.add('hidden');
        progressCanvas.classList.remove('hidden');
        try {
          const dataUrl = signaturePad.toDataURL('image/jpeg');
          const res = await fetch('/api/signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Save failed');
          console.log("Picture answer ", json)
          WalletUI.answerMatch(json.url)
        } catch (e) {
          alert(e.message);
          clearCanvasBtn.classList.remove('hidden');
          submitCanvasBtn.classList.remove('hidden');
          progressCanvas.classList.add('hidden');
        }
      });
      if (clearBtn) clearBtn.addEventListener('click', () => { if (area) area.value=''; });
      if (submitBtn) submitBtn.addEventListener('click', async () => {
        try {
          if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
          const value = (area && area.value || '').trim();
          if (!value) { alert('Please enter an answer'); return; }
          WalletUI.answer(value);
        } catch(e) { alert(e.message); }
      });
      if (refreshBtn) refreshBtn.addEventListener('click', async () => {
        try {
          if (!window.WalletUI || !WalletUI.isConnected()) throw new Error('Please connect your wallet first');
          WalletUI.checkPage();
        } catch(e) { alert(e.message); }
      });
    </script>
  </body>
</html>`
}
