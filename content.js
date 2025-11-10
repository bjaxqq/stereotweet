const STEREOTWEET_BUTTON_ID = "stereotweet-analyze-button";
const STEREOTWEET_CARD_ID = "stereotweet-result-card";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

const ICON_COMPASS = `
<svg fill="currentColor" viewBox="0 0 36 36" version="1.1" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.25em" height="1.25em">
    <path d="M20.82,15.31h0L10.46,9c-.46-.26-1.11.37-.86.84l6.15,10.56,10.56,6.15a.66.66,0,0,0,.84-.86Zm-4,4,3-3,4.55,7.44Z" stroke="currentColor" stroke-width="1"></path>
    <path d="M18,2A16,16,0,1,0,34,18,16,16,0,0,0,18,2Zm1,29.95V29.53H17v2.42A14,14,0,0,1,4.05,19H6.47V17H4.05A14,14,0,0,1,17,4.05V6.47h2V4.05A14,14,0,0,1,31.95,17H29.53v2h2.42A14,14,0,0,1,19,31.95Z" stroke="currentColor" stroke-width="1"></path>
    <rect x="0" y="0" width="36" height="36" fill-opacity="0"/>
</svg>`;

const ICON_SPINNER = `
<svg width="1.25em" height="1.25em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <style>.spinner_V8m1{transform-origin:center;animation:spinner_zKoa 2s linear infinite}.spinner_V8m1 circle{stroke-linecap:round;animation:spinner_YpQs 1.5s ease-in-out infinite}@keyframes spinner_zKoa{100%{transform:rotate(360deg)}}@keyframes spinner_YpQs{0%{stroke-dasharray:0 150;stroke-dashoffset:0}47.5%{stroke-dasharray:42 150;stroke-dashoffset:-16}95%,100%{stroke-dasharray:42 150;stroke-dashoffset:-59}}</style>
  <g class="spinner_V8m1"><circle cx="12" cy="12" r="9.5" fill="none" stroke-width="3" stroke="currentColor"></circle></g>
</svg>`;

function scanAndInjectButtons(rootNode = document) {
  const articles = rootNode.querySelectorAll?.('article[data-testid="tweet"]');
  if (!articles) return;

  for (const article of articles) {
    if (article.dataset.stereotweetInjected) continue;
    article.dataset.stereotweetInjected = "true";

    if (!article.querySelector('div[data-testid="tweetText"]')) continue;

    const actionBar = article.querySelector('div[role="group"]');
    if (!actionBar) continue;

    const tweetId = getTweetIdFromArticle(article);
    if (!tweetId) continue;

    let spacing = "0px";

    const likeButton = actionBar.querySelector('div[data-testid="like"]');
    if (likeButton) {
      const likeWrapper = likeButton.closest("div");
      if (likeWrapper) {
        const likeMargin = getComputedStyle(likeWrapper).marginLeft;
        if (likeMargin && likeMargin !== "0px") {
          spacing = likeMargin;
        }
      }
    }

    const buttonWrapper = createAnalyzeButton(tweetId);
    buttonWrapper.style.marginLeft = spacing;

    actionBar.appendChild(buttonWrapper);
  }
}

function createAnalyzeButton(tweetId) {
  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = STEREOTWEET_BUTTON_ID;
  buttonWrapper.dataset.tweetId = tweetId;

  buttonWrapper.setAttribute("role", "button");
  buttonWrapper.setAttribute("tabindex", "0");
  buttonWrapper.setAttribute("title", "Stereotweet");

  buttonWrapper.style.cssText = `
    color: #546571;
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;
    cursor: pointer;
    width: 34px;
    height: 34px;
    border-radius: 9999px;
    transition: background-color 0.2s;
  `;

  const iconContainer = document.createElement("div");
  iconContainer.innerHTML = ICON_COMPASS;
  iconContainer.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  buttonWrapper.onmouseenter = () => {
    buttonWrapper.style.backgroundColor = "rgba(29, 155, 240, 0.1)";
    buttonWrapper.style.color = "rgb(29, 155, 240)";
  };
  buttonWrapper.onmouseleave = () => {
    buttonWrapper.style.backgroundColor = "transparent";
    buttonWrapper.style.color = "#546571";
  };

  buttonWrapper.addEventListener("click", handleAnalyzeClick);
  buttonWrapper.appendChild(iconContainer);
  return buttonWrapper;
}

