import { createClient } from "https://esm.sh/genlayer-js";
import { studionet } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus } from "https://esm.sh/genlayer-js/types";

let hasNick = false;
let client = null;
let inited = false;

let contractStat = '0x98e2797FB846fFf75BF5790681d52C80C1259e48';
let contractGuess = '0xe17e1193496C353a4741D26a86d428201FA2B45b';
let contractMatch = '0xfe3D363FCd13c79541B802F09e92Ef5B67F169D6';
let contractQuiz = '0xA23B1b240903d7a9b85b7878139f936DDA6Bd820';
let contractPunch = '0x51eD95A3c625A8eAE5e7ED87Cc586ec54220c718';
let contractBeauty = '0x41c4EbE0eFDe4b526c6301cC365ff7625D7be84E';

const FLAG_KEY = 'answeredFlags';

window.quizPollInterval = null;

function maskAddress(a){ if(!a) return ''; return a.slice(0,5)+'…'+a.slice(-4); }

function fmt(t){ 
    const m = Math.floor((t%3600)/60); 
    const s = Math.floor(t%60); 
    const h = Math.floor(t/3600); 
    return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); 
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
    fmt
  };