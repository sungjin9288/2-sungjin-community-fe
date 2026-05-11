require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || 'http://localhost:8000';
const FILE_UPLOAD_API_URL = process.env.FILE_UPLOAD_API_URL || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// ===========================
// 보안: Content Security Policy 헤더
// ===========================
app.use((req, res, next) => {
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' " + (API_URL || 'http://localhost:8000') + (FILE_UPLOAD_API_URL ? ' ' + FILE_UPLOAD_API_URL : ''),
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ===========================
// 보안: 인메모리 Rate Limiting (express-rate-limit 없이 구현)
// ===========================
const rateLimitStore = new Map();
function rateLimit({ windowMs = 60_000, max = 100, message = 'Too many requests' } = {}) {
    return (req, res, next) => {
        const key = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
        if (now > entry.resetAt) {
            entry.count = 0;
            entry.resetAt = now + windowMs;
        }
        entry.count += 1;
        rateLimitStore.set(key, entry);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        if (entry.count > max) {
            return res.status(429).json({ error: message });
        }
        return next();
    };
}

// 전역 Rate Limit: 1분에 IP당 200회
app.use(rateLimit({ windowMs: 60_000, max: 200, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }));

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => {
    res.type('image/png');
    res.sendFile(path.join(__dirname, 'public', 'images', 'icons', 'icon-192x192.png'));
});

// ✅ 환경변수를 JavaScript로 제공 (JSON.stringify로 XSS/파싱 오류 방어)
app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const config = {
        API_URL,
        FILE_UPLOAD_API_URL,
        NODE_ENV,
        IS_DEV: NODE_ENV === 'development',
    };
    res.send(`window.ENV_CONFIG = ${JSON.stringify(config)};`);
});

// Blue/Green 배포 시 L7 health check 용도
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 라우팅
app.use('/', routes);

// 404 페이지
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// ===========================
// 글로벌 에러 핸들러 (500)
// ===========================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (!IS_PROD) {
        console.error('[서버 오류]', err);
    }
    if (req.accepts('json')) {
        return res.status(status).json({ error: IS_PROD ? '서버 오류가 발생했습니다.' : err.message });
    }
    return res.status(status).sendFile(path.join(__dirname, 'views', '404.html'));
});

// 서버 시작
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('🎭 아무 말 대잔치 - 프론트엔드 서버');
    console.log('==================================================');
    console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
    console.log(`📡 백엔드 API: ${API_URL}`);
    console.log(`🖼️ 파일 업로드 API: ${FILE_UPLOAD_API_URL || '(disabled)'}`);
    console.log(`🌍 환경: ${NODE_ENV}`);
    console.log('==================================================');
});
