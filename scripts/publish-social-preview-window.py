"""User-operated sudo window for the preflighted static social cover publication."""
import json,queue,subprocess,threading,tkinter as tk,webbrowser
from tkinter import ttk
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.local/social-preview';STATE=OUT/'window-state.json';config=json.loads((OUT/'deployment.json').read_text())
def state(status,**fields):STATE.write_bytes((json.dumps({'status':status,**fields})+'\n').encode())
root=tk.Tk();root.title('Дача Пар — публикация обложки');root.geometry('670x390');root.minsize(640,370)
frame=ttk.Frame(root,padding=26);frame.pack(fill='both',expand=True)
ttk.Label(frame,text='Публикуем зимний «Парус»',font=('Segoe UI',19,'bold')).pack(anchor='w',pady=(0,15))
ttk.Label(frame,text='Обновится картинка при пересылке ссылки на сайт.\nКабинет, второй фактор, заявки, MAX и каталог сохраняются.',font=('Segoe UI',11),wraplength=610).pack(anchor='w',pady=(0,18))
label=ttk.Label(frame,text='Пароль сервера, который использовали при публикации:',font=('Segoe UI',11));label.pack(anchor='w');password=ttk.Entry(frame,show='●',font=('Segoe UI',14));password.pack(fill='x',pady=(8,14));status=ttk.Label(frame,text='Пароль не сохраняется и не попадает в чат.',font=('Segoe UI',10),wraplength=610);status.pack(anchor='w',pady=(0,12));responses=queue.Queue();busy=False
def work(secret):
 try:
  folder='/tmp/dachapar-social-'+config['release'].removeprefix('SOCIAL-');result=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" python3 '+folder+'/deploy-social-preview.py --apply'],input=(secret+'\n').encode(),capture_output=True,timeout=300);secret=None;lines=result.stdout.decode('utf8',errors='replace').strip().splitlines();receipt=json.loads(lines[-1]) if lines else {'ok':False,'message':'Проверьте пароль сервера и соединение.'}
  if result.returncode or not receipt.get('ok'):responses.put({'ok':False,'message':receipt.get('message','Не удалось опубликовать.')})
  else:(OUT/'deployment-result.json').write_bytes((json.dumps(receipt,indent=2)+'\n').encode());responses.put({'ok':True})
 except Exception:responses.put({'ok':False,'message':'Ошибка соединения. Попробуйте повторить.'})
 finally:secret=None
def submit():
 global busy
 if busy:return
 secret=password.get()
 if not secret:status.config(text='Введите пароль сервера.');password.focus_set();return
 busy=True;password.delete(0,'end');password.config(state='disabled');publish.config(state='disabled');status.config(text='Публикуем и проверяем обложку…');state('publishing');threading.Thread(target=work,args=(secret,),daemon=True).start();secret=None
publish=ttk.Button(frame,text='Опубликовать обложку',command=submit);publish.pack(anchor='w');password.bind('<Return>',lambda _:submit())
def poll():
 global busy
 try:
  result=responses.get_nowait();busy=False
  if result['ok']:
   state('published');password.pack_forget();label.pack_forget();publish.pack_forget();status.config(text='Готово! Новая обложка опубликована и проверена. Можно закрыть окно.');ttk.Button(frame,text='Открыть обложку',command=lambda:webbrowser.open('https://xn--80aaan1dh9b.xn--p1ai/assets/social/dachapar-parus-winter-20261106-v1.png')).pack(anchor='w',pady=8)
  else:state('stopped',message=result['message']);status.config(text=result['message']);password.config(state='normal');publish.config(state='normal')
 except queue.Empty:pass
 root.after(300,poll)
state('waiting_password');password.focus_set();root.after(300,poll);root.mainloop()
