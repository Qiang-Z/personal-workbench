from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
PUBLIC = ROOT / 'public'
ASSETS = ROOT / 'assets'
OUT = ROOT.parent / 'portable'
OUT_ASSETS = OUT / 'assets'

ORDER = [
    'legacy/legacy-app.js',
    'data/state.js',
    'data/repository.js',
    'data/import-export.js',
    'data/backup/backup-repo.js',
    'data/sync/sync-adapter.js',
    'domain/tasks/recurrence.js',
    'domain/projects/health.js',
    'domain/overview/summary.js',
    'domain/review/overview.js',
    'domain/finance/metrics.js',
    'domain/research/summary.js',
    'domain/life/summary.js',
    'domain/health/metrics.js',
    'app/module-registry.js',
    'app/page-registry.js',
    'ui/helpers/panel-kit.js',
    'ui/components/research-panels.js',
    'ui/components/life-panels.js',
    'ui/components/health-panels.js',
    'ui/pages/overview-page.js',
    'ui/pages/overview-page-main.js',
    'ui/pages/work-page.js',
    'ui/pages/finance-page.js',
    'ui/pages/research-page.js',
    'ui/pages/life-page.js',
    'ui/pages/sport-page.js',
    'ui/pages/habit-page.js',
    'ui/pages/review-page.js',
    'app/bootstrap.js',
    'app/store.js',
    'app/selectors.js',
    'app/page-router.js',
    'app/actions.js',
    'app/store-action-bridge.js',
    'app/module-preferences.js',
    'ui/pages/more-page.js',
    'app/bootstrap-phase3.js',
    'app/bootstrap-phase4.js',
    'app/bootstrap-phase5.js',
    'app/bootstrap-phase6.js',
    'app/bootstrap-phase7.js',
    'app/bootstrap-phase8.js',
    'app/bootstrap-phase9.js',
    'main.js',
]

if OUT.exists():
    shutil.rmtree(OUT)
OUT_ASSETS.mkdir(parents=True, exist_ok=True)

html = (PUBLIC / '个人工作台.html').read_text(encoding='utf-8')
css = (ASSETS / 'app.css').read_text(encoding='utf-8')
parts = []
for rel in ORDER:
    p = SRC / rel
    parts.append('\n/* ===== FILE: ' + rel + ' ===== */\n')
    parts.append(p.read_text(encoding='utf-8'))
js = ''.join(parts)

(OUT / '个人工作台.html').write_text(html, encoding='utf-8')
(OUT_ASSETS / 'app.css').write_text(css, encoding='utf-8')
(OUT_ASSETS / 'app.js').write_text(js, encoding='utf-8')
print('Built portable package at', OUT)
