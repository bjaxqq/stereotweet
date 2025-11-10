function saveOptions() {
  const apiKey = document.getElementById("apiKey").value;
  const status = document.getElementById("status");

  if (apiKey) {
    chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
      status.textContent = "API Key saved!";
      document.getElementById("apiKey").value = "";
      document.getElementById("apiKey").placeholder = "API Key is set";
      setTimeout(() => {
        status.textContent = "";
      }, 2000);
    });
  } else {
    chrome.storage.sync.get("geminiApiKey", (items) => {
      if (items.geminiApiKey) {
        status.textContent = "Key is already saved.";
      } else {
        status.textContent = "Please enter a key.";
      }
      setTimeout(() => {
        status.textContent = "";
      }, 2000);
    });
  }
}

function restoreOptions() {
  chrome.storage.sync.get("geminiApiKey", (items) => {
    if (items.geminiApiKey) {
      document.getElementById("apiKey").placeholder = "API Key is set";
    } else {
      document.getElementById("apiKey").placeholder = "API Key is not set";
    }
  });
}

function openGitHub(event) {
  if (event.target.tagName === "A") {
    event.preventDefault();
    chrome.tabs.create({ url: event.target.href });
  }
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save").addEventListener("click", saveOptions);
document.querySelector(".footer").addEventListener("click", openGitHub);
