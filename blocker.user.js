// ==UserScript==
// @name         광고 차단기
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  사이트에서 일반적인 광고 요소를 숨기고 차단합니다.
// @author       You
// @match        https://*/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
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

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(removeIfAd);
      } else if (m.type === 'attributes' && m.target instanceof HTMLElement) {
        removeIfAd(m.target);
      }
    }
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
  // 9. 로드 완료 후 + 3초 뒤(필터 로드 지연 대비) 재정리
  // ---------------------------------------------------------------------
  function cleanup() {
    allSelectors().forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {}
    });
  }
  window.addEventListener('load', cleanup);
  setTimeout(cleanup, 3000);

})();