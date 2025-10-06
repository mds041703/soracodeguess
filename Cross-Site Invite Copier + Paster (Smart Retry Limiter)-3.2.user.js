// ==UserScript==
// @name         Cross-Site Invite Copier + Paster (Smart Retry Limiter)
// @namespace    chatgpt-helper
// @version      3.2
// @description  Copies invite code on formbiz.biz and pastes/submits it on sora.chatgpt.com, limiting retries per code to 5 times.
// @author       Matthew Smith
// @match        *://formbiz.biz/*
// @match        *://sora.chatgpt.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";

  /* =====================================================
     🔧 CONFIGURATION
     ===================================================== */
  const CONFIG = {
    MAX_ATTEMPTS: Infinity,      // total loop attempts (use Infinity for continuous)
    MAX_TRIES_PER_CODE: 5,       // ✅ max tries per unique code
    RETRY_INTERVAL_MS: 20,       // delay between loop runs
    LOAD_DELAY_MS: 1500,         // wait after page load
    COPY_SELECTOR: "button span.font-mono.text-2xl.font-bold.text-gray-900",
    COPY_MIN_LEN: 6,             // minimum code length
    INPUT_FIND_TRIES: 10,
    FIND_RETRY_MS: 20,
    CLICK_DELAY_RANGE: [2, 20],
    POST_CLICK_DELAY_MS: 20,
    DEBUG_LOG: true
  };

  /* =====================================================
     ⚙️ UTILITIES
     ===================================================== */
  const rand = (a,b)=>a+Math.random()*(b-a);
  const wait = (ms)=>new Promise(r=>setTimeout(r,ms));

  async function fastClick(btn){
    if(!btn)return;
    const rect=btn.getBoundingClientRect();
    const opts={bubbles:true,cancelable:true,clientX:rect.left+rand(2,rect.width-2),clientY:rect.top+rand(2,rect.height-2)};
    for(const ev of["pointerdown","mousedown","mouseup","pointerup","click"]){
      btn.dispatchEvent(new MouseEvent(ev,opts));
      await wait(rand(...CONFIG.CLICK_DELAY_RANGE));
    }
    await wait(CONFIG.POST_CLICK_DELAY_MS);
  }

  async function waitForEl(selector,filter=()=>true){
    for(let i=0;i<CONFIG.INPUT_FIND_TRIES;i++){
      const el=[...document.querySelectorAll(selector)].find(filter);
      if(el)return el;
      await wait(CONFIG.FIND_RETRY_MS);
    }
    return null;
  }

  function setReactValue(el,value){
    const last=el.value;
    el.value=value;
    const tracker=el._valueTracker;
    if(tracker)tracker.setValue(last);
    el.dispatchEvent(new Event("input",{bubbles:true}));
  }

  /* =====================================================
     📋 COPY SIDE (formbiz.biz)
     ===================================================== */
  async function copyLoop(){
    let attempts=0;
    while(attempts<CONFIG.MAX_ATTEMPTS){
      attempts++;
      const spans=document.querySelectorAll(CONFIG.COPY_SELECTOR);
      const code=Array.from(spans).map(s=>s.textContent.trim()).join("");
      if(code && code.length>=CONFIG.COPY_MIN_LEN){
        const prev=await GM_getValue("invite_code","");
        if(code!==prev){
          GM_setValue("invite_code",code);
          GM_setValue("attempt_count",0); // reset attempts for new code
          if(CONFIG.DEBUG_LOG)console.log(`[COPY] ✅ New invite code stored: ${code}`);
        }
      } else if(CONFIG.DEBUG_LOG){
        console.log(`[COPY] ⏳ Attempt ${attempts}: no valid code found.`);
      }
      await wait(CONFIG.RETRY_INTERVAL_MS);
    }
  }

  /* =====================================================
     🚀 PASTE SIDE (sora.chatgpt.com)
     ===================================================== */
  async function pasteLoop(){
    let attempts=0;
    while(attempts<CONFIG.MAX_ATTEMPTS){
      attempts++;
      const code=(await GM_getValue("invite_code","")).trim();
      let count=(await GM_getValue("attempt_count",0));

      if(!code){
        if(CONFIG.DEBUG_LOG)console.log("[PASTE] ❌ No code stored yet.");
        await wait(CONFIG.RETRY_INTERVAL_MS);
        continue;
      }

      if(count>=CONFIG.MAX_TRIES_PER_CODE){
        if(CONFIG.DEBUG_LOG)console.log(`[PASTE] ⚠️ Skipping "${code}" — already tried ${count} times.`);
        await wait(CONFIG.RETRY_INTERVAL_MS);
        continue;
      }

      if(CONFIG.DEBUG_LOG)console.log(`[PASTE] 📋 Attempt ${count+1} with code: ${code}`);

      const enterBtn=await waitForEl("button",b=>/enter.*invite.*code/i.test(b.textContent||""));
      if(enterBtn)await fastClick(enterBtn);

      const input=await waitForEl("input",el=>/code|invite|otp/i.test(el.placeholder||"")||el.dataset.inputOtp==="true");
      if(input){
        input.focus();
        setReactValue(input,code);
        input.blur();
      }

      const joinBtn=await waitForEl("button",b=>{
        const t=(b.textContent||"").trim();
        const cls=b.className||"";
        return /join.*sora/i.test(t)&&cls.includes("bg-token-bg-inverse")&&cls.includes("w-full");
      });
      if(joinBtn)await fastClick(joinBtn);

      GM_setValue("attempt_count",count+1);
      if(CONFIG.DEBUG_LOG)console.log(`[PASTE] ✅ Code "${code}" submitted (${count+1}/${CONFIG.MAX_TRIES_PER_CODE})`);
      await wait(CONFIG.RETRY_INTERVAL_MS);
    }
  }

  /* =====================================================
     🧠 ENTRY
     ===================================================== */
  window.addEventListener("load",()=>{
    setTimeout(()=>{
      if(location.hostname.includes("formbiz.biz")) copyLoop();
      else if(location.hostname.includes("sora.chatgpt.com")) pasteLoop();
    },CONFIG.LOAD_DELAY_MS);
  });
})();
