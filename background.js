const GOOGLE_API_KEY = "YOUR_API_KEY_HERE";

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "tweet_info_cohesive") {
    console.log(
      "BG: Received message from content script:",
      msg.payload.cohesive,
    );

    callGeminiApi(msg.payload.cohesive)
      .then((geminiResult) => {
        if (!geminiResult || !geminiResult.coordinates) {
          throw new Error("Failed to get coordinates from Gemini.");
        }
        console.log(
          "BG: Got coordinates from Gemini:",
          geminiResult.coordinates,
        );

        return createAnalyzedImage(
          geminiResult.coordinates.x,
          geminiResult.coordinates.y,
        ).then((base64Image) => {
          return { base64Image, geminiResult };
        });
      })
      .then(({ base64Image, geminiResult }) => {
        console.log("BG: Sending new image and text back to content script.");
        sendFinalImage(
          sender.tab.id,
          base64Image,
          geminiResult.keywords,
          geminiResult.reasoning,
        );
      })
      .catch((error) => {
        console.error("BG: Error in background script:", error);
        sendError(sender.tab.id, error.message);
      });
  }
  return true;
});

async function callGeminiApi(tweetText) {
  const prompt = `
    You are an expert in analyzing United States senator tweets. Your task is to take the following information from a given tweet and based off of all information and implied information, determine where on the political compass this tweet/this senator would fall.

    Here is the information from the given tweet:
    ${tweetText}

    The political compass image you are using is a grid with a coordinate starting in the top left at (0,0) and a coordinate starting in the bottom right at (20,20). We need this to be precise, so use decimal places to the third position.

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
      } catch (e2) {
        errorDetails = "Could not parse error response.";
      }
    }
    console.error("BG: Gemini API Error Details:", errorDetails);
    throw new Error(`Gemini API request failed. Details:\n${errorDetails}`);
  }

  const data = await response.json();
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

async function createAnalyzedImage(x, y) {
  const canvas = new OffscreenCanvas(512, 512);
  const ctx = canvas.getContext("2d");

  const imgBlob = await fetch(chrome.runtime.getURL("plane.png")).then((r) =>
    r.blob(),
  );
  const img = await createImageBitmap(imgBlob);

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const X_MAX = 20.0;
  const Y_MAX = 20.0;
  const px = (x / X_MAX) * canvas.width;
  const py = (y / Y_MAX) * canvas.height;

  ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 2;
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

function sendFinalImage(tabId, base64Image, keywords, reasoning) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: "analysis_result",
      payload: {
        ok: true,
        image_base64: base64Image,
        keywords: keywords,
        reasoning: reasoning,
      },
    });
  }
}

function sendError(tabId, errorMessage) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: "analysis_result",
      payload: {
        ok: false,
        error: errorMessage,
      },
    });
  }
}
