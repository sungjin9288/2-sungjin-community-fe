(function initBookmarksPage() {
    'use strict';

    function buildBookmarkCardHtml(post) {
        const tags = normalizePostTags(post.tags);
        const tagsHtml = tags.length
            ? `<div class="post-tags">${tags.map((tag) => `<span class="tag-chip">#${safeEscape(tag)}</span>`).join('')}</div>`
            : '';
        const imageHtml = post.image_url
            ? `<div class="post-image-preview"><img src="${safeEscape(resolveImageUrl(post.image_url))}" alt="게시글 이미지" loading="lazy"></div>`
            : '';

        return `
            <article class="post-item bookmark-card" data-post-id="${post.id}">
                <div class="post-item-header">
                    <img src="${safeEscape(resolveImageUrl(post.author_profile_image, '/images/default-profile.png'))}" alt="프로필" class="post-avatar" loading="lazy">
                    <div>
                        <span class="post-author">${safeEscape(post.author_nickname || '익명')}</span>
                        <span class="post-time">${safeEscape(safeFormatDate(post.created_at || new Date().toISOString()))}</span>
                    </div>
                </div>
                <div class="post-item-title">${safeEscape(post.title || '')}</div>
                <div class="post-item-content">${safeEscape(safeTruncate(post.content || '', 150))}</div>
                ${imageHtml}
                ${tagsHtml}
                <div class="post-item-footer">
                    <div class="post-stats-list">
                        <div class="post-stat"><span>좋아요</span>${formatStatCount(post.likes_count || 0)}</div>
                        <div class="post-stat"><span>댓글</span>${formatStatCount(post.comments_count || 0)}</div>
                        <div class="post-stat"><span>조회</span>${formatStatCount(post.view_count || 0)}</div>
                    </div>
                </div>
            </article>
        `;
    }

    async function loadBookmarks() {
        const container = document.getElementById('bookmarksList');
        if (!container) return;

        try {
            const response = await getBookmarkedPosts(1, 30);
            const posts = extractData(response, []);
            if (!posts.length) {
                container.innerHTML = buildEmptyStateHtml('북마크한 게시글이 없습니다.', 'doc');
                return;
            }
            container.innerHTML = posts.map(buildBookmarkCardHtml).join('');
        } catch (error) {
            container.innerHTML = buildEmptyStateHtml('북마크한 게시글을 불러오지 못했습니다.', 'doc');
            handleApiError(error, {
                fallbackMessage: '북마크 목록을 불러오는 중 오류가 발생했습니다.'
            });
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        bindDropdownMenu();
        await loadHeaderProfile();
        await loadBookmarks();

        const list = document.getElementById('bookmarksList');
        if (list) {
            list.addEventListener('click', (event) => {
                const card = event.target.closest('[data-post-id]');
                if (!card) return;
                navigateTo(`/posts/${card.dataset.postId}`);
            });
        }
    });
})();
