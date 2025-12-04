import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus } from "https://esm.sh/genlayer-js/types";

const WalletUI = (() => {

  let client = null;
  let inited = false;
  let contractStat = '0x98e2797FB846fFf75BF5790681d52C80C1259e48';
  let contractGuess = '0x5B46523CFba1D1a45De3A7b552b6Bc1a3e4e843e';
  let contractMatch = '0xeC4611722b3BB8A9873E062Dc4c908b3Ea813Bd3';
  let contractQuiz = '0x3265496Bc6a3D2dF70f9a9E7eCf85c33ee92f74b';

  const FLAG_KEY = 'answeredFlags';

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
        if (addr) addr.textContent = nick + " (points: " + res.points + ")";
        if (area) {
          area.value = nick;
        }
      } else {
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

  async function getLeaderboard() {
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
      renderLeaderboard(sorted)
    } catch (error) {
      console.error('Error getting leaderboard:', error);
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

  async function getGameQuiz(gameId) {}

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

  async function checkPage() {
    const pageName = document.body.dataset.pageName;
    switch (pageName) {
      case 'leaderboard':
        getLeaderboard();
        break;
      case 'guess':
        getGame(document.body.dataset.gameId);
        break;
      case 'match':
        getGameMatch(document.body.dataset.gameId);
        break;
      case 'quiz':
        getGameQuiz(document.body.dataset.gameId);
        break;
      case 'start_quiz':
        getMyQuiz();
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
        args: [],
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
      if (item.game_type == "1") {
        a.href = '/guess/' + item.id;
        a.textContent = "GuessPicture (" + item.id + ")";
      } else if (item.game_type == "2") {
        a.href = '/match/' + item.id;
        a.textContent = "DrawMatch (" + item.id + ")";
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
    gameMatch,
    gameQuiz,
    checkPage
  };
})();

if (typeof window !== 'undefined') {
  window.WalletUI = WalletUI;
  window.addEventListener('DOMContentLoaded', () => {
    try { WalletUI.init(); } catch (e) { console.error(e); }
  });
}


