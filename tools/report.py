"""Сводка по прогрессу пользователей из Firestore (только чтение).

Ключ служебного аккаунта (роль Cloud Datastore Viewer) лежит вне репозитория:
  C:\\Users\\User\\.secrets\\art-eye-reader.json  (или путь в переменной ARTEYE_KEY)
Запуск:  python tools/report.py          — сводка
         python tools/report.py --days   — плюс активность по дням
"""
import json, os, sys, time
from datetime import datetime
from collections import Counter

from google.cloud import firestore
from google.oauth2 import service_account

KEY = os.environ.get('ARTEYE_KEY', r'C:\Users\User\.secrets\art-eye-reader.json')
DAY = 86400_000


def mask(email):
    if not email or '@' not in email: return ''
    name, dom = email.split('@', 1)
    return name[:2] + '…@' + dom


def fmt(ms):
    return datetime.fromtimestamp(ms / 1000).strftime('%d.%m %H:%M') if ms else '—'


def summarize(uid, doc, field, site):
    s = json.loads(doc[field])
    log = s.get('log') or []
    arts = s.get('artists') or {}
    days = s.get('days') or {}
    answers = sum(days.values())
    recent = [x for x in log if not x.get('ex')][-50:]
    acc = round(100 * sum(1 for x in recent if x.get('ok')) / len(recent)) if recent else None
    first = min([a.get('intro') or 0 for a in arts.values()] or [0]) or (log[0]['t'] if log else 0)
    last = doc.get('updatedAt') or s.get('updatedAt') or 0
    return dict(
        id=uid[:6], site=site, kind='гость' if doc.get('anon') else 'аккаунт', email=mask(doc.get('email')),
        artists=len(arts), sessions=s.get('sessions') or 0, ndays=len(days), answers=answers,
        acc=acc, first=first, last=last, days=days,
        exams=len(s.get('exams') or []),
    )


def main():
    creds = service_account.Credentials.from_service_account_file(KEY)
    db = firestore.Client(project=creds.project_id, credentials=creds)
    rows, empty = [], 0
    for d in db.collection('users').stream():
        doc = d.to_dict()
        found = False
        for field, site in (('state', 'прод'), ('stateBeta', 'стенд')):
            if doc.get(field):
                try:
                    rows.append(summarize(d.id, doc, field, site)); found = True
                except Exception as e:
                    print(f'! {d.id[:6]} {field}: {e}')
        if not found: empty += 1

    now = time.time() * 1000
    rows.sort(key=lambda r: -r['last'])
    print(f"Записей с прогрессом: {len(rows)}  (пустых документов: {empty})")
    c = Counter((r['site'], r['kind']) for r in rows)
    print('  ' + ', '.join(f'{s} / {k}: {n}' for (s, k), n in sorted(c.items())))
    active = lambda days: sum(1 for r in rows if now - r['last'] < days * DAY)
    print(f"Активны за сутки: {active(1)}, за 7 дней: {active(7)}, за 30 дней: {active(30)}")
    real = [r for r in rows if r['sessions'] > 0]
    if real:
        print(f"Хотя бы одно занятие: {len(real)};  2+ дня: {sum(1 for r in real if r['ndays'] >= 2)};  "
              f"бросили (>7 дней нет): {sum(1 for r in real if now - r['last'] > 7 * DAY)}")
    print()
    hdr = f"{'id':6} {'сайт':5} {'кто':7} {'худ':>4} {'зан':>4} {'дней':>4} {'отв':>5} {'точн':>5} {'начал':>11} {'последний':>11}  email"
    print(hdr); print('-' * len(hdr))
    for r in rows:
        acc = f"{r['acc']}%" if r['acc'] is not None else '—'
        print(f"{r['id']:6} {r['site']:5} {r['kind']:7} {r['artists']:>4} {r['sessions']:>4} {r['ndays']:>4} {r['answers']:>5} "
              f"{acc:>5} {fmt(r['first']):>11} {fmt(r['last']):>11}  {r['email']}")

    if '--days' in sys.argv:
        print('\nОтветов по дням (все пользователи):')
        tot, ppl = Counter(), Counter()
        for r in rows:
            for k, v in r['days'].items(): tot[k] += v; ppl[k] += 1
        for k in sorted(tot)[-30:]:
            print(f"  {k}  людей {ppl[k]:>3}  ответов {tot[k]:>5}")


if __name__ == '__main__':
    main()
