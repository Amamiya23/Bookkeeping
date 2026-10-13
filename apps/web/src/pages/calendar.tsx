/**
 * 续费日历页（/calendar）。
 *
 * 功能：
 * - 以日历方式展示订阅的 nextBillingDate
 * - 支持从日历点击订阅并进入编辑
 */

import { useMemo, useState } from 'react';
import type { SubscriptionCollectionItem } from '@/types/subscription';
import { Header } from '@/components/header';
import { BackToTopFloatButton } from '@/components/back-to-top-float-button';
import { SubscriptionCalendar } from '@/components/subscription-calendar';
import { EditSubscriptionDialog } from '@/components/edit-subscription-dialog';
import { CalendarPageSkeleton } from '@/components/loading-skeleton';
import { useRouteReady } from '@/components/route-progress';
import { QueryErrorState } from '@/components/query-error-state';
import { useSubscriptionCalendar, useSubscriptionFacets } from '@/hooks/use-subscriptions';
import { useI18n } from '@/i18n/I18nProvider';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getSubscriptionCalendarRange } from '@/modules/subscriptions/domain/subscription-calendar-range';
import { useSubscriptionCrud } from '@/modules/subscriptions/application/use-subscription-crud';

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];

/** 日历页组件。 */
const Calendar = ({ embedded = false, compact = false }: { embedded?: boolean; compact?: boolean }) => {
  const Container = embedded ? "section" : "main";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const range = useMemo(() => getSubscriptionCalendarRange(currentMonth), [currentMonth]);
  const subscriptionsQuery = useSubscriptionCalendar(range.from, range.to);
  const hasCalendarData = subscriptionsQuery.data !== undefined;
  useRouteReady(!hasCalendarData && subscriptionsQuery.isPending);
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const facetsQuery = useSubscriptionFacets();
  const { t } = useI18n();
  const isMobileCalendarPage = useMediaQuery("(max-width: 639px)");
  const availableTags = facetsQuery.data?.tags ?? [];
  const {
    editingSubscription,
    editingCollectionItem,
    editDialogOpen,
    editDetailPending,
    handleAddSubscription,
    handleEditSubscription,
    handleSaveSubscription,
    handleEditDialogOpenChange,
  } = useSubscriptionCrud(subscriptions);

  if (!hasCalendarData && subscriptionsQuery.isPending) {
    return (
      <div className={embedded ? "" : "app-page bg-background"}>
        {!embedded && <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />}
        <Container className={embedded ? "space-y-6" : "app-main mx-auto max-w-7xl"}>
          {compact ? <div role="status" className="h-108 animate-pulse rounded-2xl bg-muted"><span className="sr-only">{t("common.loading")}</span></div> : <CalendarPageSkeleton withPageShell={false} />}
        </Container>
      </div>
    );
  }

  if (!hasCalendarData && subscriptionsQuery.error) {
    return (
      <div className={embedded ? "" : "app-page bg-background"}>
        {!embedded && <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />}
        <Container className={embedded ? "space-y-6" : "app-main mx-auto max-w-7xl"}>
          <QueryErrorState error={subscriptionsQuery.error} onRetry={subscriptionsQuery.refetch} />
        </Container>
      </div>
    );
  }

  return (
    <div className={embedded ? "lg:flex lg:flex-1 lg:flex-col" : "app-page bg-background"}>
      {!embedded && <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />}

      <Container
        className={embedded ? "space-y-6 lg:flex lg:flex-1 lg:flex-col" : "app-main mx-auto max-w-7xl"}
        aria-busy={subscriptionsQuery.isFetching ? true : undefined}
      >
        {!embedded && <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendar.pageSubtitle")}</p>
        </div>}

        <SubscriptionCalendar 
          className={embedded && !compact ? "lg:flex-1" : ""}
          compact={compact}
          subscriptions={subscriptions} 
          currentMonth={currentMonth}
          onCurrentMonthChange={setCurrentMonth}
          onEditSubscription={handleEditSubscription}
        />
      </Container>

      <EditSubscriptionDialog
        subscription={editingSubscription}
        loadingPreview={editingCollectionItem}
        open={editDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleSaveSubscription}
        availableTags={availableTags}
        loading={editDetailPending}
      />
      {/* 按需求日历页只在 H5 端启用，桌面端保持现有页面密度和视觉重心不变。 */}
      <BackToTopFloatButton enabled={isMobileCalendarPage} />
    </div>
  );
};

export default Calendar;
