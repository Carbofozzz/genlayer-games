import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import { evmNetwork, baseSepoliaNetwork, baseMainnetNetwork } from './config/network.js';
import crypto from 'crypto';
import sharp from 'sharp';
import fetch from 'node-fetch';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import passportDiscord from 'passport-discord';
import fs from 'fs/promises';
const { Strategy: DiscordStrategy } = passportDiscord;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');

const TARGET_GUILD_ID = "1237055789441487021";

const app = express();

app.set('trust proxy', 1);app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || '',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true
  }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, {
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    discriminator: user.discriminator,
    avatar: user.avatar,
    inTargetGuild: !!user.inTargetGuild,
    guildRoles: user.guildRoles || []
  });
});

passport.deserializeUser((obj, done) => done(null, obj));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function discordApi(path, accessToken, { retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (resp.ok) return resp.json();

    if (resp.status === 404) return null;

    if (resp.status === 429) {
      let waitMs = 1000;
      try {
        const data = await resp.json();
        if (typeof data?.retry_after === 'number') {
          waitMs = Math.ceil(data.retry_after * 1000);
        }
      } catch (_) {
        const h = resp.headers.get('x-ratelimit-reset-after');
        if (h) waitMs = Math.ceil(Number(h) * 1000);
      }

      if (attempt < retries) {
        await sleep(waitMs + 100); 
        continue;
      }
    }

    const txt = await resp.text();
    throw new Error(`Discord API ${path} -> ${resp.status}: ${txt}`);
  }

  throw new Error(`Discord API ${path} -> retries exceeded`);
}

passport.use(new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds.members.read']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const member = await discordApi(
        `/users/@me/guilds/${TARGET_GUILD_ID}/member`,
        accessToken
      );

      profile.inTargetGuild = !!member;
      profile.guildRoles = Array.isArray(member?.roles) ? member.roles : [];

      if (profile.inTargetGuild) {
        syncDiscordAvatarAndPanorama(profile).catch(e => {
          console.error('Avatar/panorama sync failed:', e.message);
        });
      }

      return done(null, profile);
    } catch (e) {
      console.error('Discord guild check failed:', e.message);
      profile.inTargetGuild = false;
      profile.guildRoles = [];
      return done(null, profile);
    }
  }
));

const PORT = process.env.PORT || 3000;
const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_KEY = process.env.S3_KEY || "";
const S3_SECRET = process.env.S3_SECRET || "";
const QUIZ_KEY_RAW = process.env.QUIZ_KEY || "";
const AVA_PREFIX = process.env.AVA_PREFIX || 'community';
const AVA_MAX_USERS = 474; 
const PANO_CENTER_IMAGE_KEYS = {
  64: process.env.PANO_CENTER_IMAGE_KEY_64 || 'img/panno-center-64.png',
  48: process.env.PANO_CENTER_IMAGE_KEY_48 || 'img/panno-center-48.png',
  32: process.env.PANO_CENTER_IMAGE_KEY_32 || 'img/panno-center-32.png',
};
const PANO_PLACEHOLDER_KEYS = {
  64: (process.env.PANO_PLACEHOLDER_KEYS_64 || 'img/frame-1-64.png,img/frame-2-64.png,img/frame-3-64.png,img/frame-4-64.png,img/frame-5-64.png,img/frame-6-64.png')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6),
  48: (process.env.PANO_PLACEHOLDER_KEYS_48 || 'img/frame-1-48.png,img/frame-2-48.png,img/frame-3-48.png,img/frame-4-48.png,img/frame-5-48.png,img/frame-6-48.png')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6),
  32: (process.env.PANO_PLACEHOLDER_KEYS_32 || 'img/frame-1-32.png,img/frame-2-32.png,img/frame-3-32.png,img/frame-4-32.png,img/frame-5-32.png,img/frame-6-32.png')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6),
};

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

// discord endpoints
app.get('/auth/discord', (req, res, next) => {
  const returnTo = req.query.returnTo || req.headers.referer || '/';
  res.cookie('returnTo', returnTo, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  next();
}, passport.authenticate('discord'));

app.get('/auth/discord/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      console.error('AUTH ERR:', err);
      console.error('statusCode:', err?.oauthError?.statusCode);
      console.error('data:', err?.oauthError?.data?.toString?.() || err?.oauthError?.data);
      return res.status(500).send('OAuth failed, check server logs');
    }
    if (!user) return res.redirect('/?auth=failed');
    req.logIn(user, (e) => {
      if (e) return next(e);
      res.redirect('/community');
    });
  })(req, res, next);
});

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/community');
    });
  });
});

