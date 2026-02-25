import {
    client,
    TransactionStatus,
    contractDeveloper,
    checkGenlayer,
    maskAddress
} from './core.js';

const DEVELOPER_ANSWERS_KEY = 'developer_answers';

async function getMyDeveloper({ silent = false } = {}) {
    if (!client) return;
}

async function startDeveloper() {
    try {
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
        getMyDeveloper();
    } catch (error) {
      console.error('Error start:', error);
    }
}

async function gameDeveloper(gameLang) {
    if (!client) return;
    const submitOpenBtn = document.getElementById('openBtn');
    const submitCloseBtn = document.getElementById('closeBtn');
    const progress = document.getElementById('saveProgress');
    if (submitOpenBtn) submitOpenBtn.classList.add('hidden');
    if (submitCloseBtn) submitCloseBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
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
        if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
        if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');
        getMyDeveloper();
    } catch (error) {
        console.error('Error setting quiz:', error);
        if (submitOpenBtn) submitOpenBtn.classList.remove('hidden');
        if (submitCloseBtn) submitCloseBtn.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');
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
        getMyDeveloper({ silent: true });
    } catch (error) {
        console.error('Error setting answer quiz:', error);
        if (scoreBtn) scoreBtn.disabled = false;
    }
}

function getQuizAnswersKey() {
    return DEVELOPER_ANSWERS_KEY;
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
    sendDeveloperAnswer,
    answerDeveloper,
    gameDeveloper,
    getMyDeveloper
};