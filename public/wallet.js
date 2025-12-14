import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus } from "https://esm.sh/genlayer-js/types";

const WalletUI = (() => {

  let hasNick = false;
  let client = null;
  let inited = false;
  let contractStat = '0x98e2797FB846fFf75BF5790681d52C80C1259e48';
  let contractGuess = '0x3F8e20385B10B8b56802e28B81eb9C1d8A3960a0';
  let contractMatch = '0xeC4611722b3BB8A9873E062Dc4c908b3Ea813Bd3';
  let contractQuiz = '0xA23B1b240903d7a9b85b7878139f936DDA6Bd820';
  let contractPunch = '0x51eD95A3c625A8eAE5e7ED87Cc586ec54220c718';

  window.quizPollInterval = null;

  const FLAG_KEY = 'answeredFlags';
  const QUIZ_ANSWERS_KEY_PREFIX = 'quiz_answers_';

  function getQuizAnswersKey(gameId) {
    return QUIZ_ANSWERS_KEY_PREFIX + String(gameId);
  }

  function loadQuizAnswers(gameId) {
    const key = getQuizAnswersKey(gameId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveQuizAnswers(gameId, arr) {
    const key = getQuizAnswersKey(gameId);
    localStorage.setItem(key, JSON.stringify(arr));
  }

  function appendQuizAnswer(gameId, questionId, sealed) {
    if (typeof sealed !== 'string' || !sealed) return;
    const list = loadQuizAnswers(gameId);
  
    const already = list.some(item => String(item.question_id) === String(questionId));
    if (already) return;
  
    list.push({ question_id: questionId, sealed });
    saveQuizAnswers(gameId, list);
  }

  function maskAddress(a){ if(!a) return ''; return a.slice(0,5)+'…'+a.slice(-4); }

  function getChangedIds() {
    try { 
      return new Set(JSON.parse(localStorage.getItem(FLAG_KEY) || '[]')); 
    } catch { return new Set(); }
  }
    
  function saveChangedIds(set) {
    localStorage.setItem(FLAG_KEY, JSON.stringify([...set]));
  }

  function markChanged(id) {
    const s = getChangedIds(); 
    s.add(String(id) + String(localStorage.getItem('connectedAddress'))); 
    saveChangedIds(s);
  }

  function clearChanged(id) {
    const s = getChangedIds(); 
    s.delete(String(id) + String(localStorage.getItem('connectedAddress'))); 
    saveChangedIds(s);
  }

  function isChanged(id) {
    return getChangedIds().has(String(id) + String(localStorage.getItem('connectedAddress')));
  }

  async function getStat() {
    if (!client) return;
    try {
      const points = await client.readContract({
        address: contractStat,
        functionName: 'get_my_points',
        args: [],
      });
      let res = JSON.parse(points);
      let address = res.wallet;
      let nick = res.nick;
      const addr = document.getElementById('addr');
      const area = document.getElementById('nick');
      if (nick.trim().length > 0 && nick.trim() != "Nick not set") {
        hasNick = true;
        if (addr) addr.textContent = nick + " (points: " + res.points + ")";
        if (area) {
          area.value = nick;
        }
      } else {
        hasNick = false;
        if (addr) addr.textContent = maskAddress(address) + " (points: " + res.points + ")";
        if (area) {
          area.value = "";
        }
      }
      console.error('Success getting stat:', res.points);
    } catch (error) {
      console.error('Error getting stat:', error);
    }
  }

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
        ['overall', 'guess', 'match', 'quiz', 'punch'].forEach(key => {
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

  async function getGameQuiz(gameId, { silent = false } = {}) {
    if (!client) return;
  
    if (!silent) {
      renderQuiz(0, null);
    }
  
    try {
      const game = await client.readContract({
        address: contractQuiz,
        functionName: 'get_game',
        args: [gameId],
      });
      let res = JSON.parse(game);
      if (res.error) {
        if (!silent) {
          renderQuiz(2, null);
        }
      } else {
        renderQuiz(1, res);
      }
      console.info('Success getting quiz:', res);
    } catch (error) {
      if (!silent) {
        renderQuiz(2, null);
      }
      console.error('Error getting quiz:', error);
    }
  }

  async function getMyQuiz() {
    if (!client) return;
    const submitOpenBtn = document.getElementById('openBtn');
    const submitCloseBtn = document.getElementById('closeBtn');
    const progress = document.getElementById('saveProgress');
    if (submitOpenBtn) submitOpenBtn.classList.add('hidden');
    if (submitCloseBtn) submitCloseBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const game = await client.readContract({
        address: contractQuiz,
        functionName: 'get_my_game',
        args: [],
      });
      let res = JSON.parse(game);
      if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
      if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      if (res.error) {
        renderQuizAdmin(null);
      } else {
        renderQuizAdmin(res);
      }
      console.error('Success getting my quiz:', res);
    } catch (error) {
      if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
      if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      console.error('Error getting my quiz:', error);
    }
  }

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

  async function checkPage() {
    const pageName = document.body.dataset.pageName;
    switch (pageName) {
      case 'leaderboard':
        initLeaderboardTabs();
        break;
      case 'guess':
        getGame(document.body.dataset.gameId);
        break;
      case 'match':
        getGameMatch(document.body.dataset.gameId);
        break;
      case 'quiz':
        getGameQuiz(document.body.dataset.gameId);
      case 'punch':
        getGamePunch(document.body.dataset.gameId);
        break;
      case 'start_quiz':
        getMyQuiz();
        break;
      case 'start_punch':
        getMyPunch();
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

  async function answerQuiz() {
    if (!client) return;

    const gameId = document.body.dataset.gameId;
    if (!gameId) {
      console.error('No game id for quiz scoring');
      return;
    }

    const sealedList = loadQuizAnswers(gameId) || [];
    const sealedOnly = sealedList
      .map(x => x && x.sealed)
      .filter(x => typeof x === 'string' && x.length > 0);

    if (sealedOnly.length === 0) {
      alert('No answers to score.');
      return;
    }

    const scoreBtn = document.querySelector('#stateContainer button.btn');
    if (scoreBtn) {
      scoreBtn.disabled = true;
    }
    try {
      const txHash = await client.writeContract({
        address: contractQuiz,
        functionName: "score_answers",
        args: [document.body.dataset.gameId, sealedOnly],
      });
      console.error('Success tx answer quiz:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting answer quiz:', receipt);
      getStat();
      getGameQuiz(document.body.dataset.gameId, { silent: true });
    } catch (error) {
      console.error('Error setting answer quiz:', error);
      if (scoreBtn) scoreBtn.disabled = false;
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

  async function gameQuiz(gameTitle, gameLang, gameQty, gameUrl, gameWrong) {
    if (!client) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const submitOpenBtn = document.getElementById('openBtn');
    const submitCloseBtn = document.getElementById('closeBtn');
    const progress = document.getElementById('saveProgress');
    if (submitOpenBtn) submitOpenBtn.classList.add('hidden');
    if (submitCloseBtn) submitCloseBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      const txHash = await client.writeContract({
        address: contractQuiz,
        functionName: "create_game",
        args: [id, gameTitle, gameUrl, gameQty, gameWrong, gameLang],
      });
      console.error('Success tx quiz:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting quiz:', receipt);
      if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
      if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
      getMyQuiz();
    } catch (error) {
      console.error('Error setting quiz:', error);
      if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
      if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
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

  async function gameGuess(id, picture) {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const submitBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
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

  async function delQuestion(id) {
    try {
      const txHash = await client.writeContract({
        address: contractQuiz,
        functionName: "delete_game_questions",
        args: [[id]],
      });
      console.error('Success tx q del:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success q del:', receipt);
      getMyQuiz();
    } catch (error) {
      console.error('Error q del:', error);
    }
  }

  async function editQuestion(id, val) {
    try {
      const txHash = await client.writeContract({
        address: contractQuiz,
        functionName: "edit_game_questions",
        args: [id, val],
      });
      console.error('Success tx q edit:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success q edit:', receipt);
      getMyQuiz();
    } catch (error) {
      console.error('Error q edit:', error);
    }
  }

  async function startQuiz(min) {
    try {
      const txHash = await client.writeContract({
        address: contractQuiz,
        functionName: "start_game",
        args: [Number(min)],
      });
      console.error('Success tx start:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success start:', receipt);
      getMyQuiz();
    } catch (error) {
      console.error('Error start:', error);
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

  function renderQuizAdmin(quiz) {
    const title = document.getElementById('game_title');
    const submitOpenBtn = document.getElementById('openBtn');
    const submitCloseBtn = document.getElementById('closeBtn');
    const gameLinkP = document.getElementById('game_link_p');
    const gameLink = document.getElementById('game_link');
    if (gameLinkP) gameLinkP.classList.add('hidden');
    if (title) title.value = "";
    if (submitOpenBtn) submitOpenBtn.disabled = false;
    if (submitCloseBtn) submitCloseBtn.disabled = false;
    if (quiz) {
      if (quiz.game_finished && quiz.game_finished === "False") {
        if (title && quiz.game_title) title.value = quiz.game_title;
        if (submitOpenBtn) submitOpenBtn.disabled = quiz.game_started && quiz.game_started === "True";
        if (submitCloseBtn) submitCloseBtn.disabled = quiz.game_started && quiz.game_started === "True";
        if (quiz.game_started && quiz.game_started === "True") {
          if (gameLinkP) gameLinkP.classList.remove('hidden');
          if (gameLink) gameLink.href = "/quiz/" + quiz.game_id
        }
      }
    }
    const root = document.getElementById('answers');
    if (!root) return;
    if (!quiz || !Array.isArray(quiz.game_questions) || quiz.game_questions.length === 0) {
      root.textContent = '';
      return;
    }
    if (quiz.game_finished && quiz.game_finished === "True") {
      root.textContent = '';
      return;
    }

    const questions = quiz.game_questions;
    root.textContent = '';

    const list = document.createElement('ol');
    list.style.paddingLeft = '1.25rem';
    list.style.margin = '1rem 0';
    list.style.display = 'grid';
    list.style.rowGap = '0.75rem';

    questions.forEach((q, index) => {
      const li = document.createElement('li');
      li.style.listStyle = 'decimal';
      li.style.padding = '0.75rem 0';
      li.style.borderBottom = '1px solid #e5e7eb';

      const topRow = document.createElement('div');
      topRow.style.display = 'grid';
      topRow.style.gridTemplateColumns = '1fr auto';
      topRow.style.columnGap = '0.75rem';
      topRow.style.alignItems = 'center';

      const questionText = document.createElement('div');
      questionText.textContent = q.question || `Question #${index + 1}`;
      questionText.style.fontWeight = '600';
      questionText.style.fontSize = '14px';

      const btns = document.createElement('div');
      btns.style.display = 'flex';
      btns.style.gap = '0.5rem';

      const deleteBtn = document.createElement('button');
      const toggleBtn = document.createElement('button');

      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'btn';
      deleteBtn.style.fontSize = '12px';

      deleteBtn.addEventListener('click', () => {
        console.log('Delete question', q.id);
        deleteBtn.disabled = true;
        toggleBtn.disabled = true;
        delQuestion(q.id);
      });

      toggleBtn.type = 'button';
      toggleBtn.className = 'btn';
      toggleBtn.style.fontSize = '12px';

      const isClosed = String(q.closed) === 'True';
      const answersArr = Array.isArray(q.answers) ? q.answers : [];

      if (isClosed) {
        toggleBtn.textContent = 'Make open-ended';
        toggleBtn.addEventListener('click', () => {
          console.log('Make question open', q.id);
          deleteBtn.disabled = true;
          toggleBtn.disabled = true;
          editQuestion(q.id, true);
        });
      } else {
        if (answersArr.length > 1) {
          toggleBtn.textContent = 'Make closed';
          toggleBtn.addEventListener('click', () => {
            console.log('Make question closed', q.id);
            deleteBtn.disabled = true;
            toggleBtn.disabled = true;
            editQuestion(q.id, false);
          });
        } else {
          toggleBtn.textContent = 'Can\'t close (1 answer)';
          toggleBtn.disabled = true;
          toggleBtn.style.opacity = '0.6';
          toggleBtn.style.cursor = 'default';
        }
      }

      btns.appendChild(deleteBtn);
      btns.appendChild(toggleBtn);

      topRow.appendChild(questionText);
      topRow.appendChild(btns);
      li.appendChild(topRow);

      const answersBlock = document.createElement('ul');
      answersBlock.style.margin = '0.5rem 0 0';
      answersBlock.style.paddingLeft = '1rem';

      if (!isClosed) {
        if (answersArr.length > 0) {
          const example = answersArr[0];
          const aLi = document.createElement('li');
          aLi.textContent = example.answer || '';
          aLi.style.fontSize = '13px';
          aLi.style.color = '#4b5563';
          answersBlock.appendChild(aLi);
        } else {
          const aLi = document.createElement('li');
          aLi.textContent = 'No answer';
          aLi.style.fontSize = '13px';
          aLi.style.color = '#9ca3af';
          answersBlock.appendChild(aLi);
        }
      } else {
        const correctId = String(q.correct ?? '');
        if (answersArr.length === 0) {
          const aLi = document.createElement('li');
          aLi.textContent = 'No answers';
          aLi.style.fontSize = '13px';
          aLi.style.color = '#9ca3af';
          answersBlock.appendChild(aLi);
        } else {
          answersArr.forEach(ans => {
            const aLi = document.createElement('li');
            aLi.textContent = ans.answer || '';
            aLi.style.fontSize = '13px';

            const isCorrect = String(ans.id) === correctId;
            if (isCorrect) {
              aLi.style.color = '#111827';
              aLi.style.fontWeight = '500';
            } else {
              aLi.style.color = '#dc2626';
            }

            answersBlock.appendChild(aLi);
          });
        }
      }

      li.appendChild(answersBlock);
      list.appendChild(li);
    });

    root.appendChild(list);

    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '0.5rem';
    controlsRow.style.marginTop = '1rem';
    controlsRow.style.alignItems = 'center';

    const minutesInput = document.createElement('input');
    minutesInput.type = 'number';
    minutesInput.min = '1';
    minutesInput.max = '10';
    minutesInput.value = '1';
    minutesInput.placeholder = 'Min. to start';
    minutesInput.style.width = '120px';
    minutesInput.style.padding = '8px';
    minutesInput.style.border = '1px solid #e5e7eb';
    minutesInput.style.borderRadius = '6px';
    minutesInput.id = 'quizStartMinutes';
    minutesInput.disabled = quiz.game_started && quiz.game_started === "True";

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.textContent = 'Start quiz';
    startBtn.className = 'btn';
    startBtn.style.padding = '8px 12px';
    startBtn.disabled = quiz.game_started && quiz.game_started === "True";

    controlsRow.appendChild(minutesInput);
    controlsRow.appendChild(startBtn);
    root.appendChild(controlsRow);

    startBtn.addEventListener('click', async () => {
      const mins = Number(minutesInput.value);
      if (!Number.isFinite(mins) || mins < 0) {
        alert('Please enter valid minutes (1 or greater).');
        return;
      }
      startBtn.disabled = true;
      minutesInput.disabled = true;
      startQuiz(minutesInput.value);
    });
  }

  function renderQuiz(state, game) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    const stateContainer = document.getElementById('stateContainer');
    const resultContainer = document.getElementById('resultContainer');
  
    const prevGameState = stateContainer ? stateContainer.dataset.mode : '';
  
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
  
        if (!game) {
          dataContainer.classList.add('hidden');
          emptyContainer.classList.remove('hidden');
          return;
        }
  
        const titleEl = document.getElementById('quiz_title');
        if (titleEl && game.game_title) {
          titleEl.textContent = "AiQuiz: " + game.game_title;
        } else if (titleEl) {
          titleEl.textContent = "AiQuiz";
        }
  
        const isFinished = game.game_finished === "True";
        const gs = game.game_state || {};
        const st = gs.state;
  
        const isActiveState = !isFinished && (st === 'waiting' || st === 'quiz');
  
        if (isActiveState) {
          if (!window.quizPollInterval) {
            const gameId = document.body.dataset.gameId;
            window.quizPollInterval = setInterval(() => {
              getGameQuiz(gameId, { silent: true });
            }, 1000);
          }
        } else {
          if (window.quizPollInterval) {
            clearInterval(window.quizPollInterval);
            window.quizPollInterval = null;
          }
        }
  
        if (isFinished) {
          resultContainer.classList.remove('hidden');
          stateContainer.classList.add('hidden');
          resultContainer.textContent = '';
          renderQuizPlayers(game.game_players || []);
          renderQuizQuestionsWithAnswers(game);
          stateContainer.dataset.mode = 'finished';
        } else {
          resultContainer.classList.add('hidden');
          stateContainer.classList.remove('hidden');
          if (stateContainer.dataset.mode !== st) {
            stateContainer.textContent = '';
            stateContainer.dataset.questionId = '';
          }
          stateContainer.dataset.mode = st || '';
  
          if (st === 'waiting') {
            renderQuizWaitingState(game);
          } else if (st === 'scoring') {
            renderQuizScoringState(game);
          } else if (st === 'quiz') {
            renderQuizQuestionState(game);
          } else {
            if (!prevGameState || prevGameState !== st) {
              const p = document.createElement('p');
              p.textContent = 'Waiting for game state...';
              stateContainer.appendChild(p);
            }
          }
        }
        break;
      case 2:
        loadingIndicator.classList.add('hidden');
        dataContainer.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        if (window.quizPollInterval) {
          clearInterval(window.quizPollInterval);
          window.quizPollInterval = null;
        }
        if (window.quizScoringInterval) {
          clearInterval(window.quizScoringInterval);
          window.quizScoringInterval = null;
        }
        break;
    }
  }

  function renderGamePunch(state, game) {
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
        const padTheme = document.getElementById('game_theme');
        const timer = document.getElementById('timer');
        const players = document.getElementById('players');
        const answers = document.getElementById('answers');
        const task = document.getElementById('task');

        padTheme.textContent = game.game_question;
        padTheme.classList.remove('hidden');

        const myAddr = (getAddress() || '').toLowerCase().trim();
        const creator = (game.game_creator || '').toLowerCase().trim();
        const playersArr = Array.isArray(game.game_players) ? game.game_players : [];

        const alreadyPlayed = playersArr.some(p => {
          return (p.address || '').toLowerCase().trim() === myAddr;
        });
   
        if (game.game_time_left) {
          players.classList.add('hidden');
          if (alreadyPlayed || myAddr === creator) {
            answers.style.display = 'none';
            task.classList.remove('hidden');
            if (alreadyPlayed) {
              task.textContent = "You have already made a joke";
            } else {
              task.textContent = "You are the creator of the game and cannot punch line, but you'll get points from players' jokes";
            }
            task.style.padding = '16px 0';
          } else {
            answers.style.display = 'block';
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
          secs = Math.round(Number(game.game_time_left));
          timer.style.color = '#6b7280';
          timer.textContent = 'Game finish in ' + fmt(secs);
          window.dftWidgetTimer = setInterval(()=>{ 
            secs-=1; 
            if (secs<=0){ 
              clearInterval(window.dftWidgetTimer); 
              window.dftWidgetTimer = null; 
              timer.textContent='Finished';
              getGamePunch(game.game_id);
            } else { 
              timer.textContent = 'Game finish in ' + fmt(secs);
            } 
          }, 1000); 
        } else {
          players.classList.remove('hidden');
          answers.style.display = 'none';
          timer.classList.add('hidden');
          task.classList.add('hidden');
          showPlayers(game.game_players, 4)
        }
        break;
      case 2:
        loadingIndicator.classList.add('hidden');
        dataContainer.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        break;
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
            console.log('Match game active ' + game.answered);
            if (game.answered == "True") {
              pad.classList.add('hidden');
              console.log('Match game active hidden pad');
            } else {
              pad.classList.remove('hidden');
              window.resizeCanvas();
              window.recreatePad();
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
            task.style.padding = '16px 0';
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
          timer.style.color = '#6b7280';
          timer.textContent = 'Game finish in ' + fmt(secs);
          window.dftWidgetTimer = setInterval(()=>{ 
            secs-=1; 
            if (secs<=0){ 
              clearInterval(window.dftWidgetTimer); 
              window.dftWidgetTimer = null; 
              timer.textContent='Finished';
              if (game.type == 1) {
                getGame(game.id);
              } else if (game.type == 2) {
                getGameMatch(game.id);
              }
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

  function updateQuizQuestionTimer(qState) {
    const timer = document.getElementById('quizQuestionTimer');
    if (!timer) return;
  
    let label = 'Question is finishing...';
    const finishTs = Number(qState.finish_time);
    if (Number.isFinite(finishTs) && finishTs > 0) {
      const nowSec = Date.now() / 1000;
      const secs = Math.round(finishTs - nowSec);
      if (secs > 0) {
        label = 'Time left: ' + fmt(secs);
      }
    }
    timer.textContent = label;
  }

  function renderQuizQuestionState(game) {
    const stateContainer = document.getElementById('stateContainer');
    if (!stateContainer) return;
  
    const qState = game.game_state || {};
    const q = qState.question;
    if (!q) {
      stateContainer.textContent = '';
      const p = document.createElement('p');
      p.textContent = 'No active question.';
      stateContainer.appendChild(p);
      stateContainer.dataset.questionId = '';
      return;
    }
  
    const currentId = String(q.id ?? '');
    const prevId = stateContainer.dataset.questionId || '';
  
    if (prevId === currentId) {
      updateQuizQuestionTimer(qState);
      return;
    }

    stateContainer.textContent = '';
    stateContainer.dataset.questionId = currentId;
  
    const timer = document.createElement('div');
    timer.id = 'quizQuestionTimer';
    timer.style.marginBottom = '0.75rem';
    timer.style.fontWeight = '500';
    timer.style.color = '#6b7280';
    stateContainer.appendChild(timer);
    updateQuizQuestionTimer(qState);
  
    const questionTitle = document.createElement('h2');
    questionTitle.textContent = q.question || 'Question';
    questionTitle.style.margin = '0 0 .75rem';
    stateContainer.appendChild(questionTitle);
  
    const isClosed = String(q.closed) === 'True';
    const answersArr = Array.isArray(q.answers) ? q.answers : [];
  
    if (isClosed) {
      const btnsWrap = document.createElement('div');
      btnsWrap.style.display = 'flex';
      btnsWrap.style.flexDirection = 'column';
      btnsWrap.style.gap = '0.5rem';
  
      answersArr.forEach(ans => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.textContent = ans.answer || '';
        btn.style.textAlign = 'left';
        btnsWrap.appendChild(btn);
        btn.addEventListener('click', async () => {
          try {
            if (!window.WalletUI || !WalletUI.isConnected()) {
              throw new Error('Please connect your wallet first');
            }
            btn.classList.add('btn-selected');
            WalletUI.sendQuizAnswer({
              questionId: q.id,
              answerId: ans.id,
              answerText: ans.answer || '',
            });
          } catch (e) {
            alert(e.message || String(e));
          }
        });
      });
  
      stateContainer.appendChild(btnsWrap);
    } else {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '0.5rem';
  
      const textarea = document.createElement('textarea');
      textarea.rows = 4;
      textarea.style.width = '100%';
      textarea.style.padding = '.6rem';
      textarea.style.fontFamily = 'inherit';
      textarea.style.fontSize = '14px';
      textarea.style.border = '1px solid #ddd';
      textarea.style.borderRadius = '8px';
      textarea.placeholder = 'Type your answer...';
      wrap.appendChild(textarea);
  
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '.5rem';
  
      const submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.className = 'btn';
      submitBtn.textContent = 'Submit answer';
  
      row.appendChild(submitBtn);
      wrap.appendChild(row);
      stateContainer.appendChild(wrap);
  
      submitBtn.addEventListener('click', async () => {
        const val = textarea.value.trim();
        if (!val) {
          alert('Please enter an answer');
          return;
        }
        try {
          if (!window.WalletUI || !WalletUI.isConnected()) {
            throw new Error('Please connect your wallet first');
          }
          submitBtn.classList.add('btn-selected');
          WalletUI.sendQuizAnswer({
            questionId: q.id,
            answerId: "1",
            answerText: val,
          });
        } catch (e) {
          alert(e.message || String(e));
        }
      });
    }
  }

  function renderQuizScoringState(game) {
    const stateContainer = document.getElementById('stateContainer');
    if (!stateContainer) return;
    stateContainer.textContent = '';

    const myAddr = (WalletUI.getAddress() || '').toLowerCase().trim();
    const players = Array.isArray(game.game_players) ? game.game_players : [];
    const me = players.find(p => (p.address || '').toLowerCase().trim() === myAddr);
    const creator = (game.game_creator || '').toLowerCase().trim();

    if (myAddr && creator && myAddr === creator) {
      const msg = document.createElement('p');
      msg.textContent = 'Quiz creator cannot be scored.';
      msg.style.fontWeight = '600';
      stateContainer.appendChild(msg);
    }

    if (me) {
      const msg = document.createElement('p');
      let meScore = Number(me.score);
      if (meScore == 0) {
        msg.textContent = 'Oops, you have ' + String(me.score) + ' points';
      } else {
        msg.textContent = 'Congratulations, you have ' + String(me.score) + ' points';
      }
      msg.style.fontWeight = '600';
      stateContainer.appendChild(msg);
    }
  
    const qState = game.game_state || {};
  
    const timer = document.createElement('div');
    timer.id = 'quizScoringTimer';
    timer.style.marginBottom = '0.75rem';
    timer.style.fontWeight = '500';
    timer.style.color = '#6b7280';
    stateContainer.appendChild(timer);
  
    const finishTs = Number(qState.finish_time);
    let secs = 0;
    if (Number.isFinite(finishTs) && finishTs > 0) {
      const nowSec = Date.now() / 1000;
      secs = Math.round(finishTs - nowSec);
    }
  
    function updateLabel() {
      if (secs > 0) {
        timer.textContent = 'Scoring ends in: ' + fmt(secs);
      } else {
        timer.textContent = 'Scoring is finishing...';
      }
    }
  
    updateLabel();
  
    if (window.quizScoringInterval) {
      clearInterval(window.quizScoringInterval);
      window.quizScoringInterval = null;
    }
    if (secs > 0) {
      const gameId = document.body.dataset.gameId;
      window.quizScoringInterval = setInterval(() => {
        secs -= 1;
        if (secs <= 0) {
          clearInterval(window.quizScoringInterval);
          window.quizScoringInterval = null;
          updateLabel();
          if (gameId) {
            getGameQuiz(gameId, { silent: true });
          }
        } else {
          updateLabel();
        }
      }, 1000);
    }

    if (me || myAddr && creator && myAddr === creator) {
      return;
    }
  
    const text = document.createElement('p');
    text.textContent = 'Please sign your answers so they can be scored.';
    stateContainer.appendChild(text);
  
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Score';
    btn.className = 'btn';
    btn.style.marginTop = '0.75rem';
    stateContainer.appendChild(btn);
  
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await answerQuiz();
    });
  }

  function renderQuizWaitingState(game) {
    const stateContainer = document.getElementById('stateContainer');
    if (!stateContainer) return;
    stateContainer.textContent = '';
  
    const timer = document.createElement('div');
    timer.id = 'quizTimer';
    timer.style.marginTop = '1.5rem';
    timer.style.fontWeight = '500';
    timer.style.color = '#6b7280';
    stateContainer.appendChild(timer);
  
    const startTs = Number(game.game_time);
    if (!Number.isFinite(startTs) || startTs <= 0) {
      timer.textContent = 'Waiting for quiz start...';
      return;
    }
  
    const nowSec = Date.now() / 1000;
    const secs = Math.round(startTs - nowSec);
  
    if (secs <= 0) {
      timer.textContent = 'Starting...';
    } else {
      timer.textContent = 'Quiz starts in ' + fmt(secs);
    }
  }

  function renderQuizQuestionsWithAnswers(game) {
    const root = document.getElementById('resultContainer');
    if (!root) return;
  
    const questions = game.game_questions || [];
    if (!Array.isArray(questions) || questions.length === 0) return;
  
    const myAddr = (WalletUI.getAddress() || '').toLowerCase().trim();
    const players = Array.isArray(game.game_players) ? game.game_players : [];
    const me = players.find(p => (p.address || '').toLowerCase().trim() === myAddr);
  
    const myAnswers = me ? parsePlayerQuizAnswers(me.answers || '') : [];
  
    const block = document.createElement('div');
    block.id = 'quizQuestionsBlock';
    block.style.marginTop = '1.5rem';
  
    const title = document.createElement('h2');
    title.textContent = 'Questions and answers';
    title.style.margin = '0 0 .75rem';
    block.appendChild(title);
  
    const list = document.createElement('ol');
    list.style.paddingLeft = '1.25rem';
    list.style.margin = '1rem 0';
    list.style.display = 'grid';
    list.style.rowGap = '0.75rem';
  
    questions.forEach((q, index) => {
      const li = document.createElement('li');
      li.style.listStyle = 'decimal';
      li.style.padding = '0.75rem 0';
      li.style.borderBottom = '1px solid #e5e7eb';
  
      const questionText = document.createElement('div');
      questionText.textContent = q.question || `Question #${index + 1}`;
      questionText.style.fontWeight = '600';
      questionText.style.fontSize = '14px';
      li.appendChild(questionText);
  
      const answersBlock = document.createElement('ul');
      answersBlock.style.margin = '0.5rem 0 0';
      answersBlock.style.paddingLeft = '1rem';
  
      const isClosed = String(q.closed) === 'True';
      const answersArr = Array.isArray(q.answers) ? q.answers : [];
  
      if (isClosed) {
        const correctId = String(q.correct ?? '');
        if (answersArr.length === 0) {
          const aLi = document.createElement('li');
          aLi.textContent = 'No answers';
          aLi.style.fontSize = '13px';
          aLi.style.color = '#9ca3af';
          answersBlock.appendChild(aLi);
        } else {
          answersArr.forEach(ans => {
            const aLi = document.createElement('li');
            aLi.textContent = ans.answer || '';
            aLi.style.fontSize = '13px';
            const isCorrect = String(ans.id) === correctId;
            if (isCorrect) {
              aLi.style.color = '#16a34a';
              aLi.style.fontWeight = '600';
            } else {
              aLi.style.color = '#9ca3af';
            }
            answersBlock.appendChild(aLi);
          });
        }
      } else {
        const example = answersArr[0];
        const aLi = document.createElement('li');
        aLi.textContent = example && example.answer ? example.answer : 'Open question (manual scoring)';
        aLi.style.fontSize = '13px';
        aLi.style.color = '#4b5563';
        answersBlock.appendChild(aLi);
      }
  
      li.appendChild(answersBlock);
  
      if (myAnswers.length > 0) {
        const myAnsForQuestion = myAnswers.find(a => String(a.question_id) === String(q.id));
  
        const myBlock = document.createElement('div');
        myBlock.style.marginTop = '0.5rem';
        myBlock.style.fontSize = '13px';
  
        const label = document.createElement('div');
        label.textContent = 'Your answer:';
        label.style.fontWeight = '500';
        label.style.color = '#4b5563';
        myBlock.appendChild(label);
  
        const value = document.createElement('div');
        if (!myAnsForQuestion) {
          value.textContent = 'You did not answer this question';
          value.style.color = '#9ca3af';
        } else {
          const text = String(myAnsForQuestion.answer || '').trim();
          value.textContent = text || '[empty]';
          value.style.color = '#111827';
        }
  
        myBlock.appendChild(value);
        li.appendChild(myBlock);
      }
  
      list.appendChild(li);
    });
  
    block.appendChild(list);
    root.appendChild(block);
  }

  function parsePlayerQuizAnswers(raw) {
    if (!raw) return [];
    let arr;
    try {
      const normalized = raw
        .replace(/'/g, '"')   
        .replace(/\\"/g, '"') 
        .replace(/"{/g, '{')     
        .replace(/}"/g, '}'); 
  
      arr = JSON.parse(normalized);
    } catch (e) {
      console.error('parsePlayerQuizAnswers: cannot parse outer level', raw, e);
      return [];
    }
  
    if (!Array.isArray(arr)) {
      console.warn('parsePlayerQuizAnswers: not an array', arr);
      return [];
    }
  
    return arr.map((item, idx) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item);
        } catch (e) {
          console.error('parsePlayerQuizAnswers: inner JSON error', idx, item, e);
          return null;
        }
      }
      if (typeof item === 'object' && item !== null) {
        return item;
      }
      return null;
    }).filter(Boolean);
  }

  function renderQuizPlayers(players) {
    const root = document.getElementById('resultContainer');
    if (!root) return;
  
    root.textContent = '';
    const playersBlock = document.createElement('div');
    playersBlock.id = 'quizPlayersBlock';
  
    const title = document.createElement('h2');
    title.textContent = 'Players';
    title.style.margin = '1rem 0 .5rem';
    playersBlock.appendChild(title);
  
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
    playersBlock.appendChild(header);
  
    const sorted = [...(players || [])].sort((a, b) => {
      const pointsA = Number(a.score) || 0;
      const pointsB = Number(b.score) || 0;
      return pointsB - pointsA;
    });
  
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
  
      const pointsEl = document.createElement('div');
      pointsEl.textContent = String(item.score ?? 0);
      pointsEl.style.textAlign = 'right';
      pointsEl.style.fontWeight = '600';
  
      row.appendChild(left);
      row.appendChild(pointsEl);
      playersBlock.appendChild(row);
    });
  
    root.appendChild(playersBlock);
  }

  function fmt(t){ 
    const m = Math.floor((t%3600)/60); 
    const s = Math.floor(t%60); 
    const h = Math.floor(t/3600); 
    return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); 
  }

  function showPlayers(items, type) {
    const root = document.getElementById('players');
    if (!root) return;
    root.textContent = '';

    if ((type === 4 || type === 1) && items.length > 0) {
      const totalScore = items.reduce((acc, p) => acc + (Number(p.score) || 0), 0);
      const creatorScore = Math.floor(totalScore * 0.1); 
  
      const creatorWrap = document.createElement('div');
      creatorWrap.style.display = 'flex';
      creatorWrap.style.justifyContent = 'space-between';
      creatorWrap.style.alignItems = 'center';
      creatorWrap.style.padding = '.5rem .45rem';
      creatorWrap.style.marginBottom = '.5rem';
      creatorWrap.style.borderRadius = '.5rem';
      creatorWrap.style.background = '#f3f4f6'; 
      creatorWrap.style.border = '1px solid #e5e7eb';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';
      left.style.gap = '2px';

      const labelEl = document.createElement('div');
      labelEl.textContent = 'Game creator points';
      labelEl.style.fontSize = '12px';
      labelEl.style.fontWeight = '600';
      labelEl.style.color = '#4b5563';

      const helperEl = document.createElement('div');
      helperEl.textContent = '10% of players total';
      helperEl.style.fontSize = '11px';
      helperEl.style.color = '#6b7280';

      left.appendChild(labelEl);
      left.appendChild(helperEl);

      const pointsEl = document.createElement('div');
      pointsEl.textContent = String(creatorScore);
      pointsEl.style.fontWeight = '600';
      pointsEl.style.fontSize = '14px';
      pointsEl.style.color = '#111827';

      creatorWrap.appendChild(left);
      creatorWrap.appendChild(pointsEl);

      creatorWrap.style.marginTop = '.75rem';

      root.appendChild(creatorWrap);
    }

    const sorted = [...items].sort((a, b) => {
      const pointsA = Number(a.score) || 0;
      const pointsB = Number(b.score) || 0;
      return pointsB - pointsA;
    });

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
        } else if (type == 4) {
          const answerEl = document.createElement('div');
          answerEl.textContent = "Joke: " + String(item.answer);
          answerEl.style.fontSize = '13px';
          left.appendChild(answerEl);
        } else {
          const answerEl = document.createElement('img');
          answerEl.src = item.answer;
          answerEl.width = 200; 
          answerEl.height = 150;
          answerEl.style.marginTop = '.5rem';
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

  function renderLeaderboard(rootId, items) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.textContent = '';
  
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '40px 1fr auto'; // колонка для номера
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
      row.style.gridTemplateColumns = '40px 1fr auto'; // та же сетка, что и в header
      row.style.gap = '8px';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f3f4f6';
  
      const indexEl = document.createElement('div');
      indexEl.textContent = String(index + 1);
      indexEl.style.fontWeight = '600';
      indexEl.style.textAlign = 'left';
  
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
  
      row.appendChild(indexEl);
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

  async function sendQuizAnswer({ questionId, answerId, answerText }) {
    const gameId = document.body.dataset.gameId;
    if (!gameId) throw new Error('No game id');
    const payload = {
      question_id: questionId || null,
      answer_id: answerId || null,
      answer: String(answerText || '')
    };
    let res;
    try {
      res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Network error sending quiz answer:', e);
      throw new Error('Network error sending answer');
    }

    let json;
    try {
      json = await res.json();
    } catch {
      json = {};
    }

    if (!res.ok || !json.sealed) {
      console.error('Server error sending quiz answer:', json);
      throw new Error(json.error || 'Failed to send answer');
    }
    console.log('Network success quiz answer:', json);
    appendQuizAnswer(gameId, questionId, json.sealed);

    return json.sealed;
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

  function nickIsSet() { return hasNick; }
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
    joke,
    gameGuess, 
    gameMatch,
    gamePunch,
    gameQuiz,
    checkPage,
    sendQuizAnswer,
    answerQuiz,
    nickIsSet
  };
})();

if (typeof window !== 'undefined') {
  window.WalletUI = WalletUI;
  window.addEventListener('DOMContentLoaded', () => {
    try { WalletUI.init(); } catch (e) { console.error(e); }
  });
}


