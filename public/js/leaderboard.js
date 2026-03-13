import {
    client,
    TransactionStatus,
    contractStat,
    contractMochi,
    contractDeveloper,
    checkGenlayer,
    getStat,
    maskAddress
  } from './core.js';

  function initLeaderboardTabs() {
    const tabs = document.querySelectorAll('.lb-tab');
    if (!tabs.length) {
      getLeaderboardOverall();
      return;
    }
  
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        tabs.forEach(t => t.classList.toggle('lb-tab-active', t === tab));
        ['overall', 'guess', 'match', 'quiz', 'punch', 'cook', 'mochi', 'developer'].forEach(key => {
          const el = document.getElementById('leaderboard-' + key);
          if (el) el.style.display = key === name ? '' : 'none';
        });
  
        if (name === 'overall') {
          getLeaderboardOverall();
        } else if (name === 'guess') {
          getLeaderboardGuess();
        } else if (name === 'match') {
          getLeaderboardMatch();
        } else if (name === 'punch') {
          getLeaderboardPunch();
        } else if (name === 'cook') {
          getLeaderboardCook();
        } else if (name === 'mochi') {
          getLeaderboardMochi();
        } else if (name === 'developer') {
          getLeaderboardDeveloper();
        }
      });
    });
  
    const defaultTab = document.querySelector('.lb-tab[data-tab="overall"]');
    if (defaultTab) defaultTab.click();
  }

  async function getLeaderboardOverall() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points',
        args: [50],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-overall', sorted);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
    }
  }

  async function getLeaderboardVerse() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [1, 50],
      });
      const rating2 = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [2, 50],
      });
      
      const res1 = JSON.parse(rating) || [];
      const res2 = JSON.parse(rating2) || [];

      const map = new Map();

      function addArray(arr) {
        arr.forEach(item => {
          const wallet = item.wallet;
          if (!wallet) return;

          const points = Number(item.points) || 0;
          const nick = (item.nick && String(item.nick).trim() !== '')
            ? String(item.nick)
            : '';

          if (!map.has(wallet)) {
            map.set(wallet, {
              wallet,
              nick,
              points,
            });
          } else {
            const existing = map.get(wallet);
            existing.points += points;
            if (!existing.nick && nick) {
              existing.nick = nick;
            }
          }
        });
      }

      addArray(res1);
      addArray(res2);

      const merged = Array.from(map.values());


      console.error('Success getting leaderboard verse: ', merged);
      const sorted = [...merged].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-verse', sorted);
    } catch (error) {
      console.error('Error getting leaderboard verse:', error);
    }
  }

  async function getLeaderboardGuess() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [1, 50],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard guess: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-guess', sorted);
    } catch (error) {
      console.error('Error getting leaderboard guess:', error);
    }
  }

  async function getLeaderboardCook() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [7, 50],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard cook: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-cook', sorted);
    } catch (error) {
      console.error('Error getting leaderboard cook:', error);
    }
  }

  async function getLeaderboardMochi() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractMochi,
        functionName: 'get_rating',
        args: [250],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard nft: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.level) || 0;
        const pointsB = Number(b.level) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-mochi', sorted);
    } catch (error) {
      console.error('Error getting leaderboard nft:', error);
    }
  }

  async function getLeaderboardDeveloper() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractDeveloper,
        functionName: 'get_rating',
        args: [500],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard developer: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.stat.score) || 0;
        const pointsB = Number(b.stat.score) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-developer', sorted);
    } catch (error) {
      console.error('Error getting leaderboard developer:', error);
    }
  }

  async function getLeaderboardMatch() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [2, 50],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard match: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-match', sorted);
    } catch (error) {
      console.error('Error getting leaderboard match:', error);
    }
  }

  async function getLeaderboardPunch() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contractStat,
        functionName: 'get_points_by_game',
        args: [4, 50],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard punch: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard('leaderboard-punch', sorted);
    } catch (error) {
      console.error('Error getting leaderboard punch:', error);
    }
  }

  function renderLeaderboard(rootId, items) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.textContent = '';
  
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '40px 1fr auto'; 
    header.style.gap = '8px';
    header.style.fontWeight = '600';
    header.style.padding = '8px 0';
    header.style.borderBottom = '1px solid #e5e7eb';
  
    const hIndex = document.createElement('div');
    hIndex.textContent = '#';
    hIndex.style.textAlign = 'left';
  
    const hPlayer = document.createElement('div');
    hPlayer.textContent = 'PLAYER';
  
    const hPoints = document.createElement('div');
    hPoints.textContent = 'points';
    hPoints.style.textAlign = 'right';
  
    header.appendChild(hIndex);
    header.appendChild(hPlayer);
    header.appendChild(hPoints);
    root.appendChild(header);
  
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '40px 1fr auto';
      row.style.gap = '8px';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f3f4f6';
  
      const indexEl = document.createElement('div');
      indexEl.textContent = String(index + 1);
      indexEl.style.fontWeight = '600';
      indexEl.style.textAlign = 'left';
  
      const left = document.createElement('div');
      const walletEl = document.createElement('div');
      if (rootId === "leaderboard-mochi") {
        walletEl.textContent = maskAddress(item.owner) ?? '';
      } else {
        walletEl.textContent = maskAddress(item.wallet) ?? '';
      }
      walletEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
      walletEl.style.fontSize = '14px';
      left.appendChild(walletEl);
  
      if (item.nick && String(item.nick).trim() !== '') {
        const nickEl = document.createElement('div');
        nickEl.textContent = String(item.nick);
        nickEl.style.color = '#6b7280';
        nickEl.style.fontSize = '12px';
        left.appendChild(nickEl);
      }
  
      const pointsEl = document.createElement('div');
      if (rootId === "leaderboard-mochi") {
        pointsEl.textContent = String(item.level ?? 0);
      } else if (rootId === "leaderboard-developer") {
        pointsEl.textContent = String(item.stat.score ?? 0);
      } else {
        pointsEl.textContent = String(item.points ?? 0);
      }
      pointsEl.style.textAlign = 'right';
      pointsEl.style.fontWeight = '600';
  
      row.appendChild(indexEl);
      row.appendChild(left);
      row.appendChild(pointsEl);
      root.appendChild(row);
    });
  }

  async function setNickname(nick) {
    if (!client) return;
    const clearBtn = document.getElementById('clearNick');
    const submitBtn = document.getElementById('submitNick');
    const progress = document.getElementById('nickProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      await checkGenlayer();
      const txHash = await client.writeContract({
        address: contractStat,
        functionName: "set_nickname",
        args: [nick],
      });
      console.error('Success tx nick:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting nick:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getStat();
    } catch (error) {
      console.error('Error setting nick:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    initLeaderboardTabs,
    setNickname
  };