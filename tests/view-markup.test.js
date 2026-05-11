const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'views', name), 'utf8');
}

test('messages view keeps chat partner image id required by runtime script', () => {
    const html = readView('messages.html');
    assert.match(html, /id="chatPartnerImage"/);
});

test('post detail view keeps author image id required by runtime script', () => {
    const html = readView('post-detail.html');
    assert.match(html, /id="authorImage"/);
});

test('write and edit views keep preview image and remove button ids', () => {
    const writeHtml = readView('write.html');
    const editHtml = readView('post-edit.html');

    assert.match(writeHtml, /id="previewImg"/);
    assert.match(writeHtml, /id="btnRemoveImage"/);
    assert.match(editHtml, /id="previewImg"/);
    assert.match(editHtml, /id="btnRemoveImage"/);
});

test('profile edit view keeps preview image id required by runtime script', () => {
    const html = readView('profile-edit.html');
    assert.match(html, /id="previewImage"/);
});

test('signup view keeps delegated back navigation attribute', () => {
    const html = readView('signup.html');
    assert.match(html, /data-history-back="true"/);
});

test('signup view keeps profile image picker and remove controls', () => {
    const html = readView('signup.html');

    assert.match(html, /id="profilePreview"/);
    assert.match(html, /for="profileImage"/);
    assert.match(html, /id="profileImage"/);
    assert.match(html, /id="btnRemoveProfileImage"/);
    assert.match(html, /autocomplete="new-password"/);
});

test('chatbot view keeps personalization and streaming controls required by runtime script', () => {
    const html = readView('chatbot.html');

    assert.match(html, /id="preferenceSummary"/);
    assert.match(html, /id="preferenceChips"/);
    assert.match(html, /id="currentFilters"/);
    assert.match(html, /id="rankWeightSummary"/);
    assert.match(html, /id="streamToggle"/);
    assert.match(html, /id="btnResetChat"/);
});

test('pwa manifest icon files exist', () => {
    const manifest = JSON.parse(readView('../public/manifest.json'));

    manifest.icons.forEach((icon) => {
        const iconPath = path.join(__dirname, '..', 'public', icon.src);
        assert.equal(fs.existsSync(iconPath), true);
    });
});

test('design system avoids external font dependency', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'design-system.css'), 'utf8');

    assert.doesNotMatch(css, /cdn\.jsdelivr/);
    assert.doesNotMatch(css, /@import\s+url/);
});

test('core views avoid external CDN dependencies', () => {
    ['write.html', 'post-detail.html', 'post-edit.html', 'signup.html', 'chatbot.html'].forEach((viewName) => {
        const html = readView(viewName);
        assert.doesNotMatch(html, /cdn\.jsdelivr/);
    });
});

test('server CSP and favicon route avoid external CDN browser errors', () => {
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

    assert.doesNotMatch(serverJs, /cdn\.jsdelivr/);
    assert.match(serverJs, /app\.get\('\/favicon\.ico'/);
    assert.match(serverJs, /icon-192x192\.png/);
});

test('service worker bypasses backend and other cross-origin requests', () => {
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

    assert.match(swJs, /url\.origin !== self\.location\.origin/);
});
