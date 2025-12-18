import { getGame, getMyGuess } from './game-guess.js';
import { getGameMatch, getMyMatch } from './game-match.js';
import { getGamePunch, getMyPunch } from './game-punch.js';
import { getGameQuiz, getMyQuiz } from './game-quiz.js';
import { getContest, getContests } from './contest.js';
import { getGames } from './profile.js';
import { initLeaderboardTabs } from './leaderboard.js';

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
      case 'start_quiz':
        getMyQuiz();
        break;
      case 'start_punch':
        getMyPunch();
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
      case 'profile':
        getGames();
        break;
      default:
        console.log('Page has no data-page-name');
    }
}

export { checkPageImpl };