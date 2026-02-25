import {
    client,
    TransactionStatus,
    contractGuess,
    markChanged,
    isChanged,
    checkGenlayer,
    getStat,
    clearChanged
  } from './core.js';
  import { renderGame } from './ui-render.js';

async function getMyGuess() {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractGuess,
        functionName: 'get_my_game',
        args: [],
      });
      let res = JSON.parse(game);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderGuessAdmin(null);
      } else {
        renderGuessAdmin(res);
      }
      console.error('Success getting my guess:', res);
    } catch (error) {
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my guess:', error);
    }
  }

  async function getGame(gameId) {
    if (!client) return;
    renderGame(0, null);
    try {
      const game = await client.readContract({
        address: contractGuess,
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

  function renderGuessAdmin(game) {
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const gameLinkP = document.getElementById('game_link_p');
    const gameLink = document.getElementById('game_link');
    if (gameLinkP) gameLinkP.classList.add('hidden');
    if (clearBtn) clearBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
    if (game) {
      if (game.time_left) {
        if (clearBtn) clearBtn.disabled = true;
        if (saveBtn) saveBtn.disabled = true;
        if (gameLinkP) gameLinkP.classList.remove('hidden');
        if (gameLink) gameLink.href = "/guess/" + game.id
      }
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
      await checkGenlayer();
      const txHash = await client.writeContract({
        address: contractGuess,
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
      markChanged(document.body.dataset.gameId);
      getStat();
      getGame(document.body.dataset.gameId);
    } catch (error) {
      console.error('Error setting answer:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function gameGuess(id, picture) {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      await checkGenlayer();
      const txHash = await client.writeContract({
        address: contractGuess,
        functionName: "create_game",
        args: [id, picture],
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
      window.location.href = `/guess/${id}`;
    } catch (error) {
      console.error('Error setting game:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    answer,
    gameGuess,
    getMyGuess,
    getGame
  };