// ==UserScript==
// @name         광고 차단기
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  사이트에서 일반적인 광고 요소를 숨기고 차단합니다.
// @author       You
// @match        https://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

  // ---------------------------------------------------------------------
  // 0. 설정
  // ---------------------------------------------------------------------
  const FILTER_URL = 'https://cdn.jsdelivr.net/npm/@filteringdev/filterslists-ko@latest/dist/filterslist-uBlockOrigin-unified.txt';
  const CACHE_KEY = 'adblocker_filter_cache_v1';
  const CACHE_TIME_KEY = 'adblocker_filter_cache_time_v1';
  const CACHE_TTL = 1000 * 60 * 60 * 12; // 12시간마다 갱신
  const host = location.hostname;

  // ---------------------------------------------------------------------
  // 1. 기본 내장 셀렉터/도메인 (필터 목록 로드 전/실패 시 최소 방어선)
  // ---------------------------------------------------------------------
  const baseSelectors = [
    '[class*="ads-"]', '[class*="-ads"]', '[class*="ad-"]', '[class*="-ad"]',
    '[class*="advert"]', '[class^="ad_"]', '[class*="_ad_"]',
    '[id*="ads-"]', '[id*="-ads"]', '[id^="ad_"]', '[id*="google_ads"]',
    '[id*="banner-ad"]', '[class*="banner-ad"]',
    '.ad', '.ads', '.advert', '.advertisement', '.adsbygoogle', '.ad-container',
    '.ad-wrapper', '.ad-slot', '.ad-banner', '.gpt-ad', '.dfp-ad',
    'ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="googletagservices"]',
    'iframe[src*="/ads/"]',
    'iframe[src*="adform.net"]',
    'iframe[id^="google_ads_iframe"]',
    'div[data-ad-slot]',
    'div[data-ad-client]',
    'div[aria-label="Advertisement" i]',
    '.sponsored', '.promoted-content', '.promoted-tweet',
    '#taboola-below-article', '[id^="taboola-"]',
    '.outbrain', '.OUTBRAIN', '[data-widget-id*="outbrain"]'
  ];

  const baseBlockedPatterns = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'pagead2.googlesyndication.com', 'googletagservices.com',
    'amazon-adsystem.com', 'taboola.com', 'outbrain.com', 'ads.yahoo.com',
    'adnxs.com', 'pubmatic.com', 'criteo.com', 'rubiconproject.com', 'openx.net',
    'adsrvr.org', 'moatads.com', 'scorecardresearch.com', 'quantserve.com',
    'adroll.com', 'bidswitch.net', 'casalemedia.com', 'contextweb.com',
    'sharethrough.com', 'smartadserver.com', 'media.net', 'adform.net',
    'yieldmo.com', 'triplelift.com', 'sovrn.com', 'gumgum.com',
    'indexexchange.com', 'yieldlab.net',
    // 한국 광고 네트워크
    'ader.naver.com', 'adcr.naver.com', 'ssp.pstatic.net', 'gads.pstatic.net',
    'adfit.kakao.com', 't1.daumcdn.net/adfit', 'buzzvil.com', 'cauly.co.kr',
    'ads-partners.coupang.com', 'mezzomedia.co.kr', 'adotmob.com'
  ];

  // 동적으로 채워질 것들 (필터 목록에서 파싱)
  let extraGenericSelectors = [];
  let extraDomainSelectors = {}; // { selector: [domain,...] }
  let extraBlockedPatterns = [];

  function allSelectors() {
    const domainOnly = [];
    for (const sel in extraDomainSelectors) {
      const domains = extraDomainSelectors[sel];
      if (domains.some(d => host === d || host.endsWith('.' + d))) {
        domainOnly.push(sel);
      }
    }
    return baseSelectors.concat(extraGenericSelectors, domainOnly);
  }

  function allBlockedPatterns() {
    return baseBlockedPatterns.concat(extraBlockedPatterns);
  }

  function isBlockedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return allBlockedPatterns().some(p => url.includes(p));
  }

  // ---------------------------------------------------------------------
  // 2. CSS 적용 (기본 셀렉터는 즉시 적용, 필터 로드 후 추가 적용)
  // ---------------------------------------------------------------------
  let styleEl = null;
  function applyCss() {
    const css = allSelectors().join(',') + ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; }';
    if (styleEl) {
      styleEl.textContent = css;
    } else {
      styleEl = document.createElement('style');
      styleEl.textContent = css;
      (document.head || document.documentElement).appendChild(styleEl);
    }
  }
  applyCss();

  // ---------------------------------------------------------------------
  // 1-1. [임시 디버그용] 스크립트가 실제로 이 페이지에서 실행되는지 눈으로 확인하기 위한 배지
  //      문제 해결되면 이 블록은 지워도 됩니다.
  // ---------------------------------------------------------------------
  try {
    const showBadge = () => {
      if (!document.body) return;
      if (document.getElementById('__adblocker_debug_badge__')) return;
      const badge = document.createElement('div');
      badge.id = '__adblocker_debug_badge__';
      badge.textContent = '🛡️ 광고차단기 작동중';
      badge.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:#111;color:#0f0;font-size:11px;padding:4px 8px;border-radius:6px;font-family:sans-serif;opacity:0.85;pointer-events:none;';
      document.body.appendChild(badge);
    };
    if (document.body) {
      showBadge();
    } else {
      document.addEventListener('DOMContentLoaded', showBadge);
    }
  } catch (e) {}

  // ---------------------------------------------------------------------
  // 1-2. [임시 진단 모드] iOS Safari엔 개발자도구가 없으므로, 탭한 요소의
  //      실제 HTML을 팝업으로 보여줘서 복사할 수 있게 함.
  //      사용법: 오른쪽 위 "🔍 진단모드" 버튼 탭 → 광고 박스 탭 → 뜨는 텍스트 전체 복사
  //      문제 해결되면 이 블록은 지워도 됩니다.
  // ---------------------------------------------------------------------
  let diagnosticMode = false;
  try {
    const showDiagButton = () => {
      if (!document.body) return;
      if (document.getElementById('__adblocker_diag_btn__')) return;
      const btn = document.createElement('div');
      btn.id = '__adblocker_diag_btn__';
      btn.textContent = '🔍 진단모드';
      btn.style.cssText = 'position:fixed;top:36px;right:8px;z-index:2147483647;background:#222;color:#fff;font-size:11px;padding:4px 8px;border-radius:6px;font-family:sans-serif;';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        diagnosticMode = !diagnosticMode;
        btn.style.background = diagnosticMode ? '#c00' : '#222';
        btn.textContent = diagnosticMode ? '🔍 진단모드 ON (박스를 탭하세요)' : '🔍 진단모드';
      }, true);
      document.body.appendChild(btn);
    };
    if (document.body) {
      showDiagButton();
    } else {
      document.addEventListener('DOMContentLoaded', showDiagButton);
    }

    document.addEventListener('click', function (e) {
      if (!diagnosticMode) return;
      if (e.target.id === '__adblocker_diag_btn__') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 탭한 지점부터 위로 8단계까지, 각 단계의 태그/클래스/텍스트 요약을 한 줄씩 보여줌
      // (어느 단계가 광고 카드 전체 경계인지 파악하기 위함)
      let el = e.target;
      const lines = [];
      for (let i = 0; i < 8 && el; i++) {
        const tag = el.tagName ? el.tagName.toLowerCase() : '?';
        const cls = (typeof el.className === 'string' ? el.className : '') || '';
        const attrs = el.attributes ? Array.from(el.attributes).filter(a => a.name.startsWith('data-v')).map(a => a.name).join(',') : '';
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        lines.push('[' + i + '] <' + tag + (cls ? ' class="' + cls + '"' : '') + (attrs ? ' ' + attrs : '') + '> 글자수:' + text.length + ' | ' + text.slice(0, 50));
        el = el.parentElement;
      }
      window.prompt('아래 내용 전체 선택 후 복사해서 Claude에게 붙여넣어 주세요 (탭한 지점부터 상위 8단계):', lines.join('\n'));
    }, true);
  } catch (e) {}

  // ---------------------------------------------------------------------
  // 3. List-KR 계열 필터 목록 불러와서 파싱 (ABP/uBO 문법 일부 지원)
  //    - "||domain^" 형태  -> 네트워크 차단 도메인
  //    - "domain1,domain2##selector" -> 특정 도메인 전용 셀렉터
  //    - "##selector" -> 전역 셀렉터
  //    - "!"로 시작하거나 "@@", "#@#", "$$", 정규식 등 복잡한 규칙은 건너뜀
  // ---------------------------------------------------------------------
  function parseFilterList(text) {
    const lines = text.split('\n');
    const genericSelectors = [];
    const domainSelectors = {};
    const blockedDomains = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;
      if (line.startsWith('@@')) continue; // 예외 규칙은 스킵 (안전하게 더 차단하는 방향)

      // 네트워크 차단 규칙: ||domain^ 또는 ||domain^$옵션
      const netMatch = line.match(/^\|\|([a-zA-Z0-9.\-_]+)\^/);
      if (netMatch) {
        blockedDomains.push(netMatch[1]);
        continue;
      }

      // 코스메틱(요소 숨김) 규칙: [domain(,domain)*]##selector
      const cssIdx = line.indexOf('##');
      if (cssIdx !== -1 && !line.includes('#@#') && !line.includes('#?#')) {
        const domainPart = line.slice(0, cssIdx);
        const selector = line.slice(cssIdx + 2).trim();
        if (!selector) continue;
        // AdGuard 확장 문법(:has, :contains 등 포함한 것도 최대한 시도, 실패하면 무시됨)
        if (domainPart) {
          const domains = domainPart.split(',').map(d => d.trim()).filter(Boolean);
          if (!domainSelectors[selector]) domainSelectors[selector] = [];
          domainSelectors[selector].push(...domains);
        } else {
          genericSelectors.push(selector);
        }
      }
    }

    return { genericSelectors, domainSelectors, blockedDomains };
  }

  function applyParsedFilters(parsed) {
    extraGenericSelectors = parsed.genericSelectors.slice(0, 3000); // 과도한 규칙 수 방지
    extraDomainSelectors = parsed.domainSelectors;
    extraBlockedPatterns = parsed.blockedDomains;
    try {
      applyCss();
    } catch (e) {
      console.warn('[AdBlocker] CSS 적용 중 일부 규칙 실패(무시됨):', e);
    }
  }

  function loadFilterList() {
    const cached = GM_getValue(CACHE_KEY, null);
    const cachedTime = GM_getValue(CACHE_TIME_KEY, 0);
    const isFresh = cached && (Date.now() - cachedTime < CACHE_TTL);

    if (isFresh) {
      applyParsedFilters(parseFilterList(cached));
    }

    // 캐시가 없거나 오래됐으면 새로 받아오기 (신선하더라도 백그라운드로 갱신은 생략, 트래픽 절약)
    if (!isFresh) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: FILTER_URL,
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) {
            GM_setValue(CACHE_KEY, res.responseText);
            GM_setValue(CACHE_TIME_KEY, Date.now());
            applyParsedFilters(parseFilterList(res.responseText));
          }
        },
        onerror: function () {
          console.warn('[AdBlocker] 필터 목록 다운로드 실패, 기본 규칙만 사용합니다.');
        }
      });
    }
  }

  loadFilterList();

  // ---------------------------------------------------------------------
  // 4. 네트워크 요청 차단: fetch
  // ---------------------------------------------------------------------
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (isBlockedUrl(url)) {
      console.log('[AdBlocker] Blocked fetch:', url);
      return Promise.reject(new Error('Blocked by AdBlocker'));
    }
    return originalFetch.apply(this, arguments);
  };

  // ---------------------------------------------------------------------
  // 5. 네트워크 요청 차단: XMLHttpRequest
  // ---------------------------------------------------------------------
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (isBlockedUrl(url)) {
      console.log('[AdBlocker] Blocked XHR:', url);
      return originalOpen.call(this, method, 'data:text/plain,', ...rest);
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  // ---------------------------------------------------------------------
  // 6. script/iframe의 src 속성 할당 가로채기
  // ---------------------------------------------------------------------
  ['HTMLScriptElement', 'HTMLIFrameElement'].forEach(tagCtor => {
    const proto = window[tagCtor] && window[tagCtor].prototype;
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, 'src', {
      get: desc.get,
      set: function (value) {
        if (isBlockedUrl(value)) {
          console.log('[AdBlocker] Blocked src assignment:', value);
          return;
        }
        return desc.set.call(this, value);
      },
      configurable: true
    });
  });

  // ---------------------------------------------------------------------
  // 7. DOM 변화 감시: 새로 추가되는 광고 요소 / 속성 변경 감지
  // ---------------------------------------------------------------------
  function removeIfAd(node) {
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName === 'SCRIPT' || node.tagName === 'IFRAME') {
      const src = node.src || node.getAttribute('src');
      if (isBlockedUrl(src)) {
        node.remove();
        return;
      }
    }

    allSelectors().forEach(sel => {
      try {
        if (node.matches && node.matches(sel)) {
          node.remove();
          return;
        }
        node.querySelectorAll && node.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    });
  }

  let labelScanTimer = null;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(removeIfAd);
      } else if (m.type === 'attributes' && m.target instanceof HTMLElement) {
        removeIfAd(m.target);
      }
    }
    // 텍스트 라벨 스캔은 비용이 크므로 연속 변화를 묶어서 한 번만 실행(디바운스)
    clearTimeout(labelScanTimer);
    labelScanTimer = setTimeout(() => {
      try { removeAdLabelCards(); } catch (e) {}
    }, 300);
  });

  function startObserving() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'id']
    });
  }
  if (document.documentElement) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }

  // ---------------------------------------------------------------------
  // 8. 팝업 광고 차단
  // ---------------------------------------------------------------------
  const originalWindowOpen = window.open;
  window.open = function (url, ...rest) {
    if (isBlockedUrl(url)) {
      console.log('[AdBlocker] Blocked popup:', url);
      return null;
    }
    return originalWindowOpen.call(window, url, ...rest);
  };

  // ---------------------------------------------------------------------
  // 9-1. [핵심] 텍스트 라벨 기반 탐지: "파워링크" / "광고" 표시 문구를 찾아서
  //      해당 광고 카드 전체를 제거. 클래스명이 암호화돼 있어도 표시광고법상
  //      "광고"라는 문구는 화면에 반드시 노출되어야 하므로 이 방식은 우회가 어려움.
  // ---------------------------------------------------------------------
  const AD_LABEL_TEXTS = ['파워링크', 'PowerLink', '스폰서 링크', '스폰서링크', 'Sponsored'];
  // 단독으로 쓰였을 때만 광고 라벨로 간주(문장 속 단어는 제외)하기 위해 정확히 일치하는 경우만 매칭
  const AD_BADGE_TEXTS = ['광고', 'AD', 'Ad'];
  // 이 문구가 포함된 조상까지 올라가면 광고 카드 범위를 넘어선 것 -> 그 직전 요소를 삭제 대상으로 확정
  const AD_BOUNDARY_RE = /관련\s*문서|이 저작물은|CC BY|분류\s*:|목차/;

  function collectMatchingTextNodes(exactTexts) {
    const results = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue ? node.nodeValue.trim() : '';
      if (t && exactTexts.includes(t)) results.push(node);
    }
    return results;
  }

  function removeAdLabelCards() {
    const labelNodes = collectMatchingTextNodes(AD_LABEL_TEXTS).concat(collectMatchingTextNodes(AD_BADGE_TEXTS));
    const removedContainers = new Set();

    labelNodes.forEach(textNode => {
      let el = textNode.parentElement;
      if (!el || el.dataset && el.dataset.__adblockerHandled) return;

      let target = el;
      let guard = 0;
      while (el && el.parentElement && guard < 10) {
        const parent = el.parentElement;
        const text = parent.innerText || parent.textContent || '';
        if (text.length > 2500 || AD_BOUNDARY_RE.test(text) || parent === document.body) {
          break; // 여기서부터는 광고 카드 범위를 벗어남 -> target(직전 단계)을 삭제 대상으로 확정
        }
        target = parent;
        el = parent;
        guard++;
      }

      // 이미 지운 컨테이너의 하위 요소면 중복 처리 스킵
      if (removedContainers.has(target)) return;
      for (const removed of removedContainers) {
        if (removed.contains(target)) return;
      }

      try {
        target.querySelectorAll && target.querySelectorAll('*').forEach(n => { if (n.dataset) n.dataset.__adblockerHandled = '1'; });
        removedContainers.add(target);
        target.remove();
        console.log('[AdBlocker] Removed ad-label card (text-based):', textNode.nodeValue.trim());
      } catch (e) {}
    });
  }

  // ---------------------------------------------------------------------
  // 9-2. href 기반 휴리스틱 (보조): adcr.naver.com 등 명시적 광고 리다이렉트 링크
  // ---------------------------------------------------------------------
  const adLinkPatterns = [
    /adcr\.naver\.com/i,
    /search\.naver\.com\/.*[?&]where=ad/i,
    /powerlink/i,
    /googleadservices\.com\/pagead/i,
    /google\.com\/aclk/i,
    /googlesyndication\.com/i,
    /adfit\.kakao\.com/i,
    /adx\.coupang\.com/i,
    /ads-partners\.coupang\.com/i
  ];

  function isAdLink(href) {
    if (!href) return false;
    return adLinkPatterns.some(re => re.test(href));
  }

  function removeAdLinkContainers() {
    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach(a => {
      try {
        const href = a.getAttribute('href') || a.href || '';
        if (!isAdLink(href)) return;

        // 광고 링크 하나만 지우면 레이아웃이 깨지거나 불완전하게 남을 수 있으므로
        // 상위 몇 단계까지 올라가서 "카드/박스" 형태로 보이는 컨테이너 전체를 제거 시도.
        // 너무 상위(예: body 근처)까지 올라가면 페이지 전체가 날아갈 수 있어 4단계로 제한.
        let target = a;
        let container = a;
        for (let i = 0; i < 4; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          // 부모가 명백히 페이지 전체 레이아웃(예: main, body, article 최상위)이면 더 안 올라감
          const tag = container.tagName ? container.tagName.toLowerCase() : '';
          if (['body', 'html', 'main', 'article'].includes(tag)) break;
          target = container;
        }
        target.remove();
        console.log('[AdBlocker] Removed obfuscated ad link container:', href);
      } catch (e) {}
    });
  }

  // ---------------------------------------------------------------------
  // 10. 로드 완료 후 + 주기적 재정리 (암호화 해제/지연 렌더링 대비)
  //     namuwiki류는 클라이언트에서 복호화 후 늦게 광고를 주입하는 경우가 많아
  //     한 번만 검사하면 놓칠 수 있어 초반 15초간 반복 검사
  // ---------------------------------------------------------------------
  function cleanup() {
    allSelectors().forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {}
    });
    try { removeAdLabelCards(); } catch (e) {}
    removeAdLinkContainers();
  }

  window.addEventListener('load', cleanup);
  setTimeout(cleanup, 1000);
  setTimeout(cleanup, 3000);

  let rescanCount = 0;
  const rescanInterval = setInterval(() => {
    cleanup();
    rescanCount++;
    if (rescanCount >= 15) clearInterval(rescanInterval); // 15초간 매초 재검사 후 중단(성능 보호)
  }, 1000);

  // href 변경/지연 삽입 대응: 링크 클릭 자체도 한번 더 방어 (혹시 컨테이너 제거를 놓친 경우 대비)
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && isAdLink(a.getAttribute('href') || a.href || '')) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AdBlocker] Blocked click on ad link:', a.href);
    }
  }, true);

})();