function resolvePublicAssetPath(relPath) {
  const safeRel = String(relPath || '').replace(/^\/+/, '');
  const abs = path.resolve(PUBLIC_DIR, safeRel);
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) {
    throw new Error(`Invalid local asset path: ${relPath}`);
  }
  return abs;
}

async function localGetBuffer(relPath) {
  const abs = resolvePublicAssetPath(relPath);
  return fs.readFile(abs);
}

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.json({ authenticated: false });
  }

  const user = req.user;
  return res.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatarUrl: getDiscordAvatarUrl(user),
      inTargetGuild: !!user.inTargetGuild,
      guildRoles: user.guildRoles || []
    }
  });
});

function getDiscordAvatarUrl(user) {
  if (!user) return null;

  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=512`;
  }

  let index = 0;
  if (user.discriminator && user.discriminator !== '0') {
    index = Number(user.discriminator) % 5;
  } else {
    index = Number((BigInt(user.id) >> 22n) % 6n);
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function syncDiscordAvatarAndPanorama(profile) {
  const saved = await saveDiscordAvatarVariants(profile);
  if (saved.added) {
    await requestPanoramaBuild();
  }
}

function sanitizeNick(nick) {
  return (nick || 'unknown')
    .toString()
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'unknown';
}

function getDisplayNick(profile) {
  return profile.username || `user_${profile.id}`;
}

let panoBuildPromise = null;
let panoBuildQueued = false;

async function requestPanoramaBuild() {
  if (panoBuildPromise) {
    panoBuildQueued = true;
    return panoBuildPromise;
  }

  panoBuildPromise = (async () => {
    do {
      panoBuildQueued = false;
      await buildAndUploadPanorama();
    } while (panoBuildQueued);
  })().finally(() => {
    panoBuildPromise = null;
  });

  return panoBuildPromise;
}

async function s3GetBuffer(Key) {
  const obj = await s3.getObject({ Bucket: S3_BUCKET, Key }).promise();
  return Buffer.isBuffer(obj.Body) ? obj.Body : Buffer.from(obj.Body);
}

async function s3PutBuffer(Key, Body, ContentType = 'image/jpeg') {
  return s3.upload({
    Bucket: S3_BUCKET,
    Key,
    Body,
    ContentType,
    ACL: 'public-read'
  }).promise();
}

function pickCellByGrid(grid) {
  if (grid < 30) return 64;
  if (grid < 50) return 48;
  return 32;
}

function getPanoramaLayout(usersCount) {
  const MIN_GRID = 10;
  const MAX_GRID = 70;
  const STEP = 2;
  const CENTER_CUT = 16;

  const maxCapacity = MAX_GRID * MAX_GRID - CENTER_CUT;
  const need = Math.max(1, Math.min(usersCount, maxCapacity));

  let grid = MIN_GRID;
  for (; grid <= MAX_GRID; grid += STEP) {
    const capacity = grid * grid - CENTER_CUT;
    if (capacity >= need) break;
  }
  if (grid > MAX_GRID) grid = MAX_GRID;

  const cell = pickCellByGrid(grid);
  return { grid, cell };
}

function getUsableSlots(grid) {
  const centerStart = grid / 2 - 2;
  const slots = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const inCenter = x >= centerStart && x < centerStart + 4 && y >= centerStart && y < centerStart + 4;
      if (!inCenter) slots.push({ x, y });
    }
  }
  return slots;
}

function pickUniformIndices(totalSlots, count) {
  if (count <= 0) return [];
  if (count >= totalSlots) return Array.from({ length: totalSlots }, (_, i) => i);
  if (count === 1) return [Math.floor((totalSlots - 1) / 2)];

  const taken = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let idx = Math.round((i * (totalSlots - 1)) / (count - 1));
    while (taken.has(idx) && idx < totalSlots - 1) idx++;
    while (taken.has(idx) && idx > 0) idx--;
    if (!taken.has(idx)) {
      taken.add(idx);
      out.push(idx);
    }
  }
  return out.sort((a, b) => a - b);
}

function getRingOrderIndices(slots, widthCells, heightCells) {
  const cx = (widthCells - 1) / 2;
  const cy = (heightCells - 1) / 2;

  return slots
    .map((s, idx) => {
      const dx = s.x - cx;
      const dy = s.y - cy;

      const ring = Math.max(Math.abs(dx), Math.abs(dy));

      let angle = Math.atan2(dy, dx); 
      angle = (angle + Math.PI * 2) % (Math.PI * 2); 

      return { idx, ring, angle };
    })
    .sort((a, b) => {
      if (a.ring !== b.ring) return a.ring - b.ring;
      return a.angle - b.angle;
    })
    .map(v => v.idx);
}

async function listAllObjects(prefix) {
  let token;
  const all = [];
  do {
    const page = await s3.listObjectsV2({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: token
    }).promise();
    if (page.Contents?.length) all.push(...page.Contents);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return all;
}

async function collectCurrentUserAvatarKeysBySize(size) {
  const prefix = `${AVA_PREFIX}/users/`;
  const items = await listAllObjects(prefix);
  const suffix = `/avatar_${size}.jpg`;
  const keys = items
    .filter(o => o.Key.endsWith(suffix))
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
    .map(o => o.Key);

  return keys.slice(0, AVA_MAX_USERS);
}

async function fetchDiscordAvatarBuffer(profile) {
  const avatarUrl = getDiscordAvatarUrl(profile); 
  if (!avatarUrl) return null;
  const resp = await fetch(avatarUrl);
  if (!resp.ok) throw new Error(`avatar fetch failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function saveDiscordAvatarVariants(profile) {
  const nick = sanitizeNick(getDisplayNick(profile));
  const avatarHash = profile.avatar || 'default';
  const userId = profile.id;

  const metaKey = `${AVA_PREFIX}/users/${userId}/meta.json`;
  let prevHash = null;
  try {
    const metaRaw = await s3GetBuffer(metaKey);
    const meta = JSON.parse(metaRaw.toString('utf8'));
    prevHash = meta?.avatarHash || null;
  } catch (_) {}

  if (prevHash === avatarHash) return { added: false };

  const src = await fetchDiscordAvatarBuffer(profile);
  if (!src) return { added: false };

  const v64 = await sharp(src).resize(64, 64, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  const v48 = await sharp(src).resize(48, 48, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  const v32 = await sharp(src).resize(32, 32, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();

  const byNickBase = `${AVA_PREFIX}/avatars/${nick}/${userId}_${avatarHash}`;
  await Promise.all([
    s3PutBuffer(`${byNickBase}_64.jpg`, v64, 'image/jpeg'),
    s3PutBuffer(`${byNickBase}_48.jpg`, v48, 'image/jpeg'),
    s3PutBuffer(`${byNickBase}_32.jpg`, v32, 'image/jpeg'),
  ]);

  await Promise.all([
    s3PutBuffer(`${AVA_PREFIX}/users/${userId}/avatar_64.jpg`, v64, 'image/jpeg'),
    s3PutBuffer(`${AVA_PREFIX}/users/${userId}/avatar_48.jpg`, v48, 'image/jpeg'),
    s3PutBuffer(`${AVA_PREFIX}/users/${userId}/avatar_32.jpg`, v32, 'image/jpeg'),
    s3.upload({
      Bucket: S3_BUCKET,
      Key: metaKey,
      Body: Buffer.from(JSON.stringify({
        userId,
        nick,
        avatarHash,
        updatedAt: Date.now()
      }), 'utf8'),
      ContentType: 'application/json',
      ACL: 'public-read'
    }).promise()
  ]);

  return { added: true };
}

async function buildAndUploadPanorama() {
  const countKeys = await collectCurrentUserAvatarKeysBySize(64);
  const usersCount = Math.min(countKeys.length, AVA_MAX_USERS);

  const { grid, cell } = getPanoramaLayout(Math.max(usersCount, 1));
  const size = grid * cell;
  const centerSize = 4 * cell;

  const avatarKeys = await collectCurrentUserAvatarKeysBySize(cell);
  const avatarLimited = avatarKeys.slice(0, AVA_MAX_USERS);

  const slots = getUsableSlots(grid);
  const totalSlots = slots.length;

  const avatarCount = Math.min(avatarLimited.length, totalSlots);
  const avatarKeysForPano = avatarLimited.slice(0, avatarCount);

  const placeholderKeys = (PANO_PLACEHOLDER_KEYS[cell] || []).slice(0, 6);

  const ringOrder = getRingOrderIndices(slots, grid, grid);

  const avatarPositionsInOrder = pickUniformIndices(totalSlots, avatarCount);
  const avatarPosSet = new Set(avatarPositionsInOrder);

  const placement = new Array(totalSlots).fill(null);
  let avatarPtr = 0;
  let placeholderPtr = 0;

  for (let pos = 0; pos < totalSlots; pos++) {
    const slotIdx = ringOrder[pos];

    if (avatarPosSet.has(pos)) {
      placement[slotIdx] = { source: 's3', key: avatarKeysForPano[avatarPtr++] };
    } else if (placeholderKeys.length > 0) {
      placement[slotIdx] = {
        source: 'local',
        key: placeholderKeys[placeholderPtr % placeholderKeys.length]
      };
      placeholderPtr++;
    } else {
      placement[slotIdx] = null;
    }
  }

  const composites = [];
  for (let slotIdx = 0; slotIdx < totalSlots; slotIdx++) {
    const item = placement[slotIdx];
    if (!item) continue;

    try {
      let buf = item.source === 'local'
        ? await localGetBuffer(item.key)
        : await s3GetBuffer(item.key);

      buf = await sharp(buf)
        .resize(cell, cell, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toBuffer();

      const slot = slots[slotIdx];
      composites.push({
        input: buf,
        left: slot.x * cell,
        top: slot.y * cell
      });
    } catch (e) {
      console.error('Panorama item skip:', item.key, e.message);
    }
  }

  try {
    const centerKey = PANO_CENTER_IMAGE_KEYS[cell];
    if (centerKey) {
      const centerBuf = await localGetBuffer(centerKey);
      const centerResized = await sharp(centerBuf)
        .resize(centerSize, centerSize, { fit: 'cover' })
        .png()
        .toBuffer();

      const c = grid / 2 - 2;
      composites.push({ input: centerResized, left: c * cell, top: c * cell });
    }
  } catch (e) {
    console.error('Center image load failed:', e.message);
  }

  const pano = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#0a0a0a'
    }
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  const versionedKey = `${AVA_PREFIX}/panorama/panorama_${grid}x${grid}_${cell}.jpg`;
  const latestKey = `${AVA_PREFIX}/panorama/latest.jpg`;

  const [versionedRes, latestRes] = await Promise.all([
    s3PutBuffer(versionedKey, pano, 'image/jpeg'),
    s3PutBuffer(latestKey, pano, 'image/jpeg'),
  ]);

  await s3.upload({
    Bucket: S3_BUCKET,
    Key: `${AVA_PREFIX}/panorama/latest.json`,
    Body: Buffer.from(JSON.stringify({
      key: latestKey,
      url: latestRes.Location,
      versionedKey,
      versionedUrl: versionedRes.Location,
      grid,
      cell,
      usersCount,
      updatedAt: Date.now()
    }), 'utf8'),
    ContentType: 'application/json',
    ACL: 'public-read',
    CacheControl: 'no-cache'
  }).promise();
}

async function getPanoramaMetaSafe() {
  try {
    const raw = await s3GetBuffer(`${AVA_PREFIX}/panorama/latest.json`);
    return JSON.parse(raw.toString('utf8'));
  } catch (_) {
    return null;
  }
}

app.get('/api/community/panorama', async (_req, res) => {
  try {
    const meta = await getPanoramaMetaSafe();
    const processedKeys = await collectCurrentUserAvatarKeysBySize(64);

    return res.json({
      panorama: meta, // тут уже будут url и versionedUrl
      processedAvatars: processedKeys.length,
      maxUsers: AVA_MAX_USERS
    });
  } catch (e) {
    console.error('Panorama API failed:', e);
    return res.status(500).json({ error: 'Failed to load panorama data' });
  }
});

app.get('/api/config/network', (_req, res) => {
  return res.json(evmNetwork);
});

app.get('/api/config/network_base_sepolia', (_req, res) => {
  return res.json(baseSepoliaNetwork);
});

app.get('/api/config/network_base_mainnet', (_req, res) => {
  return res.json(baseMainnetNetwork);
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

app.post('/api/contest', async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid dataUrl' });
    }
    const [meta, base64] = dataUrl.split(',');
    const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'));
    const buffer = Buffer.from(base64, 'base64');

    const processedBuffer = await sharp(buffer)
      .resize({
        width: 700,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 70,
        progressive: true,
      })
      .toBuffer();

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const ext = 'jpg';
    const filename = `cat_${id}.${ext}`;
    const s3Key = `cats/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: processedBuffer,
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

app.post('/api/contest/share-preview', async (req, res) => {
  try {
    const { catImageUrl, score, place, nick } = req.body || {};

    if (!catImageUrl || typeof catImageUrl !== 'string') {
      return res.status(400).json({ error: 'Invalid catImageUrl' });
    }

    const placeNum = Number(place);
    const scoreNum = Number(score);
    const safeNick = (nick || 'My cat').toString().slice(0, 40);

    const imgResp = await fetch(catImageUrl);
    if (!imgResp.ok) {
      return res.status(400).json({ error: 'Failed to fetch cat image' });
    }
    const catBuffer = Buffer.from(await imgResp.arrayBuffer());

    const WIDTH = 1200;
    const HEIGHT = 630;

    const AVATAR_SIZE = 400;
    const catAvatar = await sharp(catBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .toBuffer();

    const bgColor = '#050816';
    const primaryColor = '#ffd54f';
    const white = '#ffffff';

    const title = 'Cat Beauty Contest';
    const placeText = `#${isNaN(placeNum) ? '?' : placeNum} place`;
    const scoreText = `${isNaN(scoreNum) ? '?' : scoreNum} points`;
    const nickText = safeNick;

    const overlaySvg = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title { fill: ${white}; font-size: 50px; font-weight: 700; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .place { fill: ${primaryColor}; font-size: 72px; font-weight: 800; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .score { fill: ${white}; font-size: 40px; font-weight: 500; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .nick  { fill: ${white}; font-size: 32px; font-weight: 400; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .tag   { fill: #9fa8da; font-size: 26px; font-weight: 400; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .logo   { fill: ${white}; font-size: 30px; font-weight: 500; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        </style>
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b" />
            <stop offset="50%" stop-color="#020617" />
            <stop offset="100%" stop-color="#000000" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#grad)" />
        <rect x="520" y="80" rx="32" ry="32" width="620" height="470" fill="rgba(0,0,0,0.35)" />
        <text x="560" y="160" class="title">${title}</text>
        <text x="560" y="260" class="place">${placeText}</text>
        <text x="560" y="330" class="score">${scoreText}</text>
        <text x="560" y="390" class="nick">${nickText}</text>
        <text x="560" y="450" class="tag">guess-picture.onrender.com</text>
        <text x="560" y="530" class="logo">Powered by GenLayer</text>
      </svg>
    `;

    const base = sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: bgColor,
      },
    });

    const avatarMaskSvg = `
      <svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="avatarClip">
            <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" />
          </clipPath>
        </defs>
        <image
          href="data:image/jpeg;base64,${catAvatar.toString('base64')}"
          x="0"
          y="0"
          width="${AVATAR_SIZE}"
          height="${AVATAR_SIZE}"
          clip-path="url(#avatarClip)"
          preserveAspectRatio="xMidYMid slice"
        />
      </svg>
    `;

    const avatarFrameSvg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="${HEIGHT / 2}" r="${AVATAR_SIZE / 2}" fill="none" stroke="${primaryColor}" stroke-width="8" />
      </svg>
    `;

    const finalBuffer = await base
      .composite([
        {
          input: Buffer.from(overlaySvg),
          top: 0,
          left: 0,
        },
        {
          input: Buffer.from(avatarMaskSvg),
          top: Math.round(HEIGHT / 2 - AVATAR_SIZE / 2),
          left: Math.round(300 - AVATAR_SIZE / 2),
        },
        {
          input: Buffer.from(avatarFrameSvg),
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const filename = `cat_share_${id}.jpg`;
    const s3Key = `cats/share/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: finalBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    };

    const s3UploadResult = await s3.upload(params).promise();
    const s3Url = s3UploadResult.Location;

    return res.json({
      id,
      url: s3Url,
    });
  } catch (e) {
    console.error('Error generating share preview:', e);
    return res.status(500).json({ error: 'Failed to generate preview' });
  }
});

app.post('/api/contest/share-preview-dog', async (req, res) => {
  try {
    const { catImageUrl, score, place, nick } = req.body || {};

    if (!catImageUrl || typeof catImageUrl !== 'string') {
      return res.status(400).json({ error: 'Invalid catImageUrl' });
    }

    const placeNum = Number(place);
    const scoreNum = Number(score);
    const safeNick = (nick || 'My dog').toString().slice(0, 40);

    const imgResp = await fetch(catImageUrl);
    if (!imgResp.ok) {
      return res.status(400).json({ error: 'Failed to fetch dog image' });
    }
    const catBuffer = Buffer.from(await imgResp.arrayBuffer());

    const WIDTH = 1200;
    const HEIGHT = 630;

    const AVATAR_SIZE = 400;
    const catAvatar = await sharp(catBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .toBuffer();

    const bgColor = '#050816';
    const primaryColor = '#ffd54f';
    const white = '#ffffff';

    const title = 'Dog Beauty Contest';
    const placeText = `#${isNaN(placeNum) ? '?' : placeNum} place`;
    const scoreText = `${isNaN(scoreNum) ? '?' : scoreNum} points`;
    const nickText = safeNick;

    const overlaySvg = `
      <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title { fill: ${white}; font-size: 50px; font-weight: 700; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .place { fill: ${primaryColor}; font-size: 72px; font-weight: 800; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .score { fill: ${white}; font-size: 40px; font-weight: 500; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .nick  { fill: ${white}; font-size: 32px; font-weight: 400; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .tag   { fill: #9fa8da; font-size: 26px; font-weight: 400; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .logo   { fill: ${white}; font-size: 30px; font-weight: 500; font-family: -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        </style>
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b" />
            <stop offset="50%" stop-color="#020617" />
            <stop offset="100%" stop-color="#000000" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#grad)" />
        <rect x="520" y="80" rx="32" ry="32" width="620" height="470" fill="rgba(0,0,0,0.35)" />
        <text x="560" y="160" class="title">${title}</text>
        <text x="560" y="260" class="place">${placeText}</text>
        <text x="560" y="330" class="score">${scoreText}</text>
        <text x="560" y="390" class="nick">${nickText}</text>
        <text x="560" y="450" class="tag">guess-picture.onrender.com</text>
        <text x="560" y="530" class="logo">Powered by GenLayer</text>
      </svg>
    `;

    const base = sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 4,
        background: bgColor,
      },
    });

    const avatarMaskSvg = `
      <svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="avatarClip">
            <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" />
          </clipPath>
        </defs>
        <image
          href="data:image/jpeg;base64,${catAvatar.toString('base64')}"
          x="0"
          y="0"
          width="${AVATAR_SIZE}"
          height="${AVATAR_SIZE}"
          clip-path="url(#avatarClip)"
          preserveAspectRatio="xMidYMid slice"
        />
      </svg>
    `;

    const avatarFrameSvg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="300" cy="${HEIGHT / 2}" r="${AVATAR_SIZE / 2}" fill="none" stroke="${primaryColor}" stroke-width="8" />
      </svg>
    `;

    const finalBuffer = await base
      .composite([
        {
          input: Buffer.from(overlaySvg),
          top: 0,
          left: 0,
        },
        {
          input: Buffer.from(avatarMaskSvg),
          top: Math.round(HEIGHT / 2 - AVATAR_SIZE / 2),
          left: Math.round(300 - AVATAR_SIZE / 2),
        },
        {
          input: Buffer.from(avatarFrameSvg),
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const filename = `dog_share_${id}.jpg`;
    const s3Key = `dogs/share/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: finalBuffer,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    };

    const s3UploadResult = await s3.upload(params).promise();
    const s3Url = s3UploadResult.Location;

    return res.json({
      id,
      url: s3Url,
    });
  } catch (e) {
    console.error('Error generating share preview:', e);
    return res.status(500).json({ error: 'Failed to generate preview' });
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

app.get('/cat-beauty', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/cat.html'));
});

app.get('/dog-beauty', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/dog.html'));
});

app.get('/cook', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/cook.html'));
});

app.get('/mochi', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/mochi.html'));
});

app.get('/mochi-quest', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/quest.html'));
});

app.get('/questions', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/questions.html'));
});

app.get('/developer', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/developer.html'));
});

app.get('/community', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/community.html'));
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

app.get('/cook/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getCookPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load game', e);
  }
});

app.get('/cat/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getCatPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load game', e);
  }
});

