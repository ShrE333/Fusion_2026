import json
import sqlite3
from pathlib import Path
from .config import settings


def conn():
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.db_path, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=10000')
    return db


def init():
    with conn() as db:
        db.execute('CREATE TABLE IF NOT EXISTS chats (chat_id TEXT PRIMARY KEY, state TEXT NOT NULL, draft TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS seen (message_id TEXT PRIMARY KEY)')
        db.execute('CREATE TABLE IF NOT EXISTS reports (report_id TEXT PRIMARY KEY, chat_id TEXT, lat REAL, lon REAL, media_path TEXT, status TEXT, result_json TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS searches (search_id TEXT PRIMARY KEY, chat_id TEXT, query TEXT, area_json TEXT, status TEXT, result_json TEXT)')


def get_chat(chat_id):
    with conn() as db:
        row = db.execute('SELECT state,draft FROM chats WHERE chat_id=?', (chat_id,)).fetchone()
    return (row['state'], json.loads(row['draft'])) if row else ('MENU', {})


def set_chat(chat_id,state,draft=None):
    with conn() as db:
        db.execute('INSERT INTO chats VALUES (?,?,?) ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state,draft=excluded.draft', (chat_id,state,json.dumps(draft or {})))


def mark_once(message_id):
    with conn() as db:
        cur=db.execute('INSERT OR IGNORE INTO seen(message_id) VALUES (?)', (message_id,))
        return cur.rowcount==1


def save_report(report_id, chat_id, lat, lon, media_path, status='pending_inference', result=None):
    with conn() as db:
        db.execute('INSERT INTO reports VALUES(?,?,?,?,?,?,?) ON CONFLICT(report_id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json', (report_id,chat_id,lat,lon,media_path,status,json.dumps(result or {})))


def save_search(search_id,chat_id,query,area,status='pending',result=None):
    with conn() as db:
        db.execute('INSERT INTO searches VALUES(?,?,?,?,?,?) ON CONFLICT(search_id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json', (search_id,chat_id,query,json.dumps(area),status,json.dumps(result or {})))
