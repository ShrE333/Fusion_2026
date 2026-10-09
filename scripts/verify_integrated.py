"""Offline static checks for the combined GeoSathi contract.
Does not claim provider availability or mobile-browser runtime success.
"""
import ast
import sys
from pathlib import Path
repo=Path(sys.argv[1]).resolve()
checks={
    'shared source GIS+SkyCLIP':'src/lib/server/geoai-search.ts',
    'frontend search contract':'src/app/api/skyclip/search/route.ts',
    'authenticated WA search':'src/app/api/infra-search/route.ts',
    'mobile inspection route':'src/app/inspect/page.tsx',
    'map result component':'src/components/map/atlas-map.tsx',
    'WhatsApp native list':'apps/whatsapp/app/waha.py',
    'WhatsApp loop':'apps/whatsapp/app/main.py',
    'location binding':'src/app/page.tsx',
}
for label,path in checks.items():
    f=repo/path
    assert f.is_file(),(label,path)
    assert f.stat().st_size>100,(label,"empty")
    print('OK',label)
for rel in ['apps/whatsapp/app/main.py','apps/whatsapp/app/waha.py','apps/whatsapp/app/geo_links.py', 'apps/whatsapp/app/i18n.py']:
    ast.parse((repo/rel).read_text(encoding='utf8'),filename=rel)
print('OK Python syntax')
content=(repo/'apps/whatsapp/app/main.py').read_text(encoding='utf8')
assert 'inspect_url' in content and 'send_language_menu' in content
assert 'language_en' in content and 'language_hi' in content and 'language_mr' in content
assert 'send_menu(session,chat' in content
print('OK mobile deep links and language selection')
service=(repo/'src/lib/server/geoai-search.ts').read_text(encoding='utf8')
assert 'matchesSurface' in service and 'hasSubtype' in service
assert 'inside(t.bbox,bbox)' in service
assert 'normalizeGeometry(f.geometry)' in service
print('OK GIS semantic filters and geographic boundary guard')
print('PASS static contract checks. Live provider, WAHA delivery, and Vercel browser still require smoke tests.')
