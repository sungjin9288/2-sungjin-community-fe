const test = require('node:test');
const assert = require('node:assert/strict');

global.safeEscape = (str) => String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
global.resolveImageUrl = (url) => url || '/images/default.png';
global.safeTruncate = (str, len) => str;
global.safeFormatDate = (date) => 'mock-date';

const messagesUi = require('../public/js/messages.js');

test('buildSearchUserItemHtml renders nickname and email', () => {
    const html = messagesUi.buildSearchUserItemHtml({
        id: 7,
        nickname: 'tester',
        email: 'tester@example.com',
        profile_image_url: null
    });

    assert.match(html, /tester/);
    assert.match(html, /tester@example\.com/);
});

test('buildConversationItemHtml shows unread badge for active conversation state', () => {
    const html = messagesUi.buildConversationItemHtml({
        partner: {
            id: 2,
            nickname: 'receiver',
            profile_image_url: null
        },
        last_message: {
            content: 'hello world'
        },
        unread_count: 3
    }, 2);

    assert.match(html, /conversation-item active/);
    assert.match(html, /conversation-unread\">3/);
});

test('buildMessageBubbleHtml marks outgoing messages with mine class', () => {
    const html = messagesUi.buildMessageBubbleHtml({
        content: 'dm payload',
        created_at: new Date().toISOString(),
        is_mine: true
    });

    assert.match(html, /message-bubble mine/);
    assert.match(html, /dm payload/);
});
