let planeImageBitmap = null;

async function loadAndCachePlaneImage() {
  if (planeImageBitmap) return planeImageBitmap;

  try {
    const imgBlob = await fetch(chrome.runtime.getURL("plane.png")).then((r) =>
      r.blob(),
    );
    planeImageBitmap = await createImageBitmap(imgBlob);
    console.log("BG: Plane.png image loaded and cached.");
    return planeImageBitmap;
  } catch (error) {
    console.error("BG: Failed to load plane.png", error);
    return null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  loadAndCachePlaneImage();
});

async function getApiKey() {
  const items = await chrome.storage.sync.get("geminiApiKey");
  return items.geminiApiKey;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "tweet_info_cohesive") {
    console.log(
      "BG: Received message for tweet:",
      msg.payload.id,
      msg.payload.cohesive,
    );

    (async () => {
      const apiKey = await getApiKey();
      const tweetId = msg.payload.id;

      if (!apiKey) {
        console.error("BG: API Key not set.");
        sendError(
          sender.tab.id,
          tweetId,
          "Error: Gemini API Key is not set. Please set it in the extension options (click the Stereotweet icon in your toolbar).",
        );
        return;
      }

      try {
        const geminiResult = await callGeminiApi(msg.payload.cohesive, apiKey);

        if (!geminiResult || !geminiResult.coordinates) {
          throw new Error(
            "Failed to get valid coordinates from Gemini. Response may be malformed.",
          );
        }
        console.log(
          "BG: Got coordinates from Gemini:",
          geminiResult.coordinates,
        );

        const base64Image = await createAnalyzedImage(
          geminiResult.coordinates.x,
          geminiResult.coordinates.y,
        );

        console.log("BG: Sending new image and text back to content script.");
        sendFinalImage(
          sender.tab.id,
          tweetId,
          base64Image,
          geminiResult.keywords,
          geminiResult.reasoning,
        );
      } catch (error) {
        console.error("BG: Error in background script:", error);

        if (
          error.message.includes("400") ||
          error.message.includes("API key not valid")
        ) {
          sendError(
            sender.tab.id,
            tweetId,
            "Error: Invalid Gemini API Key. Please check it in the extension options.",
          );
        } else {
          sendError(sender.tab.id, tweetId, `Analysis Error: ${error.message}`);
        }
      }
    })();
  }

  return true;
});

async function callGeminiApi(tweetText, apiKey) {
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    You are an expert in analyzing politically-based tweets. Your task is to take the following information from a given tweet and based off of all information and implied information, determine where on the political compass this tweet/this senator would fall.

    Here is the information from the given tweet:
    ${tweetText}

    The political compass image you are using is a grid with a coordinate starting in the top left at (0,0) and a coordinate starting in the bottom right at (20,20). We need this to be precise, so use decimal places to the third position.

    The quadrants are mapped as follows:
    - Top-Left (Red, Authoritarian-Left): x from 0 to 10, y from 0 to 10
    - Top-Right (Blue, Authoritarian-Right): x from 10 to 10, y from 0 to 10
    - Bottom-Left (Green, Libertarian-Left): x from 0 to 10, y from 10 to 20
    - Bottom-Right (Purple, Libertarian-Right): x from 10 to 20, y from 10 to 20

    The center of the compass is at (10, 10).

    **IMPORTANT:** You must format your response *only* as a JSON object, with no other text before or after it. Use this exact structure:
    {
      "coordinates": {
        "x": 10.123,
        "y": 5.456
      },
      "keywords": "keyword one, keyword two, keyword three",
      "reasoning": "A brief, one-sentence explanation for the (x,y) placement based on the tweet's content."
    }
  `;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    let errorDetails = `Status: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      errorDetails = JSON.stringify(errorJson.error || errorJson, null, 2);
    } catch (e) {
      try {
        errorDetails = await response.text();
      } catch (e2) {}
    }
    console.error("BG: Gemini API Error Details:", errorDetails);

    throw new Error(
      `Gemini API request failed with status ${response.status}. Details: ${errorDetails}`,
    );
  }

  const data = await response.json();
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

async function createAnalyzedImage(x, y) {
  const img = await loadAndCachePlaneImage();
  if (!img) {
    throw new Error("Failed to load base compass image.");
  }

  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const X_MAX = 20.0;
  const Y_MAX = 20.0;

  const clampedX = Math.max(0, Math.min(X_MAX, x));
  const clampedY = Math.max(0, Math.min(Y_MAX, y));

  const px = (clampedX / X_MAX) * canvas.width;
  const py = (clampedY / Y_MAX) * canvas.height;

  ctx.fillStyle = "rgba(255, 0, 0, 0.9)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sendFinalImage(tabId, tweetId, base64Image, keywords, reasoning) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: "analysis_result",
      payload: {
        ok: true,
        tweetId: tweetId,
        image_base64: base64Image,
        keywords: keywords,
        reasoning: reasoning,
      },
    });
  }
}

function sendError(tabId, tweetId, errorMessage) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: "analysis_result",
      payload: {
        ok: false,
        tweetId: tweetId,
        error: errorMessage,
      },
    });
  }
}
