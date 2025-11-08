function getTweetIdFromUrl(href = location.href) {
  try {
    const u = new URL(href);
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p === "status");
    const id = i >= 0 && /^\d+$/.test(parts[i + 1] || "") ? parts[i + 1] : null;
    return id || null;
  } catch {
    return null;
  }
}

function isTweetDetailUrl(href = location.href) {
  return !!getTweetIdFromUrl(href);
}

function findTweetArticleById(id) {
  if (!id) return null;
  const anchors = document.querySelectorAll(`a[href*="/status/${id}"]`);
  for (const a of anchors) {
    const art = a.closest("article");
    if (art) return art;
  }
  for (const art of document.querySelectorAll(
    "article, article[role='article']",
  )) {
    if (art.querySelector(`a[href*="/status/${id}"]`)) return art;
  }
  return null;
}

function waitForTweetArticle(id, { timeoutMs = 12000, pollMs = 200 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryFind = () => {
      const node = findTweetArticleById(id);
      if (node) {
        cleanup();
        resolve(node);
        return;
      }
      if (Date.now() > deadline) {
        cleanup();
        reject(new Error("Timed out waiting for main tweet article"));
      }
    };
    const mo = new MutationObserver(tryFind);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const interval = setInterval(tryFind, pollMs);
    function cleanup() {
      mo.disconnect();
      clearInterval(interval);
    }
    tryFind();
  });
}

function extractBgImageUrl(el) {
  const bg = getComputedStyle(el).backgroundImage || "";
  const m = bg.match(/url\(["']?(.*?)["']?\)/i);
  return m ? m[1] : "";
}

function waitForTweetImage(article, { timeoutMs = 10000, pollMs = 200 } = {}) {
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
        const onLoad = () =>
          done({ url: img.currentSrc || img.src, source: "img" });
        const onError = () => done(null);
        img.addEventListener("load", onLoad, { once: true });
        img.addEventListener("error", onError, { once: true });
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
      attributeFilter: ["src", "srcset", "style"],
    });
    const interval = setInterval(check, pollMs);
    function cleanup() {
      mo.disconnect();
      clearInterval(interval);
    }
    check();
  });
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

function extractTweetArticleBlock(article) {
  const exact = article.matches?.('article[data-testid="tweet"]')
    ? article
    : null;
  if (exact) return exact;

  const nested = article.querySelector?.('article[data-testid="tweet"]');
  if (nested) return nested;

  return article;
}

function formatTweetInfoString(info) {
  const lines = [
    "Twitter post info",
    "",
    //`- Username: ${info.displayName ? `${info.displayName} (@${info.handle || "unknown"})` : info.handle ? `@${info.handle}` : "Unknown"}`,
    `- Post text: ${info.postText || "(none found)"}`,
    `- Image: ${info.imageUrl || "(none)"}`,
    `- Date: ${info.dateDisplay || info.dateIso || "(unknown)"}`,
  ];
  return lines.join("\n");
}

async function extractAndSendForCurrentTweet() {
  const id = getTweetIdFromUrl();
  if (!id) return;

  const article = await waitForTweetArticle(id);

  const articleBlock = extractTweetArticleBlock(article);
  const articleHTML = articleBlock?.outerHTML || "";

  const { displayName, handle } = extractUser(article);
  const postText = extractTweetText(article);
  const { dateIso, dateDisplay } = extractDate(article);
  const image = await waitForTweetImage(article);
  const imageUrl = image?.url || "";

  const info = {
    displayName,
    handle,
    postText,
    imageUrl,
    dateIso,
    dateDisplay,
  };
  const cohesive = formatTweetInfoString(info);

  console.log("[Tweet Open Detector] Extracted info:", info);
  console.log("[Tweet Open Detector] Cohesive string:\n" + cohesive);
  console.log("[Tweet Open Detector] Article element:", articleBlock);
  console.log("[Tweet Open Detector] Article HTML length:", articleHTML.length);

  chrome.runtime.sendMessage({
    type: "tweet_info_cohesive",
    payload: {
      id,
      url: location.href,
      cohesive,
      fields: info,
      articleHTML,
      ts: Date.now(),
    },
  });
}

function inject(articleEl, imageData, keywords = "", reasoning = "") {
  if (!articleEl || articleEl.dataset.extImgInjected === "1") return;

  const oldImage = document.querySelector(".ext-inline-image-after-article");
  if (oldImage) oldImage.remove();

  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const bg = dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)";
  const br = dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)";
  const txt = dark ? "#e7e9ea" : "#0f1419";
  const sub = dark ? "#8b98a5" : "#536471";

  const host = document.createElement("div");
  host.className = "ext-inline-image-after-article";
  host.style.marginTop = "12px";
  articleEl.insertAdjacentElement("afterend", host);

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .card{max-width:680px;margin:0 auto;padding:12px;border-radius:16px;
            background:${bg};border:1px solid ${br}; color:${txt};}
      .header{display:flex;gap:8px;align-items:center;margin-bottom:8px}
      .chip{font:500 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            color:${sub};border:1px solid ${br};padding:2px 6px;border-radius:999px}
      .img{display:block;width:100%;height:auto;border-radius:12px}
      .caption{font:14px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif}
      #keywords { margin-top: 12px; color: ${sub}; font-style: italic; font-size: 13px; text-align: center; }
      #reasoning { margin-top: 10px; text-align: left; }
    </style>
    <div class="card">
      <div class="header"><span class="chip">Stereotweet</span></div>
      <img class="img" alt="Extension image">
      ${reasoning?.trim() ? `<div class="caption" id="reasoning"></div>` : ``}
      ${keywords?.trim() ? `<div class="caption" id="keywords"></div>` : ``}
    </div>
  `;

  const imgEl = root.querySelector(".img");
  if (imageData instanceof Blob) {
    imgEl.src = URL.createObjectURL(imageData);
  } else {
    imgEl.src = imageData;
  }

  if (reasoning?.trim())
    root.querySelector("#reasoning").textContent = reasoning;
  if (keywords?.trim())
    root.querySelector("#keywords").textContent = `Keywords: ${keywords}`;

  articleEl.dataset.extImgInjected = "1";
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "analysis_result") {
    console.log("Result received from background:", msg.payload);

    if (msg.payload.ok && msg.payload.image_base64) {
      const article = document.querySelector('article[data-testid="tweet"]');
      if (article) {
        const imageUrl = "data:image/png;base64," + msg.payload.image_base64;

        inject(article, imageUrl, msg.payload.keywords, msg.payload.reasoning);
      }
    } else {
      console.error("Analysis failed:", msg.payload.error);
    }
  }
});

(function initUrlWatcher() {
  let lastProcessedId = null;
  const tick = async () => {
    try {
      const isDetail = isTweetDetailUrl();
      if (!isDetail) {
        if (lastProcessedId !== null) lastProcessedId = null;
        return;
      }
      const id = getTweetIdFromUrl();
      if (!id) return;
      if (id !== lastProcessedId) {
        lastProcessedId = id;

        const oldImage = document.querySelector(
          ".ext-inline-image-after-article",
        );
        if (oldImage) oldImage.remove();

        const oldArticle = document.querySelector(
          'article[data-ext-img-injected="1"]',
        );
        if (oldArticle) oldArticle.dataset.extImgInjected = "0";

        await extractAndSendForCurrentTweet();
      }
    } catch (e) {
      console.warn("[Tweet Open Detector] tick error:", e);
    }
  };
  setInterval(tick, 300);
  tick();
})();
