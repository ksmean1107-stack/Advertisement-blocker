// ==UserScript==
// @name         광고 차단기
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  사이트에서 일반적인 광고 요소를 숨기고 차단합니다.
// @author       You
// @match        https://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

  // 1. 흔한 광고 관련 CSS 셀렉터 숨기기
  const adSelectors = [
    '[class*="ads-"]', '[class*="-ads"]', '[class*="ad-"]', '[class*="-ad"]',
    '[id*="ads-"]', '[id*="-ads"]', '[id*="google_ads"]',
    '.ad', '.ads', '.advert', '.advertisement', '.adsbygoogle',
    'ins.adsbygoogle',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="/ads/"]',
    'div[data-ad-slot]',
    'div[aria-label="Advertisement"]',
    '.sponsored', '.promoted-content',
    '#taboola-below-article',
    '.outbrain', '.OUTBRAIN'
  ];

  GM_addStyle(adSelectors.join(',') + ' { display: none !important; visibility: hidden !important; height: 0 !important; }');

  // 2. 광고/트래킹 관련 도메인으로의 요청 스크립트 자체를 삽입하지 못하게 방지
  const blockedPatterns = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'amazon-adsystem.com',
    'taboola.com',
    'outbrain.com',
    'ads.yahoo.com',
    'adnxs.com',
    'pubmatic.com',
    'criteo.com'
  ];

  function isBlockedUrl(url) {
    if (!url) return false;
    return blockedPatterns.some(p => url.includes(p));
  }

  // <script> / <iframe> 태그가 추가될 때 감시해서 차단 대상이면 제거
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.tagName === 'SCRIPT' || node.tagName === 'IFRAME') {
          const src = node.src || node.getAttribute('src');
          if (isBlockedUrl(src)) {
            node.remove();
            continue;
          }
        }

        // 광고 셀렉터에 해당하는 새로 추가된 요소도 제거
        adSelectors.forEach(sel => {
          try {
            if (node.matches && node.matches(sel)) node.remove();
            node.querySelectorAll && node.querySelectorAll(sel).forEach(el => el.remove());
          } catch (e) {}
        });
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 3. window.open 팝업 광고 일부 차단 (선택적, 필요 없으면 이 블록 삭제)
  const originalOpen = window.open;
  window.open = function (url, ...rest) {
    if (isBlockedUrl(url)) {
      console.log('[AdBlocker] Blocked popup:', url);
      return null;
    }
    return originalOpen.call(window, url, ...rest);
  };

})();
