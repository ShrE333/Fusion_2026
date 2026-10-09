import hashlib
import hmac
import json
from fastapi.testclient import TestClient
from app.main import app, extract_location
from app.config import settings

def test_location():
    assert extract_location({'location':{'latitude':18.5,'longitude':73.8}})=={'lat':18.5,'lon':73.8}
    assert extract_location({'location':{'latitude':99,'longitude':73.8}}) is None

def test_auth(tmp_path):
    settings.db_path=str(tmp_path/'t.db')
    settings.waha_hmac_secret='test-secret'
    with TestClient(app) as client:
        assert client.get('/health').status_code==200
        assert client.post('/webhooks/waha',json={}).status_code==401
        data={'event':'state.change','session':'test'}
        raw=json.dumps(data).encode()
        sig=hmac.new(b'test-secret',raw,hashlib.sha512).hexdigest()
        r=client.post('/webhooks/waha',content=raw,headers={'X-Webhook-Hmac':sig,'X-Webhook-Hmac-Algorithm':'sha512'})
        assert r.status_code==200
