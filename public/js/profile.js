import {
    client,
    contractStat
  } from './core.js';

  async function getGames() {
    if (!client) return;
    try {
      const list = await client.readContract({
        address: contractStat,
        functionName: 'get_all_my_archive',
        args: [50],
      });
      let res = JSON.parse(list);
      console.error('Success getting games: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.game_time) || 0;
        const pointsB = Number(b.game_time) || 0;
        return pointsB - pointsA;
      });
      renderHistory(sorted)
    } catch (error) {
      console.error('Error getting games:', error);
    }
  }

  function renderHistory(items) {
    const root = document.getElementById('games');
    if (!root) return;
    root.textContent = '';
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '1fr auto';
    header.style.gap = '8px';
    header.style.fontWeight = '600';
    header.style.padding = '24px 0 8px';
    header.style.borderBottom = '1px solid #e5e7eb';
    const hPlayer = document.createElement('div');
    hPlayer.textContent = 'GAMES';
    const hPoints = document.createElement('div');
    hPoints.textContent = 'role';
    hPoints.style.textAlign = 'right';
    header.appendChild(hPlayer);
    header.appendChild(hPoints);
    root.appendChild(header);
    items.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr auto';
      row.style.gap = '8px';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f3f4f6';
  
      const left = document.createElement('div');
      const walletEl = document.createElement('div');
      const a = document.createElement('a');
      if (item.game_type == "1") {
        a.href = '/guess/' + item.id;
        a.textContent = "GuessPicture (" + item.id + ")";
      } else if (item.game_type == "2") {
        a.href = '/match/' + item.id;
        a.textContent = "DrawMatch (" + item.id + ")";
      } else if (item.game_type == "3") {
        a.href = '/quiz/' + item.id;
        a.textContent = "AiQuiz (" + item.id + ")";
      } else if (item.game_type == "4") {
        a.href = '/punch/' + item.id;
        a.textContent = "PunchLine (" + item.id + ")";
      } else if (item.game_type == "5") {
        a.href = '/cat/' + item.id;
        a.textContent = "CatBeauty (" + item.id + ")";
      } else if (item.game_type == "6") {
        a.href = '/dog/' + item.id;
        a.textContent = "DogBeauty (" + item.id + ")";
      } else if (item.game_type == "7") {
        a.href = '/cook/' + item.id;
        a.textContent = "CookItUp (" + item.id + ")";
      } else {
        a.textContent = item.id;
      }
      walletEl.appendChild(a);
      walletEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      walletEl.style.fontSize = '14px';
      left.appendChild(walletEl);
      
      if (item.game_time && String(item.game_time).trim() !== '') {
        const ms = Math.floor(Number(item.game_time) * 1000);
        const date = new Date(ms);
        const nickEl = document.createElement('div');
        nickEl.textContent = date.toLocaleString();
        nickEl.style.color = '#6b7280';
        nickEl.style.fontSize = '12px';
        left.appendChild(nickEl);
      }
      
      const pointsEl = document.createElement('div');
      if (item.creator == "True") {
        pointsEl.textContent = "Creator";
      } else {
        pointsEl.textContent = "Player";
      }
      pointsEl.style.textAlign = 'right';
      pointsEl.style.fontWeight = '600';
      
      row.appendChild(left);
      row.appendChild(pointsEl);
      root.appendChild(row);
      
    });
  }

  export {
    getGames
  };