app.get('/dog/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getDogPage(req));
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

function getCatPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Cat Beauty Contest</title>
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
      </style>
    </head>
    <body data-page-name="cat" data-game-id="${req.params.id}">
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
        <h1 id="contestTitle">Beauty Contest</h1>
        <div id="logoutContainer" class="hidden">
          <p>Please connect your wallet first</p>
        </div>
        <div id="loginContainer" class="hidden">
          <div id="emptyContainer" class="hidden">
            <p>Contest not found</p>
            <p>If the contest was created recently, try refreshing the page.</p>
            <button id="refresh" class="btn" style="margin-top:1rem;">Refresh</button>
          </div>
          <div id="loadingIndicator" class="hidden">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
          <div id="gameContainer" class="hidden">
            <div id="contestStatus" style="margin-top: 1rem; margin-bottom: 1rem;"></div>
            <div id="leaderboard"></div>
          </div>
        </div>  
      </div>
      <script type="module" src="/main.js"></script>
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

function getDogPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_black-BvQhofdN.svg" media="(prefers-color-scheme: light)"/>
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_white-DC3VjLtV.svg" media="(prefers-color-scheme: dark)"/>
      <title>Dog Beauty Contest</title>
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
      </style>
    </head>
    <body data-page-name="dog" data-game-id="${req.params.id}">
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
        <h1 id="contestTitle">Beauty Contest</h1>
        <div id="logoutContainer" class="hidden">
          <p>Please connect your wallet first</p>
        </div>
        <div id="loginContainer" class="hidden">
          <div id="emptyContainer" class="hidden">
            <p>Contest not found</p>
            <p>If the contest was created recently, try refreshing the page.</p>
            <button id="refresh" class="btn" style="margin-top:1rem;">Refresh</button>
          </div>
          <div id="loadingIndicator" class="hidden">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
          <div id="gameContainer" class="hidden">
            <div id="contestStatus" style="margin-top: 1rem; margin-bottom: 1rem;"></div>
            <div id="leaderboard"></div>
          </div>
        </div>  
      </div>
      <script type="module" src="/main.js"></script>
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

function getPunchPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_black-BvQhofdN.svg" media="(prefers-color-scheme: light)"/>
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_white-DC3VjLtV.svg" media="(prefers-color-scheme: dark)"/>
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
      <script type="module" src="/main.js"></script>
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

function getCookPage(req) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_black-BvQhofdN.svg" media="(prefers-color-scheme: light)"/>
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_white-DC3VjLtV.svg" media="(prefers-color-scheme: dark)"/>
      <title>CookItUp Id: ${req.params.id}</title>
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
    <body data-page-name="cook" data-game-id="${req.params.id}">
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
        <h1>CookItUp Id: ${req.params.id}</h1>
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
              <label for="answer" style="display:block; margin-bottom:.5rem;">What would you cook with these ingredients?</label>
              <textarea id="answer" placeholder="Type your recipe..."></textarea>
              <div class="row">
                <button id="clearAnswer" class="btn" type="button">Clear</button>
                <button id="submitAnswer" class="btn" type="button">Submit answer</button>
                <div id="answerProgress" class="spinner2 hidden" aria-label="Loading"></div>
              </div>
            </div>
          </div>
        </div>  
      </div>
      <script type="module" src="/main.js"></script>
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
            if (!value) { alert('Please enter a recipe'); return; }
            WalletUI.answerCook(value);
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
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_black-BvQhofdN.svg" media="(prefers-color-scheme: light)"/>
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_white-DC3VjLtV.svg" media="(prefers-color-scheme: dark)"/>
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
      <script type="module" src="/main.js"></script>
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
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_black-BvQhofdN.svg" media="(prefers-color-scheme: light)"/>
      <link rel="shortcut icon" type="image/svg+xml" href="/img/mark_white-DC3VjLtV.svg" media="(prefers-color-scheme: dark)"/>
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
    <script type="module" src="/main.js"></script>
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
