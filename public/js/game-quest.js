import {
    client,
    TransactionStatus,
    contractMochiQuest
  } from './core.js';
  import { 
    renderQuestIntro,  
    renderQuest
  } from './ui-render.js';

  async function getMochiQuest() {
    if (!client) return;
    const introBlock = document.getElementById('intro');
    const gameBlock = document.getElementById('game');
    const progress = document.getElementById('gameProgress');
    if (introBlock) introBlock.classList.add('hidden');
    if (gameBlock) gameBlock.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractMochiQuest,
        functionName: 'get_my_quest',
        args: [],
      });
      let res = JSON.parse(game);
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderQuestIntro(res.error);
      } else {
        renderQuest(res);
      }
      console.error('Success getting my quest:', res);
    } catch (error) {
      if (introBlock) introBlock.classList.remove('hidden');
      if (gameBlock) gameBlock.classList.add('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my quest:', error);
    }
  }

  async function answerMochiQuest(answer) {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (saveBtn) saveBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractMochiQuest,
        functionName: "answer",
        args: [answer],
      });
      console.error('Success tx answer quest:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer quest:', receipt);
      if (progress) progress.classList.add('hidden');
      getMochiQuest();
    } catch (error) {
      console.error('Error setting answer quest:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (saveBtn) saveBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  async function startMochiQuest(gameLang) {
    if (!client) return;
    const mochiBtn = document.getElementById('mochiBtn');
    const startBtn = document.getElementById('startBtn');
    const languageSelect = document.getElementById('languageSelect');
    const progress = document.getElementById('startProgress');
    if (mochiBtn) mochiBtn.classList.add('hidden');
    if (startBtn) startBtn.classList.add('hidden');
    if (languageSelect) languageSelect.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractMochiQuest,
        functionName: "start",
        args: [gameLang],
      });
      console.error('Success tx start quest:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting start quest:', receipt);
      if (progress) progress.classList.add('hidden');
      getMochiQuest();
    } catch (error) {
      console.error('Error setting start quest:', error);
      if (startBtn) startBtn.classList.remove('hidden');
      if (languageSelect) languageSelect.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
  }

  export {
    getMochiQuest,
    answerMochiQuest,
    startMochiQuest
};