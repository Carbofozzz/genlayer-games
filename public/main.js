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
  } from './core.js';
  
  import { gameGuess, answer } from './game-guess.js';
  import { gameMatch, answerMatch } from './game-match.js';
  import { gamePunch, joke } from './game-punch.js';
  import { gameQuiz, answerQuiz, sendQuizAnswer } from './game-quiz.js';
  import { catBeauty, getContest, getShareImage } from './contest.js';
  import { setNickname } from './leaderboard.js';
  import { checkPageImpl } from './pages.js';
  
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
    gameQuiz,
    joke,
    answer,
    answerMatch,
    answerQuiz,
    sendQuizAnswer,
    getShareImage,
    catBeauty,
    getContest,
    setNickname,
    checkPage
  };
  
  if (typeof window !== 'undefined') {
    window.WalletUI = WalletUI;
    window.addEventListener('DOMContentLoaded', () => {
      try { WalletUI.init(); } catch (e) { console.error(e); }
    });
  }
  
  export default WalletUI;