/**
 * AI 챗봇 UI 컨트롤러.
 * 현재 제공 기능: 식당 추천.
 * - 세션별 대화
 * - LocalStorage 기반 개인 취향 프로필
 * - 추천 이유/점수/피드백 렌더링
 * - SSE 스트리밍 응답
 */
(function initChatbot() {
    'use strict';

    const messageList = document.getElementById('messageList');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSend');
    const btnReset = document.getElementById('btnResetChat');
    const charCountEl = document.getElementById('charCount');
    const engineStatus = document.getElementById('engineStatus');
    const statusDot = engineStatus && engineStatus.querySelector('.status-dot');
    const statusText = engineStatus && engineStatus.querySelector('.status-text');
    const chatStatusText = document.getElementById('chatStatusText');
    const rankWeightSummaryEl = document.getElementById('rankWeightSummary');
    const preferenceSummaryEl = document.getElementById('preferenceSummary');
    const preferenceChipsEl = document.getElementById('preferenceChips');
    const currentFiltersEl = document.getElementById('currentFilters');
    const streamToggle = document.getElementById('streamToggle');

    if (!messageList || !chatForm || !chatInput || !btnSend) {
        return;
    }

    const STORAGE_KEYS = Object.freeze({
        sessionId: 'chatbot_session_id',
        profile: 'chatbot_preference_profile',
        feedback: 'chatbot_feedback_map'
    });

    const DEFAULT_PROFILE = Object.freeze({
        regions: [],
        cuisines: [],
        situations: [],
        budget: '',
        avoid: [],
        liked_shops: [],
        disliked_shops: [],
        saved_shops: [],
        liked_categories: [],
        disliked_categories: []
    });

    const REGION_KEYWORDS = ['강남', '역삼', '선릉', '삼성', '청담', '압구정', '성수', '홍대', '합정', '망원', '이태원', '한남', '중구', '을지로', '명동', '종로', '마포', '여의도', '잠실', '양재', '도곡', '신촌', '건대', '코엑스'];
    const CUISINE_KEYWORDS = ['파스타', '이탈리아', '양식', '한식', '중식', '일식', '스시', '초밥', '오마카세', '고기', '삼겹살', '갈비', '소고기', '냉면', '평냉', '라면', '국밥', '해물', '회', '카페', '브런치', '피자', '버거', '치킨', '와인', '주점', '다이닝바', '코스', '파인다이닝'];
    const SITUATION_KEYWORDS = ['데이트', '혼밥', '회식', '가족', '모임', '점심', '저녁', '아침', '소개팅', '기념일', '접대', '가성비', '조용', '분위기', '캐주얼'];
    const AVOID_KEYWORDS = ['웨이팅 긴 곳', '긴 웨이팅', '웨이팅', '노키즈존', '노키즈', '오마카세', '술집 분위기', '시끄러운'];

    let isLoading = false;
    const shopById = new Map();

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // Ignore storage edge cases.
        }
    }

    function uniquePush(list, value, limit = 20) {
        const item = String(value || '').trim();
        if (!item) return list;
        if (!list.includes(item)) list.push(item);
        return list.slice(-limit);
    }

    function normalizeProfile(profile) {
        const normalized = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
        const source = profile && typeof profile === 'object' ? profile : {};
        Object.keys(normalized).forEach((key) => {
            if (Array.isArray(normalized[key])) {
                const values = Array.isArray(source[key]) ? source[key] : [];
                values.forEach((value) => uniquePush(normalized[key], value));
            }
        });
        normalized.budget = String(source.budget || '').trim();
        return normalized;
    }

    function mergeProfile(base, incoming) {
        const merged = normalizeProfile(base);
        const next = normalizeProfile(incoming);
        Object.keys(DEFAULT_PROFILE).forEach((key) => {
            if (Array.isArray(merged[key])) {
                next[key].forEach((value) => uniquePush(merged[key], value));
            }
        });
        if (next.budget) merged.budget = next.budget;
        return merged;
    }

    function getProfile() {
        return normalizeProfile(readJson(STORAGE_KEYS.profile, DEFAULT_PROFILE));
    }

    function setProfile(profile) {
        const normalized = normalizeProfile(profile);
        writeJson(STORAGE_KEYS.profile, normalized);
        renderProfile(normalized);
        return normalized;
    }

    function containsKeyword(message, keyword) {
        if (keyword === '회') {
            return /(^|[^가-힣])회($|[^가-힣])|횟집|생선회/.test(message);
        }
        return message.includes(keyword);
    }

    function extractPreferencesFromMessage(message) {
        const profile = normalizeProfile(DEFAULT_PROFILE);
        REGION_KEYWORDS.forEach((keyword) => {
            if (containsKeyword(message, keyword)) uniquePush(profile.regions, keyword);
        });
        CUISINE_KEYWORDS.forEach((keyword) => {
            if (containsKeyword(message, keyword)) uniquePush(profile.cuisines, keyword);
        });
        SITUATION_KEYWORDS.forEach((keyword) => {
            if (containsKeyword(message, keyword)) uniquePush(profile.situations, keyword);
        });
        AVOID_KEYWORDS.forEach((keyword) => {
            const wantsAvoid = ['싫', '말고', '빼', '피해', '제외', '없는', '적은'].some((item) => message.includes(item))
                || ['웨이팅 긴 곳', '긴 웨이팅', '노키즈존', '노키즈', '술집 분위기'].includes(keyword);
            if (containsKeyword(message, keyword) && wantsAvoid) uniquePush(profile.avoid, keyword);
        });
        if (['고급', '비싸도', '비싸도 됨', '파인다이닝', '기념일'].some((keyword) => message.includes(keyword))) {
            profile.budget = '비싸도 됨';
        } else if (['중간', '보통', '적당'].some((keyword) => message.includes(keyword))) {
            profile.budget = '중간';
        } else if (['가성비', '저렴', '비싸지', '무난', '싼 곳', '싸게'].some((keyword) => message.includes(keyword))) {
            profile.budget = '가성비';
        }
        return profile;
    }

    function profileSummary(profile) {
        const parts = [];
        if (profile.regions.length) parts.push(`지역 ${profile.regions.slice(0, 4).join(', ')}`);
        if (profile.cuisines.length) parts.push(`메뉴 ${profile.cuisines.slice(0, 4).join(', ')}`);
        if (profile.situations.length) parts.push(`상황 ${profile.situations.slice(0, 4).join(', ')}`);
        if (profile.budget) parts.push(`예산 ${profile.budget}`);
        if (profile.liked_categories.length) parts.push(`선호 ${profile.liked_categories.slice(0, 3).join(', ')}`);
        if (profile.avoid.length) parts.push(`회피 ${profile.avoid.slice(0, 3).join(', ')}`);
        return parts.join(' · ') || '아직 저장된 취향이 없습니다.';
    }

    function renderProfile(profile = getProfile()) {
        const summary = profileSummary(profile);
        if (preferenceSummaryEl) preferenceSummaryEl.textContent = summary;
        if (currentFiltersEl) currentFiltersEl.textContent = summary === '아직 저장된 취향이 없습니다.' ? '식당 추천이 필요하면 지역, 메뉴, 분위기를 말해보세요.' : summary;
        if (!preferenceChipsEl) return;

        const chips = [];
        profile.regions.slice(0, 5).forEach((value) => chips.push(['지역', value]));
        profile.cuisines.slice(0, 5).forEach((value) => chips.push(['메뉴', value]));
        profile.situations.slice(0, 4).forEach((value) => chips.push(['상황', value]));
        if (profile.budget) chips.push(['예산', profile.budget]);
        profile.liked_categories.slice(0, 3).forEach((value) => chips.push(['선호', value]));
        profile.avoid.slice(0, 3).forEach((value) => chips.push(['회피', value]));

        preferenceChipsEl.innerHTML = chips.length
            ? chips.map(([label, value]) => `<span class="saved-chip"><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>`).join('')
            : '<span class="empty-chip">대화나 피드백으로 취향이 쌓입니다.</span>';
    }

    function formatDecimal(value, digits = 3) {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(digits) : '-';
    }

    function formatWeightPercent(value) {
        const number = Number(value);
        return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '0%';
    }

    function basename(path) {
        const text = String(path || '').trim();
        if (!text || text === 'default') return 'default';
        return text.split(/[\\/]/).pop() || text;
    }

    function renderRankWeightSummary(rankWeights) {
        if (!rankWeightSummaryEl) return;
        if (!rankWeights || typeof rankWeights !== 'object') {
            rankWeightSummaryEl.hidden = true;
            rankWeightSummaryEl.innerHTML = '';
            return;
        }

        const status = String(rankWeights.status || 'default');
        const source = String(rankWeights.source || 'default');
        const sourceLabel = status === 'artifact' ? '튜닝 가중치 적용' : '기본 랭킹 공식';
        const weights = rankWeights.base_weights && typeof rankWeights.base_weights === 'object'
            ? rankWeights.base_weights
            : {};
        const labels = {
            bm25: '검색',
            intent: '행동로그',
            popularity: '인기도',
            personal: '개인취향'
        };
        const weightItems = Object.entries(labels)
            .filter(([key]) => Number(weights[key]) > 0)
            .map(([key, label]) => `<span><b>${label}</b>${formatWeightPercent(weights[key])}</span>`)
            .join('');

        const promotion = rankWeights.promotion && typeof rankWeights.promotion === 'object'
            ? rankWeights.promotion
            : {};
        const metric = promotion.metric || Object.keys(rankWeights.best_metrics || {})[0] || '';
        const baselineMetrics = rankWeights.baseline_metrics || {};
        const bestMetrics = rankWeights.best_metrics || {};
        const hasMetric = metric && Number.isFinite(Number(bestMetrics[metric]));
        const metricLine = hasMetric
            ? `<div class="rank-metric-line">${escapeHtml(metric)} ${formatDecimal(baselineMetrics[metric])} → ${formatDecimal(bestMetrics[metric])}${Number.isFinite(Number(promotion.improvement)) ? ` (${Number(promotion.improvement) >= 0 ? '+' : ''}${formatDecimal(promotion.improvement)})` : ''}</div>`
            : '';
        const sampleLine = Number.isFinite(Number(rankWeights.samples))
            ? `<div class="rank-sample-line">샘플 ${Number(rankWeights.samples).toLocaleString('ko-KR')}개 · 그룹 ${Number(rankWeights.eligible_groups || 0).toLocaleString('ko-KR')}개</div>`
            : '';

        rankWeightSummaryEl.hidden = false;
        rankWeightSummaryEl.innerHTML = `
            <div class="rank-summary-head">
                <span>${sourceLabel}</span>
                <small>${escapeHtml(basename(source))}</small>
            </div>
            ${weightItems ? `<div class="rank-weight-grid">${weightItems}</div>` : ''}
            ${metricLine}
            ${sampleLine}
        `;
    }

    async function checkStatus() {
        try {
            const res = await getChatbotStatus();
            const data = res && res.data ? res.data : res;
            const engineReady = data && data.recommendation_engine && data.recommendation_engine.ready;
            const shopCount = data && data.recommendation_engine && data.recommendation_engine.shop_count;
            const rankWeights = data && data.recommendation_engine && data.recommendation_engine.rank_weights;
            const provider = data && data.chatbot && data.chatbot.provider;
            const storage = data && data.chatbot && data.chatbot.personalization && data.chatbot.personalization.storage;
            const rankLabel = rankWeights && rankWeights.status === 'artifact' ? '튜닝 적용' : '기본 공식';

            if (engineReady) {
                if (statusDot) statusDot.className = 'status-dot ready';
                if (statusText) statusText.textContent = `준비 완료 (매장 ${shopCount}개 · ${provider || 'mock'} · ${storage || 'memory'} · ${rankLabel})`;
                if (chatStatusText) chatStatusText.textContent = `${shopCount}개 매장 데이터 로드됨`;
                renderRankWeightSummary(rankWeights);
            } else {
                if (statusDot) statusDot.className = 'status-dot error';
                if (statusText) statusText.textContent = '추천 엔진 미로드 (CSV 파일 확인)';
                if (chatStatusText) chatStatusText.textContent = '추천 엔진 초기화 중...';
                renderRankWeightSummary(null);
            }
        } catch (e) {
            if (statusDot) statusDot.className = 'status-dot error';
            if (statusText) statusText.textContent = '백엔드 연결 실패';
            if (chatStatusText) chatStatusText.textContent = '서버에 연결할 수 없습니다';
            renderRankWeightSummary(null);
        }
    }

    function appendUserMessage(text) {
        const el = document.createElement('div');
        el.className = 'user-bubble';
        el.innerHTML = `<div class="bubble-body">${escapeHtml(text)}</div>`;
        messageList.appendChild(el);
        scrollToBottom();
    }

    function createBotShell() {
        const el = document.createElement('div');
        el.className = 'message-bubble bot-bubble';
        el.innerHTML = `
            <div class="bubble-avatar">AI</div>
            <div class="bubble-body">
                <div class="message-content"></div>
                <div class="message-meta" hidden></div>
                <div class="shop-cards" hidden></div>
                <div class="next-questions" hidden></div>
            </div>
        `;
        messageList.appendChild(el);
        scrollToBottom();
        return {
            el,
            content: el.querySelector('.message-content'),
            meta: el.querySelector('.message-meta'),
            cards: el.querySelector('.shop-cards'),
            questions: el.querySelector('.next-questions')
        };
    }

    function appendBotMessage(reply, shops, nextQuestions, memoryScope) {
        const shell = createBotShell();
        shell.content.textContent = reply || '';
        renderMemoryScope(shell.meta, memoryScope);
        renderShopCards(shell.cards, shops || []);
        renderNextQuestions(shell.questions, nextQuestions || []);
        scrollToBottom();
        return shell;
    }

    function memoryScopeLabel(scope) {
        const value = String(scope || '').trim().toLowerCase();
        const labels = {
            user: '계정 메모리',
            account: '계정 메모리',
            session: '브라우저 세션',
            browser: '브라우저 세션',
            local: '로컬 취향',
            memory: '임시 메모리',
            none: ''
        };
        return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value;
    }

    function renderMemoryScope(container, scope) {
        if (!container) return;
        const label = memoryScopeLabel(scope);
        if (!label) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }
        container.hidden = false;
        container.innerHTML = `<span>${escapeHtml(label)}</span>`;
    }

    function renderShopCards(container, shops) {
        if (!container) return;
        if (!shops || shops.length === 0) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }

        shops.forEach((shop) => {
            if (shop && shop.shop_id) shopById.set(String(shop.shop_id), shop);
        });
        container.hidden = false;
        container.innerHTML = shops.map(renderShopCard).join('');
    }

    function renderShopCard(shop) {
        const id = escapeHtml(shop.shop_id || '');
        const name = escapeHtml(shop.shop_name || shop.shop_id || '');
        const addr = escapeHtml(shop.address || '');
        const cats = (shop.categories || []).slice(0, 4).map((c) => `<span class="shop-tag">${escapeHtml(c)}</span>`).join('');
        const menus = (shop.menus || []).slice(0, 3).map((m) => `<span class="shop-tag">${escapeHtml(m)}</span>`).join('');
        const facs = (shop.facilities || []).slice(0, 3).map((f) => `<span class="shop-tag">${escapeHtml(f)}</span>`).join('');
        const reasons = (shop.reasons || []).slice(0, 3).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
        const score = typeof shop.score === 'number' ? `<span class="score-pill">점수 ${shop.score.toFixed(3)}</span>` : '';
        const rank = Number.isFinite(Number(shop.rank)) ? `<span class="rank-pill">#${Number(shop.rank)}</span>` : '';
        const breakdown = renderScoreBreakdown(shop.score_breakdown);
        const formula = shop.ranking_formula ? `<div class="ranking-formula">${escapeHtml(shop.ranking_formula)}</div>` : '';

        return `
            <div class="shop-card" data-shop-id="${id}">
                <div class="shop-card-head">
                    <div class="shop-card-name">${name}</div>
                    <div class="shop-card-badges">${rank}${score}</div>
                </div>
                ${addr ? `<div class="shop-card-row"><span class="label">주소</span>${addr}</div>` : ''}
                ${cats ? `<div class="shop-card-row"><span class="label">종류</span>${cats}</div>` : ''}
                ${menus ? `<div class="shop-card-row"><span class="label">메뉴</span>${menus}</div>` : ''}
                ${facs ? `<div class="shop-card-row"><span class="label">편의</span>${facs}</div>` : ''}
                ${breakdown ? `<div class="score-breakdown">${breakdown}</div>` : ''}
                ${formula}
                ${reasons ? `<ul class="reason-list">${reasons}</ul>` : ''}
                <div class="feedback-actions">
                    <button type="button" data-feedback="like" data-shop-id="${id}">좋아요</button>
                    <button type="button" data-feedback="dislike" data-shop-id="${id}">별로예요</button>
                    <button type="button" data-feedback="save" data-shop-id="${id}">저장</button>
                </div>
            </div>
        `;
    }

    function renderScoreBreakdown(scoreBreakdown) {
        if (!scoreBreakdown || typeof scoreBreakdown !== 'object') return '';
        const labels = {
            bm25: '검색',
            intent: '행동로그',
            popularity: '인기도',
            personal: '개인취향'
        };
        return Object.entries(labels)
            .filter(([key]) => Number.isFinite(Number(scoreBreakdown[key])))
            .map(([key, label]) => `<span><b>${label}</b>${Number(scoreBreakdown[key]).toFixed(2)}</span>`)
            .join('');
    }

    function renderNextQuestions(container, questions) {
        if (!container || !questions || questions.length === 0) {
            if (container) {
                container.hidden = true;
                container.innerHTML = '';
            }
            return;
        }
        container.hidden = false;
        container.innerHTML = questions.slice(0, 3)
            .map((question) => `<button type="button" class="next-question" data-prompt="${escapeHtml(question)}">${escapeHtml(question)}</button>`)
            .join('');
    }

    function appendTypingIndicator() {
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.id = 'typingIndicator';
        el.innerHTML = `
            <div class="bubble-avatar">AI</div>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        `;
        messageList.appendChild(el);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    function scrollToBottom() {
        messageList.scrollTop = messageList.scrollHeight;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getSessionId() {
        let sid = localStorage.getItem(STORAGE_KEYS.sessionId);
        if (!sid) {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                sid = `session_${window.crypto.randomUUID()}`;
            } else {
                sid = 'session_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
            }
            localStorage.setItem(STORAGE_KEYS.sessionId, sid);
        }
        return sid;
    }

    const sessionId = getSessionId();

    function applyServerPayload(data) {
        if (!data) return;
        if (data.profile) {
            setProfile(mergeProfile(getProfile(), data.profile));
        }
    }

    async function hydrateServerProfile() {
        if (typeof getChatbotProfile !== 'function') return;
        try {
            const data = await getChatbotProfile(sessionId);
            if (data && data.profile) {
                setProfile(mergeProfile(getProfile(), data.profile));
            }
        } catch (error) {
            // Local profile remains usable when the server is unavailable.
        }
    }

    async function sendMessage() {
        const message = (chatInput.value || '').trim();
        if (!message || isLoading) return;

        isLoading = true;
        btnSend.disabled = true;
        chatInput.value = '';
        updateCharCount();
        chatInput.style.height = 'auto';

        setProfile(mergeProfile(getProfile(), extractPreferencesFromMessage(message)));
        appendUserMessage(message);

        try {
            if (streamToggle && streamToggle.checked && typeof streamChatWithBot === 'function') {
                const shell = createBotShell();
                await streamChatWithBot(message, sessionId, getProfile(), {
                    chunk(text) {
                        shell.content.textContent += text;
                        scrollToBottom();
                    },
                    done(payload) {
                        const data = payload || {};
                        shell.content.textContent = data.reply || shell.content.textContent;
                        renderMemoryScope(shell.meta, data.memory_scope);
                        renderShopCards(shell.cards, data.recommended || []);
                        renderNextQuestions(shell.questions, data.next_questions || []);
                        applyServerPayload(data);
                    }
                });
            } else {
                appendTypingIndicator();
                const data = await chatWithBot(message, sessionId, getProfile());
                removeTypingIndicator();
                appendBotMessage(data.reply, data.recommended, data.next_questions, data.memory_scope);
                applyServerPayload(data);
            }
        } catch (err) {
            removeTypingIndicator();
            appendBotMessage('죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', []);
        } finally {
            isLoading = false;
            btnSend.disabled = false;
            chatInput.focus();
        }
    }

    async function handleReset() {
        if (isLoading) return;
        if (!confirm('대화 기록과 저장된 취향을 초기화할까요?')) return;

        try {
            await resetChatSession(sessionId);
        } catch (e) {
            // UI reset still proceeds.
        }

        localStorage.removeItem(STORAGE_KEYS.profile);
        localStorage.removeItem(STORAGE_KEYS.feedback);
        setProfile(DEFAULT_PROFILE);
        shopById.clear();

        messageList.innerHTML = `
            <div class="message-bubble bot-bubble">
                <div class="bubble-avatar">AI</div>
                <div class="bubble-body">
                    <div class="message-content">대화 기록과 취향 프로필이 초기화되었습니다. 다시 식당 추천을 요청해보세요.</div>
                </div>
            </div>
        `;
    }

    function updateCharCount() {
        const len = (chatInput.value || '').length;
        if (charCountEl) {
            charCountEl.textContent = len;
            charCountEl.style.color = len >= 480 ? '#ef4444' : '';
        }
    }

    async function handleFeedback(button) {
        const shopId = button.dataset.shopId;
        const action = button.dataset.feedback;
        const shop = shopById.get(shopId);
        if (!shopId || !action) return;

        button.disabled = true;
        const feedback = readJson(STORAGE_KEYS.feedback, {});
        feedback[shopId] = action;
        writeJson(STORAGE_KEYS.feedback, feedback);

        try {
            const data = await submitChatbotFeedback(sessionId, shopId, action, shop);
            if (data && data.profile) {
                setProfile(mergeProfile(getProfile(), data.profile));
            }
            button.closest('.feedback-actions')
                .querySelectorAll('button')
                .forEach((item) => item.classList.toggle('active', item === button));
        } catch (error) {
            button.disabled = false;
        }
    }

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        updateCharCount();
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    if (btnReset) btnReset.addEventListener('click', handleReset);

    document.querySelectorAll('.tip-item').forEach((el) => {
        el.addEventListener('click', () => {
            chatInput.value = el.dataset.prompt || el.textContent.trim();
            updateCharCount();
            chatInput.focus();
            sendMessage();
        });
    });

    document.querySelectorAll('.preference-chip').forEach((button) => {
        button.addEventListener('click', () => {
            const profile = getProfile();
            const type = button.dataset.prefType;
            const value = button.dataset.prefValue;
            if (type === 'budget') {
                profile.budget = value;
            } else if (Array.isArray(profile[type])) {
                uniquePush(profile[type], value);
            }
            setProfile(profile);
        });
    });

    messageList.addEventListener('click', (event) => {
        const feedbackButton = event.target.closest('[data-feedback]');
        if (feedbackButton) {
            handleFeedback(feedbackButton);
            return;
        }

        const nextQuestion = event.target.closest('.next-question');
        if (nextQuestion) {
            chatInput.value = nextQuestion.dataset.prompt || nextQuestion.textContent.trim();
            updateCharCount();
            sendMessage();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        setProfile(getProfile());
        hydrateServerProfile();
        checkStatus();
        chatInput.focus();
    });
})();
