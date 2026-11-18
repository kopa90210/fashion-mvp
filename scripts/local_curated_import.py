"""Strict, auditable loopback-only import of an existing curated PNG cache."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

import httpx
from dotenv import dotenv_values
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.bootstrap_curated_catalog import (BootstrapError,
    _catalog_row, catalog_collection, inventory_dataset)


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def validate(root):
    inventory = inventory_dataset(root)
    rejected = [r.__dict__ for r in inventory.rejected]
    seen_ids, seen_sources, items = set(), set(), []
    for candidate in inventory.valid:
        if candidate.item_id in seen_ids or candidate.source_relative_path in seen_sources:
            rejected.append({'manifest_path': candidate.source_relative_path, 'reason': 'duplicate source/deterministic ID'})
            continue
        seen_ids.add(candidate.item_id)
        seen_sources.add(candidate.source_relative_path)
        items.append(candidate)
    referenced_pngs = set()
    for path in sorted((root / 'manifests').rglob('*.json')):
        try:
            raw = json.loads(path.read_text(encoding='utf-8'))
            source = Path(raw['source_relative_path'])
            if path.resolve() != (root / 'manifests' / source).with_suffix('.json').resolve():
                raise ValueError('manifest location disagrees with source path')
            expected = source.with_suffix('.png').as_posix()
            png = (root / 'processed' / source).with_suffix('.png').resolve()
            if not png.is_relative_to((root / 'processed').resolve()):
                raise ValueError('processed PNG escapes the dataset')
            referenced_pngs.add(png)
            if raw['cutout'].get('processed_relative_path') != expected:
                raise ValueError('processed_relative_path disagrees with source path')
        except (ValueError, KeyError, TypeError) as exc:
            rejected.append({'manifest_path': path.relative_to(root).as_posix(), 'reason': str(exc)})
    for png in sorted((root / 'processed').rglob('*.png')):
        if png.resolve() not in referenced_pngs:
            rejected.append({'manifest_path': png.relative_to(root).as_posix(), 'reason': 'processed PNG has no matching manifest'})
    grouped = Counter((catalog_collection(c.source_relative_path, c.presentation_profile), c.attributes['category']) for c in items)
    collections = {collection for collection, _ in grouped}
    if not {'masculine', 'feminine'} <= collections:
        rejected.append({'manifest_path': '<dataset>', 'reason': 'both masculine and feminine collections are required'})
    report = {'valid': len(items), 'rejected': rejected,
              'counts': [{'collection': k[0], 'category': k[1], 'count': v} for k,v in sorted(grouped.items())],
              'raw_hash_check': 'photo_sha256 validated as identity; raw originals are not required or regenerated',
              'items': [{'id': c.item_id, 'name': c.attributes['display_name'], 'source': c.source_relative_path,
                         'category': c.attributes['category'], 'collection': catalog_collection(c.source_relative_path,c.presentation_profile)} for c in items]}
    return items, report


class LocalAPI:
    def __init__(self):
        env = dotenv_values(ROOT / '.env.development.local')
        self.url = (env.get('SUPABASE_URL') or env.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
        parsed = urlparse(self.url)
        if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1','localhost','::1'} or parsed.path or parsed.query or parsed.username:
            raise BootstrapError('local development Supabase must be a plain HTTP loopback origin')
        if env.get('NEXT_PUBLIC_SUPABASE_URL','').rstrip('/') != self.url:
            raise BootstrapError('app and importer must use the same local Supabase origin')
        key = env.get('SUPABASE_SERVICE_KEY') or env.get('SUPABASE_SECRET_KEY')
        if not key:
            raise BootstrapError('local development service credential is missing')
        headers = {'apikey': key}
        if not key.startswith('sb_secret_'):
            headers['Authorization'] = 'Bearer ' + key
        self.http = httpx.Client(base_url=self.url, headers=headers, timeout=60, follow_redirects=False)
        self.writes = Counter()

    def request(self, method, path, **kwargs):
        if not path.startswith('/') or path.startswith('//'):
            raise BootstrapError('only local relative API paths are allowed')
        result = self.http.request(method, path, **kwargs)
        if not result.is_success:
            raise BootstrapError(f'local {method} operation failed; HTTP status {result.status_code}')
        if method in {'POST','PATCH','DELETE','PUT'}:
            self.writes[method] += 1
        return result

    def rows(self, table, params=None):
        result, offset = [], 0
        while True:
            page = self.request('GET', '/rest/v1/' + table,
                params={**(params or {}), 'select':'*', 'order':'id' if table=='wardrobe_items' else 'item_id,user_id', 'offset':offset, 'limit':1000}).json()
            result.extend(page)
            if len(page) < 1000:
                return result
            offset += 1000


def plan_import(api, items):
    before = {'curated': api.rows('wardrobe_items', {'source':'eq.curated'}),
              'ownership': api.rows('user_wardrobe_items')}
    existing = {row['id']:row for row in before['curated']}
    actions = []
    for item in items:
        path = f'curated/{item.item_id}.png'
        image_url = f'{api.url}/storage/v1/object/public/wardrobe-images/{path}'
        collection = catalog_collection(item.source_relative_path, item.presentation_profile)
        row = existing.get(item.item_id)
        if row:
            if row['status'] != 'confirmed' or row['image_url'] != image_url:
                raise BootstrapError('existing curated row has conflicting status or image path')
            if row.get('catalog_collection') not in (None, collection):
                raise BootstrapError('existing curated row has conflicting collection')
            image = api.request('GET', f'/storage/v1/object/public/wardrobe-images/{path}').content
            with Image.open(io.BytesIO(image)) as decoded:
                if decoded.format != 'PNG':
                    raise BootstrapError('local image endpoint did not return PNG')
                decoded.verify()
            if hashlib.sha256(image).digest() != hashlib.sha256(item.processed_path.read_bytes()).digest():
                raise BootstrapError('existing image differs from validated processed PNG')
            action = 'label' if row.get('catalog_collection') is None else 'skip'
        else:
            # Check all rows, including non-curated collisions, before any upload.
            collision = api.request('GET','/rest/v1/wardrobe_items',params={'id':'eq.'+item.item_id,'select':'id'}).json()
            if collision:
                raise BootstrapError('deterministic ID is already used by a non-curated row')
            probe = api.http.get(f'/storage/v1/object/public/wardrobe-images/{path}')
            if probe.status_code not in (400,404):
                raise BootstrapError('unexpected/preexisting storage object; refusing overwrite')
            action = 'insert'
        actions.append({'id':item.item_id,'action':action,'collection':collection,'image_url':image_url,'object_path':path})
    return before, actions


def execute(api, items, actions, audit):
    for item, action in zip(items,actions):
        if action['action']=='skip':
            continue
        if action['action']=='label':
            response = api.request('PATCH','/rest/v1/wardrobe_items',
                params={'id':'eq.'+item.item_id,'source':'eq.curated','status':'eq.confirmed','catalog_collection':'is.null'},
                headers={'Prefer':'return=representation'},json={'catalog_collection':action['collection']})
            if len(response.json()) != 1:
                raise BootstrapError('label update lost a preflight condition')
        else:
            api.request('POST','/storage/v1/object/wardrobe-images/'+action['object_path'],
                        content=item.processed_path.read_bytes(), headers={'Content-Type':'image/png','x-upsert':'false'})
            api.request('POST','/rest/v1/wardrobe_items',json=_catalog_row(item,action['image_url']))
        action['completed']=True
        save(audit,actions)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset-root',type=Path,required=True)
    parser.add_argument('--report-dir',type=Path,required=True)
    parser.add_argument('--mode',choices=['dry-run','preflight','apply'],default='dry-run')
    args=parser.parse_args()
    api=None
    try:
        items,report=validate(args.dataset_root.resolve())
        save(args.report_dir/'validation.json',report)
        print(json.dumps({k:v for k,v in report.items() if k!='items'},indent=2))
        if report['rejected']:
            raise BootstrapError('file validation gate failed; no import allowed')
        if args.mode=='dry-run': return 0
        api=LocalAPI()
        bucket=api.request('GET','/storage/v1/bucket/wardrobe-images').json()
        if not bucket.get('public'):
            raise BootstrapError('local wardrobe-images bucket must already be public')
        before,actions=plan_import(api,items)
        save(args.report_dir/'before.json',before)
        save(args.report_dir/'preflight.json',actions)
        print('Local preflight:',dict(Counter(a['action'] for a in actions)))
        if args.mode=='preflight': return 0
        execute(api,items,actions,args.report_dir/'audit.json')
        after,second=plan_import(api,items)
        if before['ownership']!=after['ownership']:
            raise BootstrapError('ownership links changed')
        updated={r['id']:r for r in after['curated']}
        for row in before['curated']:
            assert {k:v for k,v in row.items() if k!='catalog_collection'}=={k:v for k,v in updated[row['id']].items() if k!='catalog_collection'}, 'existing row fields changed'
        if any(a['action']!='skip' for a in second):
            raise BootstrapError('idempotency preflight failed')
        writes_before=dict(api.writes)
        execute(api,items,second,args.report_dir/'second-audit.json')
        assert dict(api.writes)==writes_before, 'second import wrote data'
        save(args.report_dir/'after.json',after)
        summary={'actions':dict(Counter(a['action'] for a in actions)), 'writes':dict(api.writes),'second_run_writes':0,
                 'ownership_unchanged':True,'existing_fields_preserved':True,'local_url':api.url,
                 'final_counts':[{'collection':k[0],'category':k[1],'count':v} for k,v in sorted(Counter((r.get('catalog_collection') or 'unlabeled',r.get('category') or 'unknown') for r in after['curated']).items())]}
        save(args.report_dir/'result.json',summary)
        print(json.dumps(summary,indent=2))
        return 0
    except (BootstrapError,AssertionError) as exc:
        print('LOCAL IMPORT STOPPED:',str(exc),file=sys.stderr)
        return 1
    finally:
        if api: api.http.close()


if __name__=='__main__':
    raise SystemExit(main())
