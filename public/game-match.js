import {
    client,
    TransactionStatus,
    contractMatch,
    markChanged,
    isChanged,
    getStat,
    clearChanged
  } from './core.js';
  import { renderGame } from './ui-render.js';

  async function getMyMatch() {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractMatch,
        functionName: 'get_my_game',
        args: [],
      });
      let res = JSON.parse(game);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderMatchAdmin(null);
      } else {
        renderMatchAdmin(res);
      }
      console.error('Success getting my match:', res);
    } catch (error) {
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my match:', error);
    }
  }

  async function getGameMatch(gameId) {
    if (!client) return;
    renderGame(0, null);
    try {
      const game = await client.readContract({
        address: contractMatch,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        renderGame(2, null);
      } else {
        if (isChanged(gameId)) {
          if (res.answered == "False") {
            res.answered = "True";
          } else {
            clearChanged(gameId);
          }
        }
        renderGame(1, res);
      }
      console.error('Success getting game:', res);
    } catch (error) {
      renderGame(2, null);
      console.error('Error getting game:', error);
    }
  }

  function renderMatchAdmin(game) {
    const theme = document.getElementById('theme');
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const gameLinkP = document.getElementById('game_link_p');
    const gameLink = document.getElementById('game_link');
    if (gameLinkP) gameLinkP.classList.add('hidden');
    if (theme) theme.value = "";
    if (clearBtn) clearBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    if (game) {
      if (game.time_left) {
        if (theme && game.desc) theme.value = game.desc;
        if (clearBtn) clearBtn.disabled = true;
        if (saveBtn) saveBtn.disabled = true;
        if (gameLinkP) gameLinkP.classList.remove('hidden');
        if (gameLink) gameLink.href = "/match/" + game.id
      }
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
        address: contractMatch,
        functionName: "join_game",
        args: [document.body.dataset.gameId, answer],
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
      markChanged(document.body.dataset.gameId);
      getStat();
      getGameMatch(document.body.dataset.gameId);
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
        address: contractMatch,
        functionName: "create_game",
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
      window.location.href = `/match/${id}`;
    } catch (error) {
      console.error('Error setting room:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    answerMatch,
    gameMatch,
    getMyMatch,
    getGameMatch
  };