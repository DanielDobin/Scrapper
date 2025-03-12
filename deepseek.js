name: Deepseek Automation

on:
  workflow_dispatch:

jobs:
  run-automation:
    runs-on: ubuntu-22.04

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x

      - name: Install Puppeteer
        run: npm install puppeteer@latest

      - name: Install System Libraries
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libasound2 \
            libatk-bridge2.0-0 \
            libatk1.0-0 \
            libcairo2 \
            libcups2 \
            libgbm1 \
            libgtk-3-0 \
            libnss3 \
            libpango-1.0-0 \
            libxcomposite1 \
            libxdamage1 \
            libxfixes3 \
            libxrandr2 \
            fonts-liberation \
            xdg-utils

      - name: Run Automation
        run: node deepseek.js || true # Continue even if the script fails

      - name: Upload Screenshots
        uses: actions/upload-artifact@v4
        with:
          name: automation-screenshots
          path: |
            loaded_page.png
            before_login.png
            after_login.png
            error.png
