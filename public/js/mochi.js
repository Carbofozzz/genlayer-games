import {
    client,
    TransactionStatus,
    contractMochi,
    maskAddress
  } from './core.js';

    async function mintMochi() {
        if (!client) return;
        const mintBtn = document.getElementById('mintBtn');
        const burnBtn = document.getElementById('burnBtn');
        const progress = document.getElementById('mochiProgress');
        if (mintBtn) mintBtn.classList.add('hidden');
        if (burnBtn) burnBtn.classList.add('hidden');
        if (progress) progress.classList.remove('hidden');
        try {
            const txHash = await client.writeContract({
                address: contractMochi,
                functionName: "mint",
                args: [],
            });
            console.error('Success tx mint Mochi:', txHash);
            const receipt = await client.waitForTransactionReceipt({
                hash: txHash,
                status: TransactionStatus.ACCEPTED,
                retries: 100,
                interval: 2000,
            });
            console.error('Success mint Mochi', receipt);
            if (mintBtn) mintBtn.classList.add('hidden');
            if (burnBtn) burnBtn.classList.remove('hidden');
            if (progress) progress.classList.add('hidden');
            getMyMochi();
        } catch (error) {
            console.error('Error minting Mochi:', error);
            if (mintBtn) mintBtn.classList.remove('hidden');
            if (burnBtn) burnBtn.classList.remove('hidden');
            if (progress) progress.classList.add('hidden');
        }
    }

    async function activateMochi(lang) {
      if (!client) return;
      const activateBtn = document.getElementById('activateBtn');
      const select = document.getElementById('languageSelect');
      if (activateBtn) activateBtn.classList.add('hidden');
      if (select) select.classList.add('hidden');
      startMochiPulse();
      try {
          const txHash = await client.writeContract({
              address: contractMochi,
              functionName: "create_activation",
              args: [lang],
          });
          console.error('Success tx activate Mochi:', txHash);
          const receipt = await client.waitForTransactionReceipt({
              hash: txHash,
              status: TransactionStatus.ACCEPTED,
              retries: 100,
              interval: 2000,
          });
          console.error('Success activate Mochi', receipt);
          getActivation(true);
      } catch (error) {
          console.error('Error activate Mochi:', error);
          if (activateBtn) activateBtn.classList.remove('hidden');
          if (select) select.classList.remove('hidden');
          stopMochiPulse();
      }
  }

  async function answerMochi(a) {
    if (!client) return;
    const clearBtn = document.getElementById('clearAnswer');
    const submitBtn = document.getElementById('submitAnswer');
    if (clearBtn) clearBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
    startMochiPulse();
    try {
      const txHash = await client.writeContract({
          address: contractMochi,
          functionName: "answer_activation",
          args: [a],
      });
      console.error('Success tx answer Mochi:', txHash);
      const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          status: TransactionStatus.ACCEPTED,
          retries: 100,
          interval: 2000,
      });
      console.error('Success answer Mochi', receipt);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      getActivation(true);
  } catch (error) {
      console.error('Error answer Mochi:', error);
      if (clearBtn) clearBtn.classList.remove('hidden');
      if (submitBtn) submitBtn.classList.remove('hidden');
      stopMochiPulse();
  }
  }

    async function burnMochi() {
        if (!client) return;
    }

    async function getMyMochi() {
        if (!client) return;
        const mintBtn = document.getElementById('mintBtn');
        const burnBtn = document.getElementById('burnBtn');
        const progress = document.getElementById('mochiProgress');
        const activationContainer = document.getElementById('activationContainer');
        if (mintBtn) mintBtn.classList.add('hidden');
        if (burnBtn) burnBtn.classList.add('hidden');
        if (activationContainer) activationContainer.classList.add('hidden');
        if (progress) progress.classList.remove('hidden');
        try {
          const game = await client.readContract({
            address: contractMochi,
            functionName: 'get_my_token',
            args: [],
          });
          let res = JSON.parse(game);
          if (progress) progress.classList.add('hidden');
          if (res.error) {
            if (mintBtn) mintBtn.classList.remove('hidden');
            if (burnBtn) burnBtn.classList.add('hidden');
            if (activationContainer) activationContainer.classList.add('hidden');
            renderMochi(null);
          } else {
            if (mintBtn) mintBtn.classList.add('hidden');
            if (res.activated == "False") {
              if (burnBtn) burnBtn.classList.add('hidden');
              getActivation(false);
            } else {
              if (burnBtn) burnBtn.classList.remove('hidden');
              if (burnBtn) burnBtn.classList.remove('hidden');
              if (activationContainer) activationContainer.classList.add('hidden');
            }
            renderMochi(res);
          }
          console.error('Success getting my Mochi:', res);
        } catch (error) {
          if (mintBtn) mintBtn.classList.remove('hidden');
          if (burnBtn) burnBtn.classList.add('hidden');
          if (progress) progress.classList.add('hidden');
          if (activationContainer) activationContainer.classList.add('hidden');
          console.error('Error getting my Mochi:', error);
        }
    }

    async function getActivation(answered) {
        if (!client) return;
        const activationContainer = document.getElementById('activationContainer');
        const activateBtn = document.getElementById('activateBtn');
        const select = document.getElementById('languageSelect');
        const question = document.getElementById('question');
        if (activationContainer) activationContainer.classList.add('hidden');
        try {
          const game = await client.readContract({
            address: contractMochi,
            functionName: 'get_my_activation',
            args: [],
          });
          let res = JSON.parse(game);
          if (res.status == "not_created") {
            if (activationContainer) activationContainer.classList.add('hidden');
            if (activateBtn) activateBtn.classList.remove('hidden');
            if (select) select.classList.remove('hidden');
          } else if (res.status == "completed") {
            if (activationContainer) activationContainer.classList.add('hidden');
            if (activateBtn) activateBtn.classList.add('hidden');
            if (select) select.classList.add('hidden');
            if (answered) {
              getMyMochi();
            }
          } else {
            if (activationContainer) activationContainer.classList.remove('hidden');
            if (activateBtn) activateBtn.classList.add('hidden');
            if (select) select.classList.add('hidden');
            if (question) question.textContent = res.question;
          }
          stopMochiPulse();
          console.error('Success getting my activation:', res);
        } catch (error) {
          if (activationContainer) activationContainer.classList.add('hidden');
          if (activateBtn) activateBtn.classList.add('hidden');
          if (select) select.classList.add('hidden');
          stopMochiPulse();
          console.error('Error getting my activation:', error);
        }
    }

    async function renderMochi(nft) {
        const container = document.getElementById('mochiContainer');
        const elId = document.getElementById('mochiId');
        const elLevel = document.getElementById('mochiLevel');
        const elStatus = document.getElementById('mochiStatus');
        const elPrimary = document.getElementById('mochiPrimary');
        const elSecondary = document.getElementById('mochiSecondary');
        if (nft != null && nft.image) {
            let svgSrc = nft.image.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
            if (container) container.classList.remove('hidden');
            if (container) container.innerHTML = svgSrc;
            const svg = container.querySelector('svg');
            svg.id = 'mochiSvg';
        } else {
            if (container) container.classList.add('hidden');
            if (container) container.innerHTML = "";
        }
        if (nft != null) {
            if (elId) elId.textContent = nft.id;
            if (elLevel) elLevel.textContent = nft.level;
            if (nft.activated == "False") {
              if (elStatus) elStatus.textContent = "Not activated";
              if (elStatus) elStatus.style.color = "#F54927";
            } else {
              if (elStatus) elStatus.textContent = "Activated";
              if (elStatus) elStatus.style.color = "#31820A";
            }
            if (nft.primary_skill && nft.primary_skill.length > 0) {
              if (elPrimary) elPrimary.textContent = nft.primary_skill;
            } else {
              if (elPrimary) elPrimary.textContent = "—";
            }
            if (nft.secondary_skill && nft.secondary_skill.length > 0) {
              if (elSecondary) elSecondary.textContent = nft.secondary_skill;
            } else {
              if (elSecondary) elSecondary.textContent = "—";
            }
        } else {
            if (elId) elId.textContent = "—";
            if (elLevel) elLevel.textContent = "—";
            if (elStatus) elStatus.textContent = "—";
            if (elPrimary) elPrimary.textContent = "—";
            if (elSecondary) elSecondary.textContent = "—";
        }
    }

    function lerpColor(col1, col2, t) {
      const c1 = hexToRgb(col1);
      const c2 = hexToRgb(col2);
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      return rgbToHex(r, g, b);
    }
  
    function hexToRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const num = parseInt(hex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }
  
    function rgbToHex(r, g, b) {
      const toHex = (v) => ('0' + v.toString(16)).slice(-2);
      return '#' + toHex(r) + toHex(g) + toHex(b);
    }
  
    let rafId = null;
    let startTime = null;
    let elements = [];
    let elementsGrid = [];
    let baseColors = [];
    let baseGridColors = [];
  
    const RED_COLOR = '#ff0000';
    const DARK_RED_COLOR = '#7a0018';
    const PERIOD = 3000; 
  
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
  
      const phase = (elapsed % PERIOD) / PERIOD;
      let t = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const base = baseColors[i];
        const mix = lerpColor(base, RED_COLOR, t);
        el.setAttribute('fill', mix);
      }
      for (let i = 0; i < elementsGrid.length; i++) {
        const el = elementsGrid[i];
        const base = baseGridColors[i];
        const mix = lerpColor(base, DARK_RED_COLOR, t);
        el.setAttribute('fill', mix);
      }
  
      rafId = requestAnimationFrame(animate);
    }
  
    function initElements() {
      const svg = document.getElementById('mochiSvg');
      if (!svg) return;
      elements = Array.from(svg.querySelectorAll('.fill'));
      elementsGrid = Array.from(svg.querySelectorAll('.grid'));
      console.log("grid", elementsGrid.length)
  
      baseColors = elements.map(el => {
        let fill = el.getAttribute('fill');
        if (!fill || fill === 'none') {
          fill = '#ffffff';
        }
        return fill;
      });
      baseGridColors = elementsGrid.map(el => {
        let fill = el.getAttribute('fill');
        if (!fill || fill === 'none') {
          fill = '#ffffff';
        }
        return fill;
      });
      console.log("initElements");
    }
  
    function startMochiPulse() {
      if (rafId != null) return;
      initElements();
      startTime = null;
      rafId = requestAnimationFrame(animate);
      console.log("inited");
    };
  
    function stopMochiPulse() {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (let i = 0; i < elements.length; i++) {
        elements[i].setAttribute('fill', baseColors[i]);
      }
      for (let i = 0; i < elementsGrid.length; i++) {
          elementsGrid[i].setAttribute('fill', baseGridColors[i]);
      }
    };

    export {
        mintMochi,
        burnMochi,
        activateMochi,
        answerMochi,
        getMyMochi
    };