"""Tests for clear, non-duplicated WhatsApp bot messages."""
import pytest
from app import main
from app.whatsapp_copy import road_message, search_message, safe_text, progress_message


def test_gis_message_is_short_has_one_link_no_internal_ids():
    url = 'https://geosathi-atlas.vercel.app/inspect?lat=18.50&lon=73.90'
    msg = search_message('en', 'Find unpaved paths near 100m', mode='gis', count=10,
                         layer='roads', name='Track', map_url=url)
    assert '10 mapped roads features' in msg
    assert 'Track' in msg
    assert msg.count(url) == 1
    assert 'Search Q-' not in msg
    assert 'MENU' in msg
    assert 'not independently verified' in msg


def test_caution_and_no_fake_matches():
    for lang in ['en', 'hi', 'mr']:
        msg = search_message(lang, 'hospital nearby', mode='candidate', count=2,
                             map_url='https://example.test/map')
        assert msg.count('https://example.test/map') == 1
        assert 'MENU' in msg
        empty = search_message(lang, 'hospital nearby', mode='empty')
        assert 'http' not in empty
        assert 'MENU' in empty


def test_untrusted_text_flattened_and_limited():
    assert '\n' not in safe_text('Track\n*CONFIRMED*\u202e')
    assert '*' not in safe_text('Track *CONFIRMED*')
    assert len(safe_text('a'*1000)) == 120


def test_no_detection_makes_no_safety_promise():
    message = road_message('en','zero',count=0,map_url='https://example.test/map')
    assert 'saved for review' in message
    assert message.count('https://example.test/map') == 1
    assert 'safe' not in message.lower()


@pytest.mark.asyncio
async def test_search_sends_only_one_final_message_and_no_menu(monkeypatch):
    messages,menus=[] , []
    monkeypatch.setattr(main.settings,'infra_search_url','https://gis.test/search')
    async def worker(_url,_data):
        return {'gis_verified':True,'gis_layer':'roads','results':[{'id':'osm:roads:1','name':'Track'}]}
    async def send(_session,_chat,text):messages.append(text)
    async def menu(*args):menus.append(args)
    monkeypatch.setattr(main,'call_worker',worker)
    monkeypatch.setattr(main,'send_text',send)
    monkeypatch.setattr(main,'send_menu',menu)
    monkeypatch.setattr(main.store,'save_search',lambda *a:None)
    await main.finish_search('s','1@c.us','Q-SECRET','Find paths nearby',{'lat':18.5,'lon':73.9},'en')
    assert len(messages)==1
    assert not menus
    assert 'Q-SECRET' not in messages[0]
    assert messages[0].count('/inspect?')==1


def test_progress_hides_request_ids():
    for lang in ['en','hi','mr']:
        assert progress_message(lang,'search')
        assert progress_message(lang,'road')
