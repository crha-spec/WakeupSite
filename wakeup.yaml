name: 🚀 Site Uyandırıcı

on:
  schedule:
    # Her 25 dakikada bir çalışır
    - cron: '*/25 * * * *'
  workflow_dispatch:

jobs:
  wakeup:
    runs-on: ubuntu-latest
    steps:
      - name: 🎯 Render sitesini uyandır
        run: |
          echo "🚀 Site uyandırılıyor..."
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://buseferkusursuziste.onrender.com")
          TIME=$(date '+%Y-%m-%d %H:%M:%S')
          
          if [ "$STATUS" = "200" ]; then
            echo "✅ $TIME - Site aktif (Status: $STATUS)"
          else
            echo "⚠️ $TIME - Site yanıt vermiyor (Status: $STATUS)"
          fi
