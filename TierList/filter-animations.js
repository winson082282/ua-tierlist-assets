(function (window) {
    const FILTER_FADE_DURATION_MS = 220;

    let filterAnimationCycle = 0;
    let filterEnterFrameId = 0;
    let filterRowEnterFrameId = 0;
    let hasAppliedInitialFilter = false;

    function clearElementTimer(element) {
        if (!element || !element._filterTimerId) return;
        window.clearTimeout(element._filterTimerId);
        element._filterTimerId = null;
    }

    function cancelEnterFrame(frameId) {
        if (!frameId) return 0;
        window.cancelAnimationFrame(frameId);
        return 0;
    }

    function isWrapperVisible(wrapper) {
        return !!wrapper && !wrapper.classList.contains('is-filter-hidden');
    }

    function isTierRowVisible(row) {
        return !!row && !row.classList.contains('is-filter-row-hidden');
    }

    function finalizeTierRowHidden(row) {
        row._filterTimerId = null;
        row.classList.add('is-filter-row-hidden');
        row.classList.remove('is-filter-row-leaving', 'is-filter-row-pre-enter');
    }

    function resetTierRowAnimationState(row) {
        clearElementTimer(row);
        row.classList.remove('is-filter-row-leaving', 'is-filter-row-pre-enter');
    }

    function finalizeWrapperHidden(wrapper) {
        wrapper._filterTimerId = null;
        wrapper.classList.add('is-filter-hidden');
        wrapper.classList.remove('is-filter-leaving', 'is-filter-pre-enter');
        wrapper.dataset.filterVisible = 'false';
    }

    function resetWrapperAnimationState(wrapper) {
        clearElementTimer(wrapper);
        wrapper.classList.remove('is-filter-leaving', 'is-filter-pre-enter');
    }

    function syncTierRowVisibility(shouldAnimate, currentCycle) {
        const enteringRows = [];

        document.querySelectorAll('.tier-row').forEach(function (row) {
            const hasVisibleWrapper = Array.from(row.querySelectorAll('.deck-card-wrapper')).some(isWrapperVisible);
            const wasVisible = isTierRowVisible(row);

            resetTierRowAnimationState(row);

            if (hasVisibleWrapper) {
                if (wasVisible) {
                    row.classList.remove('is-filter-row-hidden');
                    return;
                }

                row.classList.remove('is-filter-row-hidden');

                if (!shouldAnimate) return;

                row.classList.add('is-filter-row-pre-enter');
                enteringRows.push(row);
                return;
            }

            if (!wasVisible) {
                finalizeTierRowHidden(row);
                return;
            }

            if (!shouldAnimate) {
                finalizeTierRowHidden(row);
                return;
            }

            row.classList.add('is-filter-row-leaving');
            row._filterTimerId = window.setTimeout(function () {
                if (currentCycle !== filterAnimationCycle) return;
                finalizeTierRowHidden(row);
            }, FILTER_FADE_DURATION_MS);
        });

        if (shouldAnimate && enteringRows.length > 0) {
            filterRowEnterFrameId = window.requestAnimationFrame(function () {
                filterRowEnterFrameId = 0;
                if (currentCycle !== filterAnimationCycle) return;
                enteringRows.forEach(function (row) {
                    row.classList.remove('is-filter-row-pre-enter');
                });
            });
        }
    }

    function queueWrapperEnter(wrapper, filterCycle) {
        wrapper.classList.add('is-filter-pre-enter');
        filterCycle.enteringWrappers.push(wrapper);
    }

    function flushWrapperEnterQueue(filterCycle) {
        if (!filterCycle.shouldAnimate || filterCycle.enteringWrappers.length === 0) return;

        filterEnterFrameId = window.requestAnimationFrame(function () {
            filterEnterFrameId = 0;
            if (filterCycle.currentCycle !== filterAnimationCycle) return;
            filterCycle.enteringWrappers.forEach(function (wrapper) {
                wrapper.classList.remove('is-filter-pre-enter');
            });
        });
    }

    function beginFilterCycle() {
        filterEnterFrameId = cancelEnterFrame(filterEnterFrameId);
        filterRowEnterFrameId = cancelEnterFrame(filterRowEnterFrameId);

        return {
            shouldAnimate: hasAppliedInitialFilter,
            currentCycle: ++filterAnimationCycle,
            enteringWrappers: []
        };
    }

    function applyHiddenCardState(wrapper, cardEl, filterCycle) {
        const wasVisible = isWrapperVisible(wrapper);

        resetWrapperAnimationState(wrapper);
        cardEl.classList.remove('is-active', 'is-dimmed');

        if (!wasVisible || !filterCycle.shouldAnimate) {
            finalizeWrapperHidden(wrapper);
            return;
        }

        wrapper.dataset.filterVisible = 'false';
        wrapper.classList.add('is-filter-leaving');
        wrapper._filterTimerId = window.setTimeout(function () {
            if (filterCycle.currentCycle !== filterAnimationCycle) return;
            finalizeWrapperHidden(wrapper);
            syncTierRowVisibility(true, filterCycle.currentCycle);
        }, FILTER_FADE_DURATION_MS);
    }

    function applyVisibleCardState(wrapper, cardEl, filterCycle) {
        const wasVisible = isWrapperVisible(wrapper);

        resetWrapperAnimationState(wrapper);
        wrapper.dataset.filterVisible = 'true';
        cardEl.classList.remove('is-dimmed');
        cardEl.classList.add('is-active');

        if (wasVisible) {
            wrapper.classList.remove('is-filter-hidden');
            return;
        }

        wrapper.classList.remove('is-filter-hidden');

        if (!filterCycle.shouldAnimate) {
            wrapper.classList.remove('is-filter-pre-enter');
            return;
        }

        queueWrapperEnter(wrapper, filterCycle);
    }

    function applyFilterResults(filterResults) {
        const filterCycle = beginFilterCycle();

        filterResults.forEach(function (result) {
            const wrapper = result.wrapper;
            const cardEl = result.cardEl;
            const shouldShow = result.shouldShow;

            if (!shouldShow) {
                applyHiddenCardState(wrapper, cardEl, filterCycle);
                return;
            }

            applyVisibleCardState(wrapper, cardEl, filterCycle);
        });

        syncTierRowVisibility(filterCycle.shouldAnimate, filterCycle.currentCycle);
        flushWrapperEnterQueue(filterCycle);
        hasAppliedInitialFilter = true;
    }

    window.UATierListFilterAnimations = {
        applyFilterResults: applyFilterResults
    };
})(window);