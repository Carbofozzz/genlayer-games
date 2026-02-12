import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus } from "https://esm.sh/genlayer-js/types";
import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.esm.min.js";

let hasNick = false;
let client = null;
let inited = false;

let contractStat = '0x98e2797FB846fFf75BF5790681d52C80C1259e48';
let contractGuess = '0xe17e1193496C353a4741D26a86d428201FA2B45b';
let contractMatch = '0xfe3D363FCd13c79541B802F09e92Ef5B67F169D6';
let contractQuiz = '0xA23B1b240903d7a9b85b7878139f936DDA6Bd820';
let contractPunch = '0x51eD95A3c625A8eAE5e7ED87Cc586ec54220c718';
let contractBeauty = '0x41c4EbE0eFDe4b526c6301cC365ff7625D7be84E';
let contractDogBeauty = '0x8017a5a51061B1e68B9c7c6e0b912722AFFbeE17';
let contractCook = '0x79fCa43f7B31Cf2C4406c8d736861a0651d60322';
let contractMochi = '0x8C06eD92CcDc05a23Ec2cEb6196f310717872878';
let contractMochiQuest = '0xe0E74E58deD82caA331B5cF0B46E62A663767d5A';
let contractQuestions = '0xd7758989e414190E4c81CDC7cBB51B26D8A20082';
let evmContractQuestions = '0x67e49832c9C1928fAf35a8233D50b8F00c7985Cb';

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const BASE_SEPOLIA_USDC= "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
const questionsAbi = [
  "function start() external payable returns (bytes32)",
  "function claim() external",
  "function claimableAmount(address user) external view returns (uint256)",
  "function claimableUnits(address user) external view returns (uint256)"
];

const FLAG_KEY = 'answeredFlags';

window.quizPollInterval = null;

function maskAddress(a){ if(!a) return ''; return a.slice(0,5)+'…'+a.slice(-4); }

function fmt(t){
    const m = Math.floor((t%3600)/60);
    const s = Math.floor(t%60);
    const h = Math.floor(t/3600);
    return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }

async function getUSDCBalance() {
  return getErc20Balance(BASE_SEPOLIA_USDC, BASE_SEPOLIA_RPC);
}

async function getErc20Balance(tokenAddress, rpc) {
  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const token = new ethers.Contract(tokenAddress, erc20Abi, provider);

  const [rawBalance, decimals, symbol] = await Promise.all([
    token.balanceOf(getAddress()),
    token.decimals(),
    token.symbol()
  ]);
  const base = ethers.BigNumber.from(10).pow(decimals);
  const wholeBn = rawBalance.div(base);
  const whole = wholeBn.toString();
  const hasWhole = wholeBn.gte(1);
  return { whole, symbol, hasWhole };
}

async function getUSDC() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const usdc = new ethers.Contract(BASE_SEPOLIA_USDC, erc20Abi, signer);
  return usdc;
}

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

  async function checkGenlayer() {
    const net = await (await fetch('/api/config/network')).json();
    checkNet(net)
  }

  async function checkBaseSepolia() {
    const net = await (await fetch('/api/config/network_base_sepolia')).json();
    checkNet(net)
  }

  async function checkNet(net) {
    if (!window.ethereum) throw new Error('No wallet');
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] });
    } catch (e) {
      if (e.code===4902 || (e.data && e.data.originalError && e.data.originalError.code===4902)) {
        await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{ chainId: net.chainIdHex, chainName: net.chainName, rpcUrls: net.rpcUrls, nativeCurrency: net.nativeCurrency, blockExplorerUrls: net.blockExplorerUrls }] });
      } else { throw e; }
    }
  }

  let _checkPageImpl = () => {};
  function setCheckPageImpl(fn) { _checkPageImpl = fn; }
  function checkPage(){ _checkPageImpl(); }

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
      console.warn('Wallet not connected. Please connect your wallet first.');
    }
  }

  export {
    client,
    TransactionStatus,
    contractStat,
    contractGuess,
    contractMatch,
    contractQuiz,
    contractPunch,
    contractBeauty,
    contractDogBeauty,
    contractCook,
    contractMochi,
    contractMochiQuest,
    contractQuestions,
    evmContractQuestions,
    questionsAbi,
    maskAddress,
    markChanged,
    clearChanged,
    isChanged,
    getAddress,
    isConnected,
    nickIsSet,
    ensureConnected,
    connect,
    disconnect,
    connectWalletAndEnsureNetwork,
    updateAccount,
    getStat,
    init,
    checkPage,
    setCheckPageImpl,
    fmt,
    checkGenlayer,
    checkBaseSepolia,
    getUSDCBalance,
    getUSDC,
    ethers
  };
