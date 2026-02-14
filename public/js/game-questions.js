import {
    client,
    TransactionStatus,
    contractQuestions,
    evmContractQuestions,
    questionsAbi,
    checkGenlayer,
    getUSDCBalance,
    getUSDC,
    ethers,
    checkBaseSepolia
} from './core.js';
import { 
    renderQuestions
} from './ui-render.js';

let waitGameTimer = null;
let waitGameTimeout = null;
let rewardGameTimer = null;
let rewardGameTimeout = null;

async function checkUsdcBalance() {
    const balance = document.getElementById('balanceAmount');
    const startBtn = document.getElementById('startGameBtn');
    const gameBlock = document.getElementById('game');
    const bal = await getUSDCBalance();
    console.log("Balance", bal)
    if (balance) balance.innerText = bal.whole + ' ' + bal.symbol;

    const hasBalance = bal.hasWhole;
    const isWaiting = !!waitGameTimer || !!waitGameTimeout;
    const hasActiveGame = gameBlock && gameBlock.dataset.state === 'True';
    console.log("Disable modifiers hasBalance", hasBalance)
    console.log("Disable modifiers isWaiting", isWaiting)
    console.log("Disable modifiers hasActiveGame", hasActiveGame)
    if (startBtn) {
        startBtn.disabled = !(hasBalance && !isWaiting && !hasActiveGame);
    }
    if (hasBalance) {
      if (balance) balance.classList.remove('empty');
    } else {
      if (balance) balance.classList.add('empty');
    }
}

