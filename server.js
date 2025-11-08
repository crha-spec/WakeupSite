const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const cors = require('cors');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;
const WS_PORT = 8081;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket sunucusu - Gerçek zamanlı veri gönderimi
const wss = new WebSocket.Server({ port: WS_PORT });
let clients = [];

wss.on('connection', (ws) => {
  console.log('✅ Web client bağlandı');
  clients.push(ws);
  
  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    console.log('❌ Web client ayrıldı');
  });
});

// Tüm clientlara paket gönder
function broadcastPacket(packet) {
  const message = JSON.stringify(packet);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// SSL Sertifika oluşturma (HTTPS için)
function generateCertificate(hostname) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  
  const attrs = [{
    name: 'commonName',
    value: hostname
  }];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  
  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  };
}

// Request/Response yakalama
const onProxyReq = (proxyReq, req, res) => {
  const startTime = Date.now();
  req.startTime = startTime;
  
  // Request body'yi kaydet
  if (req.body) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
};

const onProxyRes = (proxyRes, req, res) => {
  const duration = Date.now() - req.startTime;
  let body = [];
  
  proxyRes.on('data', (chunk) => {
    body.push(chunk);
  });
  
  proxyRes.on('end', () => {
    const bodyBuffer = Buffer.concat(body);
    let bodyString = '';
    
    try {
      bodyString = bodyBuffer.toString('utf8');
    } catch (e) {
      bodyString = bodyBuffer.toString('base64');
    }
    
    // Paket bilgilerini topla
    const packet = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      fullUrl: `${req.protocol}://${req.get('host')}${req.url}`,
      protocol: req.protocol.toUpperCase(),
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      duration: duration,
      size: bodyBuffer.length,
      isSecure: req.protocol === 'https',
      
      // Headers
      requestHeaders: req.headers,
      responseHeaders: proxyRes.headers,
      
      // Body
      requestBody: req.body ? JSON.stringify(req.body, null, 2) : '',
      responseBody: bodyString,
      
      // Ekstra bilgiler
      remoteAddress: req.socket.remoteAddress,
      contentType: proxyRes.headers['content-type'] || 'unknown',
      
      // Game detection
      isGame: detectGameTraffic(req.url, req.headers, bodyString),
      
      // Memory info (simulated - gerçek memory access için native module gerekir)
      memoryOffset: '0x' + Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'),
      processId: process.pid,
      threadId: 1
    };
    
    // WebSocket üzerinden gönder
    broadcastPacket(packet);
    
    console.log(`📦 ${packet.method} ${packet.statusCode} ${packet.url} - ${duration}ms`);
  });
};

// Oyun trafiği tespit et
function detectGameTraffic(url, headers, body) {
  const gameKeywords = [
    'game', 'player', 'match', 'leaderboard', 'shop', 'item',
    'character', 'level', 'achievement', 'inventory', 'quest',
    'battle', 'arena', 'pvp', 'guild', 'clan', 'unity', 'unreal'
  ];
  
  const urlLower = url.toLowerCase();
  const bodyLower = body.toLowerCase();
  const userAgent = (headers['user-agent'] || '').toLowerCase();
  
  return gameKeywords.some(keyword => 
    urlLower.includes(keyword) || 
    bodyLower.includes(keyword) ||
    userAgent.includes('unity') ||
    userAgent.includes('unreal')
  );
}

// Proxy middleware
const proxyOptions = {
  target: 'http://localhost',
  changeOrigin: true,
  ws: true,
  onProxyReq: onProxyReq,
  onProxyRes: onProxyRes,
  router: (req) => {
    // Her isteği hedef URL'e yönlendir
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    return `${protocol}://${host}`;
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.writeHead(500, {
      'Content-Type': 'text/plain',
    });
    res.end('Proxy error: ' + err.message);
  }
};

// Tüm istekleri proxy'den geçir
app.use('*', createProxyMiddleware(proxyOptions));

// HTTP sunucusunu başlat
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        🚀 NETWORK ANALYZER PROXY SERVER BAŞLATILDI        ║
║                                                            ║
║  HTTP Proxy:  http://localhost:${PORT}                    ║
║  WebSocket:   ws://localhost:${WS_PORT}                   ║
║                                                            ║
║  Web Interface: http://localhost:${PORT}                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

📝 Tarayıcı proxy ayarlarınızı yapın:
   Proxy: localhost
   Port: ${PORT}

🔍 Tüm network trafiği yakalanıyor...
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Sunucu kapatılıyor...');
  server.close(() => {
    console.log('✅ Sunucu kapatıldı');
    process.exit(0);
  });
});
