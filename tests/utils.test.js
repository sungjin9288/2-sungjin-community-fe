const test = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../public/js/utils.js');

test('formatDate formats correctly', () => {
    const now = new Date();
    assert.equal(utils.formatDate(now.toISOString()), '방금 전');
    assert.equal(utils.formatDate(new Date(now.getTime() - 5 * 60 * 1000).toISOString()), '5분 전');
    assert.equal(utils.formatDate(new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()), '2시간 전');
    assert.equal(utils.formatDate('2022-01-01T00:00:00.000Z'), '2022-01-01');
});

test('truncateText truncates with ellipsis', () => {
    assert.equal(utils.truncateText('Hello World', 5), 'Hello...');
    assert.equal(utils.truncateText('Short', 10), 'Short');
});

test('validateEmail checks email format', () => {
    assert.equal(utils.validateEmail('test@example.com'), true);
    assert.equal(utils.validateEmail('invalid-email'), false);
    assert.equal(utils.validateEmail(''), false);
});

test('validatePasswordComplex checks password requirements', () => {
    assert.deepEqual(utils.validatePasswordComplex('Password123!').valid, true);
    assert.deepEqual(utils.validatePasswordComplex('weak').valid, false);     // too short, missing char types
    assert.deepEqual(utils.validatePasswordComplex('OnlyLetters!!').valid, false); // missing numbers
    assert.deepEqual(utils.validatePasswordComplex('Onlyletters123').valid, false); // missing upper & special
    assert.deepEqual(utils.validatePasswordComplex('NOLOWER12!').valid, false); // missing lower
});

test('validateNickname checks nickname length and spaces', () => {
    assert.equal(utils.validateNickname('tester'), true);
    assert.equal(utils.validateNickname(''), false); // too short
    assert.equal(utils.validateNickname('loooooooongname'), false); // too long
    assert.equal(utils.validateNickname('test r'), false); // space
});

test('validateImageFile checks file type and size', () => {
    const validFile = { size: 1 * 1024 * 1024, type: 'image/jpeg', name: 'test.jpg' };
    const maxFile = { size: 6 * 1024 * 1024, type: 'image/png', name: 'large.png' };
    const invalidTypeFile = { size: 1024, type: 'application/pdf', name: 'doc.pdf' };

    assert.equal(utils.validateImageFile(validFile).valid, true);
    
    const maxResult = utils.validateImageFile(maxFile);
    assert.equal(maxResult.valid, false);
    assert.match(maxResult.message, /크기/);

    const typeResult = utils.validateImageFile(invalidTypeFile);
    assert.equal(typeResult.valid, false);
    assert.match(typeResult.message, /이미지 파일만/);
});

test('parseTagsInput normalizes comma-separated tags', () => {
    assert.deepEqual(utils.parseTagsInput('  react , #frontend,  js '), ['react', 'frontend', 'js']);
    assert.deepEqual(utils.parseTagsInput(''), []);
    assert.deepEqual(utils.parseTagsInput('a,b,c,d,e,f'), ['a', 'b', 'c', 'd', 'e']); // max 5
});

test('normalizePostTags normalizes mixed tag inputs', () => {
    assert.deepEqual(utils.normalizePostTags(['react', '#frontend']), ['react', 'frontend']);
    assert.deepEqual(utils.normalizePostTags([{ name: '#react' }, { name: 'js' }]), ['react', 'js']);
    assert.deepEqual(utils.normalizePostTags([]), []);
});

test('extractData handles API response shapes', () => {
    assert.deepEqual(utils.extractData({ data: { id: 1 } }), { id: 1 });
    assert.deepEqual(utils.extractData({ id: 2 }), { id: 2 });
    assert.deepEqual(utils.extractData(null, []), []);
});

test('escapeHtml handles malicious input', () => {
    assert.equal(utils.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('renderMarkdownContent renders safe local markdown without script execution', () => {
    const html = utils.renderMarkdownContent('# 제목\n- **굵게**\n<script>alert("x")</script>');

    assert.match(html, /<h2>제목<\/h2>/);
    assert.match(html, /<strong>굵게<\/strong>/);
    assert.match(html, /&lt;script&gt;alert/);
    assert.doesNotMatch(html, /<script>/);
});
