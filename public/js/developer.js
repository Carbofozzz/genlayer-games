import {
    client,
    TransactionStatus,
    contractDeveloper,
    evmContractDeveloper,
    developerAbi,
    checkGenlayer,
    ethers,
    checkBaseSepolia,
    fmt
} from './core.js';

const DEVELOPER_ANSWERS_KEY = 'developer_answers';

async function checkNft({ silent = false } = {}) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    const mintBtn = document.getElementById('mintBtn');
    const mintState = document.getElementById('mintState');
    const mintStat = document.getElementById('mintStat');
    const mintProgress = document.getElementById('mintProgress');

    if (!silent) {
        if (dataContainer) dataContainer.classList.add('hidden');
        if (emptyContainer) emptyContainer.classList.add('hidden');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    }
    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        const nftContract = new ethers.Contract(evmContractDeveloper, developerAbi, signer);
        const min = await nftContract.tokenCounter();
        const max = await nftContract.maxSupply();
        console.log("current supply:", min.toString());
        console.log("max supply:", max.toString());
        const balance = await nftContract.balanceOf(userAddress);
        console.log("balance nft:", balance.toString());
        const whitelisted = await nftContract.checkWhitelisted(userAddress);
        console.log("whitelisted nft:", whitelisted.toString());
        if (mintStat) mintStat.textContent = min.toString() + ' of the ' + max.toString() + ' NFTs have already been minted.';
        if (balance > 0) {
            const id = await nftContract.getId();
            console.log("id nft:", id.toString());
            const uri = await nftContract.tokenURI(id);
            const response = await (await fetch(uri)).text();
            const meta = JSON.parse(response);
            console.log(`NFT image: ${meta.image}`);
            if (mintBtn) mintBtn.disabled = true;
            const tx = 'https://sepolia.basescan.org/nft/' + evmContractDeveloper + '/' + id.toString();
            if (mintState) mintState.innerHTML = 'You have been already minted your NFT (<a href="' + tx + '" target="_blank">Check</a>)';
        } else {
            if (mintBtn) mintBtn.disabled = !whitelisted;
            if (whitelisted) {
                if (mintState) mintState.textContent = '';
            } else {
                if (mintState) mintState.textContent = 'You have not whitelisted yet';
            }
        }
        if (!silent) {
            getMyDeveloper({ silent: false });
        }
        if (mintBtn) mintBtn.classList.remove('hidden');
        if (mintState) mintState.classList.remove('hidden');
        if (mintProgress) mintProgress.classList.add('hidden');
    } catch (error) {
        console.error('Error in checkNft:', error);
        if (!silent) {
            getMyDeveloper({ silent: false });
        }
        if (mintBtn) mintBtn.classList.remove('hidden');
        if (mintState) mintState.classList.remove('hidden');
        if (mintProgress) mintProgress.classList.add('hidden');
    }
}

async function mintDeveloper() {
    const mintBtn = document.getElementById('mintBtn');
    const mintState = document.getElementById('mintState');
    const mintProgress = document.getElementById('mintProgress');
    if (mintBtn) mintBtn.classList.add('hidden');
    if (mintState) mintState.classList.add('hidden');
    if (mintProgress) mintProgress.classList.remove('hidden');
    if (mintBtn) mintBtn.disabled = true;
    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const nftContract = new ethers.Contract(evmContractDeveloper, developerAbi, signer);
        const mintPrice = await nftContract.mintPrice();
        console.log("mint() price:", mintPrice.toString());
        const tx = await nftContract.mint({ value: mintPrice });
        console.log("mint() tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("mint() tx mined:", receipt.transactionHash);
        checkNft({ silent: true });
    } catch (error) {
        console.error('Error in mintDeveloper:', error);
        if (mintBtn) mintBtn.classList.remove('hidden');
        if (mintState) mintState.classList.remove('hidden');
        if (mintProgress) mintProgress.classList.add('hidden');
        if (mintBtn) mintBtn.disabled = false;
    }
}

