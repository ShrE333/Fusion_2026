import pytest
import httpx
from app.main import extract_selection
from app.waha import send_menu


def test_gows_list_selection():
    payload={'_data':{'Message':{'listResponseMessage':{'singleSelectReply':{'selectedRowID':'road'}}}}}
    assert extract_selection(payload)=='road'
    assert extract_selection({'selectedRowId':'infrastructure'})=='infrastructure'

@pytest.mark.asyncio
async def test_send_menu_fallback(monkeypatch):
    from app import waha
    sent=[]
    async def fake_send_text(session,chat,text): sent.append((session,chat,text))
    monkeypatch.setattr(waha,'send_text',fake_send_text)
    class FailClient:
        def __init__(self,*args,**kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def post(self,*args,**kwargs):
            request=httpx.Request('POST','https://test.local/api/sendList')
            resp=httpx.Response(501,request=request)
            raise httpx.HTTPStatusError('unsupported',request=request,response=resp)
    monkeypatch.setattr(waha.httpx,'AsyncClient',FailClient)
    assert await send_menu('session','user@c.us','fallback')=='text_fallback'
    assert sent==[('session','user@c.us','fallback')]
