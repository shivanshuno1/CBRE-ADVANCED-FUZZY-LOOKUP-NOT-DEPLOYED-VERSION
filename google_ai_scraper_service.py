import json
import time
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

class GoogleAIScraper:
    def __init__(self, headless=True):
        chrome_options = Options()
        if headless:
            chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option("useAutomationExtension", False)
        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 20)

    def perform_search(self, query):
        try:
            url = f"https://www.google.com/search?q={query.replace(' ', '+')}&udm=14"
            self.driver.get(url)
            selectors = [
                "div[data-mdc-automation-id='gen-aib'] div span",
                "div[jsname='bN97Pc'] span",
                "div[class*='xpdopen'] span",
                "div[data-attrid*='description'] span",
                "div[role='region'] span"
            ]
            for selector in selectors:
                try:
                    self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                    time.sleep(2)
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    texts = [e.text.strip() for e in elements if e.text.strip()]
                    if texts:
                        full = " ".join(texts)
                        full = re.sub(r'\s+', ' ', full).strip()
                        if len(full) > 10:
                            return full
                except:
                    continue
            return None
        except TimeoutException:
            return None
        except Exception as e:
            print(f"Error: {e}")
            return None

    def get_expansion(self, abbreviation, context=""):
        if context:
            query = f"What does '{abbreviation}' stand for in '{context}'? Define the abbreviation."
        else:
            query = f"What does the abbreviation '{abbreviation}' stand for? Define it clearly."
        response = self.perform_search(query)
        if response:
            sentences = response.split('.')
            expansion = sentences[0] if sentences else response
            expansion = re.sub(rf'^{re.escape(abbreviation)}[\s:]*', '', expansion, flags=re.IGNORECASE)
            return expansion.strip()
        return None

    def close(self):
        if self.driver:
            self.driver.quit()

scraper = None

@app.route('/expand', methods=['POST'])
def expand():
    global scraper
    data = request.json
    abbreviations = data.get('abbreviations', [])
    contexts = data.get('contexts', {})
    if not abbreviations:
        return jsonify({'error': 'No abbreviations provided'}), 400
    if scraper is None:
        scraper = GoogleAIScraper(headless=True)
    results = {}
    for abbr in abbreviations:
        ctx = contexts.get(abbr, "")
        expansion = scraper.get_expansion(abbr, ctx)
        results[abbr] = expansion
    return jsonify({'expansions': results})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

@app.route('/shutdown', methods=['POST'])
def shutdown():
    global scraper
    if scraper:
        scraper.close()
        scraper = None
    return jsonify({'status': 'shutdown'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)