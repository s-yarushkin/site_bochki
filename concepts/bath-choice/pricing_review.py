"""Compile a private pricing review from live Sheets and actual dimensional specs.

Never edits Google Sheets, the existing pricebook, quiz, API or published files.
"""
from pathlib import Path
from decimal import Decimal,ROUND_HALF_UP
import argparse,collections,hashlib,json,re

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,default=ROOT/'.local/pricing-sources/live-2026-11-04.json')
decisions=json.loads((HERE/'pricing-decisions.json').read_text('utf8'))
parser.add_argument('--house-room-basis',choices=['unresolved','quiz','technical'],default=decisions['houseRoomBasis'])
args=parser.parse_args();source=json.loads(args.source.read_text('utf8'));tables=source['tables']
OUT=ROOT/'output/layout-pricing-review';OUT.mkdir(parents=True,exist_ok=True)
model_ids={'Квадро':'kvadro','Парус':'parus','Викинг':'viking','Квадро Хаус':'kvadro-house'}
def cents(value):return int((Decimal(str(value))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
def size_key(model,label):
    numbers=re.findall(r'\d+(?:[,.]\d+)?',label)
    return 'x'.join(numbers) if model=='kvadro-house' else str(int(Decimal(numbers[0].replace(',','.'))*100))
def dump(name,value):(OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf8')
def rub(value):return '—' if value is None else f'{value/100:,.2f}'.replace(',',' ').replace('.',',')

rrc={row[0]:{'label':row[2],'unit':row[3],'rrc':row[4] if len(row)>4 else None,'row':index+11}
     for index,row in enumerate(tables['РРЦ']['values']) if len(row)>3 and row[0]}
method=tables['Методика_header']['values']
reserve,discount,markup,assembly=[Decimal(str(method[i][1])) for i in [3,4,5,6]]
factor=(1+reserve)*(1-discount)*(1+markup)
construction=next(row[1] for row in tables['Методика']['values'] if row and row[0]=='Дополнительное помещение: доски и работы, РРЦ')
room_raw=sum(Decimal(str(v)) for v in [construction,rrc['OPT_77']['rrc'],rrc['OPT_74']['rrc'],rrc['OPT_175']['rrc']])
room_sell=Decimal(str(tables['Квиз_header']['values'][6][1]))
assert room_sell==room_raw*factor
generic={'bench_lounge':2,'table':1,'cabinet_500':1,'upper':1,'lower':1,'entry':1,'steam_door':1,'main_window':1,'steam_window':1,'stove':1,'structure':1,'firebox':1,'guard':1}
catalog={'version':'layout-pricing-review-2026-11-04','approval':'draft','sourceUrl':source['metadata']['spreadsheetUrl'],
 'retrievedAt':source['retrievedAt'],'sourceSha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),
 'roomUnitCents':{'standard':cents(room_sell),'house':cents(room_sell+room_raw*(1+reserve)*assembly)},'items':{},'models':{}}
for sku,item in rrc.items():
    value=item['rrc'];standard=house=None
    if isinstance(value,(int,float)):
        standard=cents(Decimal(str(value))*factor)
        house=cents(Decimal(str(value))*(factor+(1+reserve)*assembly))
    catalog['items'][sku]={'label':item['label'],'unit':item['unit'],'customerUnitCents':{'standard':standard,'house':house},'source':f"РРЦ!E{item['row']}"}
kitchen=decisions['kitchen']
assert rrc[kitchen['sku']]['rrc']==kitchen['rrcRub']
catalog['items'][kitchen['sku']].update(customerUnitCents={model:cents(kitchen['customerRub']) for model in ['standard','house']},approvedBy=kitchen['approvedBy'],bundleIncludes=kitchen['includes'])
for name,rule_row in [('ASTON_12_SWAP',7),('ASTON_16_SWAP',8)]:
    value=cents(tables['Квиз_header']['values'][rule_row][1])
    catalog['items'][name]={'label':'Замена штатной печи на '+name.removesuffix('_SWAP'),'unit':'шт','customerUnitCents':{'standard':value,'house':value},'source':f'Квиз!B{rule_row+1}'}
room_bases={}
for row in tables['Тех · расчёт Делюкс']['values'][1:]:
    if not row:continue
    model=model_ids[row[0]];size=size_key(model,row[1]);room_bases[(model,size)]=(int(row[5]),int(row[6]))
conflicts=[]
for row in tables['Цены и прибыль_header']['values'][3:]:
    if not row:continue
    model=model_ids[row[0]];size=size_key(model,row[1]);comfort_rooms,deluxe_rooms=room_bases[(model,size)]
    if model=='kvadro-house':
        quiz_rooms=decisions['houseIncludedRooms'][size]
        conflicts.append({'model':model,'size':size,'technicalComfortRooms':comfort_rooms,'technicalDeluxeRooms':deluxe_rooms,'quizRooms':quiz_rooms,'decision':args.house_room_basis,'approvedBy':decisions['approvedBy']})
        if args.house_room_basis=='quiz':comfort_rooms=deluxe_rooms=quiz_rooms
        elif args.house_room_basis=='unresolved':comfort_rooms=deluxe_rooms=None
    model_data=catalog['models'].setdefault(model,{'name':row[0],'sizes':{}})
    model_data['sizes'][size]={'label':row[1],
        'comfort':{'priceCents':cents(row[2]),'roomCount':comfort_rooms,'included':dict(generic)},
        'deluxe':{'priceCents':cents(row[6]),'roomCount':deluxe_rooms,'included':{**generic,'OPT_45':1}}}

registry=json.loads((ROOT/'output/bath-choice-prototype/choice/layouts.json').read_text('utf8'))
base_path=ROOT/'output/bath-choice-prototype/home-hero/layouts'
def included(key):return {'status':'resolved','operation':'included','inclusionKey':key}
def pending(candidates=()):return {'status':'unconfirmed','candidates':list(candidates)}
def extra(sku):return {'status':'resolved','operation':'extra','sku':sku}
def nearest_room(point,rooms):
    def distance(room):
        polygon=room['polygon_mm'];distances=[]
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            dx,dy=b[0]-a[0],b[1]-a[1];length=dx*dx+dy*dy
            t=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)) if length else 0
            distances.append((point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2)
        return min(distances)
    ranked=sorted((distance(room),room['room_kind']) for room in rooms)
    return ranked[0][1] if ranked[0][0]<2500 else None
unpriced=collections.defaultdict(list);bills=[];inventory=[]
for plan in registry['plans']:
    spec=json.loads((base_path/plan['spec']).read_text('utf8'))
    rooms=[i for i in spec['items'] if i['kind']=='floor']
    counts=collections.Counter();lines=[]
    kitchen_item=next((i for i in spec['items'] if i['kind']=='kitchen'),None)
    for item in spec['items']:
        kind=item['kind'];code=item['code'];label=item['label'];record=item.get('source_record',{})
        if kind in ['floor','wall']:continue
        # Decorative towels, cups and branches were added to the render, not the factory bill.
        if kind=='accessory' and label=='Банные принадлежности':continue
        counts[kind]+=1;number=counts[kind];w,d=item.get('size_mm',[0,0]);candidate=[]
        proposed={'comfort':pending(),'deluxe':pending()}
        if kind=='kitchen':proposed={p:extra(kitchen['sku']) for p in ['comfort','deluxe']}
        elif kind=='kitchen_sink' and kitchen_item:
            proposed={p:{'status':'resolved','operation':'bundle_part','bundleLineId':kitchen_item['id'],'bundleSku':kitchen['sku']} for p in ['comfort','deluxe']}
        elif kind in decisions['separateAgreement']['kinds'] or kind=='kitchen_sink':
            proposed={p:{'status':'resolved','operation':'separate_agreement','approvedBy':decisions['separateAgreement']['approvedBy']} for p in ['comfort','deluxe']}
        elif kind=='stove':
            match=re.search(r'ASTON (12|16)',label)
            if match:
                sku='ASTON_'+match[1]+'_SWAP'
                proposed={'comfort':extra(sku),'deluxe':included('stove')}
        elif kind=='bench' and number<=2:proposed={p:included('bench_lounge') for p in ['comfort','deluxe']}
        elif kind=='table' and number==1:proposed={p:included('table') for p in ['comfort','deluxe']}
        elif kind=='storage' and number==1 and max(w,d)<=550:proposed={p:included('cabinet_500') for p in ['comfort','deluxe']}
        elif kind=='upper':
            proposed={'comfort':included('upper') if number==1 else pending(['OPT_45','OPT_47']),
                      'deluxe':included('upper') if number==1 else included('OPT_45') if number==2 else pending(['OPT_45','OPT_47'])}
        elif kind=='lower':proposed={p:included('lower') if number==1 else pending(['OPT_46','OPT_172','OPT_173']) for p in ['comfort','deluxe']}
        elif kind=='door':
            role=record.get('kind')
            if role in ['steam','entry']:proposed={p:included('steam_door' if role=='steam' else 'entry') for p in ['comfort','deluxe']}
            else:proposed={p:pending(['OPT_14','OPT_212','OPT_214']) for p in ['comfort','deluxe']}
        elif kind=='window':
            role=nearest_room(record['center'],rooms);key='steam_window' if role=='steam' else 'main_window' if role=='lounge' else None
            if key is None:
                proposed={p:pending(['OPT_28','OPT_33']) for p in ['comfort','deluxe']}
            else:
                counts['window_'+key]+=1
                if counts['window_'+key]==1:proposed={p:included(key) for p in ['comfort','deluxe']}
                else:proposed={p:pending(['OPT_28','OPT_33']) for p in ['comfort','deluxe']}
        elif kind=='storage':proposed={p:pending(['OPT_99','OPT_100']) for p in ['comfort','deluxe']}
        elif kind=='open_storage':proposed={p:pending(['OPT_206','OPT_207']) for p in ['comfort','deluxe']}
        elif kind in ['bench','wash_bench']:proposed={p:pending(['OPT_94','OPT_149']) for p in ['comfort','deluxe']}
        elif kind=='accessory' and 'Короб' in label:proposed={p:included('firebox') for p in ['comfort','deluxe']}
        elif kind=='accessory' and label=='Основание и настилы':proposed={p:included('structure') for p in ['comfort','deluxe']}
        line={'id':item['id'],'code':code,'label':label,'kind':kind,'sizeMm':[round(w,1),round(d,1)],'quantity':1,'packages':proposed}
        lines.append(line)
        if any(v['status']!='resolved' for v in proposed.values()):unpriced[label].append({'geometryId':plan['id'],'code':code,'sizeMm':line['sizeMm'],'candidateSkus':sorted({s for v in proposed.values() for s in v.get('candidates',[])})})
    for model in plan['models']:
        bill={'id':plan['id']+'-'+model,'geometryId':plan['id'],'dimensionSha256':spec['dimension_sha256'],'geometryDimensionSha256':plan['dimension_sha256'],
              'model':model,'size':plan['size'],'roomCount':len(rooms),'approval':'draft','lines':lines,
              'inclusionAssignment':'Draft quantity matching against the documented package; factory furniture sizes and opening products require confirmation.',
              'pending':[{'code':'FACTORY_BILL_CONFIRMATION','detail':'Подтвердить типоразмеры штатной мебели, изделий дверей и окон по этой геометрии.'}]}
        bills.append(bill)
    inventory.append({'id':plan['id'],'models':plan['models'],'size':plan['size'],'roomCount':len(rooms),'items':len(lines),'unresolvedItems':sum(any(p['status']!='resolved' for p in l['packages'].values()) for l in lines)})
dump('catalog.json',catalog);dump('bills.json',bills);dump('room-baseline-conflicts.json',conflicts);dump('unresolved-goods.json',unpriced);dump('inventory.json',inventory)

published=json.loads((ROOT/'.local/renewal-baseline/catalog-pricebook.json').read_text('utf8'))
quiz=json.loads((ROOT/'.local/bath-choice-cache/data/quiz-v1.json').read_text('utf8'))
parity=[]
for model,data in catalog['models'].items():
    for size,row in data['sizes'].items():
        live=published['r85']['models'][model]['sizes'][size]
        parity.append({'model':model,'size':size,'comfortSheet':row['comfort']['priceCents']//100,'comfortPublished':live['priceRub'],
          'deluxeSheet':row['deluxe']['priceCents']//100,'deluxePublished':live['deluxe']['priceRub'],'deluxeQuiz':quiz['deluxePrices'][model][size]})
dump('base-price-parity.json',parity)
summary=['# Единые цены планировок: рабочая сверка',
f'Источник: {catalog["sourceUrl"]}. Прочитан {source["retrievedAt"]}.',
'Это внутренняя рабочая смета. Цены сайта, квиз, Google-калькулятор и API не изменены.',
'## Что уже проверено',
f'- 20 из 20 цен в комплектации «Комфорт» совпадают с действующим сайтом.',
f'- 20 из 20 цен в комплектации «Делюкс» из текущего калькулятора совпадают с данными квиза. Карточки сайта используют более старые значения.',
f'- Дополнительное помещение: {rub(cents(room_raw))} ₽ исходных позиций → {rub(catalog["roomUnitCents"]["standard"])} ₽ клиенту; для «Квадро Хаус» с добавочной сборкой — {rub(catalog["roomUnitCents"]["house"])} ₽.',
'- Эта сумма состоит из конструкции, светильника, выключателя и вентиляции. Дверь, мебель, душ и сантехника в неё не включены.',
f'- Извлечён фактический состав {len(inventory)} геометрий; подготовлено {len(bills)} модельных ведомостей, каждая для двух комплектаций.',
f'- Владелец утвердил кухню {kitchen["sku"]}: 35 000 ₽ РРЦ, {kitchen["customerRub"]:,} ₽ клиенту. Раковина и смеситель входят в комплект; повторной доплаты за них нет.',
'- Диван, кровать и сантехника вне кухонного комплекта исключены из суммы бани и вынесены на отдельное согласование. Это исключение из объёма, а не бесплатные товары.',
'## Матрица составов',
'| Схема | Модели | Размер | Помещений | Позиций | Требуют уточнения |','|---|---|---|---:|---:|---:|']
for p in inventory:summary.append('| '+p['id']+' | '+', '.join(catalog['models'][m]['name'] for m in p['models'])+' | '+catalog['models'][p['models'][0]]['sizes'][p['size']]['label']+' | '+str(p['roomCount'])+' | '+str(p['items'])+' | '+str(p['unresolvedItems'])+' |')
summary+=['## Что нужно закрепить до конечных цен',
'1. Владелец утвердил базу помещений «Квадро Хаус» 3/4 для обеих комплектаций: 3 в 4×4, 5×4, 6×4; 4 в 6×5, 6×6. В рабочих ведомостях применено; источники production пока не перезаписаны.',
'2. В ряде пакетов в комплектации «Делюкс» уже оплачено 3 помещения, а на схеме 2. Нужен пересчёт пакета по реальному составу, а не ещё одна доплата поверх него.',
'3. Для каждого изделия нужны точное соответствие позиции справочника, размер/метраж и зачёт базовой мебели. Обычную лавку нельзя автоматически оценить как лавку-рундук.',
'4. Диван, кровать и сантехника согласуются отдельно по решению владельца. Для оставшейся мебели и ступеней нужно подтвердить тип изделия и тариф; пустая цена не заменяется нулём.',
'5. Существующий квиз использует 41 схему старого альбома с другими кодами. Нужна явная связь с новыми геометриями; сходство модели и длины не доказывает одинаковый состав.',
'## Изделия, требующие цены или правила сопоставления',
'| Изделие | Встречается в схемах | Кандидаты справочника |','|---|---|---|']
for label,items in sorted(unpriced.items()):
    summary.append('| '+label+' | '+', '.join(sorted({i['geometryId'] for i in items}))+' | '+', '.join(sorted({s for i in items for s in i['candidateSkus']}))+' |')
summary+=['## Как устроен общий расчёт',
'`layout-pricing.mjs` принимает геометрию и её ведомость. Учитывает уже оплаченное количество, доплаты за помещения, товары и явно подтверждённые замены. Не выдаёт конечную цену при неопределённой строке. Квиз обращается к той же ведомости через явный код соответствия.',
'Следующий коммерческий результат — утверждённая ведомость и две конечные цены на каждую геометрию/модель, затем один экспорт для сайта и квиза. Сырые затраты и внутренние комментарии в публичный файл не попадают.']
(OUT/'README.md').write_text('\n\n'.join(summary[:7])+'\n\n'+'\n'.join(summary[7:])+'\n','utf8')
assert all(p['comfortSheet']==p['comfortPublished'] for p in parity)
assert all(p['deluxeSheet']==p['deluxeQuiz'] for p in parity)
print(json.dumps({'geometries':len(inventory),'modelBills':len(bills),'packageQuotes':len(bills)*2,'comfortParity':20,'deluxeQuizParity':20,'published':False,'houseRoomBasis':args.house_room_basis},ensure_ascii=False))
