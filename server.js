const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const url = require('url');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket sunucusu
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
let clients = [];

wss.on('connection', (ws) => {
  console.log('✅ Web client bağlandı');
  clients.push(ws);
  
  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    console.log('❌ Web client ayrıldı');
  });
});

function broadcastPacket(packet) {
  const message = JSON.stringify(packet);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Proxy endpoint - Tüm istekleri yakala
app.all('/proxy/*', async (req, res) => {
  const startTime = Date.now();
  const targetUrl = req.url.replace('/proxy/', '');
  
  try {
    // İsteği hedef URL'e yönlendir
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: url.parse(targetUrl).host
      },
      data: req.body,
      validateStatus: () => true, // Tüm status kodlarını kabul et
      maxRedirects: 5
    });

    const duration = Date.now() - startTime;

    // Paket bilgilerini topla
    const packet = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      method: req.method,
      url: targetUrl,
      fullUrl: targetUrl,
      protocol: targetUrl.startsWith('https') ? 'HTTPS' : 'HTTP',
      statusCode: response.status,
      statusMessage: response.statusText,
      duration: duration,
      size: JSON.stringify(response.data).length,
      isSecure: targetUrl.startsWith('https'),
      
      requestHeaders: req.headers,
      responseHeaders: response.headers,
      
      requestBody: JSON.stringify(req.body, null, 2),
      responseBody: typeof response.data === 'object' 
        ? JSON.stringify(response.data, null, 2) 
        : String(response.data),
      
      contentType: response.headers['content-type'] || 'unknown',
      isGame: detectGameTraffic(targetUrl, req.headers, response.data),
      
      memoryOffset: '0x' + Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'),
      processId: process.pid,
      threadId: 1
    };

    // WebSocket'e gönder
    broadcastPacket(packet);
    
    console.log(`📦 ${packet.method} ${packet.statusCode} ${targetUrl} - ${duration}ms`);

    // Response'u geri gönder
    res.status(response.status).set(response.headers).send(response.data);

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Proxy error', 
      message: error.message,
      url: targetUrl 
    });
  }
});

function detectGameTraffic(urlString, headers, body) {
  const gameKeywords = [
    'game', 'player', 'match', 'leaderboard', 'shop', 'item',
    'character', 'level', 'achievement', 'inventory', 'quest',
    'battle', 'arena', 'pvp', 'guild', 'clan', 'unity', 'unreal'
  ];
  
  const urlLower = urlString.toLowerCase();
  const bodyString = typeof body === 'object' ? JSON.stringify(body) : String(body);
  const bodyLower = bodyString.toLowerCase();
  const userAgent = (headers['user-agent'] || '').toLowerCase();
  
  return gameKeywords.some(keyword => 
    urlLower.includes(keyword) || 
    bodyLower.includes(keyword) ||
    userAgent.includes('unity') ||
    userAgent.includes('unreal')
  );
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    clients: clients.length,
    uptime: process.uptime() 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        🚀 NETWORK ANALYZER CLOUD VERSION                  ║
║                                                            ║
║  Server:  http://localhost:${PORT}                        ║
║  WebSocket: Same port                                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

🌐 Cloud deploy edildi ve çalışıyor...
  `);
});

process.on('SIGTERM', () => {
  console.log('🛑 Sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});
