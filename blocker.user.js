// ==UserScript==
// @name         광고 차단기
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  사이트에서 일반적인 광고 요소를 숨기고 차단합니다.
// @author       You
// @match        https://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

  // ---------------------------------------------------------------------
  // 1. CSS로 광고 요소 즉시 숨기기
  // ---------------------------------------------------------------------
  const adSelectors = [
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
    '.outbrain', '.OUTBRAIN', '[data-widget-id*="outbrain"]',
    '.MPU', '.mpu-ad'
  ];

  GM_addStyle(adSelectors.join(',') + ' { display: none !important; visibility: hidden !important; height: 0 !important; min-height: 0 !important; }');

  // ---------------------------------------------------------------------
  // 2. 차단 대상 광고/트래킹 도메인
  // ---------------------------------------------------------------------
  const blockedPatterns = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'pagead2.googlesyndication.com',
    'googletagservices.com',
    'amazon-adsystem.com', 'taboola.com', 'outbrain.com',
    'ads.yahoo.com', 'adnxs.com', 'pubmatic.com', 'criteo.com',
    'rubiconproject.com', 'openx.net', 'adsrvr.org', 'moatads.com',
    'scorecardresearch.com', 'quantserve.com', 'adroll.com',
    'bidswitch.net', 'casalemedia.com', 'contextweb.com',
    'sharethrough.com', 'smartadserver.com', 'media.net',
    'adform.net', 'yieldmo.com', 'triplelift.com', 'sovrn.com',
    'gumgum.com', 'indexexchange.com', 'yieldlab.net'
  ];

  function isBlockedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return blockedPatterns.some(p => url.includes(p));
  }

  // ---------------------------------------------------------------------
  // 3. 네트워크 요청 차단: fetch
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
  // 4. 네트워크 요청 차단: XMLHttpRequest
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
  // 5. script/iframe의 src 속성 할당 가로채기
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
  // 6. DOM 변화 감시: 새로 추가되는 광고 요소 / 속성 변경 감지
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

    adSelectors.forEach(sel => {
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

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'class', 'id']
  });

  // ---------------------------------------------------------------------
  // 7. 팝업 광고 차단
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
  // 8. 로드 완료 후 한 번 더 정리 (지연 삽입 광고 대응)
  // ---------------------------------------------------------------------
  window.addEventListener('load', () => {
    adSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) {}
    });
  });

})();