import {
    client,
    TransactionStatus,
    contractBeauty,
    maskAddress
  } from './core.js';

  async function getContests() {
    if (!client) return;
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    const select = document.getElementById('contestSelect');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractBeauty,
        functionName: 'get_active_games',
        args: [],
      });
      let res = JSON.parse(game);
      renderBeautyHistory(res, 'current', false);
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        if (submitBtn) submitBtn.classList.remove('hidden');
      } else {
        if (select) {
          select.innerHTML = '';
          if (!Array.isArray(res.contests) || res.contests.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No active contests';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
          } else {
            res.contests.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c.id;
              opt.textContent = c.title;
              select.appendChild(opt);
            });
          }
        }
        if (res.contests && res.contests.length > 0) {
          if (submitBtn) submitBtn.classList.remove('hidden');
        }
      }
      console.error('Success getting contests:', res);
    } catch (error) {
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting contests:', error);
    }
    try {
      const oldGamesRaw = await client.readContract({
        address: contractBeauty,
        functionName: 'get_old_games',
        args: [10],
      });
      let oldRes = JSON.parse(oldGamesRaw);
      renderBeautyHistory(oldRes, 'history', true);
      console.error('Success getting old contests:', oldRes);
    } catch (error) {
      console.error('Error getting old contests:', error);
    }
  }

  async function getContest(gameId) {
    if (!client) return;
    renderContest(0, null);
    try {
      const game = await client.readContract({
        address: contractBeauty,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        renderContest(2, null);
      } else {
        renderContest(1, res);
      }
      console.error('Success getting contest:', res);
    } catch (error) {
      renderContest(2, null);
      console.error('Error getting contest:', error);
    }
  }

  async function getShareImage({ catImageUrl, score, place, nick }) {
    const res = await fetch('/api/contest/share-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catImageUrl, score, place, nick }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to generate preview');
    return json.url;
  }

  function renderBeautyHistory(data, root, old) {
    const historyRoot = document.getElementById(root);

    if (!historyRoot) {
      console.error('No #history element on page');
      return;
    }
    historyRoot.textContent = '';

    if (data.error || !Array.isArray(data.contests) || data.contests.length === 0) {
      const p = document.createElement('p');
      if (old) {
        p.textContent = 'No past contests yet';
      } else {
        p.textContent = 'No active contests yet';
      }
      p.style.marginTop = '1.5rem';
      historyRoot.appendChild(p);
      return;
    }
    const title = document.createElement('h2');
    if (old) {
      title.textContent = 'Past contests';
    } else {
      title.textContent = 'Active contests';
    }
    title.style.marginTop = '1.5rem';
    title.style.marginBottom = '.5rem';
    historyRoot.appendChild(title);
    const list = document.createElement('div');
    list.style.margin = '0';
    data.contests.forEach(c => {
      const li = document.createElement('p');
      const a = document.createElement('a');
      a.href = '/cat/' + c.id;
      a.textContent = c.title || c.id;
      li.appendChild(a);
      list.appendChild(li);
    });

    historyRoot.appendChild(list);
  }

  async function catBeauty(picture, nick, id) {
    if (!client) return;
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractBeauty,
        functionName: "join_contest",
        args: [id, picture, nick],
      });
      console.error('Success tx contest:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting contest:', receipt);
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      window.location.href = `/cat/${id}`;
    } catch (error) {
      console.error('Error setting contest:', error);
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  function renderContest(state, game) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    const contestTitle = document.getElementById('contestTitle');
    const leaderboard = document.getElementById('leaderboard');
    const statusContainer = document.getElementById('contestStatus');
    switch (state) {
      case 0:
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        if (dataContainer) dataContainer.classList.add('hidden');
        if (emptyContainer) emptyContainer.classList.add('hidden');
        if (leaderboard) leaderboard.textContent = '';
        break;
      case 1:
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        if (dataContainer) dataContainer.classList.remove('hidden');
        if (emptyContainer) emptyContainer.classList.add('hidden');

        if (contestTitle && game && game.game_title) {
          contestTitle.textContent = "Beauty Contest: " + game.game_title;
        }

        if (!leaderboard) {
          return;
        }

        leaderboard.textContent = '';

        if (statusContainer) {
          statusContainer.textContent = '';
        }

        const players = Array.isArray(game.game_players) ? game.game_players : [];

        if (!players.length) {
          const p = document.createElement('p');
          p.textContent = 'No participants yet';
          p.style.marginTop = '1rem';
          leaderboard.appendChild(p);

          let hasAttempts = true;
          if (game.game_attempt && game.game_attempt === '3') {
            hasAttempts = false;
          }

          if (statusContainer && game.game_active === 'True' && hasAttempts) {
            const joinBtn = document.createElement('button');
            joinBtn.type = 'button';
            joinBtn.className = 'btn';
            joinBtn.textContent = 'Show your cat';
            joinBtn.addEventListener('click', () => {
              window.location.href = '/cat-beauty';
            });
            statusContainer.appendChild(joinBtn);
          }

          return;
        }

        const sorted = [...players].sort((a, b) => {
          const sA = Number(a.score) || 0;
          const sB = Number(b.score) || 0;
          return sB - sA;
        });

        if (statusContainer) {
          const myAddr = (WalletUI.getAddress() || '').toLowerCase().trim();
          const meIndex = sorted.findIndex(p =>
            (p.address || '').toLowerCase().trim() === myAddr
          );
        
          if (meIndex >= 0) {
            const place = meIndex + 1;
            const me = sorted[meIndex];
        
            const msg = document.createElement('div');
            msg.textContent = `Congrats, your cat is in ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} place`;
            msg.style.marginBottom = '.5rem';
            msg.style.fontWeight = '600';
        
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.textContent = 'Change cat\'s photo';
        
            btn.addEventListener('click', () => {
              window.location.href = '/cat-beauty';
            });

            const shareBtn = document.createElement('button');
            shareBtn.type = 'button';
            shareBtn.className = 'btn';
            shareBtn.textContent = 'Share on X';
            shareBtn.style.margin = '0 1rem';
            shareBtn.dataset.catImageUrl = me.cat;
            shareBtn.dataset.score = String(me.score ?? 0);
            shareBtn.dataset.place = String(place);
            shareBtn.dataset.nick = me.cat_nick || '';

            shareBtn.addEventListener('click', async () => {
              try {
                shareBtn.disabled = true;
                shareBtn.textContent = 'Generating...';

                const url = await WalletUI.getShareImage({
                  catImageUrl: shareBtn.dataset.catImageUrl,
                  score: Number(shareBtn.dataset.score || 0),
                  place: Number(shareBtn.dataset.place || 0),
                  nick: shareBtn.dataset.nick || '',
                });

                const text = `My cat is in #${place} place in Cat Beauty Contest “${game.game_title}”!`;
                const xUrl = new URL('https://x.com/intent/post');
                xUrl.searchParams.set('text', text);
                xUrl.searchParams.set('url', url);

                window.open(xUrl.toString(), '_blank', 'noopener,noreferrer');
              } catch (e) {
                console.error(e);
                alert(e.message || 'Failed to share');
              } finally {
                shareBtn.disabled = false;
                shareBtn.textContent = 'Share on X';
              }
            });
        
            statusContainer.appendChild(msg);
            if (game.game_active === 'True') {
              statusContainer.appendChild(btn);
            }
            statusContainer.appendChild(shareBtn);
          } else {
            const msg = document.createElement('div');
            if (game.game_active === 'True') {
              msg.textContent = 'Your cat is not participating in the contest yet.';
            } else {
              msg.textContent = 'Your cat did not participate in the contest.';
            }
            msg.style.marginBottom = '.5rem';
        
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.textContent = 'Show your cat';
        
            btn.addEventListener('click', () => {
              window.location.href = '/cat-beauty';
            });
        
            statusContainer.appendChild(msg);
            if (game.game_active === 'True') {
              statusContainer.appendChild(btn);
            }
          }
        }

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '.5rem';
        list.style.marginTop = '1rem';

        const header = document.createElement('div');
        header.style.display = 'grid';
        header.style.gridTemplateColumns = '40px 80px 1fr auto';
        header.style.alignItems = 'center';
        header.style.gap = '8px';
        header.style.fontWeight = '600';
        header.style.padding = '8px 0';
        header.style.borderBottom = '1px solid #e5e7eb';

        const hPlace = document.createElement('div');
        hPlace.textContent = '#';
        hPlace.style.textAlign = 'center';
        const hPhoto = document.createElement('div');
        hPhoto.textContent = 'Photo';
        hPhoto.style.display = 'flex';
        hPhoto.style.alignItems = 'center';
        hPhoto.style.justifyContent = 'center';
        const hCat = document.createElement('div');
        hCat.textContent = 'Cat / Owner';
        const hScore = document.createElement('div');
        hScore.textContent = 'score';
        hScore.style.textAlign = 'right';

        header.appendChild(hPlace);
        header.appendChild(hPhoto);
        header.appendChild(hCat);
        header.appendChild(hScore);
        list.appendChild(header);

        function ensurePhotoOverlay() {
          let overlay = document.getElementById('catPhotoOverlay');
          if (overlay) return overlay;

          overlay = document.createElement('div');
          overlay.id = 'catPhotoOverlay';
          overlay.style.position = 'fixed';
          overlay.style.inset = '0';
          overlay.style.background = 'rgba(0,0,0,0.75)';
          overlay.style.display = 'flex';
          overlay.style.alignItems = 'center';
          overlay.style.justifyContent = 'center';
          overlay.style.zIndex = '9999';
          overlay.style.padding = '16px';

          const inner = document.createElement('div');
          inner.style.position = 'relative';
          inner.style.maxWidth = '90vw';
          inner.style.maxHeight = '90vh';

          const img = document.createElement('img');
          img.id = 'catPhotoOverlayImg';
          img.style.maxWidth = '90vw';
          img.style.maxHeight = '90vh';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '12px';
          img.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
          img.alt = 'Cat photo';

          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.textContent = '×';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '-10px';
          closeBtn.style.right = '-10px';
          closeBtn.style.width = '32px';
          closeBtn.style.height = '32px';
          closeBtn.style.borderRadius = '50%';
          closeBtn.style.border = 'none';
          closeBtn.style.background = '#ffffff';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.fontSize = '20px';
          closeBtn.style.lineHeight = '1';
          closeBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

          closeBtn.addEventListener('click', () => {
            overlay.remove();
          });

          overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
          });

          inner.appendChild(img);
          inner.appendChild(closeBtn);
          overlay.appendChild(inner);
          document.body.appendChild(overlay);
          return overlay;
        }

        function openPhoto(url) {
          if (!url) return;
          const overlay = ensurePhotoOverlay();
          const img = overlay.querySelector('#catPhotoOverlayImg');
          if (img) img.src = url;
        }

        sorted.forEach((p, index) => {
          const place = index + 1;
          const row = document.createElement('div');
          row.style.display = 'grid';
          row.style.gridTemplateColumns = '40px 80px 1fr auto';
          row.style.alignItems = 'center';
          row.style.gap = '8px';
          row.style.padding = '8px 0';
          row.style.borderBottom = '1px solid #f3f4f6';

          if (place === 1) {
            row.style.background = 'linear-gradient(90deg, rgba(250,204,21,0.12), transparent)';
          } else if (place === 2) {
            row.style.background = 'linear-gradient(90deg, rgba(156,163,175,0.12), transparent)';
          } else if (place === 3) {
            row.style.background = 'linear-gradient(90deg, rgba(244,114,182,0.12), transparent)';
          }

          const placeEl = document.createElement('div');
          placeEl.textContent = String(place);
          placeEl.style.textAlign = 'center';
          placeEl.style.fontWeight = '700';

          const photoWrap = document.createElement('div');
          photoWrap.style.width = '100%';
          photoWrap.style.display = 'flex';
          photoWrap.style.alignItems = 'center';
          photoWrap.style.justifyContent = 'center';

          const img = document.createElement('img');
          img.src = p.cat;
          img.alt = p.cat_nick || 'Cat';
          img.style.cursor = 'pointer';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '50%';
          img.style.display = 'block';

          if (place === 1) {
            img.style.width = '72px';
            img.style.height = '72px';
            img.style.border = '3px solid #facc15';
          } else if (place === 2) {
            img.style.width = '64px';
            img.style.height = '64px';
            img.style.border = '3px solid #9ca3af'; 
          } else if (place === 3) {
            img.style.width = '56px';
            img.style.height = '56px';
            img.style.border = '3px solid #f97316'; 
          } else {
            img.style.width = '40px';
            img.style.height = '40px';
            img.style.border = '2px solid #e5e7eb';
          }

          img.addEventListener('click', () => openPhoto(p.cat));
          photoWrap.appendChild(img);

          const info = document.createElement('div');
          info.style.display = 'flex';
          info.style.flexDirection = 'column';
          info.style.gap = '2px';

          const catName = document.createElement('div');
          catName.textContent = p.cat_nick || 'Unnamed cat';
          catName.style.fontWeight = place <= 3 ? '700' : '500';
          catName.style.fontSize = '14px';

          const owner = document.createElement('div');
          const nick = (p.nick && String(p.nick).trim() !== '') ? p.nick : 'Nick not set';
          owner.textContent = nick || '';
          owner.style.fontSize = '12px';
          owner.style.color = '#6b7280';

          const wallet = document.createElement('div');
          const w = maskAddress(p.address);
          wallet.textContent = w || '';
          wallet.style.fontSize = '12px';
          wallet.style.color = '#6b7280';

          info.appendChild(catName);
          if (nick) info.appendChild(owner);
          info.appendChild(wallet);

          const scoreEl = document.createElement('div');
          scoreEl.textContent = String(p.score ?? 0);
          scoreEl.style.textAlign = 'right';
          scoreEl.style.fontWeight = '700';
          scoreEl.style.fontSize = place <= 3 ? '16px' : '14px';

          row.appendChild(placeEl);
          row.appendChild(photoWrap);
          row.appendChild(info);
          row.appendChild(scoreEl);

          list.appendChild(row);
        });

        leaderboard.appendChild(list);
        break;
      case 2:
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        if (dataContainer) dataContainer.classList.add('hidden');
        if (emptyContainer) emptyContainer.classList.remove('hidden');
        if (leaderboard) leaderboard.textContent = '';
        break;
    }
  }

  export {
    getShareImage,
    catBeauty,
    getContests,
    getContest
  };