async function handleAnalyzeClick(event) {
  event.stopPropagation();
  event.preventDefault();

  const buttonWrapper = event.currentTarget;
  const tweetId = buttonWrapper.dataset.tweetId;
  if (!tweetId) return;

  const article = buttonWrapper.closest('article[data-testid="tweet"]');
  if (!article) return;

  const actionBar = article.querySelector('div[role="group"]');
  if (!actionBar) return;

  const existingCard = document.getElementById(
    `${STEREOTWEET_CARD_ID}-${tweetId}`,
  );
  if (existingCard) {
    existingCard.remove();
    return;
  }

  const cacheKey = `stereotweet_cache_${tweetId}`;
  const data = await chrome.storage.local.get(cacheKey);
  const cachedItem = data[cacheKey];

  if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_DURATION_MS) {
    console.log(`[Stereotweet] Cache HIT for tweet ${tweetId}`);
    const card = injectCard(article, tweetId, actionBar);
    const { image_base64, reasoning, keywords } = cachedItem.payload;
    const imageUrl = "data:image/png;base64," + image_base64;
    card.innerHTML = getSuccessStateHtml(imageUrl, reasoning, keywords);
    return;
  }

  console.log(`[Stereotweet] Cache MISS for tweet ${tweetId}`);
  const iconContainer = buttonWrapper.firstChild;
  if (iconContainer) iconContainer.innerHTML = ICON_SPINNER;
  buttonWrapper.style.color = "rgb(29, 155, 240)";
  buttonWrapper.style.pointerEvents = "none";

  const card = injectCard(article, tweetId, actionBar);
  card.innerHTML = getLoadingStateHtml();

  try {
    const info = await extractTweetInfo(article);
    const cohesive = formatTweetInfoString(info);

    console.log(`[Stereotweet] Analyzing tweet ${tweetId}:`, cohesive);

    chrome.runtime.sendMessage({
      type: "tweet_info_cohesive",
      payload: {
        id: tweetId,
        url: location.href,
        cohesive,
        fields: info,
        ts: Date.now(),
      },
    });
  } catch (error) {
    console.error("[Stereotweet] Error extracting info:", error);
    card.innerHTML = getErrorStateHtml(
      `Error extracting tweet data: ${error.message}`,
    );
    const iconContainer = buttonWrapper.firstChild;
    if (iconContainer) iconContainer.innerHTML = ICON_COMPASS;
    buttonWrapper.style.pointerEvents = "auto";
    buttonWrapper.style.color = "#546571";
    buttonWrapper.style.backgroundColor = "transparent";
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "analysis_result") {
    const { tweetId, ok, image_base64, keywords, reasoning, error } =
      msg.payload;
    if (!tweetId) return;

    const cardHost = document.getElementById(
      `${STEREOTWEET_CARD_ID}-${tweetId}`,
    );
    if (!cardHost) return;

    const card = cardHost.shadowRoot?.querySelector(".card");
    if (!card) return;

    const buttonWrapper = document.querySelector(
      `.${STEREOTWEET_BUTTON_ID}[data-tweet-id="${tweetId}"]`,
    );
    if (buttonWrapper) {
      const iconContainer = buttonWrapper.firstChild;
      if (iconContainer) iconContainer.innerHTML = ICON_COMPASS;
      buttonWrapper.style.pointerEvents = "auto";
      buttonWrapper.style.color = "#546571";
      buttonWrapper.style.backgroundColor = "transparent";
    }

    if (ok) {
      const imageUrl = "data:image/png;base64," + image_base64;
      card.innerHTML = getSuccessStateHtml(imageUrl, reasoning, keywords);

      const cacheKey = `stereotweet_cache_${tweetId}`;
      const cacheItem = {
        payload: msg.payload,
        timestamp: Date.now(),
      };
      chrome.storage.local.set({ [cacheKey]: cacheItem }, () => {
        console.log(`[Stereotweet] Saved result to cache for ${tweetId}`);
      });
    } else {
      card.innerHTML = getErrorStateHtml(error);
    }
  }
});

