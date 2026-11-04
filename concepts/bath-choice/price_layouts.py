"""Build 48 traceable internal quotes from actual geometry and live owner rules.

Writes local review data and native Sheets requests; never sends them itself.
The pricebook and R117 remain untouched.
"""
from pathlib import Path
from decimal import Decimal,ROUND_HALF_UP
import collections,copy,hashlib,json,math

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OUT=HERE/'pricing';OUT.mkdir(exist_ok=True)
source=json.loads((ROOT/'.local/pricing-sources/updated-v4.json').read_text('utf8'))
rules=json.loads((HERE/'pricing-decisions.json').read_text('utf8'))
registry=json.loads((ROOT/'output/bath-choice-prototype/choice/layouts.json').read_text('utf8'))
SID=source['spreadsheetId'];SHEET_PRICE=2026110401;SHEET_BOM=2026110402
PRICE='Планировки 3D · цены';BOM='Планировки 3D · состав'
model_ids={'Квадро':'kvadro','Парус':'parus','Викинг':'viking','Квадро Хаус':'kvadro-house'}
model_names={v:k for k,v in model_ids.items()}
def dump(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
def cents(value):return int((Decimal(str(value))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
def grid(name):
    sheet=next(s for s in source['sheets'] if s['properties']['title']==name);result={}
    for data in sheet['data']:
        for r,row in enumerate(data.get('rowData',[]),data.get('startRow',0)+1):
            for c,cell in enumerate(row.get('values',[]),data.get('startColumn',0)):
                result[r,c]=cell
    return result
def value(c):return next(iter(c.get('effectiveValue',{}).values()),next(iter(c.get('userEnteredValue',{}).values()),''))
def get(name,r,c):return value(grids[name].get((r,c),{}))
grids={name:grid(name) for name in ['РРЦ','Цены и прибыль','Методика','Тех · расчёт Делюкс','Квиз']}
reserve,discount,markup,assembly=[Decimal(str(get('Методика',r,1))) for r in [4,5,6,7]]
factor=(1+reserve)*(1-discount)*(1+markup);house_factor=factor+(1+reserve)*assembly
rrc={}
for r in range(2,238):
    sku=get('РРЦ',r,0)
    if not sku:continue
    raw=get('РРЦ',r,4);amount=Decimal(str(raw)) if isinstance(raw,(int,float)) else None
    rrc[sku]={'row':r,'label':get('РРЦ',r,2),'unit':get('РРЦ',r,3),'rrcRub':float(amount) if amount is not None else None,
      'customerUnitCents':{'standard':cents(amount*factor) if amount is not None else None,'house':cents(amount*house_factor) if amount is not None else None},'source':f'РРЦ!E{r}'}
assert all(rrc[sku]['rrcRub']==3000 for sku in ['OPT_149','LAYOUT_BENCH','LAYOUT_HANGER','LAYOUT_STEP'])
assert rrc['LAYOUT_SHOE']['rrcRub']==2000 and rrc['OPT_206']['rrcRub']==rrc['OPT_207']['rrcRub']==rrc['OPT_99']['rrcRub']==10000
assert rrc['OPT_100']['rrcRub']==14000 and all(rrc[sku]['rrcRub']==0 for sku in ['OPT_212','OPT_214','OPT_216','OPT_218'])
catalog={'version':'layout-pricing-v4-2026-11-04','approval':'internal_calculation','sourceUrl':source['spreadsheetUrl'],
 'unusedPackageAllowanceHasNoRefund':True,'roomUnitCents':{},'items':rrc,'models':{},'rules':rules}
room_rrc=sum(Decimal(str(get('Методика',34,1) if sku is None else rrc[sku]['rrcRub'])) for sku in [None,'OPT_77','OPT_74','OPT_175'])
catalog['roomUnitCents']={'standard':cents(room_rrc*factor),'house':cents(room_rrc*house_factor)}
assert catalog['roomUnitCents']=={'standard':1354050,'house':1481550}
catalog['items']['OPT_97']['customerUnitCents']={key:cents(rules['kitchen']['customerRub']) for key in ['standard','house']}
for size,row in [('12',8),('16',9)]:
    tariff=cents(get('Квиз',row,1));catalog['items']['ASTON_'+size+'_SWAP']={'label':'Доплата за замену печи ASTON '+size,'unit':'шт','rrcRub':None,'row':None,'customerUnitCents':{'standard':tariff,'house':tariff},'source':f'Квиз!B{row}'}
def sizekey(model,label):
    import re
    numbers=re.findall(r'\d+(?:[,.]\d+)?',label)
    return 'x'.join(numbers) if model=='kvadro-house' else str(int(Decimal(numbers[0].replace(',','.'))*100))
rooms={}
for r in range(8,28):
    model=model_ids[get('Тех · расчёт Делюкс',r,0)];key=sizekey(model,get('Тех · расчёт Делюкс',r,1));rooms[model,key]=(int(get('Тех · расчёт Делюкс',r,5)),int(get('Тех · расчёт Делюкс',r,6)))
for row in range(4,24):
    model=model_ids[get('Цены и прибыль',row,0)];size=sizekey(model,get('Цены и прибыль',row,1));cr,dr=rooms[model,size]
    if model=='kvadro-house':cr=dr=rules['houseIncludedRooms'][size]
    generic={'bench_lounge':2,'table':1,'upper':1,'lower':1,'entry':1,'steam_door':1,'main_window':1,'steam_window':1,'stove':1,'structure':1,'OPT_99':1}
    catalog['models'].setdefault(model,{'name':model_names[model],'sizes':{}})['sizes'][size]={
      'label':get('Цены и прибыль',row,1),'sourceRow':row,
      'comfort':{'priceCents':cents(get('Цены и прибыль',row,2)),'roomCount':cr,'included':generic},
      'deluxe':{'priceCents':cents(get('Цены и прибыль',row,6)),'roomCount':dr,'included':{**generic,'OPT_45':1,'OPT_57':1}}}

def distance(point,room):
    points=room['polygon_mm'];best=float('inf')
    for a,b in zip(points,points[1:]+points[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1];length=dx*dx+dy*dy;t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)) if length else 0
        best=min(best,(point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2)
    return best
def nearest(point,rooms):return min(rooms,key=lambda r:distance(point,r))['room_kind']
def included(key):return {'status':'resolved','operation':'included','inclusionKey':key}
def extra(sku):return {'status':'resolved','operation':'extra','sku':sku}
def replacement(sku):return {'status':'resolved','operation':'replace','sku':sku,'creditSku':'OPT_99','creditApproved':True}
def separate():return {'status':'resolved','operation':'separate_agreement','approvedBy':'owner_in_chat'}

bills=[];inventory=[]
for plan in registry['plans']:
    n=plan['number'];spec=json.loads((HERE/'geometry/specs'/f'{n:02}.json').read_text('utf8'));room_items=[i for i in spec['items'] if i['kind']=='floor']
    windows=[i for i in spec['items'] if i['kind']=='window'];main=[i for i in windows if nearest(i['source_record']['center'],room_items)=='lounge'];steam=[i for i in windows if nearest(i['source_record']['center'],room_items)=='steam']
    main_id=max(main,key=lambda i:i['opening_width_mm'])['id'] if main else None;steam_id=min(steam,key=lambda i:i['opening_width_mm'])['id'] if steam else None
    primary=next(i['id'] for i in spec['items'] if i.get('sliding'));upper_id=max((i for i in spec['items'] if i['kind']=='upper'),key=lambda i:max(i['size_mm']))['id']
    kitchen=next((i for i in spec['items'] if i['kind']=='kitchen'),None);lines=[];counts=collections.Counter();stock_storage=False
    for item in spec['items']:
        kind=item['kind'];record=item.get('source_record',{});label=item['label'];w,d=item['size_mm']
        if kind in ['floor','wall'] or kind=='accessory' and label=='Банные принадлежности':continue
        choices={};rule=''
        if kind=='accessory':
            if label=='Основание и настилы':choices={p:included('structure') for p in ['comfort','deluxe']};rule='Штатная конструкция'
            elif any(word in label for word in ['Кран','Бак','Вода','таз']):choices={p:separate() for p in ['comfort','deluxe']};rule='Сантехника согласуется отдельно'
            else:raise ValueError(('Unclassified accessory',n,label))
        elif kind in rules['separateAgreement']['kinds']:
            choices={p:separate() for p in ['comfort','deluxe']};rule='По отдельному согласованию; не нулевая цена'
        elif kind=='kitchen_sink':
            assert kitchen
            choices={p:{'status':'resolved','operation':'bundle_part','bundleLineId':kitchen['id'],'bundleSku':'OPT_97'} for p in ['comfort','deluxe']};rule='Раковина и смеситель уже в кухонном комплекте'
        elif kind=='kitchen':choices={p:extra('OPT_97') for p in ['comfort','deluxe']};rule='Фиксированная клиентская цена 37 900 ₽, Сергей'
        elif kind=='stove':
            model=record.get('model',label);number='16' if '16' in model else '12'
            choices={'comfort':extra('ASTON_'+number+'_SWAP'),'deluxe':included('stove')};rule='Доплата за замену штатной печи по тарифу квиза; в «Делюкс» учтена'
        elif kind=='bench':
            counts['bench']+=1;choices={p:included('bench_lounge') if counts['bench']<=2 else extra('LAYOUT_BENCH') for p in ['comfort','deluxe']};rule='Две лавки включены; дополнительная 3 000 ₽ РРЦ'
        elif kind=='wash_bench':choices={p:extra('OPT_149') for p in ['comfort','deluxe']};rule='Лавка помывочной 3 000 ₽ РРЦ'
        elif kind=='table':choices={p:included('table') for p in ['comfort','deluxe']};rule='Один стол в соответствующей комплектации'
        elif kind in ['storage','open_storage']:
            sku='OPT_206' if kind=='open_storage' else 'OPT_100' if max(w,d)>501 else 'OPT_99'
            choices={p:replacement(sku) if not stock_storage else extra(sku) for p in ['comfort','deluxe']};stock_storage=True
            rule='Первый шкаф/стеллаж с зачётом OPT_99; широкий шкаф OPT_100; открытый стеллаж по цене OPT_99'
        elif kind=='upper':
            choices={p:included('upper') if item['id']==upper_id else extra('OPT_45') for p in ['comfort','deluxe']};rule='Основной полок включён; в «Делюкс» ещё один OPT_45 уже оплачен'
        elif kind=='lower':choices={p:included('lower') if item['id']==primary else extra('LAYOUT_STEP') for p in ['comfort','deluxe']};rule='Первый выдвижной полок включён; дополнительные одноуровневые 3 000 ₽ РРЦ'
        elif kind=='door':
            role=record['kind'];width=round(item['opening_width_mm'])
            if role in ['entry','steam']:choices={p:included('entry' if role=='entry' else 'steam_door') for p in ['comfort','deluxe']};rule='Штатная дверь по комплектации'
            elif record.get('material')=='timber':choices={p:extra('OPT_216' if width>750 else 'OPT_214') for p in ['comfort','deluxe']};rule='Штатная деревянная дверь, доплаты нет — решение Сергея'
            else:choices={p:extra('OPT_14') for p in ['comfort','deluxe']};rule='Дополнительная стеклянная дверь'
        elif kind=='window':
            if item['id'] in [main_id,steam_id]:choices={p:included('main_window' if item['id']==main_id else 'steam_window') for p in ['comfort','deluxe']};rule='Первое окно комнаты отдыха / первая форточка парной включены'
            elif item['opening_width_mm']<=401:choices={p:extra('OPT_25') for p in ['comfort','deluxe']};rule='Дополнительная форточка 3 000 ₽ РРЦ — Сергей'
            else:choices={p:extra(rules['additionalWindows'][p+'Sku']) for p in ['comfort','deluxe']};rule='Дополнительное окно по стандарту комплектации — Сергей'
        elif kind=='hanger':choices={p:extra('LAYOUT_HANGER') for p in ['comfort','deluxe']};rule='Вешалка 3 000 ₽ РРЦ — Сергей'
        elif kind=='shoe_shelf':choices={p:extra('LAYOUT_SHOE') for p in ['comfort','deluxe']};rule='Обувная полка 2 000 ₽ РРЦ — Сергей'
        else:raise ValueError(('Unclassified item',n,item['id'],kind,label))
        lines.append({'id':item['id'],'code':item['code'],'kind':kind,'label':label,'sizeMm':[w,d],'quantity':1,'rule':rule,'packages':choices})
        if kind=='stove' and record.get('tunnel_bbox'):
            lines.append({'id':item['id']+'-firebox','code':'Топка','kind':'firebox','label':'Вынос топки по планировке','quantity':1,'rule':'По чертежу в смежное помещение / наружу; в «Делюкс» включён',
                          'packages':{p:extra('OPT_57') for p in ['comfort','deluxe']}})
    for model in plan['models']:
        bills.append({'id':plan['id']+'-'+model,'geometryId':plan['id'],'number':n,'dimensionSha256':spec['dimension_sha256'],'geometryDimensionSha256':plan['dimension_sha256'],'model':model,'size':plan['size'],'roomCount':len(room_items),'approval':'internal_calculation','lines':copy.deepcopy(lines),'pending':[]})
    inventory.append({'id':plan['id'],'number':n,'models':plan['models'],'roomCount':len(room_items),'items':len(lines)})
dump(OUT/'catalog.json',catalog);dump(OUT/'bills.json',bills);dump(OUT/'inventory.json',inventory);dump(OUT/'owner-rules.json',rules)
print(json.dumps({'geometries':len(inventory),'bills':len(bills),'quotes':len(bills)*2,'roomUnitRub':{k:v/100 for k,v in catalog['roomUnitCents'].items()},'source':'Live RRP and owner answers, 04.11.2026','published':False},ensure_ascii=False))
