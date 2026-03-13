import {
    init,
    connect,
    disconnect,
    connectWalletAndEnsureNetwork,
    isConnected,
    getAddress,
    ensureConnected,
    nickIsSet,
    setCheckPageImpl,
    checkPage,
  } from './js/core.js';
  
  import { askQuestion, startQuestion, claimQuestion } from './js/game-questions.js';
  import { answerMochiQuest, startMochiQuest } from './js/game-quest.js';
  import { gameGuess, answer } from './js/game-guess.js';
  import { gameMatch, answerMatch } from './js/game-match.js';
  import { gamePunch, joke } from './js/game-punch.js';
  import { gameCook, answerCook } from './js/game-cook.js';
  import { gameQuiz, answerQuiz, sendQuizAnswer } from './js/game-quiz.js';
  import { sendDeveloperAnswer, answerDeveloper, gameDeveloper, startDeveloper, mintDeveloper } from './js/developer.js';
  import { catBeauty, getContest, getShareImage } from './js/contest.js';
  import { dogBeauty, getDogContest, getDogShareImage } from './js/contest-dog.js';
  import { setNickname } from './js/leaderboard.js';
  import { checkPageImpl } from './js/pages.js';
  import { mintMochi, burnMochi, activateMochi, answerMochi } from './js/mochi.js';
  import { auth, logout } from './js/community.js';
  
  setCheckPageImpl(checkPageImpl);
  
  const WalletUI = {
    connectWalletAndEnsureNetwork,
    connect,
    disconnect,
    init,
    isConnected,
    getAddress,
    ensureConnected,
    nickIsSet,
    gamePunch,
    gameGuess,
    gameMatch,
    gameCook,
    gameQuiz,
    joke,
    answer,
    answerMatch,
    answerCook,
    answerQuiz,
    sendQuizAnswer,
    getShareImage,
    catBeauty,
    getContest,
    getDogShareImage,
    dogBeauty,
    getDogContest,
    setNickname,
    checkPage,
    mintMochi,
    burnMochi,
    activateMochi,
    answerMochi,
    answerMochiQuest,
    startMochiQuest,
    askQuestion,
    startQuestion,
    claimQuestion,
    sendDeveloperAnswer,
    answerDeveloper,
    gameDeveloper,
    startDeveloper,
    mintDeveloper,
    auth,
    logout
  };
  
  if (typeof window !== 'undefined') {
    window.WalletUI = WalletUI;
    window.addEventListener('DOMContentLoaded', () => {
      try { WalletUI.init(); } catch (e) { console.error(e); }
    });
  }
  
  export default WalletUI;