const test = require('node:test');
const assert = require('node:assert/strict');

function createStorage(initial = {}) {
    const store = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
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

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get(name) {
                if (String(name).toLowerCase() === 'content-type') {
                    return 'application/json';
                }
                return null;
            }
        },
        json: async () => payload,
        text: async () => JSON.stringify(payload)
    };
}

function streamResponse(chunks) {
    return {
        ok: true,
        status: 200,
        headers: {
            get(name) {
                if (String(name).toLowerCase() === 'content-type') {
                    return 'text/event-stream';
                }
                return null;
            }
        },
        body: new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(Buffer.from(chunk, 'utf8')));
                controller.close();
            }
        })
    };
}

function loadApiClient({ fetchImpl, localStorageData = {}, pathname = '/posts' }) {
    global.fetch = fetchImpl;
    global.localStorage = createStorage(localStorageData);
    global.sessionStorage = createStorage();
    global.location = {
        pathname,
        href: `http://localhost${pathname}`
    };
    global.ENV_CONFIG = {
        API_URL: 'http://api.test',
        IS_DEV: false,
        NODE_ENV: 'test'
    };

    delete require.cache[require.resolve('../public/js/api.js')];
    return require('../public/js/api.js');
}

test('login stores tokens and injects Authorization header', async () => {
    const calls = [];

    const api = loadApiClient({
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            const endpoint = url.replace('http://api.test', '');

            if (endpoint === '/auth/login') {
                return jsonResponse(200, {
                    message: 'login_success',
                    data: {
                        access_token: 'access-token-1',
                        refresh_token: 'refresh-token-1',
                        token_type: 'bearer',
                        expires_in: 3600
                    }
                });
            }

            if (endpoint === '/users/me') {
                return jsonResponse(200, {
                    message: 'ok',
                    data: { id: 1, nickname: 'tester' }
                });
            }

            return jsonResponse(404, { message: 'not_found' });
        }
    });

    await api.login('tester@example.com', 'Password123!');
    await api.getMe();

    const meCalls = calls.filter((call) => call.url.endsWith('/users/me'));
    assert.ok(meCalls.length >= 1);

    for (const call of meCalls) {
        assert.equal(call.options.headers.Authorization, 'Bearer access-token-1');
    }

    const tokens = api.getAuthTokens();
    assert.equal(tokens.accessToken, 'access-token-1');
    assert.equal(tokens.refreshToken, 'refresh-token-1');
});

test('401 responses trigger single refresh for concurrent requests and retry once', async () => {
    let refreshCalls = 0;
    let refreshed = false;

    const api = loadApiClient({
        localStorageData: {
            'auth.access_token': 'old-access',
            'auth.refresh_token': 'refresh-1'
        },
        fetchImpl: async (url, options = {}) => {
            const endpoint = url.replace('http://api.test', '');
            const authHeader = options.headers && options.headers.Authorization;

            if (endpoint === '/auth/refresh') {
                refreshCalls += 1;
                await new Promise((resolve) => setTimeout(resolve, 20));
                refreshed = true;
                return jsonResponse(200, {
                    message: 'refresh_success',
                    data: {
                        access_token: 'new-access',
                        refresh_token: 'new-refresh',
                        token_type: 'bearer',
                        expires_in: 3600
                    }
                });
            }

            if (endpoint === '/users/me') {
                if (!refreshed && authHeader === 'Bearer old-access') {
                    return jsonResponse(401, { message: 'token_expired' });
                }
                assert.equal(authHeader, 'Bearer new-access');
                return jsonResponse(200, { message: 'ok', data: { id: 1 } });
            }

            if (endpoint.startsWith('/posts?')) {
                if (!refreshed && authHeader === 'Bearer old-access') {
                    return jsonResponse(401, { message: 'token_expired' });
                }
                assert.equal(authHeader, 'Bearer new-access');
                return jsonResponse(200, { message: 'ok', data: [] });
            }

            return jsonResponse(404, { message: 'not_found' });
        }
    });

    await Promise.all([
        api.getMe(),
        api.getPosts(1, 10, 'latest', '')
    ]);

    assert.equal(refreshCalls, 1);
    const tokens = api.getAuthTokens();
    assert.equal(tokens.accessToken, 'new-access');
    assert.equal(tokens.refreshToken, 'new-refresh');
});

