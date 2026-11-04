"""Prepare formula-backed native Sheets pages for the 24 layout/model pairs."""
from pathlib import Path
import collections,json
HERE=Path(__file__).resolve().parent;OUT=HERE/'pricing';ROOT=HERE.parents[1]
catalog=json.loads((OUT/'catalog.json').read_text('utf8'));bills=json.loads((OUT/'bills.json').read_text('utf8'));quotes=json.loads((OUT/'quotes.json').read_text('utf8'))
PRICE='Планировки 3D · цены';BOM='Планировки 3D · состав';P_ID=2026110401;B_ID=2026110402
def dump(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8')
def cell(value,note=None):
    out={'userEnteredValue':{'formulaValue':value} if isinstance(value,str) and value.startswith('=') else {'numberValue':value} if isinstance(value,(int,float)) else {'stringValue':str(value)}}
    if note:out['note']=note
    return out
def cells(row,width):return [cell(v) if v is not None else {} for v in row]+[{}]*(width-len(row))
def rrc(sku):return "'РРЦ'!$E$"+str(catalog['items'][sku]['row'])
def q(bill,package):return next(q for q in quotes if q['billId']==bill['id'] and q['package']==package)
def cRange(sheet,r0,r1,c0,c1):return {'sheetId':sheet,'startRowIndex':r0,'endRowIndex':r1,'startColumnIndex':c0,'endColumnIndex':c1}
notes=[
 'ЦЕНЫ ПЛАНИРОВОК · 04.11.2026',
 'Один состав и две цены для каждой схемы. Правила и тарифы мебели подтверждены Сергеем в чате 04.11.2026.',
 'Включённые позиции без возврата за отсутствие. Новые помещения и оснащение сверх комплектации прибавляются. Зачёт штатного шкафа при замене сохранён.',
 'Доставка, фундамент, кровать, диван и отдельная сантехника не включены. Кухонный комплект с раковиной/смесителем — 37 900 ₽.',
 'В комплектации «Комфорт» учтена замена печи по схеме и вынос топки; в комплектации «Делюкс» они уже включены. Допы без повторного округления.',
 ['Схема','Модель','Размер','Помещений','В комплектации «Комфорт», ₽','В комплектации «Делюкс», ₽','База «Комфорт», ₽','База «Делюкс», ₽','Доп. помещения «Комфорт», ₽','Доп. помещения «Делюкс», ₽','Оснащение «Комфорт», ₽','Оснащение «Делюкс», ₽','По отдельному согласованию','Лист альбома','Версия геометрии','Помещений в базе / правило']
]
top_labels=['Планировки 3D · цены','Тарифы','Начисление','Отдельно','Печь']
summary=[cells([top_labels[i],None,None,s],16) if isinstance(s,str) else cells(s,16) for i,s in enumerate(notes)]
detail=[
 cells(['Состав планировок'],14),
 cells(['Коэффициент допов, обычная баня',"=(1+'Методика'!$B$4)*(1-'Методика'!$B$5)*(1+'Методика'!$B$6)"],14),
 cells(['Коэффициент допов, Квадро Хаус',"=B2+(1+'Методика'!$B$4)*'Методика'!$B$7"],14),
 cells(['Кухня: клиентская цена, Сергей',37900],14),
 cells(['Как читать',None,'Пустая сумма означает отдельное согласование. Ноль у штатной позиции означает, что она уже оплачена в комплектации.'],14),
 cells(['Планировка / модель','Комплектация','Объект 3D','Код','Позиция','Правило','Количество','SKU','РРЦ за единицу','Зачёт РРЦ','РРЦ доплаты','Доплата клиенту, ₽','Пояснение','Источник цены'],14)
]
detail_evidence=[];summary_evidence=[]
for bill in bills:
    model=bill['model'];house=model=='kvadro-house';base=catalog['models'][model]['sizes'][bill['size']];key=bill['id'];number=bill['number'];factor='$B$3' if house else '$B$2'
    for package in ['comfort','deluxe']:
        quote=q(bill,package);line_map={line['id']:line for line in quote['lines']}
        row=len(detail)+1;quantity=max(0,bill['roomCount']-base[package]['roomCount'])
        unit="='Методика'!$B$34+"+rrc('OPT_77')+'+'+rrc('OPT_74')+'+'+rrc('OPT_175')
        values=[key,package,'rooms','Помещения','Дополнительные помещения','room',quantity,'ROOM',unit,0,f'=G{row}*I{row}',f'=ROUND(K{row}*{factor},2)','Только сверх уже оплаченных помещений; Квадро Хаус — база 3/4','Методика!B34 + РРЦ: свет, выключатель, вентиляция']
        detail.append(cells(values,14));detail_evidence.append({'row':row,'billId':key,'package':package,'id':'rooms','totalCents':line_map['rooms']['totalCents']})
        for line in bill['lines']:
            selection=line['packages'][package];calculated=line_map[line['id']];row=len(detail)+1
            operation=selection['operation'];sku=selection.get('sku','');quantity=line.get('quantity',1);rate=credit=raw=total=None;source='';memo=line['rule']
            if operation=='included':
                operation='included';raw=0;total=0;memo+='; уже учтено в базовой цене'
            elif operation=='separate_agreement':operation='separate';memo+='; цена не включена'
            elif operation=='bundle_part':operation='bundle';raw=0;total=0;memo+='; отдельной оплаты нет'
            else:
                product=catalog['items'][sku];source=product['source'];rate='='+rrc(sku) if product.get('row') else None
                if selection['operation']=='replace':credit='='+rrc(selection['creditSku'])
                else:credit=0
                covered=calculated.get('coveredQuantity',0)
                if covered:memo+=f'; {covered:g} шт. уже оплачено в комплектации'
                if sku.startswith('ASTON_'):
                    total='='+source.replace('Квиз!',"'Квиз'!");memo+='; коммерческая доплата без повторного коэффициента'
                else:
                    raw=f'=(I{row}-J{row})*(G{row}-{covered:g})'
                    total=f'=ROUND(K{row}*{factor},2)' if sku!='OPT_97' else f'=G{row}*$B$4'
            values=[key,package,line['id'],line['code'],line['label'],operation,quantity,sku,rate,credit,raw,total,memo,source]
            detail.append(cells(values,14));detail_evidence.append({'row':row,'billId':key,'package':package,'id':line['id'],'totalCents':calculated['totalCents']})
    row=len(summary)+1;start=7;end=len(detail)+100
    source_c=f"='Цены и прибыль'!C{base['sourceRow']}";source_d=f"='Цены и прибыль'!G{base['sourceRow']}"
    def sumifs(pack,rooms):
        return f'=SUMIFS(\'{BOM}\'!$L$7:$L$2000,\'{BOM}\'!$A$7:$A$2000,$A{row}&"-"&"{model}",\'{BOM}\'!$B$7:$B$2000,"{pack}",\'{BOM}\'!$F$7:$F$2000,"{ "room" if rooms else "<>room" }")'
    separate=sorted({x['label'] for x in q(bill,'comfort')['separateAgreementItems']})
    size=base['label'];size=({'4x4':'4×4 м','5x4':'4×5 м','6x4':'4×6 м','6x5':'5×6 м','6x6':'6×6 м'}[bill['size']] if house else size)
    slide='p'+str(number) if number<15 else 'dp_p'+str(number)
    values=[bill['geometryId'],catalog['models'][model]['name'],size,bill['roomCount'],f'=ROUND(G{row}+I{row}+K{row},2)',f'=ROUND(H{row}+J{row}+L{row},2)',source_c,source_d,sumifs('comfort',True),sumifs('deluxe',True),sumifs('comfort',False),sumifs('deluxe',False),'; '.join(separate),f'https://docs.google.com/presentation/d/1GuLDnKUWfHckXYGTN2Ux5ItNFVd8GAPmY6Qklr7E7b8/edit#slide=id.{slide}',bill['dimensionSha256'],f"В комплектации «Комфорт»: {base['comfort']['roomCount']}; в комплектации «Делюкс»: {base['deluxe']['roomCount']}. Без вычета неиспользованной позиции."]
    summary.append(cells(values,16));summary_evidence.append({'row':row,'billId':bill['id'],'comfortCents':q(bill,'comfort')['calculatedTotalCents'],'deluxeCents':q(bill,'deluxe')['calculatedTotalCents']})

assert len(detail)<1999 and len(summary)==30
requests=[
 {'addSheet':{'properties':{'sheetId':P_ID,'title':PRICE,'gridProperties':{'rowCount':40,'columnCount':16,'frozenRowCount':6,'frozenColumnCount':3}}}},
 {'addSheet':{'properties':{'sheetId':B_ID,'title':BOM,'gridProperties':{'rowCount':2000,'columnCount':14,'frozenRowCount':6,'frozenColumnCount':2}}}},
 {'updateCells':{'range':cRange(P_ID,0,len(summary),0,16),'rows':[{'values':r} for r in summary],'fields':'userEnteredValue,note'}},
 {'updateCells':{'range':cRange(B_ID,0,len(detail),0,14),'rows':[{'values':r} for r in detail],'fields':'userEnteredValue,note'}}
]
for sheet,width,height in [(P_ID,16,len(summary)),(B_ID,14,len(detail))]:
    requests.extend([
      {'repeatCell':{'range':cRange(sheet,0,height,0,width),'cell':{'userEnteredFormat':{'textFormat':{'fontFamily':'Arial','fontSize':10},'verticalAlignment':'TOP'}},'fields':'userEnteredFormat(textFormat,verticalAlignment)'}},
      {'repeatCell':{'range':cRange(sheet,5,6,0,width),'cell':{'userEnteredFormat':{'backgroundColor':{'red':.93,'green':.93,'blue':.93},'textFormat':{'bold':True},'wrapStrategy':'WRAP'}},'fields':'userEnteredFormat(backgroundColor,textFormat.bold,wrapStrategy)'}},
      {'setBasicFilter':{'filter':{'range':cRange(sheet,5,height,0,width)}}},
      {'repeatCell':{'range':cRange(sheet,0,1,0,width),'cell':{'userEnteredFormat':{'textFormat':{'bold':True,'fontSize':14}}},'fields':'userEnteredFormat.textFormat'}},
      {'updateDimensionProperties':{'range':{'sheetId':sheet,'dimension':'ROWS','startIndex':5,'endIndex':6},'properties':{'pixelSize':62},'fields':'pixelSize'}}
    ])
for row in range(5):
    for first,last in [(0,3),(3,12)]:requests.append({'mergeCells':{'range':cRange(P_ID,row,row+1,first,last),'mergeType':'MERGE_ALL'}})
requests.extend([
 {'repeatCell':{'range':cRange(P_ID,1,5,0,16),'cell':{'userEnteredFormat':{'wrapStrategy':'WRAP'}},'fields':'userEnteredFormat.wrapStrategy'}},
 {'updateDimensionProperties':{'range':{'sheetId':P_ID,'dimension':'ROWS','startIndex':1,'endIndex':5},'properties':{'pixelSize':34},'fields':'pixelSize'}},
 {'repeatCell':{'range':cRange(P_ID,6,len(summary),4,12),'cell':{'userEnteredFormat':{'numberFormat':{'type':'NUMBER','pattern':'#,##0.00" ₽"'}}},'fields':'userEnteredFormat.numberFormat'}},
 {'repeatCell':{'range':cRange(P_ID,6,len(summary),4,6),'cell':{'userEnteredFormat':{'textFormat':{'bold':True}}},'fields':'userEnteredFormat.textFormat.bold'}},
 {'repeatCell':{'range':cRange(B_ID,6,len(detail),8,12),'cell':{'userEnteredFormat':{'numberFormat':{'type':'NUMBER','pattern':'#,##0.00" ₽"'}}},'fields':'userEnteredFormat.numberFormat'}},
 {'mergeCells':{'range':cRange(B_ID,0,1,0,2),'mergeType':'MERGE_ALL'}},
 {'mergeCells':{'range':cRange(B_ID,4,5,0,2),'mergeType':'MERGE_ALL'}},
 {'mergeCells':{'range':cRange(B_ID,4,5,2,14),'mergeType':'MERGE_ALL'}},
 {'repeatCell':{'range':cRange(B_ID,1,4,0,1),'cell':{'userEnteredFormat':{'wrapStrategy':'WRAP'}},'fields':'userEnteredFormat.wrapStrategy'}},
 {'updateDimensionProperties':{'range':{'sheetId':B_ID,'dimension':'ROWS','startIndex':1,'endIndex':5},'properties':{'pixelSize':34},'fields':'pixelSize'}}
])
widths_price=[100,145,95,65,155,155,135,135,130,130,135,135,340,280,220,340]
widths_bom=[205,95,115,70,270,105,85,115,120,120,125,150,530,180]
for sheet,widths in [(P_ID,widths_price),(B_ID,widths_bom)]:
    for index,width in enumerate(widths):requests.append({'updateDimensionProperties':{'range':{'sheetId':sheet,'dimension':'COLUMNS','startIndex':index,'endIndex':index+1},'properties':{'pixelSize':width},'fields':'pixelSize'}})
for request in requests:assert len(request)==1
dump(OUT/'sheets-requests.json',requests);dump(OUT/'sheets-evidence.json',{'priceSheetId':P_ID,'priceSheetName':PRICE,'bomSheetId':B_ID,'bomSheetName':BOM,'summaryRows':summary_evidence,'detailRows':detail_evidence,'populatedDetailRows':len(detail),'requiredRanges':[f"'{PRICE}'!A1:P30",f"'{BOM}'!A1:N{len(detail)}"]})
print(json.dumps({'summaryRows':24,'quotes':48,'detailRows':len(detail)-6,'requests':len(requests),'nativeSheetIds':[P_ID,B_ID]},ensure_ascii=False))
