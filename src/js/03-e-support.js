/* ---- 清单（场景/服化道/器材） ---- */
function renderStuff(p){
  /* 空状态分区块给出下一步引导，而不是干瘪的「暂无」 */
  const EMPTY_HINT={scenes:'还没有场景。先把候选地点记下来，分镜里可以直接引用场景。',
    items_s:'还没有服化道。列出来，拍摄前才好逐项核对。',
    items_g:'还没有器材。机位定了就写进来，避免当天缺件。'};
  const section=(title,key,arr,ph,ek)=>{
    return '<div class="card"><h2>'+title+'</h2>'
      +'<div class="row" style="margin-bottom:10px"><input id="f_'+key+'" class="grow" placeholder="'+ph+'" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addStuff(\''+key+'\');}"><input id="fn_'+key+'" class="grow" placeholder="备注…">'
      +(key==='scenes'?favPickerBtn():'')   // 清单页入口只放首个分区，覆盖 scenes + items 两类收藏
      +'<button class="btn btn-primary btn-sm" onclick="addStuff(\''+key+'\')">添加</button></div>'
      +(arr.length?arr.map(it=>{
        const editing=view.editingStuffId===it.id&&view.editingStuffKey===key;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row"><input id="es_name" class="grow" value="'+esc(it.name)+'">'
            +'<input id="es_note" class="grow" value="'+esc(it.note||'')+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveStuffEdit(\''+key+'\','+jstr(it.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="grow '+(it.done?'done-text':'')+'">'+esc(it.name)+'</span><span class="muted">'+esc(it.note||'')+'</span>';
        return '<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--line)" data-fid="'+esc(it.id)+'">'
          +'<button class="chk '+(it.done?'on':'')+'" style="width:22px;height:22px" onclick="toggleStuff(\''+key+'\','+jstr(it.id)+')">'+(it.done?'✓':'')+'</button>'
          +body
          +editBtn('Stuff',it.id,key)
          +favBtn(key==='scenes'?'scenes':'items',it)
          +'<button class="iconbtn" onclick="delStuff(\''+key+'\','+jstr(it.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join(''):'<p class="muted empty-hint">'+EMPTY_HINT[ek]+'</p>')+'</div>';
  };
  document.getElementById('tabBody').innerHTML=
    section('场景选址','scenes',p.scenes,'地点名称…','scenes')
    +section('服装 / 造型 / 道具','items_s',p.items.filter(i=>i.kind!=='器材'),'物品名称（可注明类别）…','items_s')
    +section('器材需求','items_g',p.items.filter(i=>i.kind==='器材'),'器材名称…','items_g');
}
function saveStuffEdit(key,id){
  const name=gv('es_name').trim(); if(!name){ toast('名称不能为空'); return; }
  const patch={name,note:gv('es_note').trim()};
  updateCur(p=>{
    const arr=key==='scenes'?p.scenes:p.items;
    const it=arr.find(x=>x.id===id); if(it) Object.assign(it,patch);
  });
  clearInlineEditState(view); renderProject();
}
function addStuff(key){
  const name=gv('f_'+key).trim(); if(!name){toast('名称不能为空');return;}
  const note=gv('fn_'+key).trim();
  updateCur(p=>{
    if(key==='scenes') p.scenes.push({id:uid(),name,note,done:false,fav:false});
    else p.items.push({id:uid(),kind:key==='items_g'?'器材':'服装道具',name,note,done:false,fav:false});
  }); renderProject();
}
function toggleStuff(key,id){ updateCur(p=>{const arr=key==='scenes'?p.scenes:p.items; const it=arr.find(x=>x.id===id); if(it) it.done=!it.done;}); renderProject(); }
function delStuff(key,id){ updateCur(p=>{ if(key==='scenes') p.scenes=p.scenes.filter(x=>x.id!==id); else p.items=p.items.filter(x=>x.id!==id);}); renderProject(); }

/* ---- 预算 ---- */
const CATS=['场地','人员','服装道具','器材','交通餐饮','后期','其他'];
function renderBudget(p){
  const total=p.budget.reduce((s,b)=>s+(+b.amount||0),0), paid=p.budget.filter(b=>b.paid).reduce((s,b)=>s+(+b.amount||0),0);
  document.getElementById('tabBody').innerHTML='<div class="card"><h2>预算管理</h2>'
    +'<div class="stat-cards">'
    +'<div class="stat-card"><div class="num amount-red">¥'+total.toLocaleString()+'</div><div class="lbl">总预算</div></div>'
    +'<div class="stat-card"><div class="num" style="color:var(--green)">¥'+paid.toLocaleString()+'</div><div class="lbl">已支付</div></div>'
    +'<div class="stat-card"><div class="num">¥'+(total-paid).toLocaleString()+'</div><div class="lbl">待支付</div></div></div>'
    +'<div class="row" style="margin-bottom:10px"><input id="b_item" class="grow" placeholder="费用项目…">'
    +'<select id="b_cat" style="max-width:120px">'+CATS.map(c=>'<option>'+c+'</option>').join('')+'</select>'
    +'<input type="number" id="b_amt" style="max-width:120px" placeholder="金额 ¥" min="0" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addBudget();}">'
    +favPickerBtn()
    +'<button class="btn btn-primary btn-sm" onclick="addBudget()">添加</button></div>'
    +(p.budget.length?p.budget.map(b=>'<div class="brow" data-fid="'+esc(b.id)+'"><span class="grow">'+esc(b.item)+'</span><span class="tag">'+esc(b.cat)+'</span>'
      +'<span class="amount-red">¥'+(+b.amount).toLocaleString()+'</span>'
      +'<button class="tag '+(b.paid?'green':'red')+'" style="border:none;min-height:32px" onclick="togglePaid('+jstr(b.id)+')">'+(b.paid?'已支付':'待支付')+'</button>'
      +favBtn('budget',b)
      +'<button class="iconbtn" onclick="delBudget('+jstr(b.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>').join('')
      :'<p class="muted empty-hint">还没有预算条目。把场地、人员、器材等开销记进来，客户提案里的报价会自动汇总。</p>')
    +'</div>';
}
function addBudget(){
  const item=gv('b_item').trim(), amt=parseFloat(gv('b_amt'));
  if(!item||!(amt>0)){toast('请填写项目和有效金额');return;}
  updateCur(p=>p.budget.push({id:uid(),item,cat:gv('b_cat'),amount:amt,paid:false,fav:false})); renderProject();
}
function togglePaid(id){ updateCur(p=>{const b=p.budget.find(x=>x.id===id); if(b) b.paid=!b.paid;}); renderProject(); }
function delBudget(id){ updateCur(p=>p.budget=p.budget.filter(x=>x.id!==id)); renderProject(); }

/* ---- 备注与协作 ---- */
const NOTE_KINDS=['电话','微信','见面','其他'];
const NOTE_TAG={电话:'blue',微信:'green',见面:'purple',其他:'gray'};
function renderNotes(p){
  const t=todayStr();
  const open=p.todos.filter(x=>!x.done).length;
  const overdue=p.todos.filter(x=>!x.done&&x.due&&x.due<t).length;
  document.getElementById('tabBody').innerHTML=
    '<div class="card"><h2>待办事项 <span class="muted" style="font-weight:400">· 未完成 '+open+(overdue?'（<span style="color:var(--red)">逾期 '+overdue+'</span>）':'')+'</span></h2>'
    +'<div class="row" style="margin-bottom:12px"><input id="td_title" class="grow" placeholder="待办内容，如：给客户发提案确认报价" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addTodo();}">'
    +'<input id="td_owner" style="max-width:110px" placeholder="负责人">'
    +'<input type="date" id="td_due" style="max-width:150px">'
    +favPickerBtn()
    +'<button class="btn btn-primary" onclick="addTodo()">添加</button></div>'
    +p.todos.map(x=>{
        const od=!x.done&&x.due&&x.due<t;
        const editing=view.editingTodoId===x.id;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row">'
            +'<input id="et_title" class="grow" value="'+esc(x.title)+'">'
            +'<input id="et_owner" style="max-width:110px" value="'+esc(x.owner||'')+'">'
            +'<input type="date" id="et_due" style="max-width:150px" value="'+esc(x.due||'')+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveTodoEdit('+jstr(x.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="grow '+(x.done?'done-text':'')+'">'+esc(x.title)+'</span>'
            +(x.owner?'<span class="tag gray">'+esc(x.owner)+'</span>':'')
            +(x.due?'<span class="tag '+(od?'red':'gray')+'">'+(od?'逾期 ':'')+esc(x.due)+'</span>':'');
        return '<div class="row" style="padding:8px 0;border-bottom:1px dashed var(--line)" data-fid="'+esc(x.id)+'">'
          +'<button class="chk '+(x.done?'on':'')+'" onclick="toggleTodo('+jstr(x.id)+')">'+(x.done?'✓':'')+'</button>'
          +body
          +editBtn('Todo',x.id)
          +favBtn('todos',x)
          +'<button class="iconbtn" onclick="delTodo('+jstr(x.id)+')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join('')
    +(!p.todos.length?'<p class="muted">暂无待办。把「给客户发提案」「检查 SD 卡」这类事记进来，看板会汇总逾期项。</p>':'')
    +'</div>'
    +'<div class="card"><h2>沟通记录</h2>'
    +'<p class="muted" style="margin-bottom:10px">记录与客户、化妆师、场地等各方的沟通要点，按时间倒序排列。</p>'
    +'<div class="row" style="margin-bottom:12px">'
    +'<select id="nt_kind" style="max-width:100px">'+NOTE_KINDS.map(k=>'<option>'+k+'</option>').join('')+'</select>'
    +'<input id="nt_text" class="grow" placeholder="沟通要点…" onkeydown="if(event.key===\'Enter\')addNote()">'
    +'<button class="btn btn-primary" onclick="addNote()">记录</button></div>'
    +[...p.notes].sort((a,b)=>(b.ts||0)-(a.ts||0)).map(n=>{
        const d=new Date(n.ts||Date.now());
        const ds=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        const editing=view.editingNoteId===n.id;
        const body=editing
          ?'<div class="inline-edit grow"><div class="row">'
            +'<select id="en_kind" style="max-width:100px">'+NOTE_KINDS.map(k=>'<option '+(n.kind===k?'selected':'')+'>'+k+'</option>').join('')+'</select>'
            +'<input id="en_content" class="grow" value="'+esc(n.content)+'">'
            +'<button class="btn btn-primary btn-sm" onclick="saveNoteEdit('+jstr(n.id)+')">保存</button>'
            +'<button class="btn btn-ghost btn-sm" onclick="cancelInlineEdit()">取消</button></div></div>'
          :'<span class="note-kind tag '+(NOTE_TAG[n.kind]||'gray')+'">'+esc(n.kind)+'</span>'
            +'<div class="grow" style="min-width:0">'+esc(n.content)+'</div>';
        return '<div class="note-item" data-fid="'+esc(n.id)+'">'+body
          +'<span class="note-time">'+ds+'</span>'
          +editBtn('Note',n.id)
          +favBtn('notes',n)
          +'<button class="iconbtn" onclick="delNote('+jstr(n.id)+')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14"/></svg></button></div>';
      }).join('')
    +(!p.notes.length?'<p class="muted empty-hint">还没有记录。客户改需求、确认档期这类信息随手记下来，翻案时有据可查。</p>':'')
    +'</div>';
}
function saveTodoEdit(id){
  const title=gv('et_title').trim(); if(!title){ toast('待办内容不能为空'); return; }
  const patch={title,owner:gv('et_owner').trim(),due:gv('et_due')};
  updateCur(p=>{ const x=p.todos.find(y=>y.id===id); if(x) Object.assign(x,patch); });
  clearInlineEditState(view); renderProject();
}
function saveNoteEdit(id){
  const content=gv('en_content').trim(); if(!content){ toast('沟通内容不能为空'); return; }
  const patch={kind:gv('en_kind'),content};
  updateCur(p=>{ const n=p.notes.find(x=>x.id===id); if(n) Object.assign(n,patch); });
  clearInlineEditState(view); renderProject();
}
function addTodo(){
  const title=gv('td_title').trim(); if(!title){toast('待办内容不能为空');return;}
  updateCur(p=>p.todos.push({id:uid(),title,owner:gv('td_owner').trim(),due:gv('td_due'),done:false,fav:false}));
  renderProject();
}
function toggleTodo(id){ updateCur(p=>{const x=p.todos.find(y=>y.id===id); if(x) x.done=!x.done;}); renderProject(); }
function delTodo(id){ updateCur(p=>p.todos=p.todos.filter(x=>x.id!==id)); renderProject(); }
function addNote(){
  const content=gv('nt_text').trim(); if(!content){toast('先写点内容');return;}
  updateCur(p=>p.notes.push({id:uid(),kind:gv('nt_kind'),content,ts:Date.now(),fav:false}));
  renderProject();
}
function delNote(id){ updateCur(p=>p.notes=p.notes.filter(n=>n.id!==id)); renderProject(); }