test('logout clears tokens and local auth state', async () => {
    const logoutBodies = [];

    const api = loadApiClient({
        localStorageData: {
            'auth.access_token': 'access-logout',
            'auth.refresh_token': 'refresh-logout'
        },
        fetchImpl: async (url, options = {}) => {
            const endpoint = url.replace('http://api.test', '');
            if (endpoint === '/auth/logout') {
                logoutBodies.push(options.body ? JSON.parse(options.body) : null);
                return jsonResponse(200, { message: 'logout_success', data: null });
            }
            return jsonResponse(404, { message: 'not_found' });
        }
    });

    await api.logout();

    assert.equal(logoutBodies.length, 1);
    assert.equal(logoutBodies[0].refresh_token, 'refresh-logout');

    const tokens = api.getAuthTokens();
    assert.equal(tokens.accessToken, null);
    assert.equal(tokens.refreshToken, null);
    assert.equal(api.isAuthenticated(), false);
});

test('getPosts sends sort and tag query params', async () => {
    const urls = [];
    const api = loadApiClient({
        localStorageData: {
            'auth.access_token': 'access-query',
            'auth.refresh_token': 'refresh-query'
        },
        fetchImpl: async (url) => {
            urls.push(url);
            return jsonResponse(200, { message: 'ok', data: [] });
        }
    });

    await api.getPosts(2, 15, 'discussed', 'react');

    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/posts\?/);
    assert.match(urls[0], /page=2/);
    assert.match(urls[0], /limit=15/);
    assert.match(urls[0], /sort=discussed/);
    assert.match(urls[0], /tag=react/);
});

test('streamChatWithBot sends profile payload and dispatches SSE chunks', async () => {
    const calls = [];
    const chunks = [];
    let donePayload = null;

    const api = loadApiClient({
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            return streamResponse([
                'event: chunk\ndata: "안녕하세요 "\n\n',
                'event: chunk\ndata: "추천입니다."\n\n',
                'event: done\ndata: {"reply":"안녕하세요 추천입니다.","recommended":[]}\n\n'
            ]);
        }
    });

    const result = await api.streamChatWithBot(
        '성수 파스타',
        'session-test',
        { regions: ['성수'], cuisines: ['파스타'] },
        {
            chunk(text) {
                chunks.push(text);
            },
            done(payload) {
                donePayload = payload;
            }
        }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://api.test/chatbot/chat/stream');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.message, '성수 파스타');
    assert.equal(body.session_id, 'session-test');
    assert.deepEqual(body.profile.regions, ['성수']);
    assert.deepEqual(chunks, ['안녕하세요 ', '추천입니다.']);
    assert.equal(donePayload.reply, '안녕하세요 추천입니다.');
    assert.equal(result.reply, '안녕하세요 추천입니다.');
});

test('chatbot requests attach optional Authorization for logged-in users', async () => {
    const calls = [];
    const api = loadApiClient({
        localStorageData: {
            'auth.access_token': 'chatbot-access-token'
        },
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            return jsonResponse(200, {
                message: 'chat_success',
                data: { reply: 'ok', recommended: [], memory_scope: 'user' }
            });
        }
    });

    const data = await api.chatWithBot('강남 파스타 추천', 'session-chatbot', {
        regions: ['강남']
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://api.test/chatbot/chat');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer chatbot-access-token');
    assert.equal(data.memory_scope, 'user');
});

test('streamChatWithBot attaches optional Authorization for logged-in users', async () => {
    const calls = [];
    const api = loadApiClient({
        localStorageData: {
            'auth.access_token': 'stream-access-token'
        },
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            return streamResponse([
                'event: done\ndata: {"reply":"ok","recommended":[],"memory_scope":"user"}\n\n'
            ]);
        }
    });

    const result = await api.streamChatWithBot('강남 파스타', 'session-stream', {});

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer stream-access-token');
    assert.equal(result.memory_scope, 'user');
});

test('streamChatWithBot rejects SSE error events instead of returning an empty payload', async () => {
    const api = loadApiClient({
        fetchImpl: async () => streamResponse([
            'event: error\ndata: {"message":"validation_error","detail":"profile invalid"}\n\n'
        ])
    });

    await assert.rejects(
        () => api.streamChatWithBot('강남 파스타', 'session-stream-error', {}),
        (error) => {
            assert.equal(error.name, 'ApiError');
            assert.equal(error.code, 'validation_error');
            assert.equal(error.message, '입력값을 확인해 주세요.');
            return true;
        }
    );
});

test('getChatbotProfile loads persisted preference memory by session id', async () => {
    const calls = [];
    const api = loadApiClient({
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            return jsonResponse(200, {
                message: 'profile_loaded',
                data: {
                    profile: { regions: ['강남'], cuisines: ['파스타'] },
                    storage: 'database'
                }
            });
        }
    });

    const data = await api.getChatbotProfile('session-profile');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://api.test/chatbot/profile?session_id=session-profile');
    assert.equal(calls[0].options.method, 'GET');
    assert.deepEqual(data.profile.regions, ['강남']);
    assert.equal(data.storage, 'database');
});
