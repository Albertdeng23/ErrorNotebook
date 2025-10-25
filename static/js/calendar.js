// calendar.js - 日历渲染与交互
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        const calendarGrid = document.getElementById('calendar-grid');
        const monthYearEl = document.getElementById('month-year');
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        let currentDate = new Date();

        // 如果 attachRegenerateListener 尚未定义，延迟调用（在 summary.js 加载后会生效）
        if (typeof attachRegenerateListener === 'function') attachRegenerateListener();

        function renderCalendar(year, month) {
            if (!calendarGrid) return;
            calendarGrid.innerHTML = '';
            if (monthYearEl) monthYearEl.textContent = `${year}年 ${month + 1}月`;

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startDayOfWeek = (firstDay.getDay() + 6) % 7;

            const daysInPrevMonth = new Date(year, month, 0).getDate();
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                const dayEl = document.createElement('div');
                dayEl.classList.add('calendar-day', 'prev-month-day');
                dayEl.textContent = daysInPrevMonth - i;
                calendarGrid.appendChild(dayEl);
            }

            const todayStr = new Date().toISOString().split('T')[0];
            for (let i = 1; i <= daysInMonth; i++) {
                const dayEl = document.createElement('div');
                dayEl.classList.add('calendar-day');
                dayEl.textContent = i;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                dayEl.dataset.date = dateStr;

                if (typeof allDatesWithRecords !== 'undefined' && allDatesWithRecords.includes(dateStr)) {
                    dayEl.classList.add('has-records');
                } else {
                    dayEl.classList.add('disabled');
                }
                if (dateStr === todayStr) dayEl.classList.add('today');
                calendarGrid.appendChild(dayEl);
            }

            const totalCells = startDayOfWeek + daysInMonth;
            const remainingCells = (7 - (totalCells % 7)) % 7;
            for (let i = 1; i <= remainingCells; i++) {
                const dayEl = document.createElement('div');
                dayEl.classList.add('calendar-day', 'next-month-day');
                dayEl.textContent = i;
                calendarGrid.appendChild(dayEl);
            }
        }

        if (calendarGrid) {
            calendarGrid.addEventListener('click', (e) => {
                const dayEl = e.target;
                if (!dayEl.classList.contains('has-records')) return;
                const date = dayEl.dataset.date;
                const selected = calendarGrid.querySelector('.selected');
                if (selected) selected.classList.remove('selected');
                dayEl.classList.add('selected');

                const activePane = document.querySelector('.subject-pane.active');
                if (!activePane) { alert('请先选择一个科目！'); return; }

                activePane.innerHTML = '<div class="loader">加载中...</div>';
                activePane.dataset.page = '1';
                activePane.dataset.hasMore = 'true';
                activePane.dataset.lastDate = '';
                activePane.dataset.currentDate = date;

                if (typeof loadQuestionsForActiveSubject === 'function') loadQuestionsForActiveSubject();
                if (typeof fetchAndUpdateSummary === 'function') fetchAndUpdateSummary(date);
            });

            if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });
            if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); });

            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        }
    });
})();
