import { getMochiQuest } from './game-quest.js';
import { getQuestions, getQuestionStats, checkUsdcBalance, checkRewards } from './game-questions.js';
import { getGame, getMyGuess } from './game-guess.js';
import { getGameMatch, getMyMatch } from './game-match.js';
import { getGamePunch, getMyPunch } from './game-punch.js';
import { getGameCook, getMyCook } from './game-cook.js';
import { getGameQuiz, getMyQuiz } from './game-quiz.js';
import { getMyDeveloper } from './developer.js';
import { getContest, getContests } from './contest.js';
import { getDogContest, getDogContests } from './contest-dog.js';
import { getGames } from './profile.js';
import { initLeaderboardTabs } from './leaderboard.js';
import { getMyMochi } from './mochi.js';

function checkPageImpl() {
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
        break;
      case 'punch':
        getGamePunch(document.body.dataset.gameId);
        break;
      case 'cat':
        getContest(document.body.dataset.gameId);
        break;
      case 'dog':
        getDogContest(document.body.dataset.gameId);
        break;
      case 'cook':
        getGameCook(document.body.dataset.gameId);
        break;
      case 'start_quiz':
        getMyQuiz();
        break;
      case 'start_punch':
        getMyPunch();
        break;
      case 'start_cook':
        getMyCook();
        break;
      case 'start_guess':
        getMyGuess();
        break;
      case 'start_match':
        getMyMatch();
        break;
      case 'start_cat':
        getContests();
        break;
      case 'start_dog':
        getDogContests();
        break;
      case 'profile':
        getGames();
        break;
      case 'mochi':
        getMyMochi();
        break;
      case 'mochi_quest':
        getMochiQuest();
        break;
      case 'questions':
        checkUsdcBalance();
        checkRewards();
        getQuestionStats();
        getQuestions(true);
        break;
      case 'developer':
        getMyDeveloper();
        break;
      default:
        console.log('Page has no data-page-name');
    }
}

export { checkPageImpl };