async function checkRewards() {
    const rewards = document.getElementById('rewardAmount');
    const claimBtn = document.getElementById('claimBtn');

    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        const gameContract = new ethers.Contract(evmContractQuestions, questionsAbi, signer);
        const units = await gameContract.claimableUnits(userAddress);
        console.log("claimableUnits:", units.toString());
        if (rewards) rewards.innerText = units.toString() + ' USDC';
        const hasReward = units.gt(0);
        if (!hasReward) {
            if (claimBtn) claimBtn.disabled = true;
            if (rewards) rewards.classList.add('empty');
            if (rewards) rewards.classList.remove('no-money');
            return;
        }

        const usdc = await getUSDC();
        const decimals = await usdc.decimals();

        const oneUnit = ethers.BigNumber.from(10).pow(decimals);
        const requiredAmount = units.mul(oneUnit);
        const contractBalance = await usdc.balanceOf(evmContractQuestions);
        console.log("USDC contract balance:", contractBalance.toString());
        console.log("Required for claim:", requiredAmount.toString());

        const enoughLiquidity = contractBalance.gte(requiredAmount);
        const hasAtLeastOneUsdc = contractBalance.gte(oneUnit);
        if (claimBtn) {
            claimBtn.disabled = !(hasReward && hasAtLeastOneUsdc);
            if (!hasReward) {
                claimBtn.textContent = 'Claim';
            } else if (enoughLiquidity) {
                claimBtn.textContent = 'Claim';
            } else if (hasAtLeastOneUsdc) {
                const maxUnitsByBalance = contractBalance.div(oneUnit);
                const availableUnits = units.lt(maxUnitsByBalance) ? units : maxUnitsByBalance;
                if (rewards) {
                    rewards.innerText = availableUnits.toString() + ' of ' + units.toString() + ' USDC';
                }
                claimBtn.textContent = 'Claim Part';
            } else {
                claimBtn.textContent = 'Claim';
            }
        }
        if (hasReward && enoughLiquidity) {
            if (rewards) {
                rewards.classList.remove('empty');
                rewards.classList.remove('no-money');
            }
        } else if (hasReward && !enoughLiquidity) {
            if (rewards) {
                rewards.classList.add('empty');
                rewards.classList.add('no-money');
            }
        }
    } catch (error) {
        console.error('Error in checkRewards:', error);
        if (rewards) {
            rewards.innerText = '0 USDC';
            rewards.classList.add('empty');
            rewards.classList.remove('no-money');
        }
        if (claimBtn) claimBtn.disabled = true;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function startWaitRewardGame() {
    if (rewardGameTimer) {
      clearInterval(rewardGameTimer);
      rewardGameTimer = null;
    }
    if (rewardGameTimeout) {
      clearTimeout(rewardGameTimeout);
      rewardGameTimeout = null;
    }
    console.log("start reward timer")

    rewardGameTimer = setInterval(async () => {
      try {
        console.log('[rewardGameTimer] tick done');
        await checkRewards();
      } catch (e) {
        console.error('checkRewards in wait error', e);
      }
    }, 30000);
  
    rewardGameTimeout = setTimeout(async () => {
        console.log('[rewardGameTimer] timeout – stop timer');
        clearInterval(rewardGameTimer);
        rewardGameTimer = null;
        rewardGameTimeout = null;
  
    }, 5 * 60 * 1000);
}

function startWaitActiveGame() {
    const gameBlock = document.getElementById('game');
    const startBtn = document.getElementById('startGameBtn');
    const creating = document.getElementById('creating');
    const rewarding = document.getElementById('rewarding');
    if (startBtn) startBtn.disabled = true;
    if (rewarding) creating.classList.add('hidden');
    if (creating) creating.classList.remove('hidden');
    if (waitGameTimer) {
      clearInterval(waitGameTimer);
      waitGameTimer = null;
    }
    if (waitGameTimeout) {
      clearTimeout(waitGameTimeout);
      waitGameTimeout = null;
    }

    waitGameTimer = setInterval(async () => {
      try {
        await getQuestions(false);
        
        const hasActiveGame = gameBlock && gameBlock.dataset.state === 'True';
  
        if (hasActiveGame) {
          clearInterval(waitGameTimer);
          waitGameTimer = null;
          clearTimeout(waitGameTimeout);
          waitGameTimeout = null;
          checkUsdcBalance();
          if (creating) creating.classList.add('hidden');
        }
      } catch (e) {
        console.error('getQuestions in wait error', e);
      }
    }, 20000);
  
    waitGameTimeout = setTimeout(async () => {
      clearInterval(waitGameTimer);
      waitGameTimer = null;
      waitGameTimeout = null;
  
      if (creating) creating.classList.add('hidden');
      try {
        await checkRewards();
      } catch (e) {
        console.error('checkRewards error', e);
      }
      checkUsdcBalance();
    }, 4 * 60 * 1000);
}

async function startQuestion() {
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) startBtn.disabled = true;
    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        const gameContract = new ethers.Contract(evmContractQuestions, questionsAbi, signer);
        const usdc = await getUSDC();
        const currentAllowance = await usdc.allowance(userAddress, evmContractQuestions);
        console.log("Current USDC allowance:", currentAllowance.toString());
        const decimals = await usdc.decimals();
        const oneUsdc = ethers.BigNumber.from(10).pow(decimals);
        if (currentAllowance.lt(oneUsdc)) {
            console.log("Approving USDC to game contract...");
            const approveTx = await usdc.approve(evmContractQuestions, oneUsdc);
            await approveTx.wait();
            console.log("Approve tx mined:", approveTx.hash);
        }
        await sleep(1000);
        console.log("Calling start() on evmContractQuestions...");
        const tx = await gameContract.start();
        console.log("start() tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("start() tx mined:", receipt.transactionHash);
        startWaitActiveGame();
        await sleep(1000);
        checkUsdcBalance();
    } catch (error) {
        console.error('Error in startQuestion:', error);
        checkUsdcBalance();
    }
}

async function claimQuestion() {
    const claimBtn = document.getElementById('claimBtn');
    if (claimBtn) claimBtn.disabled = true;
    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const gameContract = new ethers.Contract(evmContractQuestions, questionsAbi, signer);
        console.log("Calling claim() on evmContractQuestions...");
        const tx = await gameContract.claimPart();
        console.log("claim() tx sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("claim() tx mined:", receipt.transactionHash);
        await sleep(1000);
        checkUsdcBalance();
        checkRewards();
    } catch (error) {
        console.error('Error in claim:', error);
        checkRewards();
    }
}

