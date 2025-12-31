import {
    client,
    TransactionStatus,
    contractPunch,
    getStat
  } from './core.js';
  import { renderGamePunch } from './ui-render.js';

  async function getMyPunch() {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractPunch,
        functionName: 'get_my_game',
        args: [],
      });
      let res = JSON.parse(game);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderPunchAdmin(null);
      } else {
        renderPunchAdmin(res);
      }
      console.error('Success getting my punch:', res);
    } catch (error) {
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my punch:', error);
    }
  }

  async function getGamePunch(gameId) {
    if (!client) return;
    renderGamePunch(0, null);
    try {
      const game = await client.readContract({
        address: contractPunch,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        renderGamePunch(2, null);
      } else {
        renderGamePunch(1, res);
      }
      console.error('Success getting joke:', res);
    } catch (error) {
      renderGamePunch(2, null);
      console.error('Error getting joke:', error);
    }
  }

  function renderPunchAdmin(game) {
    const question = document.getElementById('theme');
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const gameLinkP = document.getElementById('game_link_p');
    const gameLink = document.getElementById('game_link');
    if (gameLinkP) gameLinkP.classList.add('hidden');
    if (question) question.value = "";
    if (clearBtn) clearBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    if (game) {
      if (game.game_time_left) {
        if (question && game.game_question) question.value = game.game_question;
        if (clearBtn) clearBtn.disabled = true;
        if (saveBtn) saveBtn.disabled = true;
        if (gameLinkP) gameLinkP.classList.remove('hidden');
        if (gameLink) gameLink.href = "/punch/" + game.game_id
      }
    }
  }

  async function joke(answer) {
    if (!client) return;
    const clearBtn = document.getElementById('clearAnswer');
    const submitBtn = document.getElementById('submitAnswer');
    const progress = document.getElementById('answerProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractPunch,
        functionName: "join_game",
        args: [document.body.dataset.gameId, answer],
      });
      console.error('Success tx answer joke:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer joke:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getStat();
      getGamePunch(document.body.dataset.gameId);
    } catch (error) {
      console.error('Error setting answer joke:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function gamePunch(theme) {
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
        address: contractPunch,
        functionName: "create_game",
        args: [id, theme],
      });
      console.error('Success tx joke:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting joke:', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      window.location.href = `/punch/${id}`;
    } catch (error) {
      console.error('Error setting joke:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    joke,
    gamePunch,
    getMyPunch,
    getGamePunch
  };