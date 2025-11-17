import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus } from "https://esm.sh/genlayer-js/types";

const WalletUI = (() => {

  let client = null;
  let inited = false;
  let contract = '0x2a20912465B723066F542Af9BB9d60aC13Bb78a1';
  let baseUrl = 'https://guess-picture.onrender.com';

  function maskAddress(a){ if(!a) return ''; return a.slice(0,5)+'…'+a.slice(-4); }

  async function getStat() {
    if (!client) return;
    try {
      const points = await client.readContract({
        address: contract,
        functionName: 'get_my_points',
        args: [],
      });
      let res = JSON.parse(points);
      let address = res.wallet;
      let nick = res.nick;
      const addr = document.getElementById('addr');
      const area = document.getElementById('nick');
      if (nick.trim().length > 0) {
        if (addr) addr.textContent = nick + " (points: " + res.points + ")";
        if (area) {
          area.value = nick;
        }
      } else {
        if (addr) addr.textContent = maskAddress(address) + " (points: " + res.points + ")";
      }
      console.error('Success getting stat:', res.points);
    } catch (error) {
      console.error('Error getting stat:', error);
    }
  }

  async function getLeaderboard() {
    if (!client) return;
    try {
      const rating = await client.readContract({
        address: contract,
        functionName: 'get_points',
        args: [],
      });
      let res = JSON.parse(rating);
      console.error('Success getting leaderboard: ', res);
      const sorted = [...res].sort((a, b) => {
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;
        return pointsB - pointsA;
      });
      renderLeaderboard(sorted)
    } catch (error) {
      console.error('Error getting leaderboard:', error);
    }
  }

  async function getGames() {
    if (!client) return;
    try {
      const list = await client.readContract({
        address: contract,
        functionName: 'get_my_games',
        args: [],
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

  async function getGame(gameId) {
    if (!client) return;
    renderGame(0, null);
    try {
      const game = await client.readContract({
        address: contract,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        renderGame(2, null);
      } else {
        renderGame(1, res);
      }
      console.error('Success getting game:', res);
    } catch (error) {
      renderGame(2, null);
      console.error('Error getting game:', error);
    }
  }

  async function checkPage() {
    const pageName = document.body.dataset.pageName;
    switch (pageName) {
      case 'leaderboard':
        getLeaderboard();
        break;
      case 'game':
        getGame(document.body.dataset.gameId);
        break;
      case 'profile':
        getGames();
        break;
      default:
        console.log('Page has no data-page-name');
    }
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
      const txHash = await client.writeContract({
        address: contract,
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

  async function answer(answer) {
    if (!client) return;
    const clearBtn = document.getElementById('clearAnswer');
    const submitBtn = document.getElementById('submitAnswer');
    const progress = document.getElementById('answerProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contract,
        functionName: "join_game",
        args: [document.body.dataset.gameId, answer],
      });
      console.error('Success tx answer:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getStat();
      getGame(document.body.dataset.gameId);
    } catch (error) {
      console.error('Error setting answer:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function answerMatch(answer) {
    if (!client) return;
    const clearBtn = document.getElementById('clearCanvas');
    const submitBtn = document.getElementById('saveCanvas');
    const progress = document.getElementById('canvasProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contract,
        functionName: "join_match_game",
        args: [document.body.dataset.gameId, baseUrl + answer],
      });
      console.error('Success tx answer match:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer match:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getStat();
      getGame(document.body.dataset.gameId);
    } catch (error) {
      console.error('Error setting answer match:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function gameMatch(theme) {
    if (!client) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contract,
        functionName: "create_match_game",
        args: [id, theme],
      });
      console.error('Success tx room:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting room:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      window.location.href = `/game/${id}`;
    } catch (error) {
      console.error('Error setting room:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function gameGuess(gameUrl, id, picture) {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contract,
        functionName: "create_game",
        args: [id, baseUrl + picture],
      });
      console.error('Success tx game:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting game:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      window.location.href = gameUrl || `/game/${id}`;
    } catch (error) {
      console.error('Error setting game:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  function renderGame(state, game) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    switch (state) {
      case 0:
        loadingIndicator.classList.remove('hidden');
        dataContainer.classList.add('hidden');
        emptyContainer.classList.add('hidden');
        break;
      case 1:
        loadingIndicator.classList.add('hidden');
        dataContainer.classList.remove('hidden');
        emptyContainer.classList.add('hidden');
        const img = document.getElementById('picture');
        const pad = document.getElementById('pad');
        const padTheme = document.getElementById('game_theme');
        const timer = document.getElementById('timer');
        const players = document.getElementById('players');
        const answers = document.getElementById('answers');
        const task = document.getElementById('task');
        if (game.type == 2) {
          padTheme.textContent = 'Draw on the theme of "' + game.desc + '" and join the game.';
          padTheme.classList.remove('hidden');
          img.classList.add('hidden');
          if (game.time_left) {
            if (game.answered == "True") {
              pad.classList.add('hidden');
            } else {
              pad.classList.remove('hidden');
              window.resizeCanvas();
            }
          } else {
            pad.classList.add('hidden');
          }
        } else {
          padTheme.classList.add('hidden');
          pad.classList.add('hidden');
          if (game.image.length > 0) {
            img.src = game.image;
            img.classList.remove('hidden');
          } else {
            img.classList.add('hidden');
          }
        }
       
        if (game.time_left) {
          players.classList.add('hidden');
          if (game.answered == "True" || game.type == 1 && getAddress().toLowerCase().trim() == game.creator.toLowerCase().trim()) {
            answers.style.display = 'none';
            task.classList.remove('hidden');
            if (game.answered == "True") {
              task.textContent = "You have already answered";
            } else {
              task.textContent = "You are the creator of the game and cannot answer your own riddle";
            }
            task.style.padding = '8px 0';
          } else {
            if (game.type == 1) {
              answers.style.display = 'block';
            } else {
              answers.style.display = 'none';
            }
            task.classList.add('hidden');
            task.textContent = "";
          }
          timer.classList.remove('hidden');
          timer.style.padding = '8px 0';
          if (window.dftWidgetTimer) {
            clearInterval(window.dftWidgetTimer);
            window.dftWidgetTimer = null;
          }
          let secs = 0;
          secs = Math.round(Number(game.time_left));
          timer.textContent = 'Game finish in ' + fmt(secs);
          window.dftWidgetTimer = setInterval(()=>{ 
            secs-=1; 
            if (secs<=0){ 
              clearInterval(window.dftWidgetTimer); 
              window.dftWidgetTimer = null; 
              timer.textContent='Finished';
              getGame(game.id)
            } else { 
              timer.textContent = 'Game finish in ' + fmt(secs);
            } 
          }, 1000); 
        } else {
          players.classList.remove('hidden');
          answers.style.display = 'none';
          timer.classList.add('hidden');
          if (game.type == 1) {
            task.classList.remove('hidden');
            task.textContent = "Correct answer: " + game.desc
            task.style.padding = '8px 0';
          } else {
            task.classList.add('hidden');
          }
          showPlayers(game.players, game.type)
        }
        break;
      case 2:
        loadingIndicator.classList.add('hidden');
        dataContainer.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        break;
    }
  }

  function fmt(t){ 
    const m = Math.floor((t%3600)/60); 
    const s = Math.floor(t%60); 
    const h = Math.floor(t/3600); 
    return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); 
  }

  function showPlayers(items, type) {
    const sorted = [...items].sort((a, b) => {
      const pointsA = Number(a.score) || 0;
      const pointsB = Number(b.score) || 0;
      return pointsB - pointsA;
    });
    const root = document.getElementById('players');
    if (!root) return;
    root.textContent = '';
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '1fr auto';
    header.style.gap = '8px';
    header.style.fontWeight = '600';
    header.style.padding = '8px 0';
    header.style.borderBottom = '1px solid #e5e7eb';
    const hPlayer = document.createElement('div');
    hPlayer.textContent = 'PLAYER';
    const hPoints = document.createElement('div');
    hPoints.textContent = 'points';
    hPoints.style.textAlign = 'right';
    header.appendChild(hPlayer);
    header.appendChild(hPoints);
    root.appendChild(header);
    // строки
    sorted.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr auto';
      row.style.gap = '8px';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f3f4f6';
  
      const left = document.createElement('div');
      const walletEl = document.createElement('div');
      walletEl.textContent = maskAddress(item.address) ?? '';
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

      if (item.answer && String(item.answer).trim() !== '') {
        if (type == 1) {
          const answerEl = document.createElement('div');
          answerEl.textContent = "Answer: " + String(item.answer);
          answerEl.style.fontSize = '13px';
          left.appendChild(answerEl);
        } else {
          const answerEl = document.createElement('img');
          answerEl.src = item.answer;
          answerEl.width = 200; 
          answerEl.height = 150;
          left.appendChild(answerEl);
        }
      }
      
      const pointsEl = document.createElement('div');
      pointsEl.textContent = String(item.score ?? 0);
      pointsEl.style.textAlign = 'right';
      pointsEl.style.fontWeight = '600';
      
      row.appendChild(left);
      row.appendChild(pointsEl);
      root.appendChild(row);
      
    });
  }

  function renderLeaderboard(items) {
    const root = document.getElementById('leaderboard');
    if (!root) return;
    root.textContent = '';
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '1fr auto';
    header.style.gap = '8px';
    header.style.fontWeight = '600';
    header.style.padding = '8px 0';
    header.style.borderBottom = '1px solid #e5e7eb';
    const hPlayer = document.createElement('div');
    hPlayer.textContent = 'PLAYER';
    const hPoints = document.createElement('div');
    hPoints.textContent = 'points';
    hPoints.style.textAlign = 'right';
    header.appendChild(hPlayer);
    header.appendChild(hPoints);
    root.appendChild(header);
    // строки
    items.forEach(item => {
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1fr auto';
      row.style.gap = '8px';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f3f4f6';
  
      const left = document.createElement('div');
      const walletEl = document.createElement('div');
      walletEl.textContent = maskAddress(item.wallet) ?? '';
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
      pointsEl.textContent = String(item.points ?? 0);
      pointsEl.style.textAlign = 'right';
      pointsEl.style.fontWeight = '600';
      
      row.appendChild(left);
      row.appendChild(pointsEl);
      root.appendChild(row);
      
    });
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
    // строки
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
      a.href = '/game/' + item.id;
      a.textContent = item.id;
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

  function updateAccount(account) {
    try {
      if (!account) {
        client = null;
        return;
      }
      client = createClient({ chain: studionet, account, endpoint: 'https://studio.genlayer.com/api' });
      queueMicrotask(() => getStat());
      queueMicrotask(() => checkPage());
    } catch (error) {
      console.error('Error update', error);
    }
  }

  async function connectWalletAndEnsureNetwork(){
    const net = await (await fetch('/api/config/network')).json();
    if (!window.ethereum) throw new Error('No wallet');
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] }); }
    catch (e) {
      if (e.code===4902 || (e.data && e.data.originalError && e.data.originalError.code===4902)) {
        await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{ chainId: net.chainIdHex, chainName: net.chainName, rpcUrls: net.rpcUrls, nativeCurrency: net.nativeCurrency, blockExplorerUrls: net.blockExplorerUrls }] });
      } else { throw e; }
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts[0];
  }

  function setUIConnected(address) {
    const addr = document.getElementById('addr'); if (addr) addr.textContent = maskAddress(address);
    const btn = document.getElementById('connectBtn'); if (btn) { btn.textContent = 'Disconnect'; btn.dataset.state = 'connected'; }
    const blockOut = document.getElementById('logoutContainer'); if (blockOut) { blockOut.classList.add('hidden'); }
    const blockIn = document.getElementById('loginContainer'); if (blockIn) { blockIn.classList.remove('hidden'); }
  }

  function setUIDisconnected() {
    const addr = document.getElementById('addr'); if (addr) addr.textContent = '';
    const btn = document.getElementById('connectBtn'); if (btn) { btn.textContent = 'Connect wallet'; btn.dataset.state = 'disconnected'; }
    const blockOut = document.getElementById('logoutContainer'); if (blockOut) { blockOut.classList.remove('hidden'); }
    const blockIn = document.getElementById('loginContainer'); if (blockIn) { blockIn.classList.add('hidden'); }
  }

  async function disconnect() {
    try {
      localStorage.removeItem('connectedAddress');
      setUIDisconnected();
    } catch (e) {
      console.error('Disconnect error', e);
    }
}

  async function connect() {
    const address = await connectWalletAndEnsureNetwork();
    localStorage.setItem('connectedAddress', address);
    setUIConnected(address);
    updateAccount(address);
    return address;
  }

  function init() {
    if (inited) {
      return;
    }
    inited = true;
    const btn = document.getElementById('connectBtn');
    if (btn) {
      btn.dataset.state = 'disconnected';
      btn.addEventListener('click', async () => {
        try {
          if (btn.dataset.state === 'connected') { await disconnect(); }
          else { await connect(); }
        } catch (e) { alert(e.message || String(e)); }
      });
    }
    const saved = localStorage.getItem('connectedAddress');
    if (saved) {
      setUIConnected(saved);
      queueMicrotask(() => updateAccount(saved));
    } else {
      setUIDisconnected();
    }
  }

  function isConnected(){ return !!localStorage.getItem('connectedAddress'); }
  function getAddress(){ return localStorage.getItem('connectedAddress') || ''; }

  async function ensureConnected(){
    if (!isConnected()) throw new Error('Please connect your wallet first');
    return getAddress();
  }
  function requireConnectedOnLoad(){
    if (!isConnected()) {
      // Soft prompt; UI has Connect button
      console.warn('Wallet not connected. Please connect your wallet first.');
    }
  }

  return { 
    connectWalletAndEnsureNetwork, 
    connect, 
    disconnect,
    init, 
    isConnected, 
    getAddress, 
    ensureConnected, 
    requireConnectedOnLoad, 
    setNickname, 
    answer, 
    answerMatch,
    gameGuess, 
    gameMatch
  };
})();

if (typeof window !== 'undefined') {
  window.WalletUI = WalletUI;
  window.addEventListener('DOMContentLoaded', () => {
    try { WalletUI.init(); } catch (e) { console.error(e); }
  });
}


