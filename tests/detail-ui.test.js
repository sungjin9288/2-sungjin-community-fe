const test = require('node:test');
const assert = require('node:assert/strict');

global.document = {
    addEventListener: () => {},
    getElementById: () => ({ addEventListener: () => {}, style: {} })
};

global.escapeHtml = (value) => String(value ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
global.resolveImageUrl = (value, fallback = '/images/default-profile.png') => value || fallback;
global.formatDate = () => 'mock-date';
global.buildEmptyStateHtml = (message) => `<div>${message}</div>`;

const detailUi = require('../public/js/posts/detail.js');

test('extractComments handles various API response shapes', () => {
    // Standard shape
    assert.deepEqual(
        detailUi.extractComments({ data: [{ id: 1, text: 'hello' }] }),
        [{ id: 1, text: 'hello' }]
    );

    // Array directly
    assert.deepEqual(
        detailUi.extractComments([{ id: 2, text: 'world' }]),
        [{ id: 2, text: 'world' }]
    );

    // Null/undefined
    assert.deepEqual(detailUi.extractComments(null), []);
    assert.deepEqual(detailUi.extractComments(undefined), []);
});

test('countComments includes nested replies', () => {
    const comments = [
        { id: 1, replies: [{ id: 2, replies: [] }] },
        { id: 3, replies: [{ id: 4, replies: [{ id: 5, replies: [] }] }] }
    ];

    assert.equal(detailUi.countComments(comments), 5);
});

test('buildCommentHtml renders reply and report controls for other user comments', () => {
    const html = detailUi.buildCommentHtml({
        id: 11,
        is_author: false,
        content: 'hello',
        author_nickname: 'tester',
        author_profile_image: null,
        created_at: new Date().toISOString(),
        replies: []
    });

    assert.match(html, /btn-comment-reply/);
    assert.match(html, /btn-comment-report/);
});

test('buildCommentHtml marks nested replies with reply class', () => {
    const html = detailUi.buildCommentHtml({
        id: 12,
        is_author: true,
        content: 'reply',
        author_nickname: 'me',
        author_profile_image: null,
        created_at: new Date().toISOString(),
        replies: []
    }, 1);

    assert.match(html, /comment-item is-reply/);
});