async function getMyDeveloper({ silent = false } = {}) {
    if (!client) return;

    const loadingIndicator = document.getElementById('loadingIndicator');
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');

    if (!silent) {
        if (dataContainer) dataContainer.classList.add('hidden');
        if (emptyContainer) emptyContainer.classList.add('hidden');
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    } else {
        if (dataContainer) dataContainer.classList.remove('hidden');
        if (emptyContainer) emptyContainer.classList.add('hidden');
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
    
    try {
        const game = await client.readContract({
            address: contractDeveloper,
            functionName: 'get_my_game',
            args: [],
        });
        let res = JSON.parse(game);
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        if (res.error) {
            renderQuizEmpty(res.error);
        } else {
            renderQuizData(res);
        }
        console.error('Success getting my quiz:', res);
    } catch (error) {
        if (!silent) {
            if (dataContainer) dataContainer.classList.add('hidden');
            if (emptyContainer) emptyContainer.classList.remove('hidden');
        } else {
            if (dataContainer) dataContainer.classList.remove('hidden');
            if (emptyContainer) emptyContainer.classList.add('hidden');
        }
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        console.error('Error getting my quiz:', error);
    }
}

async function startDeveloper() {
    if (!client) return;
    const createBtn = document.getElementById('createBtn');
    const startBtn = document.getElementById('startBtn');
    const saveProgress = document.getElementById('saveProgress');
    if (createBtn) createBtn.classList.add('hidden');
    if (startBtn) startBtn.classList.add('hidden');
    if (saveProgress) saveProgress.classList.remove('hidden');
    try {
        clearQuizAnswers();
        await checkGenlayer();
        const txHash = await client.writeContract({
            address: contractDeveloper,
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
        if (saveProgress) saveProgress.classList.add('hidden');
        getMyDeveloper({ silent: false });
    } catch (error) {
      console.error('Error start:', error);
      if (createBtn) createBtn.classList.add('hidden');
      if (startBtn) startBtn.classList.remove('hidden');
      if (saveProgress) saveProgress.classList.add('hidden');
    }
}

async function gameDeveloper(gameLang) {
    if (!client) return;
    const createBtn = document.getElementById('createBtn');
    const startBtn = document.getElementById('startBtn');
    const saveProgress = document.getElementById('saveProgress');
    if (createBtn) createBtn.classList.add('hidden');
    if (startBtn) startBtn.classList.add('hidden');
    if (saveProgress) saveProgress.classList.remove('hidden');
    try {
        await checkGenlayer();
        const txHash = await client.writeContract({
            address: contractDeveloper,
            functionName: "create_game",
            args: [gameLang],
        });
        console.error('Success tx quiz:', txHash);
        const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: TransactionStatus.ACCEPTED,
            retries: 100,
            interval: 2000,
        });
        console.error('Success setting quiz:', receipt);
        if (saveProgress) saveProgress.classList.add('hidden');
        getMyDeveloper({ silent: false });
    } catch (error) {
        console.error('Error setting quiz:', error);
        if (createBtn) createBtn.classList.remove('hidden');
        if (startBtn) startBtn.classList.add('hidden');
        if (saveProgress) saveProgress.classList.add('hidden');
    }
}

async function sendDeveloperAnswer({ questionId, answerId }) {
    const payload = {
        question_id: questionId || null,
        answer_id: answerId || null,
        answer: String('')
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
    appendQuizAnswer(questionId, json.sealed);

    return json.sealed;
}

async function answerDeveloper() {
    if (!client) return;

    const sealedList = loadQuizAnswers() || [];
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
        await checkGenlayer();
        const txHash = await client.writeContract({
            address: contractDeveloper,
            functionName: "score_answers",
            args: [sealedOnly],
        });
        console.error('Success tx answer quiz:', txHash);
        const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: TransactionStatus.ACCEPTED,
            retries: 100,
            interval: 2000,
        });
        console.error('Success setting answer quiz:', receipt);
        getMyDeveloper({ silent: false });
    } catch (error) {
        console.error('Error setting answer quiz:', error);
        if (scoreBtn) scoreBtn.disabled = false;
    }
}

