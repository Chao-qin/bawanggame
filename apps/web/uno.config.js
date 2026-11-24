import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    colors: {
      app: 'var(--ui-background)',
      soft: 'var(--ui-surface)',
      card: 'var(--ui-raised)',
      line: 'var(--ui-border)',
      text: 'var(--ui-text)',
      dim: 'var(--ui-muted)',
      accent: 'var(--ui-accent)',
      danger: 'var(--ui-danger)',
    },
  },
  shortcuts: {
    player: 'fixed inset-0 z-20 bg-[#05070a]',
    playerStage: 'absolute inset-0 bg-[#05070a]',
    runtimeView: 'absolute inset-0 flex items-center justify-center overflow-hidden',
    runtimeError: 'absolute inset-5 z-100 grid place-items-center whitespace-pre-wrap text-red-300',
    'runtime-view': 'absolute inset-0 flex items-center justify-center overflow-hidden',
    'runtime-stage': 'flex h-full min-h-0 min-w-0 w-full items-center justify-center overflow-hidden',
    playerExit: 'fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/50 text-2xl text-white backdrop-blur sm:left-4 sm:top-4',
    exitConfirm: 'fixed inset-0 z-[300] grid place-items-center bg-black/60 p-5',
    exitBox: 'grid w-full max-w-sm gap-3 rounded-lg border border-line bg-card p-5 text-text shadow-2xl',
    runtimeToolbar: 'absolute left-1/2 top-[max(8px,var(--safe-area-top,env(safe-area-inset-top,0px)))] z-200 flex w-[calc(100%-16px)] max-w-[720px] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-white/15 bg-[var(--ui-surface)] px-2 py-1.5 text-xs text-white shadow-lg sm:top-[max(12px,var(--safe-area-top,env(safe-area-inset-top,0px)))] sm:gap-2 sm:px-3 sm:py-2',
    runtimeToolbarContent: 'flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2',
    runtimeToolbarToggle: 'hidden h-9 w-9 shrink-0 place-items-center rounded-md border border-white/20 bg-[var(--ui-surface)] p-0 text-[11px] font-bold text-white/80 transition hover:border-white/40 hover:text-white active:bg-white/20',
    runtimeToolbarCollapsed: 'w-10 max-w-10 rounded-md p-0',
    runtimeToolbarButton: 'min-h-8 shrink-0 appearance-none rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:bg-white/20 sm:px-2.5',
    runtimeToolbarBack: 'w-8 px-0 text-xl leading-none',
    runtimeToolbarIconButton: 'text-base leading-none',
    runtimeToolbarSpacer: 'min-w-0 flex-1',
    runtimeLive: 'flex items-center gap-1.5 text-[#b0f4dc]',
    runtimeGame: 'max-w-[35vw] overflow-hidden text-ellipsis whitespace-nowrap text-white/65',
    runtimeStatusDot: 'text-[#b0f4dc]',
    runtimeBoot: 'absolute inset-0 z-[140] grid place-content-center place-items-center gap-3 bg-[#05070a] text-sm text-white/70',
    runtimeFrameBoot: 'fixed inset-0 z-[1]',
    runtimeBootSpinner: 'h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent',
    runtimeFailure: 'absolute inset-5 z-[150] grid max-w-md place-self-center gap-3 rounded-lg border border-red-300/20 bg-[var(--ui-background)] p-5 text-center text-sm text-red-100 shadow-2xl',
    runtimeFailureButton: 'mt-1 min-h-10 rounded-lg border border-red-200/25 bg-red-200/10 px-4 text-sm font-semibold text-white hover:bg-red-200/20 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
    deviceStatus: 'hidden',
    deviceStatusRight: 'flex items-center gap-1.5 text-white/70',
  },
  preflights: [{
    // The player's stage and toolbar room are laid out in mobile-ui.css (fixed, whether the toolbar is collapsed or
    // not); only the collapsed toolbar's own look lives here.
    getCSS: () => ':root{--safe-area-top:env(safe-area-inset-top,0px);--safe-area-right:env(safe-area-inset-right,0px);--safe-area-bottom:env(safe-area-inset-bottom,0px);--safe-area-left:env(safe-area-inset-left,0px)}.runtimeToolbar.runtimeToolbarCollapsed{border:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;left:max(8px,var(--safe-area-left,env(safe-area-inset-left,0px)));right:auto;transform:none}',
  }],
})
