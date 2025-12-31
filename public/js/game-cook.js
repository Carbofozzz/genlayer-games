import {
    client,
    TransactionStatus,
    contractCook,
    getStat
  } from './core.js';
  import { renderGameCook } from './ui-render.js';

  async function getMyCook() {
    if (!client) return;
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractCook,
        functionName: 'get_my_game',
        args: [],
      });
      let res = JSON.parse(game);
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderCookAdmin(null);
      } else {
        renderCookAdmin(res);
      }
      console.error('Success getting my cook:', res);
    } catch (error) {
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my cook:', error);
    }
  }

  async function getGameCook(gameId) {
    if (!client) return;
    renderGameCook(0, null);
    try {
      const game = await client.readContract({
        address: contractCook,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        renderGameCook(2, null);
      } else {
        renderGameCook(1, res);
      }
      console.error('Success getting cook:', res);
    } catch (error) {
        renderGameCook(2, null);
      console.error('Error getting cook:', error);
    }
  }

  function renderCookAdmin(game) {
    const saveBtn = document.getElementById('saveBtn');
    const gameLinkP = document.getElementById('game_link_p');
    const gameLink = document.getElementById('game_link');
    if (gameLinkP) gameLinkP.classList.add('hidden');
    if (saveBtn) saveBtn.disabled = false;
    if (game) {
      if (game.game_time_left) {
        if (saveBtn) saveBtn.disabled = true;
        if (gameLinkP) gameLinkP.classList.remove('hidden');
        if (gameLink) gameLink.href = "/cook/" + game.game_id
      }
    }
  }

  async function answerCook(answer) {
    if (!client) return;
    const clearBtn = document.getElementById('clearAnswer');
    const submitBtn = document.getElementById('submitAnswer');
    const progress = document.getElementById('answerProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractCook,
        functionName: "join_game",
        args: [document.body.dataset.gameId, answer],
      });
      console.error('Success tx answer cook:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer cook:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getStat();
      getGameCook(document.body.dataset.gameId);
    } catch (error) {
      console.error('Error setting answer cook:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function gameCook(lang) {
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
        address: contractCook,
        functionName: "create_game",
        args: [id, lang],
      });
      console.error('Success tx cook:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting cook:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      window.location.href = `/cook/${id}`;
    } catch (error) {
      console.error('Error setting cook:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    answerCook,
    gameCook,
    getMyCook,
    getGameCook
  };