function renderQuizData(game) {
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    const stateContainer = document.getElementById('stateContainer');
    const resultContainer = document.getElementById('resultContainer');
  
    const prevGameState = stateContainer ? stateContainer.dataset.mode : '';

    if (dataContainer) dataContainer.classList.remove('hidden');
    if (emptyContainer) emptyContainer.classList.add('hidden');

    const isFinished = game.game_score;
    const gs = game.game_state || {};
    const st = gs.state;
  
    const isActiveState = !isFinished && (st === 'waiting' || st === 'quiz');
  
    if (isActiveState) {
        if (!window.quizPollInterval) {
            window.quizPollInterval = setInterval(() => {
                getMyDeveloper({ silent: true });
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
            renderQuizScoringState();
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

function renderQuizScoringState() {
    const stateContainer = document.getElementById('stateContainer');
    if (!stateContainer) return;
    stateContainer.textContent = '';
  
    const text = document.createElement('p');
    text.style.paddingTop = '1rem';
    text.textContent = 'Please sign your answers so they can be scored.';
    stateContainer.appendChild(text);
  
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Score';
    btn.className = 'btn';
    btn.style.marginTop = '0.75rem';
    stateContainer.appendChild(btn);
  
    btn.addEventListener('click', async () => {
        await answerDeveloper();
    });
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
  
    const answersArr = Array.isArray(q.answers) ? q.answers : [];

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
                WalletUI.sendDeveloperAnswer({
                    questionId: q.id,
                    answerId: ans.id
                });
            } catch (e) {
                alert(e.message || String(e));
            }
        });
    });
  
    stateContainer.appendChild(btnsWrap);
  
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

function renderQuizEmpty(error) {
    const dataContainer = document.getElementById('gameContainer');
    const emptyContainer = document.getElementById('emptyContainer');
    const languageSelect = document.getElementById('languageSelect');
    const createBtn = document.getElementById('createBtn');
    const startBtn = document.getElementById('startBtn');
    const saveProgress = document.getElementById('saveProgress');
    if (saveProgress) saveProgress.classList.add('hidden');
    if (dataContainer) dataContainer.classList.add('hidden');
    if (emptyContainer) emptyContainer.classList.remove('hidden');
    if (error === 'Game not started') {
        if (languageSelect) languageSelect.classList.add('hidden');
        if (createBtn) createBtn.classList.add('hidden');
        if (startBtn) startBtn.classList.remove('hidden');
    } else {
        if (languageSelect) languageSelect.classList.remove('hidden');
        if (createBtn) createBtn.classList.remove('hidden');
        if (startBtn) startBtn.classList.add('hidden');
    }
}

function renderQuizQuestionsWithAnswers(game) {
    const root = document.getElementById('resultContainer');
    if (!root) return;
  
    const questions = game.game_questions || [];
    if (!Array.isArray(questions) || questions.length === 0) return;
    const me = game.game_score;
  
    const myAnswers = me ? parsePlayerQuizAnswers(me.answers || '') : [];
  
    const block = document.createElement('div');
    block.id = 'quizQuestionsBlock';
    block.style.marginTop = '1.5rem';

    const titleResult = document.createElement('h2');
    titleResult.textContent = 'Your result: ' + me.score + ' of 5000';
    titleResult.style.margin = '0 0 .75rem';
    block.appendChild(titleResult);

    const scoreResult = Number(me.score);
    if (scoreResult >= 500) {
        let rarity = 'common';
        if (scoreResult > 2600) rarity = 'rare';
        if (scoreResult > 3500) rarity = 'epic';
        if (scoreResult > 4200) rarity = 'legendary';
        if (scoreResult > 4700) rarity = 'mythic';
    
        const resultText = document.createElement('div');
        resultText.textContent = 'You have been whitelisted to mint a ' + rarity + ' Real GenLayer Developer NFT. If you have just completed the quiz, minting will be available in a couple of minutes.';
        resultText.style.fontWeight = '400';
        resultText.style.fontSize = '16px';
        block.appendChild(resultText);
    } else {
        const resultText = document.createElement('div');
        resultText.textContent = 'You have not been whitelisted to mint a Real GenLayer Developer NFT.';
        resultText.style.fontWeight = '400';
        resultText.style.fontSize = '16px';
        block.appendChild(resultText);
    }
  
    const title = document.createElement('h2');
    title.textContent = 'Questions and answers';
    title.style.margin = '1.75rem 0 .75rem';
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
    
        const answersArr = Array.isArray(q.answers) ? q.answers : [];
    
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
                const myAnswer = answersArr.find(a => 
                    String(a.id) === String(myAnsForQuestion.answer_id || '')
                );
                const text = String(myAnswer.answer || '').trim();
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

function getQuizAnswersKey() {
    return DEVELOPER_ANSWERS_KEY;
}

function clearQuizAnswers() {
    const key = getQuizAnswersKey();
    localStorage.removeItem(key);
}

function loadQuizAnswers() {
    const key = getQuizAnswersKey();
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveQuizAnswers(arr) {
    const key = getQuizAnswersKey();
    localStorage.setItem(key, JSON.stringify(arr));
}

function appendQuizAnswer(questionId, sealed) {
    if (typeof sealed !== 'string' || !sealed) return;
    const list = loadQuizAnswers();
  
    const already = list.some(item => String(item.question_id) === String(questionId));
    if (already) return;
  
    list.push({ question_id: questionId, sealed });
    saveQuizAnswers(list);
}

export {
    mintDeveloper,
    sendDeveloperAnswer,
    startDeveloper,
    answerDeveloper,
    gameDeveloper,
    getMyDeveloper,
    checkNft
};