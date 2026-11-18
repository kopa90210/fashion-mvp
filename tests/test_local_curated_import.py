import io
import json
from pathlib import Path

import pytest
from PIL import Image

from curated_pipeline.cache import build_manifest
from scripts.bootstrap_curated_catalog import catalog_collection
from scripts.local_curated_import import validate, LocalAPI, BootstrapError, execute


def write_item(root, source, digest):
    attributes = dict(category='top', subcategory='shirt', display_name='Test shirt',
        color={'primary':'white'}, material={'primary':'cotton'}, fit={'primary':'regular'},
        pattern='solid', style_tags={'minimal':1}, formality_score=.5,
        season_weights={'spring':1}, layer_role='base_layer', model_confidence=.9)
    buffer = io.BytesIO()
    Image.new('RGBA',(2,2),(255,255,255,255)).save(buffer,format='PNG')
    png = buffer.getvalue()
    manifest = build_manifest(Path(source),digest,'neutral','top',attributes,png,2,2)
    for folder, suffix, content in [('manifests','.json',json.dumps(manifest).encode()),('processed','.png',png)]:
        path=(root/folder/source).with_suffix(suffix)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(content)
    return (root/'processed'/source).with_suffix('.png')


@pytest.mark.parametrize('folder,expected',[('muscline','masculine'),('musculine','masculine'),('femine','feminine')])
def test_legacy_aliases(folder,expected):
    assert catalog_collection(folder+'/tops/a.png','neutral')==expected


def test_both_collections_and_hashes_validate(tmp_path):
    write_item(tmp_path,'muscline/tops/a.png','a'*64)
    write_item(tmp_path,'femine/tops/b.png','b'*64)
    items,report=validate(tmp_path)
    assert len(items)==2 and report['rejected']==[]


@pytest.mark.parametrize('problem',['duplicate','missing','hash','ambiguous','missing_collection','wrong_path','orphan'])
def test_file_gate_rejects_invalid_batch(tmp_path,problem):
    png=write_item(tmp_path,'musculine/tops/a.png','a'*64)
    write_item(tmp_path,'feminine/tops/b.png','b'*64)
    if problem=='duplicate': write_item(tmp_path,'musculine/tops/c.png','a'*64)
    if problem=='missing': png.unlink()
    if problem=='hash': png.write_bytes(b'not a PNG')
    if problem=='ambiguous': write_item(tmp_path,'musculine/femine/tops/c.png','c'*64)
    if problem=='missing_collection':
        (tmp_path/'manifests/feminine/tops/b.json').unlink()
    if problem=='wrong_path':
        (tmp_path/'manifests/musculine/tops/a.json').rename(tmp_path/'manifests/musculine/tops/renamed.json')
    if problem=='orphan': (tmp_path/'processed/orphan.png').write_bytes(b'orphan')
    assert validate(tmp_path)[1]['rejected']


def test_non_loopback_config_is_rejected_before_http(monkeypatch):
    monkeypatch.setattr('scripts.local_curated_import.dotenv_values',lambda _: {'SUPABASE_URL':'https://hosted.invalid','NEXT_PUBLIC_SUPABASE_URL':'https://hosted.invalid'})
    with pytest.raises(BootstrapError,match='loopback'): LocalAPI()


def test_existing_label_update_does_not_write_other_fields(tmp_path):
    calls=[]
    class Fake:
        def request(self,*args,**kwargs):
            calls.append((args,kwargs))
            class Response:
                def json(self): return [{'id':'test'}]
            return Response()
    from types import SimpleNamespace
    execute(Fake(),[SimpleNamespace(item_id='test')],[{'id':'test','action':'label','collection':'masculine'}],tmp_path/'audit.json')
    assert calls[0][0]==('PATCH','/rest/v1/wardrobe_items')
    assert calls[0][1]['json']=={'catalog_collection':'masculine'}
    assert calls[0][1]['params']['catalog_collection']=='is.null'
