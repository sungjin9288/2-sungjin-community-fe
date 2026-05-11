(function initNotificationsPage() {
    'use strict';

    function buildNotificationItemHtml(item) {
        const unreadClass = item.is_read ? '' : ' unread';
        const actorName = item.actor && item.actor.nickname ? item.actor.nickname : '시스템';
        const body = item.body ? `<p class="notification-body">${safeEscape(item.body)}</p>` : '';
        return `
            <button class="notification-item${unreadClass}" data-id="${item.id}" data-link="${safeEscape(item.link_url || '')}">
                <div class="notification-topline">
                    <strong>${safeEscape(item.title || '알림')}</strong>
                    <span>${safeEscape(safeFormatDate(item.created_at || new Date().toISOString()))}</span>
                </div>
                <div class="notification-actor">${safeEscape(actorName)}</div>
                ${body}
            </button>
        `;
    }

    function renderNotifications(items) {
        const container = document.getElementById('notificationsList');
        if (!container) return;
        if (!items.length) {
            container.innerHTML = buildEmptyStateHtml('아직 도착한 알림이 없습니다.', 'message');
            return;
        }
        container.innerHTML = items.map(buildNotificationItemHtml).join('');
    }

    async function loadNotifications() {
        const response = await getNotifications(false, 50);
        const items = extractData(response, []);
        renderNotifications(items);
    }

    async function handleNotificationClick(event) {
        const target = event.target.closest('[data-id]');
        if (!target) return;
        const notificationId = Number(target.dataset.id);
        const link = target.dataset.link || '';

        try {
            await markNotificationRead(notificationId);
            if (typeof refreshHeaderIndicators === 'function') {
                await refreshHeaderIndicators();
            }
            if (link) {
                navigateTo(link);
            } else {
                await loadNotifications();
            }
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '알림 상태를 갱신하지 못했습니다.'
            });
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        bindDropdownMenu();
        await loadHeaderProfile();
        await loadNotifications();

        const list = document.getElementById('notificationsList');
        if (list) {
            list.addEventListener('click', handleNotificationClick);
        }

        const btnReadAll = document.getElementById('btnReadAllNotifications');
        if (btnReadAll) {
            btnReadAll.addEventListener('click', async () => {
                try {
                    await markAllNotificationsRead();
                    await loadNotifications();
                    if (typeof refreshHeaderIndicators === 'function') {
                        await refreshHeaderIndicators();
                    }
                    showToast('모든 알림을 읽음 처리했습니다.');
                } catch (error) {
                    handleApiError(error, {
                        fallbackMessage: '알림 읽음 처리에 실패했습니다.'
                    });
                }
            });
        }
    });
})();
