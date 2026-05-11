/**
 * Posts list page
 * - Sort: latest | hot | discussed
 * - Tag filter
 * - Trending section (tags + posts)
 */
(function initPostsListPage(global) {
    'use strict';

    const FEED_LIMIT = 10;
    const TRENDING_DAYS = 7;
    const TRENDING_LIMIT = 5;
    const SORT_OPTIONS = ['latest', 'hot', 'discussed'];

    const feedState = {
        page: 1,
        limit: FEED_LIMIT,
        sort: 'latest',
        tag: '',
        isLoading: false,
        hasMore: true,
        posts: []
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', async () => {
            const isReady = await ensureAuthenticated();
            if (!isReady) return;

            bindDropdownMenu();
            bindFilterControls();
            bindScrollHandler();
            
            const navEntries = performance.getEntriesByType("navigation");
            const isBackForward = navEntries.length > 0 && navEntries[0].type === "back_forward";
            const cached = loadPageScrollState('feed');

            if (isBackForward && cached && cached.state) {
                Object.assign(feedState, cached.state);
                
                const tagInput = document.getElementById('tagFilterInput');
                if (tagInput) tagInput.value = feedState.tag || '';
                renderSortButtons();
                syncFilterQuery();

                await Promise.all([
                    loadHeaderProfile(),
                    loadTrending()
                ]);

                const container = document.getElementById('postsList');
                if (container) {
                    container.innerHTML = '';
                    renderPosts(feedState.posts || [], container);
                }

                setTimeout(() => {
                    window.scrollTo(0, cached.scrollY);
                }, 50);
            } else {
                hydrateFiltersFromQuery();
                await Promise.all([
                    loadHeaderProfile(),
                    resetFeed(),
                    loadTrending()
                ]);
            }
        });

        window.addEventListener('beforeunload', () => {
            savePageScrollState('feed', feedState);
        });
    }

    function bindFilterControls() {
        const sortButtons = document.querySelectorAll('[data-sort]');
        const tagInput = document.getElementById('tagFilterInput');
        const applyButton = document.getElementById('btnApplyTag');
        const clearButton = document.getElementById('btnClearTag');

        sortButtons.forEach((button) => {
            button.addEventListener('click', async () => {
                const sort = button.dataset.sort;
                if (!SORT_OPTIONS.includes(sort) || sort === feedState.sort) {
                    return;
                }

                feedState.sort = sort;
                renderSortButtons();
                syncFilterQuery();
                await resetFeed();
            });
        });

        if (tagInput) {
            tagInput.value = feedState.tag;
            tagInput.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                await applyTagFilter();
            });
        }

        if (applyButton) {
            applyButton.addEventListener('click', applyTagFilter);
        }

        if (clearButton) {
            clearButton.addEventListener('click', async () => {
                if (!feedState.tag && !(tagInput && tagInput.value.trim())) return;
                feedState.tag = '';
                if (tagInput) tagInput.value = '';
                syncFilterQuery();
                await resetFeed();
            });
        }

        renderSortButtons();
    }

    function bindScrollHandler() {
        const onScroll = debounce(async () => {
            if (feedState.isLoading || !feedState.hasMore) return;

            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            const shouldLoadMore = scrollTop + clientHeight >= scrollHeight - 200;

            if (!shouldLoadMore) return;

            feedState.page += 1;
            await loadPosts(true);
        }, 120);

        window.addEventListener('scroll', onScroll);
    }

    function hydrateFiltersFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const querySort = params.get('sort');
        const queryTag = params.get('tag');

        if (SORT_OPTIONS.includes(querySort)) {
            feedState.sort = querySort;
        }

        if (queryTag) {
            feedState.tag = queryTag;
        }
    }

    function syncFilterQuery() {
        const params = new URLSearchParams(window.location.search);
        params.set('sort', feedState.sort);

        if (feedState.tag) {
            params.set('tag', feedState.tag);
        } else {
            params.delete('tag');
        }

        const next = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', next);
    }

    function renderSortButtons() {
        const sortButtons = document.querySelectorAll('[data-sort]');
        sortButtons.forEach((button) => {
            const isActive = button.dataset.sort === feedState.sort;
            button.classList.toggle('active', isActive);
        });
    }

    async function applyTagFilter() {
        const tagInput = document.getElementById('tagFilterInput');
        if (!tagInput) return;

        const normalizedTag = String(tagInput.value || '').trim().replace(/^#/, '');
        if (feedState.tag === normalizedTag) return;

        feedState.tag = normalizedTag;
        syncFilterQuery();
        await resetFeed();
    }

    async function resetFeed() {
        feedState.page = 1;
        feedState.hasMore = true;

        const container = document.getElementById('postsList');
        if (container) {
            container.innerHTML = Array(4).fill(getPostSkeletonHtml()).join('');
        }

        await loadPosts(false);
    }

    async function loadPosts(append) {
        if (feedState.isLoading) return;

        feedState.isLoading = true;

        const container = document.getElementById('postsList');
        if (!container) {
            feedState.isLoading = false;
            return;
        }

        if (append) {
            const tempDiv = document.createElement('div');
            tempDiv.id = 'feedLoadingMore';
            tempDiv.style.gridColumn = '1 / -1';
            tempDiv.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 20px; width: 100%;">${Array(2).fill(getPostSkeletonHtml()).join('')}</div>`;
            container.appendChild(tempDiv);
        }

        try {
            const response = await getPosts(feedState.page, feedState.limit, feedState.sort, feedState.tag);
            const posts = extractPostArray(response);

            if (!append) {
                container.innerHTML = '';
                feedState.posts = [];
            }
            
            feedState.posts = feedState.posts.concat(posts);

            if (posts.length === 0 && !append) {
                container.innerHTML = buildEmptyStateHtml('조건에 맞는 게시글이 없습니다.', 'doc');
                feedState.hasMore = false;
                return;
            }

            renderPosts(posts, container);
            if (posts.length < feedState.limit) {
                feedState.hasMore = false;
            }
        } catch (error) {
            if (!append) {
                container.innerHTML = buildEmptyStateHtml('피드를 불러오지 못했습니다.', 'doc');
            }
            handleApiError(error, {
                fallbackMessage: '피드를 불러오는 중 오류가 발생했습니다.'
            });
        } finally {
            removeLoadingIndicator('feedLoadingMore');
            feedState.isLoading = false;
        }
    }

    function extractPostArray(response) {
        if (!response) return [];
        if (Array.isArray(response.data)) return response.data;
        if (response.data && Array.isArray(response.data.items)) return response.data.items;
        if (response.data && Array.isArray(response.data.posts)) return response.data.posts;
        if (Array.isArray(response)) return response;
        return [];
    }

    function renderPosts(posts, container) {
        posts.forEach((post) => {
            const postItem = document.createElement('article');
            postItem.className = 'post-item';
            postItem.addEventListener('click', () => {
                navigateTo(`/posts/${post.id}`);
            });

            postItem.innerHTML = buildPostCardHtml(post);
            container.appendChild(postItem);
        });
    }

    function buildPostCardHtml(post) {
        const postTags = normalizePostTags(post.tags);
        const tagsHtml = postTags.length > 0
            ? `<div class="post-tags">${postTags.map((tag) => `<span class="tag-chip">#${safeEscape(tag)}</span>`).join('')}</div>`
            : '';

        return `
            <div class="post-item-header">
                <img
                    src="${safeEscape(resolveImageUrl(post.author_profile_image, '/images/default-profile.png'))}"
                    alt="프로필"
                    class="post-avatar"
                    loading="lazy"
                    onerror="this.src='/images/default-profile.png'"
                >
                <div>
                    <span class="post-author">${safeEscape(post.author_nickname || '익명')}</span>
                    <span class="post-time">${safeEscape(safeFormatDate(post.created_at || new Date().toISOString()))}</span>
                </div>
            </div>

            <div class="post-item-title">${safeEscape(safeTruncate(post.title || '', 50))}</div>
            <div class="post-item-content">${safeEscape(safeTruncate(post.content || '', 150))}</div>

            ${buildPostImageHtml(post.image_url)}
            ${tagsHtml}

            <div class="post-item-footer">
                <div class="post-stats-list">
                    <div class="post-stat"><span>좋아요</span>${formatStatCount(post.likes_count || 0)}</div>
                    <div class="post-stat"><span>댓글</span>${formatStatCount(post.comments_count || 0)}</div>
                    <div class="post-stat"><span>조회</span>${formatStatCount(post.view_count || post.views || 0)}</div>
                </div>
            </div>
        `;
    }

    function buildPostImageHtml(imageUrl) {
        if (!imageUrl) return '';
        return `
            <div class="post-image-preview">
                <img src="${safeEscape(resolveImageUrl(imageUrl))}" alt="게시글 이미지" loading="lazy">
            </div>
        `;
    }

    async function loadTrending() {
        const trendingPostsContainer = document.getElementById('trendingPostsList');
        const trendingTagsContainer = document.getElementById('trendingTagsList');

        if (!trendingPostsContainer || !trendingTagsContainer) return;

        trendingPostsContainer.innerHTML = Array(5).fill(getTrendingPostSkeletonHtml()).join('');
        trendingTagsContainer.innerHTML = Array(4).fill(getTrendingTagSkeletonHtml()).join('');

        try {
            const response = await getTrendingPosts(TRENDING_DAYS, TRENDING_LIMIT);
            const trendingData = extractData(response, {});
            const posts = Array.isArray(trendingData.posts) ? trendingData.posts : extractPostArray(response);
            const topTags = Array.isArray(trendingData.top_tags) ? trendingData.top_tags : null;

            renderTrendingPosts(posts, trendingPostsContainer);
            renderTrendingTags(topTags, posts, trendingTagsContainer);
        } catch (error) {
            trendingPostsContainer.innerHTML = buildEmptyStateHtml('트렌딩 정보를 불러오지 못했습니다.', 'doc');
            handleApiError(error, {
                fallbackMessage: '트렌딩 정보를 불러오지 못했습니다.'
            });
        }
    }

    function renderTrendingPosts(posts, container) {
        if (!posts.length) {
            container.innerHTML = buildEmptyStateHtml('트렌딩 게시글이 없습니다.', 'doc');
            return;
        }

        container.innerHTML = '';

        posts.forEach((post, index) => {
            const item = document.createElement('button');
            item.className = 'trending-post-item';
            item.type = 'button';
            item.addEventListener('click', () => navigateTo(`/posts/${post.id}`));
            item.innerHTML = buildTrendingPostItemHtml(post, index);
            container.appendChild(item);
        });
    }

    function renderTrendingTags(topTags, posts, container) {
        let rankedTags;
        if (Array.isArray(topTags) && topTags.length > 0) {
            rankedTags = topTags.map((item) => ({ tag: item.name, count: item.count }));
        } else {
            rankedTags = collectTrendingTags(posts);
        }

        if (!rankedTags.length) {
            container.innerHTML = '<span class="empty-inline">태그 데이터가 없습니다.</span>';
            return;
        }

        container.innerHTML = '';
        rankedTags.forEach((item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'trending-tag-chip';
            button.innerHTML = buildTrendingTagChipHtml(item.tag, item.count);
            button.addEventListener('click', async () => {
                const tagInput = document.getElementById('tagFilterInput');
                if (tagInput) tagInput.value = item.tag;
                feedState.tag = item.tag;
                syncFilterQuery();
                await resetFeed();
            });
            container.appendChild(button);
        });
    }

    function buildTrendingPostItemHtml(post, index) {
        return `
            <span class="trending-rank">${index + 1}</span>
            <div class="trending-content">
                <strong>${safeEscape(safeTruncate(post.title || '', 50))}</strong>
                <small>좋아요 ${formatStatCount(post.likes_count || 0)} · 댓글 ${formatStatCount(post.comments_count || 0)}</small>
            </div>
        `;
    }

    function buildTrendingTagChipHtml(tag, count) {
        return `#${safeEscape(tag)} <span>${count}</span>`;
    }

    function collectTrendingTags(posts) {
        const counts = new Map();

        posts.forEach((post) => {
            normalizePostTags(post.tags).forEach((tag) => {
                counts.set(tag, (counts.get(tag) || 0) + 1);
            });
        });

        return [...counts.entries()]
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
            .slice(0, 8);
    }

    // Test exports
    const postsListTestUtils = {
        extractPostArray,
        collectTrendingTags,
        normalizePostTags,
        buildPostCardHtml,
        buildTrendingPostItemHtml,
        buildTrendingTagChipHtml
    };

    if (typeof window !== 'undefined') {
        window.__postsListTestUtils = postsListTestUtils;
    }

    function buildSearchUserItemHtml() {
        // Not used here, stub for consistency if needed or simply omit.
    }

    // --- Skeleton Loaders ---
    function getPostSkeletonHtml() {
        return `
            <div class="post-item" style="pointer-events: none;">
                <div class="post-item-header">
                    <div class="skeleton skeleton-circle post-avatar"></div>
                    <div style="flex: 1;">
                        <div class="skeleton skeleton-text short"></div>
                        <div class="skeleton skeleton-text" style="width: 30%;"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-rect post-image-preview"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text medium"></div>
            </div>
        `;
    }

    function getTrendingPostSkeletonHtml() {
        return `
            <div class="trending-post-item" style="border: none; pointer-events: none;">
                <div class="skeleton skeleton-circle" style="width: 20px; height: 20px;"></div>
                <div style="flex: 1;">
                    <div class="skeleton skeleton-text medium"></div>
                    <div class="skeleton skeleton-text short"></div>
                </div>
            </div>
        `;
    }

    function getTrendingTagSkeletonHtml() {
        return `<div class="skeleton skeleton-text" style="width: 60px; height: 26px; border-radius: 999px;"></div>`;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = postsListTestUtils;
    }
})(typeof window !== 'undefined' ? window : globalThis);
