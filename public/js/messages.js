(function initMessagesPage(globalScope) {
    'use strict';

    const state = {
        me: null,
        selectedUser: null,
        conversations: [],
        messages: [],
        searchResults: [],
        conversationQuery: ''
    };

    function buildSearchUserItemHtml(user) {
        return `
            <img class="search-user-avatar" src="${safeEscape(resolveImageUrl(user.profile_image_url))}" alt="${safeEscape(user.nickname)}" loading="lazy">
            <div>
                <div class="search-user-name">${safeEscape(user.nickname)}</div>
                <div class="search-user-email">${safeEscape(user.email)}</div>
            </div>
            <span class="message-helper">대화 시작</span>
        `;
    }

    function buildConversationItemHtml(conversation, activeUserId) {
        const partner = conversation.partner;
        const isActive = Number(activeUserId) === Number(partner.id);
        const unread = Number(conversation.unread_count || 0);

        return `
            <button class="conversation-item${isActive ? ' active' : ''}" data-user-id="${partner.id}">
                <img class="conversation-avatar" src="${safeEscape(resolveImageUrl(partner.profile_image_url))}" alt="${safeEscape(partner.nickname)}" loading="lazy">
                <div>
                    <div class="conversation-name">${safeEscape(partner.nickname)}</div>
                    <div class="conversation-preview">${safeEscape(safeTruncate((conversation.last_message && conversation.last_message.content) || '', 36))}</div>
                </div>
                ${unread > 0 ? `<span class="conversation-unread">${unread}</span>` : ''}
            </button>
        `;
    }

    function buildMessageBubbleHtml(message) {
        const bubbleClass = message.is_mine ? 'mine' : 'theirs';
        return `
            <article class="message-bubble ${bubbleClass}">
                <div class="message-content">${safeEscape(message.content || '')}</div>
                <div class="message-time">${safeEscape(safeFormatDate(message.created_at || new Date().toISOString()))}</div>
            </article>
        `;
    }

    function setChatPartner(user) {
        state.selectedUser = user || null;

        const name = document.getElementById('chatPartnerName');
        const meta = document.getElementById('chatPartnerMeta');
        const image = document.getElementById('chatPartnerImage');
        const input = document.getElementById('messageInput');
        const button = document.getElementById('btnSendMessage');
        const helper = document.getElementById('messageHelper');
        const blockButton = document.getElementById('btnBlockChatUser');

        if (!user) {
            if (name) name.textContent = '대화 상대를 선택하세요';
            if (meta) meta.textContent = '검색 또는 대화 목록에서 시작할 수 있습니다.';
            if (image) image.src = '/images/default-profile.png';
            if (input) {
                input.disabled = true;
                input.value = '';
            }
            if (button) button.disabled = true;
            if (helper) helper.textContent = '대화 상대를 먼저 선택하세요.';
            if (blockButton) blockButton.disabled = true;
            return;
        }

        if (name) name.textContent = user.nickname || '알 수 없음';
        if (meta) meta.textContent = user.email || '';
        if (image) image.src = resolveImageUrl(user.profile_image_url);
        if (input) input.disabled = false;
        if (button) button.disabled = false;
        if (helper) helper.textContent = `${user.nickname}님에게 메시지를 보냅니다.`;
        if (blockButton) blockButton.disabled = false;
    }

    function renderSearchResults(users) {
        const container = document.getElementById('searchResults');
        if (!container) return;
        state.searchResults = Array.isArray(users) ? users : [];

        if (!state.searchResults.length) {
            container.innerHTML = buildEmptyStateHtml('검색 결과가 없습니다.');
            return;
        }

        container.innerHTML = state.searchResults
            .map((user) => `<button class="search-user-item" data-user-id="${user.id}">${buildSearchUserItemHtml(user)}</button>`)
            .join('');
    }

    function renderConversations() {
        const container = document.getElementById('conversationList');
        if (!container) return;

        if (!state.conversations.length) {
            container.innerHTML = buildEmptyStateHtml('아직 시작한 대화가 없습니다.', 'message');
            return;
        }

        container.innerHTML = state.conversations
            .map((conversation) => buildConversationItemHtml(conversation, state.selectedUser && state.selectedUser.id))
            .join('');
    }

    function renderMessages() {
        const container = document.getElementById('messageList');
        if (!container) return;

        if (!state.selectedUser) {
            container.innerHTML = buildEmptyStateHtml('대화 상대를 선택하면 메시지가 표시됩니다.', 'message');
            return;
        }

        if (!state.messages.length) {
            container.innerHTML = buildEmptyStateHtml('첫 메시지를 보내 대화를 시작하세요.', 'message');
            return;
        }

        container.innerHTML = state.messages.map(buildMessageBubbleHtml).join('');
        container.scrollTop = container.scrollHeight;
    }

    async function refreshConversations() {
        const response = await getConversations(state.conversationQuery);
        state.conversations = extractData(response, []);
        renderConversations();
    }

    async function loadConversations(selectUserId) {
        await refreshConversations();

        if (selectUserId) {
            const matched = state.conversations.find((item) => Number(item.partner.id) === Number(selectUserId));
            if (matched) {
                if (state.selectedUser && Number(state.selectedUser.id) === Number(selectUserId)) {
                    setChatPartner(matched.partner);
                    renderConversations();
                    return;
                }
                await selectConversation(matched.partner);
                return;
            }
        }

        if (!state.selectedUser && state.conversations.length > 0) {
            await selectConversation(state.conversations[0].partner);
        }
    }

    async function selectConversation(user) {
        setChatPartner(user);
        renderConversations();

        const response = await getMessagesWithUser(user.id);
        state.messages = extractData(response, []);
        renderMessages();
        await refreshConversations();
        renderConversations();
    }

    async function handleSearch() {
        const input = document.getElementById('userSearchInput');
        const keyword = input ? input.value.trim() : '';
        const response = await searchMessageUsers(keyword);
        const users = extractData(response, []);
        renderSearchResults(users);
    }

    function bindEvents() {
        const searchButton = document.getElementById('btnUserSearch');
        const searchInput = document.getElementById('userSearchInput');
        const searchResults = document.getElementById('searchResults');
        const conversationList = document.getElementById('conversationList');
        const messageForm = document.getElementById('messageForm');
        const messageInput = document.getElementById('messageInput');
        const btnConversationSearch = document.getElementById('btnConversationSearch');
        const conversationSearchInput = document.getElementById('conversationSearchInput');
        const btnBlockChatUser = document.getElementById('btnBlockChatUser');

        if (searchButton) {
            searchButton.addEventListener('click', async () => {
                await handleSearch();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                await handleSearch();
            });
        }

        if (btnConversationSearch && conversationSearchInput) {
            btnConversationSearch.addEventListener('click', async () => {
                state.conversationQuery = conversationSearchInput.value.trim();
                await loadConversations(state.selectedUser && state.selectedUser.id);
            });
        }

        if (conversationSearchInput) {
            conversationSearchInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                state.conversationQuery = conversationSearchInput.value.trim();
                await loadConversations(state.selectedUser && state.selectedUser.id);
            });
        }

        if (searchResults) {
            searchResults.addEventListener('click', async (event) => {
                const target = event.target.closest('[data-user-id]');
                if (!target) return;
                const userId = Number(target.dataset.userId);
                const nextUser = state.searchResults.find((item) => Number(item.id) === userId);
                if (!nextUser) return;
                await selectConversation(nextUser);
            });
        }

        if (conversationList) {
            conversationList.addEventListener('click', async (event) => {
                const target = event.target.closest('[data-user-id]');
                if (!target) return;
                const userId = Number(target.dataset.userId);
                const conversation = state.conversations.find((item) => Number(item.partner.id) === userId);
                if (!conversation) return;
                await selectConversation(conversation.partner);
            });
        }

        if (messageForm && messageInput) {
            messageForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                if (!state.selectedUser) {
                    showToast('대화 상대를 먼저 선택해 주세요.', { type: 'warning' });
                    return;
                }

                const content = messageInput.value.trim();
                if (!content) {
                    showToast('메시지를 입력해 주세요.', { type: 'warning' });
                    return;
                }

                try {
                    await sendDirectMessage(state.selectedUser.id, content);
                    messageInput.value = '';
                    await selectConversation(state.selectedUser);
                } catch (error) {
                    handleApiError(error, {
                        fallbackMessage: '메시지 전송에 실패했습니다.'
                    });
                }
            });
        }

        if (btnBlockChatUser) {
            btnBlockChatUser.addEventListener('click', async () => {
                if (!state.selectedUser) return;
                const confirmed = showConfirmDialog(`${state.selectedUser.nickname}님을 차단하시겠습니까? 이후 해당 사용자의 글과 메시지를 숨깁니다.`);
                if (!confirmed) return;

                try {
                    await blockUser(state.selectedUser.id);
                    showToast('사용자를 차단했습니다.');
                    state.selectedUser = null;
                    state.messages = [];
                    setChatPartner(null);
                    renderMessages();
                    await refreshConversations();
                    await refreshHeaderIndicators();
                } catch (error) {
                    handleApiError(error, {
                        fallbackMessage: '사용자 차단에 실패했습니다.'
                    });
                }
            });
        }
    }

    async function bootstrapMessagesPage() {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        bindDropdownMenu();
        bindEvents();

        const headerUser = await loadHeaderProfile();
        state.me = headerUser;

        const initialUserId = Number(getQueryParam('userId') || 0);
        await loadConversations(initialUserId || null);
        if (!state.selectedUser && initialUserId) {
            const response = await searchMessageUsers('');
            const users = extractData(response, []);
            const nextUser = users.find((item) => Number(item.id) === initialUserId);
            if (nextUser) {
                await selectConversation(nextUser);
            }
        }
        if (!state.selectedUser) {
            setChatPartner(null);
            renderMessages();
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', bootstrapMessagesPage);
    }

    const publicApi = {
        buildSearchUserItemHtml,
        buildConversationItemHtml,
        buildMessageBubbleHtml
    };

    Object.assign(globalScope, publicApi);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = publicApi;
    }
})(typeof window !== 'undefined' ? window : globalThis);