async function getQuestionStats() {
    if (!client) return;
    const statAll = document.getElementById('statAll');
    const stat10x = document.getElementById('stat10x');
    const stat1x = document.getElementById('stat1x');
    try {
        const game = await client.readContract({
            address: contractQuestions,
            functionName: 'get_my_stat',
            args: [],
        });
        let res = JSON.parse(game);
        if (res.error) {
            if (statAll) statAll.textContent = "0";
            if (stat10x) stat10x.textContent = "0";
            if (stat10x) stat1x.textContent = "0";
        } else {
            if (statAll) statAll.textContent = res.total;
            if (stat10x) stat10x.textContent = res.fast;
            if (stat10x) stat1x.textContent = res.passed;
        }
        console.error('Success getting my stat:', res);
    } catch (error) {
        console.error('Error getting my stat:', error);
    }
}

async function getQuestions(first) {
    if (!client) return;
    const closed = document.getElementById('closed');
    const gameBlock = document.getElementById('game');
    const progress = document.getElementById('gameProgress');
    const isWaiting = !!waitGameTimer || !!waitGameTimeout;
    if (first) {
        if (closed) closed.classList.add('hidden');
        if (gameBlock) gameBlock.classList.add('hidden');
        if (progress) progress.classList.remove('hidden');
    } else {
        if (!isWaiting) {
            if (closed) closed.classList.add('hidden');
            if (gameBlock) gameBlock.classList.remove('hidden');
        }
        if (progress) progress.classList.add('hidden');
    }
    try {
        const game = await client.readContract({
            address: contractQuestions,
            functionName: 'get_game',
            args: [],
        });
        let res = JSON.parse(game);
        if (progress) progress.classList.add('hidden');
        if (res.error) {
            if (gameBlock) gameBlock.dataset.state = 'False';
            if (closed) closed.textContent = "You hasn't played yet. Start a new game."
            if (closed) closed.classList.remove('hidden');
            if (gameBlock) gameBlock.classList.add('hidden');
        } else {
            if (gameBlock) {
                const oldState = gameBlock.dataset.state;
                gameBlock.dataset.tag = res.id;
                gameBlock.dataset.state = res.active;
                if (oldState === 'True' && res.active === 'False' && res.resolved == 'True') {
                    startWaitRewardGame();
                }
                checkUsdcBalance();
            }
            renderQuestions(res);
            if (res.active === 'False' && res.resolved == 'True') {
                getQuestionStats();
            }
        }
        console.error('Success getting my questions:', res);
    } catch (error) {
        if (closed) closed.textContent = "You hasn't played yet. Start a new game."
        if (closed) closed.classList.remove('hidden');
        if (first) {
            if (gameBlock) gameBlock.classList.add('hidden');
        }
        if (progress) progress.classList.add('hidden');
        console.error('Error getting my questions:', error);
    }
}

async function askQuestion(game, question) {
    if (!client) return;
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveBtn');
    const progress = document.getElementById('saveProgress');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (saveBtn) saveBtn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
      await checkGenlayer();
      const txHash = await client.writeContract({
        address: contractQuestions,
        functionName: "ask",
        args: [game, question],
      });
      console.error('Success tx ask questions:', txHash);
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 2000,
      });
      console.error('Success setting ask questions:', receipt);
      if (progress) progress.classList.add('hidden');
      getQuestions(false);
    } catch (error) {
      console.error('Error setting ask questions:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (saveBtn) saveBtn.classList.remove('hidden');
      if (progress) progress.classList.add('hidden');
    }
}

export {
    getQuestions,
    askQuestion,
    getQuestionStats,
    checkUsdcBalance,
    checkRewards,
    startQuestion,
    claimQuestion
};