function getTweetIdFromArticle(article) {
  if (!article) return null;
  const links = article.querySelectorAll('a[href*="/status/"]');
  for (const a of links) {
    const href = a.getAttribute("href");
    const match = href?.match(/\/status\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function extractTweetText(article) {
  const textNode = article.querySelector('[data-testid="tweetText"]');
  return textNode ? textNode.innerText.trim() : "";
}

function extractUser(article) {
  const userBlock = article.querySelector('[data-testid="User-Name"]');
  let displayName = "",
    handle = "";
  if (userBlock) {
    const dispSpan = userBlock.querySelector("span");
    if (dispSpan?.innerText) displayName = dispSpan.innerText.trim();
    const handleSpan = [...userBlock.querySelectorAll("span")].find((s) =>
      s.innerText?.trim().startsWith("@"),
    );
    if (handleSpan) handle = handleSpan.innerText.trim().replace(/^@/, "");
    else {
      const a = userBlock.querySelector('a[href^="/"]');
      if (a?.getAttribute("href")) {
        const p = a.getAttribute("href").split("/").filter(Boolean)[0];
        if (p) handle = p;
      }
    }
  }
  return { displayName, handle };
}

function extractDate(article) {
  const timeEl = article.querySelector("time[datetime]");
  return {
    dateIso: timeEl?.getAttribute("datetime") || "",
    dateDisplay: (timeEl?.textContent || "").trim(),
  };
}

function extractBgImageUrl(el) {
  const bg = getComputedStyle(el).backgroundImage || "";
  const m = bg.match(/url\(["']?(.*?)["']?\)/i);
  return m ? m[1] : "";
}

function waitForTweetImage(article, { timeoutMs = 5000, pollMs = 200 } = {}) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const done = (res) => {
      cleanup();
      resolve(res);
    };
    const check = () => {
      const img = article.querySelector('[data-testid="tweetPhoto"] img');
      if (img) {
        if (img.complete && img.naturalWidth > 0)
          return done({ url: img.currentSrc || img.src, source: "img" });
      }
      const bgDiv = article.querySelector(
        '[data-testid="tweetPhoto"] [style*="background-image"]',
      );
      if (bgDiv) {
        const url = extractBgImageUrl(bgDiv);
        if (url) return done({ url, source: "background" });
      }
      if (Date.now() > deadline) return done(null);
    };
    const mo = new MutationObserver(check);
    mo.observe(article, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ["src", "style"],
    });
    const interval = setInterval(check, pollMs);
    function cleanup() {
      mo.disconnect();
      clearInterval(interval);
    }
    check();
  });
}

async function extractTweetInfo(article) {
  const { displayName, handle } = extractUser(article);
  const postText = extractTweetText(article);
  const { dateIso, dateDisplay } = extractDate(article);
  const image = await waitForTweetImage(article);
  const imageUrl = image?.url || "";

  return { displayName, handle, postText, imageUrl, dateIso, dateDisplay };
}

function formatTweetInfoString(info) {
  const lines = [
    "Twitter post info",
    "",
    `- Post text: ${info.postText || "(none found)"}`,
    `- Image: ${info.imageUrl || "(none)"}`,
    `- Date: ${info.dateDisplay || info.dateIso || "(unknown)"}`,
  ];
  return lines.join("\n");
}

function injectCard(articleEl, tweetId, actionBarEl) {
  const host = document.createElement("div");
  host.id = `${STEREOTWEET_CARD_ID}-${tweetId}`;
  host.style.marginTop = "12px";

  const injectionPoint = actionBarEl.parentElement;
  injectionPoint.insertAdjacentElement("afterend", host);

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    ${getStyles()}
    <div class="card">
    </div>
  `;
  return root.querySelector(".card");
}

function getLoadingStateHtml() {
  return `
    <div class="header">
      <span class="chip">Stereotweet</span>
    </div>
    <div class="loading-text">
      ${ICON_SPINNER.replace("1.25em", "1.5em")}
      <span>Analyzing tweet...</span>
    </div>
  `;
}

function getErrorStateHtml(errorMsg) {
  return `
    <div class="header">
      <span class="chip">Stereotweet</span>
    </div>
    <div class="error-msg">${errorMsg}</div>
  `;
}

function getSuccessStateHtml(imageUrl, reasoning, keywords) {
  return `
    <div class="header">
      <span class="chip">Stereotweet</span>
    </div>
    <div class="content-grid">
      <div class="image-wrapper">
        <img class="img" src="${imageUrl}" alt="Political compass analysis">
      </div>
      <div class="text-wrapper">
        <div class="reasoning-title">Reasoning</div>
        <div class="reasoning-text">${reasoning}</div>
        <div class="keywords-text"><b>Keywords:</b> ${keywords}</div>
      </div>
    </div>
  `;
}

function getStyles() {
  return `
    <style>
      :host {
        --bg: var(--color-base, #ffffff);
        --bg-secondary: var(--color-base-secondary, #f7f9f9);
        --text-primary: var(--color-base-primary, #0f1419);
        --text-secondary: var(--color-base-secondary, #536471);
        --border: var(--color-border, #cfd9de);
        --accent: var(--color-accent, #1d9bf0);
        --error: var(--color-error, #d90000);
        --error-bg: var(--color-error-container, #fdd8d8);

        @media (prefers-color-scheme: dark) {
          --bg: var(--color-base, #000000);
          --bg-secondary: var(--color-base-secondary, #192734);
          --text-primary: var(--color-base-primary, #e7e9ea);
          --text-secondary: var(--color-base-secondary, #8b98a5);
          --border: var(--color-border, #38444d);
          --error: var(--color-error, #f3a6a6);
          --error-bg: var(--color-error-container, #5c0000);
        }
      }

      .card {
        max-width: 680px;
        margin: 0 auto;
        border-radius: 16px;
        background-color: var(--bg);
        border: 1px solid var(--border);
        color: var(--text-primary);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        overflow: hidden;
      }
      .header {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
      }
      .chip {
        font: 500 12px system-ui;
        color: var(--text-secondary);
        font-weight: 600;
      }

      .loading-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 32px;
        color: var(--text-secondary);
        font-style: italic;
        font-size: 14px;
      }
      .loading-text svg { color: var(--accent); }

      .error-msg {
        color: var(--error);
        background-color: var(--error-bg);
        font-weight: 500;
        font-size: 14px;
        padding: 16px;
        text-align: center;
      }

      .content-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 16px;
      }
      @media (max-width: 500px) {
        .content-grid {
          grid-template-columns: 1fr;
        }
      }
      .image-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .img {
        display: block;
        width: 100%;
        max-width: 256px;
        height: auto;
        border-radius: 12px;
        border: 1px solid var(--border);
      }
      .text-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 14px;
        line-height: 1.4;
      }
      .reasoning-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
      }
      .reasoning-text {
        color: var(--text-primary);
      }
      .keywords-text {
        color: var(--text-secondary);
        font-size: 13px;
        margin-top: 8px;
      }
      .keywords-text b {
        color: var(--text-primary);
        font-weight: 600;
      }
    </style>
  `;
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.('article[data-testid="tweet"]')) {
            scanAndInjectButtons(node);
          } else {
            scanAndInjectButtons(node);
          }
        }
      }
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () =>
    scanAndInjectButtons(document.body),
  );
} else {
  scanAndInjectButtons(document.body);
}
