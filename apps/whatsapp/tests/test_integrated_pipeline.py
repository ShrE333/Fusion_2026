from urllib.parse import parse_qs, urlparse

import pytest
from PIL import Image
from app import main, waha
from app.geo_links import inspect_url


def test_link_preserves_gps_query_and_feature_without_secrets():
    query = 'रुग्णालय near me & roads'
    args = parse_qs(urlparse(inspect_url(18.5204, 73.8567, query, 'osm:places:42')).query)
    assert args == {'lat': ['18.5204000'], 'lon': ['73.8567000'], 'q': [query], 'feature_id': ['osm:places:42']}


@pytest.mark.parametrize('language', ['en', 'hi', 'mr'])
@pytest.mark.asyncio
async def test_native_language_and_service_lists(monkeypatch, language):
    sent = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            sent.append(kwargs['json'])
            class Response:
                def raise_for_status(self): pass
            return Response()
    monkeypatch.setattr(waha.httpx, 'AsyncClient', Client)
    assert await waha.send_language_menu('s', '1@c.us', language=language) == 'list'
    assert await waha.send_menu('s', '1@c.us', 'fallback', language) == 'list'
    for payload in sent:
        ids = [row['rowId'] for section in payload['message']['sections'] for row in section['rows']]
        assert {'language_en', 'language_hi', 'language_mr'} <= set(ids)
    assert {'road', 'infrastructure'} <= set(ids)
    assert main.extract_selection({'selectedRowId': 'language_mr'}) == 'language_mr'


@pytest.mark.asyncio
async def test_search_passes_text_and_gps_then_delivers_link_and_recurring_menu(monkeypatch):
    calls, messages, menus = [], [], []
    loc = {'lat': 18.5204, 'lon': 73.8567}
    async def worker(url, data):
        calls.append(data)
        return {'gis_verified': True, 'gis_layer': 'places', 'results': [{'id':'osm:places:42', 'name':'Hospital', 'center':loc}]}
    async def text(*args): messages.append(args[-1])
    async def menu(*args): menus.append(args)
    monkeypatch.setattr(main.settings, 'infra_search_url', 'https://atlas.example.test/api/infra-search')
    monkeypatch.setattr(main, 'call_worker', worker)
    monkeypatch.setattr(main, 'send_text', text)
    monkeypatch.setattr(main, 'send_menu', menu)
    monkeypatch.setattr(main.store, 'save_search', lambda *args: None)
    await main.finish_search('s', '1@c.us', 'SEARCH-1', 'hospital near me', loc, 'hi')
    assert calls[0]['query'] == 'hospital near me'
    assert calls[0]['location'] == loc
    assert any('/inspect?' in message and 'feature_id=osm%3Aplaces%3A42' in message for message in messages)
    assert not menus
    assert len(messages) == 1
    assert messages[0].count('/inspect?') == 1
    assert 'SEARCH-1' not in messages[0]


@pytest.mark.asyncio
async def test_pothole_detection_delivers_annotated_image_and_recurring_menu(monkeypatch, tmp_path):
    image = tmp_path / 'road.png'
    Image.new('RGB', (40, 40)).save(image)
    sent, menus, saved = [], [], []
    async def detector(_): return {'potholes_count':1, 'detections':[{'confidence':0.8, 'bbox':{'x1':1,'y1':1,'x2':20,'y2':20}}]}
    async def send_image(*args): sent.append(args)
    async def text(*args): pass
    async def menu(*args): menus.append(args)
    monkeypatch.setattr(main.settings, 'road_inference_url', 'https://road.example.test/predict')
    monkeypatch.setattr(main, 'call_road_detector', detector)
    monkeypatch.setattr(main, 'send_image', send_image)
    monkeypatch.setattr(main, 'send_text', text)
    monkeypatch.setattr(main, 'send_menu', menu)
    monkeypatch.setattr(main.store, 'save_report', lambda *args: saved.append(args))
    await main.finish_report('s', '1@c.us', 'REPORT-1', image, {'lat':18.52,'lon':73.85}, 'mr')
    assert len(sent) == 1 and sent[0][2].is_file()
    assert not menus
    assert saved
