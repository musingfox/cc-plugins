export const PANE = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'omp-quota',
  viewport: { columns: 160, rows: 40 },
  props: {
    title: 'omp quota',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const
