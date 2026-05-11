(function initBlockedUsersPage() {
    'use strict';

    function buildBlockedUserCardHtml(item) {
        const user = item.user || {};
        return `
            <article class="blocked-user-card" data-user-id="${user.id}">
                <div class="blocked-user-meta">
                    <img
                        class="blocked-user-avatar"
                        src="${safeEscape(resolveImageUrl(user.profile_image_url, '/images/default-profile.png'))}"
                        alt="${safeEscape(user.nickname || '차단한 사용자')}"
                        loading="lazy"
                    >
                    <div>
                        <div class="blocked-user-name">${safeEscape(user.nickname || '알 수 없음')}</div>
                        <div class="blocked-user-email">${safeEscape(user.email || '')}</div>
                        <div class="blocked-user-created">차단 일시: ${safeEscape(safeFormatDate(item.created_at || new Date().toISOString()))}</div>
                    </div>
                </div>
                <button type="button" class="btn-unblock-user" data-user-id="${user.id}">차단 해제</button>
            </article>
        `;
    }

    async function loadBlockedUsers() {
        const container = document.getElementById('blockedUsersList');
        if (!container) return;

        try {
            const response = await getBlockedUsers();
            const users = extractData(response, []);

            if (!users.length) {
                container.innerHTML = buildEmptyStateHtml('차단한 사용자가 없습니다.', 'message');
                return;
            }

            container.innerHTML = users.map(buildBlockedUserCardHtml).join('');
        } catch (error) {
            container.innerHTML = buildEmptyStateHtml('차단한 사용자 목록을 불러오지 못했습니다.', 'message');
            handleApiError(error, {
                fallbackMessage: '차단 목록을 불러오는 중 오류가 발생했습니다.'
            });
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        bindDropdownMenu();
        await loadHeaderProfile();
        await loadBlockedUsers();

        const container = document.getElementById('blockedUsersList');
        if (!container) return;

        container.addEventListener('click', async (event) => {
            const button = event.target.closest('.btn-unblock-user');
            if (!button) return;

            const blockedUserId = Number(button.dataset.userId);
            if (!blockedUserId) return;

            try {
                await unblockUser(blockedUserId);
                showToast('사용자 차단을 해제했습니다.');
                await loadBlockedUsers();
            } catch (error) {
                handleApiError(error, {
                    fallbackMessage: '차단 해제에 실패했습니다.'
                });
            }
        });
    });
})();
