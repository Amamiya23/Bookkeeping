import { lazy, Suspense, type ComponentProps } from "react";

const LazyAddToCalendarDialog = lazy(() =>
  import("./add-to-calendar-dialog").then((module) => ({ default: module.AddToCalendarDialog })),
);

type AddToCalendarDialogProps = ComponentProps<typeof LazyAddToCalendarDialog>;

/** 日历弹窗按需加载；关闭时保留订阅快照，让原有退出动画完成。 */
export function AddToCalendarDialog(props: AddToCalendarDialogProps) {
  if (!props.open && !props.subscription && !props.loadingPreview) return null;

  return (
    <Suspense fallback={null}>
      <LazyAddToCalendarDialog {...props} />
    </Suspense>
  );
}
