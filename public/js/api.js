/**
 * API client and auth session manager (JWT access/refresh).
 * - Unified request wrapper
 * - Bearer token injection
 * - Automatic refresh + single-flight lock for concurrent 401s
 * - Message-code based error normalization
 */
(function initApiClient(globalScope) {
    'use strict';

    const defaultConfig = {
        API_URL: 'http://localhost:8000',
        FILE_UPLOAD_API_URL: '',
        IS_DEV: true,
        NODE_ENV: 'development'
    };

    const envConfig = globalScope.ENV_CONFIG || defaultConfig;
    const API_URL = (envConfig.API_URL || defaultConfig.API_URL).replace(/\/+$/, '');
    const FILE_UPLOAD_API_URL = (envConfig.FILE_UPLOAD_API_URL || defaultConfig.FILE_UPLOAD_API_URL || '').replace(/\/+$/, '');
    const IS_DEV = Boolean(envConfig.IS_DEV);

    const STORAGE_KEYS = Object.freeze({
        accessToken: 'auth.access_token',
        refreshToken: 'auth.refresh_token',
        expiresAt: 'auth.expires_at'
    });

    const SESSION_KEYS = Object.freeze({
        authNotice: 'auth.notice'
    });

    const AUTH_FREE_PATHS = ['/login', '/signup'];

    const MESSAGE_MAP = Object.freeze({
        login_success: '로그인되었습니다.',
        logout_success: '로그아웃되었습니다.',
        token_expired: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        token_invalid: '유효하지 않은 인증 정보입니다. 다시 로그인해 주세요.',
        invalid_token: '유효하지 않은 인증 정보입니다. 다시 로그인해 주세요.',
        unauthorized: '로그인이 필요합니다.',
        forbidden: '이 작업을 수행할 권한이 없습니다.',
        permission_denied: '이 작업을 수행할 권한이 없습니다.',
        validation_error: '입력값을 확인해 주세요.',
        invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
        email_already_exists: '이미 사용 중인 이메일입니다.',
        nickname_already_exists: '이미 사용 중인 닉네임입니다.',
        post_not_found: '게시글을 찾을 수 없습니다.',
        comment_not_found: '댓글을 찾을 수 없습니다.',
        user_not_found: '사용자 정보를 찾을 수 없습니다.',
        image_upload_failed: '이미지 업로드에 실패했습니다.',
        message_sent: '메시지를 전송했습니다.',
        read_conversations_success: '대화 목록을 불러왔습니다.',
        read_messages_success: '메시지를 불러왔습니다.',
        search_message_users_success: '사용자를 불러왔습니다.',
        read_notifications_success: '알림을 불러왔습니다.',
        read_unread_notifications_success: '읽지 않은 알림 수를 불러왔습니다.',
        notifications_read_all: '모든 알림을 읽음 처리했습니다.',
        notification_read: '알림을 읽음 처리했습니다.',
        read_bookmarked_posts_success: '북마크한 게시글을 불러왔습니다.',
        bookmark_created: '게시글을 북마크했습니다.',
        bookmark_deleted: '북마크를 해제했습니다.',
        report_created: '신고가 접수되었습니다.',
        user_blocked: '사용자를 차단했습니다.',
        user_unblocked: '사용자 차단을 해제했습니다.',
        read_blocks_success: '차단한 사용자 목록을 불러왔습니다.',
        read_unread_messages_success: '읽지 않은 메시지 수를 불러왔습니다.',
        chat_success: '추천 결과를 불러왔습니다.',
        session_reset: '대화 기록을 초기화했습니다.',
        feedback_recorded: '추천 피드백을 반영했습니다.',
        profile_loaded: '저장된 챗봇 취향을 불러왔습니다.',
        status_ok: '상태를 확인했습니다.'
    });

    class ApiError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = options.status || 0;
            this.code = options.code || '';
            this.category = options.category || 'unknown';
            this.details = options.details || null;
            this.raw = options.raw;
        }
    }

    function createMemoryStorage() {
        const store = new Map();
        return {
            getItem(key) {
                return store.has(key) ? store.get(key) : null;
            },
            setItem(key, value) {
                store.set(key, String(value));
            },
            removeItem(key) {
                store.delete(key);
            }
        };
    }

    function getStorage(storageName) {
        try {
            if (globalScope[storageName]) {
                return globalScope[storageName];
            }
        } catch (error) {
            // Ignore and fallback.
        }
        return createMemoryStorage();
    }

    const localStore = getStorage('localStorage');
    const sessionStore = getStorage('sessionStorage');

    function debugLog(...args) {
        if (IS_DEV) {
            console.log('[api]', ...args);
        }
    }

    function toApiUrl(pathOrUrl) {
        if (!pathOrUrl) return pathOrUrl;
        if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
        return `${API_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
    }

    function toUploadApiUrl(pathOrUrl) {
        if (!pathOrUrl) return pathOrUrl;
        if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
        if (!FILE_UPLOAD_API_URL) return pathOrUrl;
        return `${FILE_UPLOAD_API_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
    }

    const authState = {
        accessToken: localStore.getItem(STORAGE_KEYS.accessToken),
        refreshToken: localStore.getItem(STORAGE_KEYS.refreshToken),
        expiresAt: Number(localStore.getItem(STORAGE_KEYS.expiresAt) || 0),
        user: null
    };

    let refreshInFlight = null;

    function persistTokens() {
        if (authState.accessToken) {
            localStore.setItem(STORAGE_KEYS.accessToken, authState.accessToken);
        } else {
            localStore.removeItem(STORAGE_KEYS.accessToken);
        }

        if (authState.refreshToken) {
            localStore.setItem(STORAGE_KEYS.refreshToken, authState.refreshToken);
        } else {
            localStore.removeItem(STORAGE_KEYS.refreshToken);
        }

        if (authState.expiresAt) {
            localStore.setItem(STORAGE_KEYS.expiresAt, String(authState.expiresAt));
        } else {
            localStore.removeItem(STORAGE_KEYS.expiresAt);
        }
    }

    function setTokens(tokenPayload = {}) {
        const nextAccessToken = tokenPayload.access_token || tokenPayload.accessToken || null;
        const nextRefreshToken = tokenPayload.refresh_token || tokenPayload.refreshToken || null;
        const expiresIn = Number(tokenPayload.expires_in || tokenPayload.expiresIn || 0);

        authState.accessToken = nextAccessToken;
        authState.refreshToken = nextRefreshToken || authState.refreshToken;
        authState.expiresAt = expiresIn > 0 ? Date.now() + (expiresIn * 1000) : 0;
        persistTokens();
    }

    function clearAuthState() {
        authState.accessToken = null;
        authState.refreshToken = null;
        authState.expiresAt = 0;
        authState.user = null;
        persistTokens();
    }

    function setCurrentUser(user) {
        authState.user = user || null;
    }

    function getCurrentUser() {
        return authState.user;
    }

    function getAuthTokens() {
        return {
            accessToken: authState.accessToken,
            refreshToken: authState.refreshToken,
            expiresAt: authState.expiresAt
        };
    }

    function isAuthenticated() {
        return Boolean(authState.accessToken);
    }

    function isAccessTokenExpired() {
        if (!authState.expiresAt) return false;
        return Date.now() >= (authState.expiresAt - 5000);
    }

    function shouldRedirectToLogin() {
        const pathname = globalScope.location && globalScope.location.pathname
            ? globalScope.location.pathname
            : '';
        return AUTH_FREE_PATHS.every((path) => !pathname.startsWith(path));
    }

    function markAuthNotice(message) {
        try {
            sessionStore.setItem(SESSION_KEYS.authNotice, message);
        } catch (error) {
            // Ignore storage edge-cases.
        }
    }

    function popAuthNotice() {
        try {
            const notice = sessionStore.getItem(SESSION_KEYS.authNotice);
            if (notice) {
                sessionStore.removeItem(SESSION_KEYS.authNotice);
            }
            return notice;
        } catch (error) {
            return null;
        }
    }

    function inferErrorCategory(status, code) {
        if (status === 401 || code === 'token_expired' || code === 'token_invalid' || code === 'invalid_token') {
            return 'auth';
        }
        if (status === 403 || code === 'forbidden' || code === 'permission_denied') {
            return 'forbidden';
        }
        if (status === 400 || status === 422 || code === 'validation_error') {
            return 'validation';
        }
        if (status >= 500) {
            return 'server';
        }
        if (status === 0) {
            return 'network';
        }
        return 'unknown';
    }

    function getMappedMessage(code, fallback, status) {
        if (code && MESSAGE_MAP[code]) {
            return MESSAGE_MAP[code];
        }

        if (status === 401) return '로그인이 필요합니다.';
        if (status === 403) return '이 작업을 수행할 권한이 없습니다.';
        if (status === 400 || status === 422) return '입력값을 확인해 주세요.';
        if (status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

        return fallback || '요청 처리 중 오류가 발생했습니다.';
    }

    function normalizeApiError(payload, status) {
        const code = (payload && (payload.message || payload.code)) || '';
        const serverMessage = payload && (payload.detail || payload.error || payload.message);
        const message = getMappedMessage(code, serverMessage, status);
        return new ApiError(message, {
            status,
            code,
            category: inferErrorCategory(status, code),
            details: payload && payload.data ? payload.data : null,
            raw: payload
        });
    }

    async function parseResponseBody(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return response.json();
        }

        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (error) {
            return { message: text };
        }
    }

    function buildRequestBody(body, headers) {
        if (body === undefined || body === null) {
            return null;
        }

        if (typeof FormData !== 'undefined' && body instanceof FormData) {
            return body;
        }

        if (typeof body === 'string') {
            if (!headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
            return body;
        }

        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        return JSON.stringify(body);
    }

    async function refreshAccessToken() {
        if (!authState.refreshToken) {
            return false;
        }

        if (refreshInFlight) {
            return refreshInFlight;
        }

        refreshInFlight = (async () => {
            const response = await request('/auth/refresh', {
                method: 'POST',
                body: { refresh_token: authState.refreshToken },
                auth: false,
                retry: false,
                suppressAuthRedirect: true
            });

            const tokenData = response && response.data ? response.data : response;
            if (!tokenData || !tokenData.access_token) {
                throw new ApiError('토큰 재발급에 실패했습니다.', {
                    status: 401,
                    code: 'token_invalid',
                    category: 'auth'
                });
            }

            setTokens(tokenData);
            return true;
        })()
            .catch((error) => {
                clearAuthState();
                throw error;
            })
            .finally(() => {
                refreshInFlight = null;
            });

        return refreshInFlight;
    }

    function handleAuthExpiredRedirect() {
        clearAuthState();
        markAuthNotice('로그인이 만료되었습니다. 다시 로그인해 주세요.');

        if (shouldRedirectToLogin() && globalScope.location) {
            globalScope.location.href = '/login';
        }
    }

    async function request(endpoint, options = {}) {
        const {
            method = 'GET',
            headers = {},
            body,
            auth = true,
            optionalAuth = false,
            retry = true,
            suppressAuthRedirect = false
        } = options;

        try {
            const shouldAttachAuth = auth || optionalAuth;
            // Boot restoration shortcut: if access token is missing or expired but refresh token exists.
            if (shouldAttachAuth && authState.refreshToken && (!authState.accessToken || isAccessTokenExpired())) {
                try {
                    await refreshAccessToken();
                } catch (error) {
                    if (optionalAuth && !auth) {
                        clearAuthState();
                    } else if (!suppressAuthRedirect) {
                        handleAuthExpiredRedirect();
                    }
                    if (auth) {
                        throw error;
                    }
                }
            }

            const requestHeaders = { ...headers };
            const requestBody = buildRequestBody(body, requestHeaders);

            if (shouldAttachAuth && authState.accessToken) {
                requestHeaders.Authorization = `Bearer ${authState.accessToken}`;
            }

            const response = await fetch(toApiUrl(endpoint), {
                method,
                headers: requestHeaders,
                body: requestBody
            });

            const payload = await parseResponseBody(response);

            if (response.status === 401 && auth && retry) {
                try {
                    await refreshAccessToken();
                    return request(endpoint, {
                        ...options,
                        retry: false
                    });
                } catch (error) {
                    if (!suppressAuthRedirect) {
                        handleAuthExpiredRedirect();
                    }
                    throw normalizeApiError(payload || { message: 'token_expired' }, 401);
                }
            }

            if (!response.ok) {
                throw normalizeApiError(payload || {}, response.status);
            }

            return payload;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            throw new ApiError('네트워크 연결을 확인해 주세요.', {
                status: 0,
                code: 'network_error',
                category: 'network',
                raw: error
            });
        }
    }

    async function buildOptionalAuthHeaders(headers = {}) {
        const requestHeaders = { ...headers };
        if (authState.refreshToken && (!authState.accessToken || isAccessTokenExpired())) {
            try {
                await refreshAccessToken();
            } catch (error) {
                clearAuthState();
            }
        }
        if (authState.accessToken) {
            requestHeaders.Authorization = `Bearer ${authState.accessToken}`;
        }
        return requestHeaders;
    }

    async function ensureAuthenticated(options = {}) {
        const { redirect = true } = options;

        if (authState.accessToken && !isAccessTokenExpired()) {
            return true;
        }

        if (!authState.refreshToken) {
            if (redirect && shouldRedirectToLogin() && globalScope.location) {
                globalScope.location.href = '/login';
            }
            return false;
        }

        try {
            await refreshAccessToken();
            return true;
        } catch (error) {
            if (redirect && shouldRedirectToLogin() && globalScope.location) {
                handleAuthExpiredRedirect();
            }
            return false;
        }
    }

    async function bootstrapSession() {
        const restored = await ensureAuthenticated({ redirect: false });
        if (!restored) return false;

        try {
            const meResponse = await getMe();
            setCurrentUser(meResponse && meResponse.data ? meResponse.data : meResponse);
        } catch (error) {
            // If /users/me fails after token restoration, caller pages can still retry.
            debugLog('Failed to hydrate current user during bootstrap:', error.message);
        }

        return true;
    }

    function normalizeTags(tags) {
        if (!Array.isArray(tags)) return [];
        return [...new Set(tags
            .map((tag) => String(tag || '').trim().replace(/^#/, ''))
            .filter(Boolean)
        )];
    }

    // =========================
    // Auth API
    // =========================

    async function signup(email, password, nickname) {
        return request('/auth/signup', {
            method: 'POST',
            body: { email, password, nickname },
            auth: false
        });
    }

    async function checkEmail(email) {
        return request('/auth/check-email', {
            method: 'POST',
            body: { email },
            auth: false
        });
    }

    async function login(email, password) {
        const response = await request('/auth/login', {
            method: 'POST',
            body: { email, password },
            auth: false,
            suppressAuthRedirect: true
        });

        const tokenData = response && response.data ? response.data : response;
        if (!tokenData || !tokenData.access_token) {
            throw new ApiError('로그인 응답 형식이 올바르지 않습니다.', {
                status: 500,
                code: 'invalid_login_response',
                category: 'server'
            });
        }

        setTokens(tokenData);

        try {
            const meResponse = await getMe();
            setCurrentUser(meResponse && meResponse.data ? meResponse.data : meResponse);
        } catch (error) {
            debugLog('Failed to hydrate user right after login:', error.message);
        }

        return response;
    }

    async function logout(refreshToken = authState.refreshToken) {
        try {
            await request('/auth/logout', {
                method: 'POST',
                body: refreshToken ? { refresh_token: refreshToken } : {},
                auth: false,
                retry: false,
                suppressAuthRedirect: true
            });
        } catch (error) {
            debugLog('logout request failed (clearing local auth anyway):', error.message);
        } finally {
            clearAuthState();
        }

        return {
            message: 'logout_success',
            data: null
        };
    }

    async function getMe() {
        return request('/users/me');
    }

    // =========================
    // Posts API
    // =========================

    async function getPosts(page = 1, limit = 10, sort = 'latest', tag = '') {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        params.set('sort', sort || 'latest');
        if (tag) {
            params.set('tag', tag);
        }
        return request(`/posts?${params.toString()}`);
    }

    async function getTrendingPosts(days = 7, limit = 5) {
        const params = new URLSearchParams();
        params.set('days', String(days));
        params.set('limit', String(limit));
        return request(`/posts/trending?${params.toString()}`);
    }

    async function getPost(postId) {
        return request(`/posts/${postId}`);
    }

    async function createPost(title, content, imageUrl = null, tags = []) {
        return request('/posts', {
            method: 'POST',
            body: {
                title,
                content,
                image_url: imageUrl || null,
                tags: normalizeTags(tags)
            }
        });
    }

    async function updatePost(postId, title, content, imageUrl = null, tags = undefined) {
        const body = {
            title,
            content,
            image_url: imageUrl || null
        };

        if (Array.isArray(tags)) {
            body.tags = normalizeTags(tags);
        }

        return request(`/posts/${postId}`, {
            method: 'PUT',
            body
        });
    }

    async function deletePost(postId) {
        return request(`/posts/${postId}`, {
            method: 'DELETE'
        });
    }

    async function likePost(postId) {
        return request(`/posts/${postId}/likes`, {
            method: 'POST'
        });
    }

    async function unlikePost(postId) {
        return request(`/posts/${postId}/likes`, {
            method: 'DELETE'
        });
    }

    // =========================
    // Comments API
    // =========================

    async function getComments(postId) {
        return request(`/posts/${postId}/comments`);
    }

    async function createComment(postId, content, parentCommentId = null) {
        return request(`/posts/${postId}/comments`, {
            method: 'POST',
            body: { content, parent_comment_id: parentCommentId }
        });
    }

    async function updateComment(postId, commentId, content) {
        return request(`/posts/${postId}/comments/${commentId}`, {
            method: 'PUT',
            body: { content }
        });
    }

    async function deleteComment(postId, commentId) {
        return request(`/posts/${postId}/comments/${commentId}`, {
            method: 'DELETE'
        });
    }

    // =========================
    // User/Profile API
    // =========================

    async function updateProfile(nickname, profileImageUrl = null) {
        return request('/users/me', {
            method: 'PATCH',
            body: {
                nickname,
                profile_image_url: profileImageUrl
            }
        });
    }

    async function changePassword(currentPassword, newPassword) {
        return request('/users/me/password', {
            method: 'PATCH',
            body: {
                current_password: currentPassword,
                new_password: newPassword
            }
        });
    }

    async function withdrawUser() {
        return request('/users/me', {
            method: 'DELETE'
        });
    }

    // =========================
    // Direct Messages API
    // =========================

    async function searchMessageUsers(query = '') {
        const params = new URLSearchParams();
        if (query && String(query).trim()) {
            params.set('query', String(query).trim());
        }
        const suffix = params.toString() ? `?${params.toString()}` : '';
        return request(`/messages/users${suffix}`);
    }

    async function getConversations(query = '') {
        const params = new URLSearchParams();
        if (query && String(query).trim()) {
            params.set('query', String(query).trim());
        }
        const suffix = params.toString() ? `?${params.toString()}` : '';
        return request(`/messages/conversations${suffix}`);
    }

    async function getMessagesWithUser(userId) {
        return request(`/messages/with/${userId}`);
    }

    async function getUnreadMessageCount() {
        return request('/messages/unread-count');
    }

    async function sendDirectMessage(recipientId, content) {
        return request('/messages', {
            method: 'POST',
            body: {
                recipient_id: recipientId,
                content
            }
        });
    }

    // =========================
    // Notifications API
    // =========================

    async function getNotifications(unreadOnly = false, limit = 30) {
        const params = new URLSearchParams();
        if (unreadOnly) params.set('unread_only', 'true');
        params.set('limit', String(limit));
        return request(`/notifications?${params.toString()}`);
    }

    async function getUnreadNotificationCount() {
        return request('/notifications/unread-count');
    }

    async function markNotificationRead(notificationId) {
        return request(`/notifications/${notificationId}/read`, {
            method: 'POST'
        });
    }

    async function markAllNotificationsRead() {
        return request('/notifications/read-all', {
            method: 'POST'
        });
    }

    // =========================
    // Bookmark / Moderation API
    // =========================

    async function getBookmarkedPosts(page = 1, limit = 20) {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        return request(`/posts/bookmarks/me?${params.toString()}`);
    }

    async function bookmarkPost(postId) {
        return request(`/posts/${postId}/bookmarks`, {
            method: 'POST'
        });
    }

    async function unbookmarkPost(postId) {
        return request(`/posts/${postId}/bookmarks`, {
            method: 'DELETE'
        });
    }

    async function createReport(targetType, targetId, reason = 'etc', description = '') {
        return request('/reports', {
            method: 'POST',
            body: {
                target_type: targetType,
                target_id: targetId,
                reason,
                description
            }
        });
    }

    async function getBlockedUsers() {
        return request('/blocks/users');
    }

    async function blockUser(userId) {
        return request(`/blocks/users/${userId}`, {
            method: 'POST'
        });
    }

    async function unblockUser(userId) {
        return request(`/blocks/users/${userId}`, {
            method: 'DELETE'
        });
    }

    // =========================
    // Chatbot API
    // =========================

    /**
     * 식당 추천 챗봇에 메시지를 전송한다.
     * @param {string} message - 사용자 입력
     * @param {string} [sessionId] - 세션 격리용 고유 ID
     * @returns {Promise<{reply: string, recommended: Array}>}
     */
    async function chatWithBot(message, sessionId, profile) {
        const body = { message: String(message || '').trim() };
        if (sessionId) body.session_id = sessionId;
        if (profile) body.profile = profile;
        const res = await request('/chatbot/chat', {
            method: 'POST',
            body,
            auth: false,
            optionalAuth: true
        });
        return res && res.data ? res.data : res;
    }

    async function streamChatWithBot(message, sessionId, profile, handlers = {}) {
        const body = { message: String(message || '').trim() };
        if (sessionId) body.session_id = sessionId;
        if (profile) body.profile = profile;

        const response = await fetch(toApiUrl('/chatbot/chat/stream'), {
            method: 'POST',
            headers: await buildOptionalAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const payload = await parseResponseBody(response);
            throw normalizeApiError(payload || {}, response.status);
        }

        if (!response.body || !response.body.getReader) {
            const payload = await parseResponseBody(response);
            const data = payload && payload.data ? payload.data : payload;
            if (handlers.done) handlers.done(data);
            return data;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let lastPayload = null;

        function dispatchEventBlock(block) {
            const lines = block.split('\n');
            let eventName = 'message';
            const dataLines = [];
            lines.forEach((line) => {
                if (line.startsWith('event:')) eventName = line.slice(6).trim();
                if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            });
            if (!dataLines.length) return;
            const rawData = dataLines.join('\n');
            let parsed = rawData;
            try {
                parsed = JSON.parse(rawData);
            } catch (error) {
                // Keep raw text.
            }
            if (eventName === 'chunk' && handlers.chunk) {
                handlers.chunk(String(parsed || ''));
            }
            if (eventName === 'error') {
                const payload = parsed && typeof parsed === 'object'
                    ? parsed
                    : { message: String(parsed || 'stream_error') };
                throw normalizeApiError(payload, response.status || 500);
            }
            if (eventName === 'done') {
                lastPayload = parsed;
                if (handlers.done) handlers.done(parsed);
            }
        }

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';
            blocks.forEach(dispatchEventBlock);
        }
        if (buffer.trim()) dispatchEventBlock(buffer);
        return lastPayload;
    }

    /**
     * 챗봇 대화 기록을 초기화한다.
     * @param {string} [sessionId] - 세션 ID
     */
    async function resetChatSession(sessionId) {
        const body = {};
        if (sessionId) body.session_id = sessionId;
        return request('/chatbot/reset', {
            method: 'POST',
            body: Object.keys(body).length > 0 ? body : undefined,
            auth: false,
            optionalAuth: true
        });
    }

    /**
     * 챗봇/추천 엔진 초기화 상태를 확인한다.
     */
    async function getChatbotStatus() {
        return request('/chatbot/status', { auth: false });
    }

    async function getChatbotProfile(sessionId) {
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const res = await request(`/chatbot/profile${suffix}`, {
            auth: false,
            optionalAuth: true
        });
        return res && res.data ? res.data : res;
    }

    async function submitChatbotFeedback(sessionId, shopId, action, shop) {
        const body = { shop_id: shopId, action };
        if (sessionId) body.session_id = sessionId;
        if (shop) body.shop = shop;
        const res = await request('/chatbot/feedback', {
            method: 'POST',
            body,
            auth: false,
            optionalAuth: true
        });
        return res && res.data ? res.data : res;
    }

    // =========================
    // Images API
    // =========================

    async function uploadImageViaGateway(file, type) {
        const accessToken = authState.accessToken;
        const initHeaders = {
            'Content-Type': 'application/json'
        };

        if (accessToken) {
            initHeaders.Authorization = `Bearer ${accessToken}`;
        }

        const initRes = await fetch(toUploadApiUrl('/upload-url'), {
            method: 'POST',
            headers: initHeaders,
            body: JSON.stringify({
                file_name: file.name,
                file_type: file.type || 'application/octet-stream',
                upload_type: type || 'profile'
            })
        });

        let initPayload = null;
        try {
            initPayload = await initRes.json();
        } catch (error) {
            initPayload = null;
        }

        if (!initRes.ok) {
            throw normalizeApiError(initPayload || { message: 'image_upload_failed' }, initRes.status);
        }

        const initData = initPayload && initPayload.data ? initPayload.data : initPayload;
        const uploadUrl = initData && initData.upload_url;
        const imageUrl = initData && initData.image_url;
        const objectKey = initData && initData.key;

        if (!uploadUrl || !imageUrl) {
            throw new ApiError('이미지 업로드 응답 형식이 올바르지 않습니다.', {
                status: 500,
                code: 'invalid_upload_response',
                category: 'server',
                raw: initPayload
            });
        }

        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type || 'application/octet-stream'
            },
            body: file
        });

        if (!uploadRes.ok) {
            throw new ApiError('이미지 업로드에 실패했습니다.', {
                status: uploadRes.status || 500,
                code: 'image_upload_failed',
                category: uploadRes.status >= 500 ? 'server' : 'validation'
            });
        }

        return {
            message: 'upload_success',
            data: {
                image_url: imageUrl,
                key: objectKey || null
            }
        };
    }

    async function uploadImage(file, type = 'profile') {
        if (FILE_UPLOAD_API_URL) {
            return uploadImageViaGateway(file, type);
        }

        const formData = new FormData();
        formData.append('file', file);

        return request(`/images/${type}`, {
            method: 'POST',
            body: formData
        });
    }

    const publicApi = {
        API_URL,
        FILE_UPLOAD_API_URL,
        ApiError,
        request,
        apiRequest: request,
        signup,
        checkEmail,
        login,
        logout,
        getMe,
        getPosts,
        getTrendingPosts,
        getPost,
        createPost,
        updatePost,
        deletePost,
        likePost,
        unlikePost,
        getComments,
        createComment,
        updateComment,
        deleteComment,
        updateProfile,
        changePassword,
        withdrawUser,
        searchMessageUsers,
        getConversations,
        getMessagesWithUser,
        getUnreadMessageCount,
        sendDirectMessage,
        getNotifications,
        getUnreadNotificationCount,
        markNotificationRead,
        markAllNotificationsRead,
        getBookmarkedPosts,
        bookmarkPost,
        unbookmarkPost,
        createReport,
        getBlockedUsers,
        blockUser,
        unblockUser,
        chatWithBot,
        streamChatWithBot,
        resetChatSession,
        getChatbotStatus,
        getChatbotProfile,
        submitChatbotFeedback,
        uploadImage,
        normalizeTags,
        toApiUrl,
        getMappedMessage,
        ensureAuthenticated,
        bootstrapSession,
        getAuthTokens,
        isAuthenticated,
        setCurrentUser,
        getCurrentUser,
        popAuthNotice,
        clearAuthState
    };

    Object.assign(globalScope, publicApi);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = publicApi;
    }
})(typeof window !== 'undefined' ? window : globalThis);
