const express = require('express');
const router = express.Router();
const { sendView } = require('../helpers/view');

// 프로필 관리
router.get('/profile/edit', (req, res) => {
    sendView(res, 'profile-edit');
});

router.get('/password/change', (req, res) => {
    sendView(res, 'password-change');
});

router.get('/messages', (req, res) => {
    sendView(res, 'messages');
});

router.get('/chatbot', (req, res) => {
    sendView(res, 'chatbot');
});

router.get('/notifications', (req, res) => {
    sendView(res, 'notifications');
});

router.get('/bookmarks', (req, res) => {
    sendView(res, 'bookmarks');
});

router.get('/blocks', (req, res) => {
    sendView(res, 'blocks');
});

// 정책 페이지
router.get('/terms', (req, res) => {
    sendView(res, 'terms');
});

router.get('/privacy', (req, res) => {
    sendView(res, 'privacy');
});

module.exports = router;
