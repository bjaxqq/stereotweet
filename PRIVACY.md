# Privacy Policy for Stereotweet

Last updated: November 9, 2025

This privacy policy explains how the Stereotweet browser extension handles your data.

## Data We Collect and Why

Stereotweet processes two types of data to function:

1.  **Google Gemini API Key:**
    * **What it is:** This is your personal API key that you provide to the extension.
    * **How it's used:** The key is stored locally on your device using `chrome.storage.sync`. It is used **only** to make requests to the Google Gemini API on your behalf to analyze tweet content.
    * **Storage:** This key is synced to your Chrome profile so you can use the extension on different devices. It is never sent to us or any other third party.

2.  **Tweet Content:**
    * **What it is:** When you click the "Analyze" button, the extension reads the text content of that specific tweet.
    * **How it's used:** The tweet text is sent to the Google Gemini API for analysis. It is not stored or logged by us.
    * **Caching:** To prevent redundant API calls, the final analysis result (the image and reasoning) is stored locally on your computer for 24 hours using `chrome.storage.local`. This cache is never transmitted.

## Data Sharing

We do not collect, sell, or transfer any of your personal data to any third party. The only external communication is between your browser and the Google Gemini API, which is governed by Google's own privacy policies.

## Contact

If you have any questions about this privacy policy, please open an issue on our GitHub repository.
