# Stereotweet - Hack QU Fall 2025

Ever see a post and aren’t sure of its politics? Never again.

Stereotweet is a browser extension that analyzes the political leaning of a tweet and displays the result on a political compass, right in your timeline. It uses the Google Gemini AI to analyze the tweet's text and metadata.

## Contributors

[Brooks Jackson](https://github.com/bjaxqq)
[Hayden Lacy](https://github.com/EarthToHayden)
[Thomas Morrissey](https://github.com/TMM1003)

## Project Overview

This project provides a tool for users on X (formerly Twitter) to get an immediate, AI-powered analysis of the political leaning of any given tweet. By injecting a simple button into the UI, users can request an analysis on-demand. The result is displayed in a clean, embedded card, showing a dot on a political compass, the AI's reasoning, and key terms it identified.

## Features

- **Seamless UI Integration**: Adds an "Analyze" (compass) button directly into the action bar of every tweet on `x.com`.
- **AI-Powered Analysis**: On-click, it sends the tweet's content to the Google Gemini API for political analysis.
- **Visual Feedback**: Displays the result as a red dot plotted on a political compass image, directly below the tweet.
- **Detailed Reasoning**: Includes a one-sentence explanation from the AI for its (x,y) placement, along with key keywords it identified.
- **Secure API Key Storage**: Your Gemini API key is stored safely in `chrome.storage.sync` via the extension's popup.
- **Efficient Caching**: Analyzed tweets are cached in `chrome.storage.local` for 24 hours to prevent redundant API calls and provide instant results on subsequent clicks.
- **Style-Safe Injection**: Uses a Shadow DOM to inject the analysis card, preventing CSS conflicts with X's main website.

## Technologies Used

- **Extension & Frontend**:
  - JavaScript (ESM)
  - HTML & CSS
  - Chrome Extension (Manifest V3)
  - Shadow DOM for style encapsulation

- **Backend & Services**:
  - Google Gemini API for generative AI analysis
  - Chrome Storage API (`sync` for API key, `local` for caching)
  - Chrome Messaging API for `content.js` to `background.js` communication
  - OffscreenCanvas API for server-side image generation

## How It Works

1.  **Inject Button**: The **Content Script (`content.js`)** scans the page as it loads and injects a new compass icon button into each tweet's action bar.

2.  **Scrape & Check Cache**: When a user clicks the button, the script checks `chrome.storage.local` for a cached result for that tweet ID.

3.  **Analyze (Cache Miss)**: If no valid cache is found, the script scrapes the tweet's text and metadata. It sends this data to the **Service Worker (`background.js`)** and displays a loading spinner.

4.  **Call Gemini API**: The service worker retrieves the user's saved Gemini API key and calls the Gemini API with a detailed prompt, requesting coordinates, keywords, and reasoning in a specific JSON format.

5.  **Generate Image**: The service worker uses the `OffscreenCanvas` API to load the base `plane.png` image, draw a red dot at the AI-provided coordinates, and export the new image as a Base64 string.

6.  **Display & Cache**: The final image and text are sent back to the content script, which injects the analysis card into the page. The successful result is then saved to `chrome.storage.local` with a 24-hour timestamp.

## Installation and Setup

1.  **Get a Gemini API Key**:
    - Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create an API key.
    - Ensure the "Generative Language API" is enabled in your Google Cloud project.

2.  **Clone the Repository**:
    ```bash
    git clone [https://github.com/bjaxqq/stereotweet.git](https://github.com/bjaxqq/stereotweet.git)
    cd stereotweet
    ```

3.  **Load in Chrome**:
    - Open Chrome and navigate to `chrome://extensions`.
    - Enable **Developer mode** in the top-right corner.
    - Click **Load unpacked**.
    - Select the `stereotweet` project folder (the one containing `manifest.json`).

4.  **Set Your API Key**:
    - Click the new Stereotweet icon in your Chrome toolbar.
    - Paste your Gemini API key into the text field and click **Save Key**.

5.  **Run**: Navigate to `x.com` to see it in action!
