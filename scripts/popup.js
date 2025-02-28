// Helper function to get API URL
function getApiUrl(url) {
  if (url.includes('amazon') || url.includes('daraz')) {
    return 'https://api-for-minor-project.onrender.com';
  } else {
    return 'https://api-for-minor-project.onrender.com'; // Default API
  }
}

// Scrape reviews with language support
async function scrapeReviews() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const reviews = [];
            document.querySelectorAll('.mod-reviews').forEach(review => {
              const content = review.querySelector('.content');
              const top = review.querySelector('.top');
              const middle = review.querySelector('.middle');
              if (content) {
                reviews.push({
                  reviewText: content.textContent.trim(),
                  reviewDate: top?.textContent.trim() || '',
                  authorName: middle?.textContent.trim() || ''
                });
              }
            });
            return reviews;
          }
        });
        resolve(results[0].result);
      } catch (error) {
        reject(new Error('Failed to scrape reviews. Try scrolling down first!'));
      }
    });
  });
}

// Main analysis function
async function runAnalysis(elements) {
  try {
    elements.analyzeBtn.disabled = true;
    elements.loadingState.classList.remove('hidden');
    elements.results?.classList.add('hidden');
    document.getElementById('loadingSpinner').classList.remove('hidden');
    document.getElementById('sentimentPlot').classList.add('hidden');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes('amazon') && !tab.url.includes('daraz')) {
      throw new Error('Please navigate to a product page');
    }

    elements.loadingText.textContent = "Analyzing reviews...";
    elements.progressBar.style.width = "50%";

    const apiUrl = getApiUrl(tab.url);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url })
    });

    if (!response.ok) {
      throw new Error(`Server Error: ${response.status}`);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('JSON Parse Error:', text);
      throw new Error('Invalid response from server');
    }

    if (!data.success || !data.data) {
      throw new Error(data.error || 'Analysis failed');
    }

    const results = data.data;

    // Update UI with results
    elements.confidenceScore.textContent = (parseFloat(results.confidence_score) || 0).toFixed(1);
    elements.reviewCount.textContent = parseInt(results.total_reviews) || 0;

    if (results.sentiment_distribution) {
      updateSentimentDisplay(elements, results.sentiment_distribution);
    } else {
      console.warn('Sentiment distribution data is missing from API response.');
    }

    // Update sentiment image
    const timestamp = new Date().getTime();
    document.getElementById('sentimentPlot').src = `${apiUrl}/static/sentiment.png?t=${timestamp}`;
    document.getElementById('sentimentPlot').classList.remove("hidden");
    document.getElementById('loadingSpinner').classList.add("hidden");

    // Update recommendation
    updateRecommendation(elements, parseFloat(results.confidence_score) || 0);

    elements.loadingState.classList.add('hidden');
    elements.results.classList.remove('hidden');
  } catch (error) {
    console.error('Analysis error:', error);
    elements.loadingText.textContent = `Error: ${error.message}`;
    elements.loadingState.classList.add('error');
  } finally {
    elements.analyzeBtn.disabled = false;
  }
}

// Update recommendation text safely
function updateRecommendation(elements, confidenceScore) {
  const recommendationContainer = document.getElementById('recommendations');
  recommendationContainer.textContent = ''; // Clear previous recommendations

  let recommendationText = '';
  let recommendationClass = '';

  if (confidenceScore >= 7) {
    recommendationText = 'Excellent! You can go with this product.';
    recommendationClass = 'bg-green-100 text-green-800';
  } else if (confidenceScore >= 5) {
    recommendationText = 'Average product. Could be better.';
    recommendationClass = 'bg-yellow-100 text-yellow-800';
  } else {
    recommendationText = 'Not recommended. Consider other options.';
    recommendationClass = 'bg-red-100 text-red-800';
  }

  const recommendationDiv = document.createElement('div');
  recommendationDiv.className = `p-4 rounded ${recommendationClass}`;
  recommendationDiv.textContent = recommendationText;

  recommendationContainer.appendChild(recommendationDiv);
}

// Update sentiment display safely
function updateSentimentDisplay(elements, distribution) {
  if (!distribution || typeof distribution !== 'object') {
    console.error('Sentiment distribution data is missing or invalid:', distribution);
    return;
  }

  const container = document.createElement('div');
  container.className = 'stat-card sentiment-chart';

  // Check and set default values to avoid "undefined" errors
  const positive = distribution.positive ? distribution.positive.toFixed(1) : '0';
  const negative = distribution.negative ? distribution.negative.toFixed(1) : '0';
  const neutral = distribution.neutral ? distribution.neutral.toFixed(1) : '0';

  // Instead of innerHTML, create elements safely
  const label = document.createElement('div');
  label.className = 'stat-label';
  label.textContent = 'Sentiment Distribution';

  const sentimentGrid = document.createElement('div');
  sentimentGrid.className = 'sentiment-grid';

  const positiveDiv = document.createElement('div');
  positiveDiv.textContent = `Positive: ${positive}%`;
  positiveDiv.style.color = '#22c55e';

  const negativeDiv = document.createElement('div');
  negativeDiv.textContent = `Negative: ${negative}%`;
  negativeDiv.style.color = '#ef4444';

  const neutralDiv = document.createElement('div');
  neutralDiv.textContent = `Neutral: ${neutral}%`;
  neutralDiv.style.color = '#6b7280';

  sentimentGrid.appendChild(positiveDiv);
  sentimentGrid.appendChild(negativeDiv);
  sentimentGrid.appendChild(neutralDiv);

  container.appendChild(label);
  container.appendChild(sentimentGrid);

  const existingChart = elements.results.querySelector('.sentiment-chart');
  if (existingChart) existingChart.remove();

  elements.results.appendChild(container);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    analyzeBtn: document.getElementById('analyzeBtn'),
    loadingState: document.getElementById('loadingState'),
    loadingText: document.getElementById('loadingText'),
    progressBar: document.getElementById('progressBar'),
    results: document.getElementById('results'),
    confidenceScore: document.getElementById('confidenceScore'),
    reviewCount: document.getElementById('reviewCount')
  };

  if (elements.analyzeBtn) {
    elements.analyzeBtn.addEventListener('click', () => runAnalysis(elements));
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const urlElement = document.getElementById('currentUrl');
    if (urlElement) {
      urlElement.textContent = new URL(tabs[0].url).hostname;
    }
  });
});
