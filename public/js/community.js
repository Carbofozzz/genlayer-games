async function auth() {
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    window.location.assign('/auth/discord');
}

async function logout() {
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    try {
        await fetch('/logout', {
            method: 'GET'
        });
        checkDiscordAuth();
    } catch(error) {
        checkDiscordAuth();
    }
    
}

async function checkDiscordAuth() {
    panno();
    const submitBtn = document.getElementById('discordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const progress = document.getElementById('saveProgress');
    const pannel = document.getElementById('panno');
    const note = document.getElementById('guild_note');
    if (submitBtn) submitBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (progress) progress.classList.remove("hidden");
    try {
        const res = await fetch('/api/me', {
            method: 'GET'
        });
        const json = await res.json();
        console.log("get user", json);
        if (progress) progress.classList.add("hidden");
        if (json.authenticated) {
            if (logoutBtn) logoutBtn.classList.remove("hidden");
            if (submitBtn) submitBtn.classList.add("hidden");
            if (json.user && json.user.inTargetGuild) {
                if (pannel) pannel.classList.remove("hidden");
                if (note) note.textContent = '';
                composeImage(json.user);
                await sleep(3000);
                panno();
            } else {
                if (pannel) pannel.classList.add("hidden");
                if (note) note.textContent = 'You are not a member of the GenLayer community.';
            }
        } else {
            if (pannel) pannel.classList.add("hidden");
            if (logoutBtn) logoutBtn.classList.add("hidden");
            if (submitBtn) submitBtn.classList.remove("hidden");
            if (note) note.textContent = '';
        }
    } catch(error) {
        if (progress) progress.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
        if (submitBtn) submitBtn.classList.remove("hidden");
        if (note) note.textContent = '';
    }
    
}

async function panno() {
    const progress = document.getElementById('panelProgress');
    const nft = document.getElementById('nft');
    try {
        const res = await fetch('/api/community/panorama');
        const json = await res.json();
        console.log("panno", json);
        if (progress) progress.innerHTML = 'Progress: ' + json.processedAvatars + ' of ' + json.maxUsers + ' places';
        if (nft && json.panorama) nft.src = json.panorama.url;
    } catch (error) {
        if (progress) progress.innerHTML = '';
        if (nft) nft.src = 'https://storage.yandexcloud.net/genlayer/community/panorama/latest.jpg';
    }
    
}

async function composeImage(user) {
    const frameUrl = "/img/panno.png";
    const hole = { x: 410, y: 230, size: 508 };
    const avatarSize = 512;
    const nameRect = { x: 515, y: 725, w: 300, h: 50 };
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    const [frame, avatar] = await Promise.all([
      loadImage(frameUrl, false),
      loadImage(user.avatarUrl, true)
    ]);

    canvas.width = frame.naturalWidth || 1170;
    canvas.height = frame.naturalHeight || 874;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dx = hole.x + (hole.size - avatarSize) / 2;
    const dy = hole.y + (hole.size - avatarSize) / 2;
    drawCover(ctx, avatar, dx, dy, avatarSize);

    ctx.drawImage(frame, 0, 0);

    fitSingleLineText(
        ctx,
        user.global_name || user.username || "Member",
        nameRect,
        {
          maxFontSize: 120, 
          minFontSize: 16,
          fontWeight: "800",
          color: "#ffffff",
          stroke: { color: "rgba(0,0,0,0.7)", width: 4 }, 
          align: "center",
          padding: 4
        }
    );
}

function loadImage(url, useCORS = false) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (useCORS) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
}

function drawCover(ctx, img, dx, dy, dSize) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(dSize / iw, dSize / ih);
    const sw = dSize / scale;
    const sh = dSize / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dSize, dSize);
}
  
function fitSingleLineText(ctx, text, rect, opts = {}) {
    const {
      fontFamily = "Inter, Arial, sans-serif",
      fontWeight = "800",
      minFontSize = 10,
      maxFontSize = 120,
      color = "#fff",
      stroke = null,
      padding = 2,
      align = "center"
    } = opts;
  
    const x = rect.x + padding;
    const y = rect.y + padding;
    const w = rect.w - padding * 2;
    const h = rect.h - padding * 2;
  
    const strokePad = stroke ? stroke.width : 0;
  
    let lo = minFontSize;
    let hi = maxFontSize;
    let best = minFontSize;
  
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      ctx.font = `${fontWeight} ${mid}px ${fontFamily}`;
  
      const m = ctx.measureText(text);
      const tw = m.width + strokePad * 2;
      const th =
        (m.actualBoundingBoxAscent || mid * 0.82) +
        (m.actualBoundingBoxDescent || mid * 0.18) +
        strokePad * 2;
  
      if (tw <= w && th <= h) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  
    ctx.font = `${fontWeight} ${best}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
  
    const drawX = align === "left" ? x : align === "right" ? x + w : x + w / 2;
    const drawY = y + h / 2;
  
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  
    if (stroke) {
      ctx.lineWidth = stroke.width;
      ctx.strokeStyle = stroke.color;
      ctx.strokeText(text, drawX, drawY);
    }
    ctx.fillText(text, drawX, drawY);
  
    ctx.restore();
  
    return best;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export {
    auth,
    logout,
    checkDiscordAuth
};