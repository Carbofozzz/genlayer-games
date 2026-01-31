import { maskAddress, fmt, getAddress } from './core.js';
import { getGame } from './game-guess.js';
import { getGameMatch } from './game-match.js';
import { getGamePunch } from './game-punch.js';
import { getGameCook } from './game-cook.js';

function renderQuestIntro(error) {
  const introBlock = document.getElementById('intro');
  const gameBlock = document.getElementById('game');
  const select = document.getElementById('languageSelect');
  const startBtn = document.getElementById('startBtn');
  const mochiBtn = document.getElementById('mochiBtn');
  if (introBlock) introBlock.classList.remove('hidden');
  if (gameBlock) gameBlock.classList.add('hidden');
  if (error === "This address has not minted Mochi yet" || error === "Your Mochi hasn't been activated yet") {
    if (select) select.classList.add('hidden');
    if (startBtn) startBtn.classList.add('hidden');
    if (mochiBtn) mochiBtn.classList.remove('hidden');
  } else {
    if (select) select.classList.remove('hidden');
    if (startBtn) startBtn.classList.remove('hidden');
    if (mochiBtn) mochiBtn.classList.add('hidden');
  }
}

function renderQuest(quest) {
  const introBlock = document.getElementById('intro');
  const gameBlock = document.getElementById('game');
  const clearBtn = document.getElementById('clearBtn');
  const saveBtn = document.getElementById('saveBtn');
  const progress = document.getElementById('saveProgress');
  const narration = document.getElementById('narration');
  const task = document.getElementById('task');
  const comment = document.getElementById('comment');
  const area = document.getElementById('theme');
  if (introBlock) introBlock.classList.add('hidden');
  if (progress) progress.classList.add('hidden');
  if (gameBlock) gameBlock.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
  if (saveBtn) saveBtn.classList.remove('hidden');
  if (narration) narration.textContent = quest.last_narration
  if (task) task.textContent = quest.last_task_summary
  if (comment) comment.textContent = quest.last_comment
  if (area) area.value=''; 
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

function renderGameCook(state, game) {
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

        padTheme.textContent = "You have " + game.game_ingredients.join(", ") + ". What will you cook?";
        padTheme.classList.remove('hidden');

        const myAddr = (getAddress() || '').toLowerCase().trim();
        const playersArr = Array.isArray(game.game_players) ? game.game_players : [];

        const alreadyPlayed = playersArr.some(p => {
          return (p.address || '').toLowerCase().trim() === myAddr;
        });
   
        if (game.game_time_left) {
          players.classList.add('hidden');
          if (alreadyPlayed) {
            answers.style.display = 'none';
            task.classList.remove('hidden');
            task.textContent = "You have already sent a recipe";
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
              getGameCook(game.game_id);
            } else { 
              timer.textContent = 'Game finish in ' + fmt(secs);
            } 
          }, 1000); 
        } else {
          players.classList.remove('hidden');
          answers.style.display = 'none';
          timer.classList.add('hidden');
          task.classList.add('hidden');
          showPlayers(game.game_players, 7)
        }
        break;
      case 2:
        loadingIndicator.classList.add('hidden');
        dataContainer.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        break;
    }
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
        } else if (type == 7) {
          const answerEl = document.createElement('div');
          answerEl.textContent = "Recipe: " + String(item.answer);
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

export {
  renderGame,
  renderGamePunch,
  renderGameCook,
  showPlayers,
  renderQuestIntro,
  renderQuest
};