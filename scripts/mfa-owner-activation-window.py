"""User-operated recovery window. Password and activation code stay in RAM/UI only."""
import json,queue,subprocess,threading,tkinter as tk,webbrowser
from tkinter import ttk
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];STATE=ROOT/'.local/mfa/activation-window-state.json'
REMOTE='/tmp/dachapar-mfa-owner-invite-20261106.mjs'
def state(status):
 STATE.parent.mkdir(parents=True,exist_ok=True);STATE.write_bytes((json.dumps({'status':status})+'\n').encode())
root=tk.Tk();root.title('Дача Пар — подключение приложения');root.geometry('740x640');root.minsize(680,570);root.configure(bg='#f5f4ed')
style=ttk.Style();style.configure('TFrame',background='#f5f4ed');style.configure('TLabel',background='#f5f4ed',font=('Segoe UI',11));style.configure('TButton',font=('Segoe UI',11),padding=9)
frame=ttk.Frame(root,padding=28);frame.pack(fill='both',expand=True)
ttk.Label(frame,text='Подключение приложения-аутентификатора',font=('Segoe UI',18,'bold'),wraplength=670).pack(anchor='w',pady=(0,15))
ttk.Label(frame,text='Получим новый код первого подключения только для вашей учётки владельца. Уже подключённое приложение не сбрасывается.',wraplength=660).pack(anchor='w',pady=(0,20))
password_label=ttk.Label(frame,text='Пароль сервера, который вводили при публикации:');password_label.pack(anchor='w')
password=ttk.Entry(frame,show='●',font=('Segoe UI',14));password.pack(fill='x',pady=(8,12))
status=ttk.Label(frame,text='Пароль и код не сохраняются в файлах или чате.',wraplength=660);status.pack(anchor='w',pady=(0,12))
responses=queue.Queue();busy=False
def work(secret):
 try:
  result=subprocess.run(['ssh','-T','-o','BatchMode=yes','dachapar','sudo -S -p "" /usr/bin/node '+REMOTE],input=(secret+'\n').encode(),capture_output=True,timeout=60,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));secret=None
  lines=result.stdout.decode('utf8',errors='replace').strip().splitlines()
  data=json.loads(lines[-1]) if lines else {'ok':False,'code':'SUDO_OR_SSH_FAILED'}
  if result.returncode or not data.get('ok'):responses.put({'ok':False,'code':data.get('code','REISSUE_FAILED')})
  else:responses.put(data)
 except Exception:responses.put({'ok':False,'code':'CONNECTION_FAILED'})
 finally:secret=None
def submit():
 global busy
 if busy:return
 secret=password.get()
 if not secret:status.config(text='Введите пароль сервера в поле выше.');password.focus_set();return
 busy=True;password.delete(0,'end');password.config(state='disabled');get_code.config(state='disabled');status.config(text='Проверяем учётку и выпускаем новый код…');state('checking');threading.Thread(target=work,args=(secret,),daemon=True).start();secret=None
get_code=ttk.Button(frame,text='Получить мой код подключения',command=submit);get_code.pack(anchor='w',pady=(0,15))
password.bind('<Return>',lambda _:submit())
def show(data):
 global busy
 busy=False
 if not data.get('ok'):
  state('stopped');password.config(state='normal');get_code.config(state='normal');password.focus_set()
  status.config(text='Не удалось получить код. Проверьте пароль сервера и соединение. Можно повторить. Причина: '+str(data.get('code','REISSUE_FAILED')));return
 password.pack_forget();password_label.pack_forget();get_code.pack_forget()
 if data.get('alreadyEnabled'):
  state('already_connected');status.config(text='Приложение уже подключено. Ничего не сброшено. Войдите с кодом своего приложения или резервным кодом.');ttk.Button(frame,text='Открыть кабинет',command=lambda:webbrowser.open('https://дачапар.рф/manager.html')).pack(anchor='w');return
 state('code_ready');status.config(text='Ваш новый код подключения готов. Предыдущий потерянный код больше не действует.')
 code=ttk.Entry(frame,font=('Consolas',20),justify='center');code.insert(0,data.pop('activationCode'));code.config(state='readonly');code.pack(fill='x',pady=(6,15))
 def copy():root.clipboard_clear();root.clipboard_append(code.get());status.config(text='Код скопирован. Вставьте его в поле «Код подключения» в кабинете.')
 buttons=ttk.Frame(frame);buttons.pack(anchor='w',pady=(0,18));ttk.Button(buttons,text='1. Копировать код',command=copy).pack(side='left',padx=(0,12));ttk.Button(buttons,text='2. Открыть кабинет',command=lambda:webbrowser.open('https://дачапар.рф/manager.html')).pack(side='left')
 ttk.Label(frame,text='Дальше на сайте:\n\n1. Войдите с обычным логином и паролем. Если форма уже открыта, нажмите «К логину» и войдите заново.\n\n2. Вставьте этот код в поле «Код подключения» и нажмите «Подключить приложение».\n\n3. Появятся QR-код и ключ. Отсканируйте QR приложением-аутентификатором, введите шесть цифр и сохраните резервные коды.',wraplength=660,justify='left').pack(anchor='w')
 ttk.Label(frame,text='Не закрывайте это окно, пока не подключите приложение. Код действует 7 дней.',wraplength=660,font=('Segoe UI',10,'bold')).pack(anchor='w',pady=(20,0))
def poll():
 try:show(responses.get_nowait())
 except queue.Empty:pass
 root.after(300,poll)
state('waiting_password');password.focus_set();root.after(300,poll);root.mainloop()
