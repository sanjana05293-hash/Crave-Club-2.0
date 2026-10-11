
(() => {
  'use strict';

  // Firebase connection
  const firebaseConfig = {
    apiKey: "AIzaSyDE1a3bekyRJyhmDSpOh5YwHWti_kb9ewQ",
    authDomain: "crave-club-2.firebaseapp.com",
    projectId: "crave-club-2",
    storageBucket: "crave-club-2.firebasestorage.app",
    messagingSenderId: "462781490855",
    appId: "1:462781490855:web:6f8fd00664ff1b32615d82",
    measurementId: "G-L922DFZB79"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  const APPROVED_MANAGER_UIDS = new Set([
    "Mm3doLvdYvhMe60M1TbphqXIhnm1",
    "7la4mBuaBEaHAMMQ8OF9qPLL9tM2"
  ]);

  function isApprovedManager(user) {
    return Boolean(
      user && APPROVED_MANAGER_UIDS.has(user.uid)
    );
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'craveClub.v1';
  const MAX_IMAGE_DIMENSION = 900;
  const IMAGE_QUALITY = 0.78;
  const state = {
    page: 'home', menu: [], orders: [], tables: [], stock: [], contacts: [],
    cart: {}, selectedTableId: null, dialog: null, editId: null, pendingConfirm: null,
    selectedImageData: null
  };
  const units = ['kg','g','L','ml','packets','pieces','bottles'];
  const icons = ['🥬','🥛','🧀','🍞','🧂','☕','📦','🍅','🧴','🥚','🧋','🧻'];
  const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const dateTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
  const safeArray = value => Array.isArray(value) ? value : [];

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.menu = safeArray(parsed.menu).filter(x => x && typeof x.id === 'string' && typeof x.name === 'string' && Number.isFinite(Number(x.price)) && Number(x.price) >= 0);
        state.orders = safeArray(parsed.orders).filter(x => x && typeof x.id === 'string' && Array.isArray(x.items));
        state.tables = safeArray(parsed.tables).filter(x => x && typeof x.id === 'string' && typeof x.name === 'string');
        state.stock = safeArray(parsed.stock).filter(x => x && typeof x.id === 'string' && typeof x.name === 'string');
        state.contacts = safeArray(parsed.contacts).filter(x => x && typeof x.id === 'string' && typeof x.name === 'string');
      }
    } catch (error) {
      toast('Saved data could not be read. A fresh safe workspace is ready; existing browser data was not overwritten.', 'error');
      state.menu = []; state.orders = []; state.tables = []; state.stock = []; state.contacts = [];
    }
    if (!state.tables.length) {
      state.tables = Array.from({length:8},(_,i)=>({id:uid('table'),name:`Table ${i+1}`,createdAt:new Date().toISOString()}));
    }
    syncTableOccupancy();
  }
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version:1, menu:state.menu, orders:state.orders, tables:state.tables, stock:state.stock, contacts:state.contacts
      }));
      return true;
    } catch (error) {
      toast('Could not save: browser storage may be full. Try a smaller food image or remove unused photos, then try again.', 'error');
      return false;
    }
  }
  function syncTableOccupancy() {
    state.tables.forEach(table => {
      const active = state.orders.find(order => order.tableId === table.id && order.status === 'Active');
      table.occupiedBy = active ? active.id : null;
    });
  }
  function toast(message, type='success', title='') {
    const region = $('#toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    if (title) { const strong = document.createElement('strong'); strong.textContent = title; item.append(strong); }
    const text = document.createElement('span'); text.textContent = message; item.append(text);
    region.append(item);
    setTimeout(() => item.remove(), 3800);
  }
  function confirmAction(title, message, yesLabel, callback, danger=true) {
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    $('#confirmYes').textContent = yesLabel || 'Yes, do it';
    $('#confirmYes').className = danger ? 'danger-button' : 'primary-button';
    state.pendingConfirm = callback;
    $('#confirmDialog').showModal();
  }
  function openPage(page) {
    state.page = page;
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `${page}Page`));
    if (page === 'menu') renderMenu();
    if (page === 'orders') { renderTables(); renderOrderMenu(); renderCart(); renderHistory(); }
    if (page === 'stock') renderStock();
    if (page === 'contacts') renderContacts();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function renderEmpty(icon, title, description, buttonLabel, buttonId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';
    const illustration = document.createElement('div'); illustration.className='empty-illustration'; illustration.textContent=icon;
    const heading = document.createElement('h3'); heading.textContent=title;
    const para = document.createElement('p'); para.textContent=description;
    wrapper.append(illustration,heading,para);
    if (buttonLabel) { const button=document.createElement('button'); button.className='primary-button'; button.textContent=buttonLabel; button.addEventListener('click',()=>$('#'+buttonId)?.click()); wrapper.append(button); }
    return wrapper;
  }
  function renderMenu() {
    const root = $('#menuList'); root.replaceChildren();
    if (!state.menu.length) { root.append(renderEmpty('🍔','Your menu is hungry for ideas','Add your first food item and it will show up here — ready for the order station.','＋ Add Item','addMenuButton')); return; }
    state.menu.forEach(item => {
      const card=document.createElement('article'); card.className='food-card';
      const imageWrap=document.createElement('div'); imageWrap.className='food-image-wrap';
      if(item.image){const img=document.createElement('img');img.className='food-image';img.src=item.image;img.alt=item.name;imageWrap.append(img);}
      else {const placeholder=document.createElement('div');placeholder.className='food-placeholder';placeholder.textContent='🍽️';imageWrap.append(placeholder);}
      const body=document.createElement('div');body.className='food-card-body';
      const name=document.createElement('h3');name.textContent=item.name;
      const price=document.createElement('div');price.className='food-price';price.textContent=money(item.price);
      const actions=document.createElement('div');actions.className='food-card-actions';
      const edit=document.createElement('button');edit.className='small-action';edit.textContent='✎ Edit';edit.addEventListener('click',()=>openMenuDialog(item.id));
      const del=document.createElement('button');del.className='small-action delete';del.textContent='🗑';del.setAttribute('aria-label',`Delete ${item.name}`);del.addEventListener('click',()=>confirmAction('Remove this menu item?',`${item.name} will be removed from the menu. Saved order tickets keep their original snapshots.`, 'Delete item',()=>{state.menu=state.menu.filter(x=>x.id!==item.id);if(saveData()){renderMenu();renderOrderMenu();toast('Menu item removed.','success');}},true));
      actions.append(edit,del);body.append(name,price,actions);card.append(imageWrap,body);root.append(card);
    });
  }
  function renderTables() {
    const root=$('#tableGrid');root.replaceChildren();
    state.tables.forEach(table=>{
      const occupied=state.orders.some(order=>order.tableId===table.id&&order.status==='Active');
      const button=document.createElement('button');button.className=`table-chip${occupied?' occupied':''}${state.selectedTableId===table.id?' selected':''}`;button.disabled=occupied;
      const number=document.createElement('span');number.className='table-number';number.textContent=table.name;
      const status=document.createElement('span');status.className='table-status';status.textContent=occupied?'● Occupied':'● Available';
      button.append(number,status);button.addEventListener('click',()=>{state.selectedTableId=table.id;renderTables();renderCart();});root.append(button);
    });
  }
  function renderOrderMenu() {
    const root=$('#orderMenu');root.replaceChildren();
    if(!state.menu.length){root.append(renderEmpty('🥹','No food on the menu yet','Add food in Menu List first, then come back to build an order.','Go to Menu List','goToMenuHidden'));return;}
    state.menu.forEach(item=>{
      const button=document.createElement('button');button.className='pick-food';button.title=`Add ${item.name}`;
      if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';button.append(img);}else{const ph=document.createElement('div');ph.className='pick-placeholder';ph.textContent='🍽️';button.append(ph);}
      const copy=document.createElement('div');copy.className='pick-food-copy';const name=document.createElement('strong');name.textContent=item.name;const price=document.createElement('span');price.textContent=money(item.price);copy.append(name,price);button.append(copy);
      button.addEventListener('click',()=>{state.cart[item.id]=(state.cart[item.id]||0)+1;renderCart();button.animate([{transform:'scale(1)'},{transform:'scale(.95)'},{transform:'scale(1)'}],{duration:180});});root.append(button);
    });
  }
  function renderCart() {
    const root=$('#cartItems');root.replaceChildren();
    const table=state.tables.find(x=>x.id===state.selectedTableId);
    $('#selectedTableLabel').textContent=table?`Selected: ${table.name}`:'Choose an available table';
    let total=0, hasItems=false;
    Object.entries(state.cart).forEach(([id,qty])=>{
      const item=state.menu.find(x=>x.id===id);
      if(!item||!Number.isInteger(qty)||qty<=0)return;
      hasItems=true;total+=Number(item.price)*qty;
      const row=document.createElement('div');row.className='cart-row';
      const info=document.createElement('div');const name=document.createElement('div');name.className='cart-item-name';name.textContent=item.name;const price=document.createElement('div');price.className='cart-item-price';price.textContent=`${money(item.price)} each`;info.append(name,price);
      const controls=document.createElement('div');controls.className='cart-qty-controls';
      const minus=document.createElement('button');minus.className='qty-button';minus.textContent='−';minus.setAttribute('aria-label',`Decrease ${item.name}`);minus.addEventListener('click',()=>{if(state.cart[id]<=1)delete state.cart[id];else state.cart[id]--;renderCart();});
      const count=document.createElement('span');count.className='qty-number';count.textContent=qty;
      const plus=document.createElement('button');plus.className='qty-button';plus.textContent='+';plus.setAttribute('aria-label',`Increase ${item.name}`);plus.addEventListener('click',()=>{if(state.cart[id]<99)state.cart[id]++;else toast('Quantity limit is 99 per item.','error');renderCart();});
      const remove=document.createElement('button');remove.className='remove-cart';remove.textContent='×';remove.title='Remove item';remove.addEventListener('click',()=>{delete state.cart[id];renderCart();});
      controls.append(minus,count,plus,remove);row.append(info,controls);root.append(row);
    });
    if(!hasItems){root.append(Object.assign(document.createElement('div'),{className:'cart-empty',textContent:'Your ticket is empty. Tap a food card to add a craving ♡'}));}
    $('#orderTotal').textContent=money(total);
    $('#saveOrderButton').disabled=!table||!hasItems;
  }
  function renderHistory() {
    const root=$('#orderHistory');root.replaceChildren();
    const sorted=[...state.orders].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    if(!sorted.length){root.append(renderEmpty('🧾','No tickets yet','Your saved orders will appear here. Build the first one above.'));return;}
    sorted.forEach(order=>{
      const card=document.createElement('article');card.className='history-card';
      const main=document.createElement('div');const id=document.createElement('div');id.className='history-id';id.textContent=order.id;const meta=document.createElement('div');meta.className='history-meta';meta.textContent=`${dateTime(order.createdAt)} · ${order.tableName}`;main.append(id,meta);
      const foods=document.createElement('div');foods.className='history-foods';foods.textContent=order.items.map(x=>`${x.name} × ${x.quantity}`).join(' · ');
      const right=document.createElement('div');right.className='history-right';const total=document.createElement('div');total.className='history-total';total.textContent=money(order.total);const status=document.createElement('span');status.className=`status-pill status-${order.status.toLowerCase()}`;status.textContent=order.status;const actions=document.createElement('div');actions.className='history-actions';
      const details=document.createElement('button');details.textContent='Details';details.addEventListener('click',()=>showOrderDetails(order.id));actions.append(details);
      if(order.status==='Active'){const complete=document.createElement('button');complete.textContent='✓ Complete';complete.addEventListener('click',()=>changeOrderStatus(order.id,'Completed'));const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.addEventListener('click',()=>confirmAction('Cancel this order?',`${order.id} will be marked Cancelled and ${order.tableName} will become available. The ticket stays in history.`, 'Cancel order',()=>changeOrderStatus(order.id,'Cancelled',true),true));actions.append(complete,cancel);}
      const trash=document.createElement('button');trash.className='trash-order';trash.textContent='🗑';trash.title='Delete order record';trash.setAttribute('aria-label',`Delete order ${order.id}`);trash.addEventListener('click',()=>confirmAction('Delete this order record?',order.status==='Active'?'This active ticket will be marked Cancelled first, then removed from history. Its table will be released.':'This permanently removes the order record from this browser. This cannot be undone.','Delete record',()=>{const existing=state.orders.find(x=>x.id===order.id);if(existing?.status==='Active')existing.status='Cancelled';state.orders=state.orders.filter(x=>x.id!==order.id);syncTableOccupancy();if(saveData()){renderHistory();renderTables();toast('Order record deleted.','success');}},true));actions.append(trash);
      right.append(total,status,actions);card.append(main,foods,right);root.append(card);
    });
  }
  function changeOrderStatus(id,status,alreadyConfirmed=false) {
    const order=state.orders.find(x=>x.id===id);if(!order||order.status!=='Active')return;
    if(!alreadyConfirmed&&status==='Cancelled'){confirmAction('Cancel this order?',`The ticket will stay in history as Cancelled.`, 'Cancel order',()=>changeOrderStatus(id,'Cancelled',true),true);return;}
    order.status=status;order.updatedAt=new Date().toISOString();syncTableOccupancy();
    if(saveData()){renderHistory();renderTables();toast(status==='Completed'?'Order completed — table is free!':'Order cancelled — table is free!', 'success');}
  }
  function showOrderDetails(id) {
    const order=state.orders.find(x=>x.id===id);if(!order)return;
    $('#detailsContent').replaceChildren();
    const meta=document.createElement('div');meta.className='detail-meta';
    [ `Order: ${order.id}`, `Table: ${order.tableName}`, `Placed: ${dateTime(order.createdAt)}`, `Status: ${order.status}` ].forEach(text=>{const line=document.createElement('div');line.textContent=text;meta.append(line);});
    const lines=document.createElement('div');lines.className='detail-lines';
    order.items.forEach(item=>{const line=document.createElement('div');line.className='detail-line';const left=document.createElement('span');left.textContent=`${item.name} × ${item.quantity}`;const right=document.createElement('strong');right.textContent=money(item.price*item.quantity);line.append(left,right);lines.append(line);});
    const total=document.createElement('div');total.className='detail-total';const label=document.createElement('span');label.textContent='Total';const amount=document.createElement('span');amount.textContent=money(order.total);total.append(label,amount);
    $('#detailsContent').append(meta,lines,total);$('#detailsDialog').showModal();
  }
  function renderStock() {
    const root=$('#stockList');root.replaceChildren();
    const query=$('#stockSearch').value.trim().toLowerCase();const filter=$('#stockFilter').value;
    const items=state.stock.filter(item=>{
      const quantity=Number(item.quantity)||0;const low=item.threshold!==null&&item.threshold!==''&&Number.isFinite(Number(item.threshold))&&quantity<=Number(item.threshold);const unavailable=quantity<=0;
      const matches=(item.name+' '+(item.note||'')).toLowerCase().includes(query);
      return matches&&(filter==='all'||(filter==='low'&&low&&!unavailable)||(filter==='available'&&!unavailable)||(filter==='unavailable'&&unavailable));
    });
    if(!items.length){root.append(renderEmpty('📦',state.stock.length?'No matching supplies':'Your storage shelf is empty',state.stock.length?'Try another search or filter.':'Add ingredients and supplies to start tracking them.','＋ Add Stock','addStockButton'));return;}
    items.forEach(item=>{
      const qty=Number(item.quantity)||0;const low=item.threshold!==null&&item.threshold!==''&&Number.isFinite(Number(item.threshold))&&qty<=Number(item.threshold);const unavailable=qty<=0;
      const card=document.createElement('article');card.className=`stock-card-item${low?' low':''}${unavailable?' unavailable':''}`;
      const icon=document.createElement('div');icon.className='stock-icon';icon.textContent=item.icon||'📦';
      const main=document.createElement('div');main.className='stock-main';const name=document.createElement('h3');name.textContent=item.name;const quantity=document.createElement('div');quantity.className='stock-quantity';quantity.textContent=`${qty} ${item.unit}`;const updated=document.createElement('div');updated.className='stock-detail';updated.textContent=`Updated ${dateTime(item.updatedAt)}`;
      const status=document.createElement('span');status.className=`stock-status${unavailable?' unavailable':low?' low':''}`;status.textContent=unavailable?'Unavailable':low?'Low stock':'Available';
      main.append(name,quantity,updated,status);
      if(item.threshold!==null&&item.threshold!==''){const threshold=document.createElement('div');threshold.className='stock-detail';threshold.textContent=`Low-stock threshold: ${item.threshold} ${item.unit}`;main.append(threshold);}
      if(item.note){const note=document.createElement('p');note.className='stock-note';note.textContent=item.note;main.append(note);}
      const actions=document.createElement('div');actions.className='stock-actions';const edit=document.createElement('button');edit.textContent='✎ Edit';edit.addEventListener('click',()=>openStockDialog(item.id));const update=document.createElement('button');update.textContent='± Qty';update.addEventListener('click',()=>openQuantityDialog(item.id));const del=document.createElement('button');del.className='delete';del.textContent='🗑';del.setAttribute('aria-label',`Delete ${item.name}`);del.addEventListener('click',()=>confirmAction('Delete this stock entry?',`${item.name} will be removed from manual stock tracking.`, 'Delete stock',()=>{state.stock=state.stock.filter(x=>x.id!==item.id);if(saveData()){renderStock();toast('Stock entry deleted.');}},true));actions.append(edit,update,del);main.append(actions);card.append(icon,main);root.append(card);
    });
  }
  function renderContacts() {
    const root=$('#contactList');root.replaceChildren();
    if(!state.contacts.length){root.append(renderEmpty('☎️','No contacts saved yet','Add a trusted contact so their number is easy to find when you need it.','＋ Add Contact','addContactButton'));return;}
    state.contacts.forEach(contact=>{
      const card=document.createElement('article');card.className='contact-card-item';const top=document.createElement('div');top.className='contact-card-top';const icon=document.createElement('div');icon.className='contact-icon';icon.textContent='☎️';const actions=document.createElement('div');actions.className='contact-actions-top';
      const name=document.createElement('h3');name.className='contact-name';name.textContent=contact.name;const phone=document.createElement('div');phone.className='contact-phone';phone.textContent=contact.phone;
      top.append(icon);const body=document.createElement('div');body.append(name,phone);
      if(contact.note){const note=document.createElement('p');note.className='contact-note';note.textContent=contact.note;body.append(note);}
      const row=document.createElement('div');row.className='contact-actions';const call=document.createElement('a');call.className='call-button';call.href=`tel:${contact.phone.replace(/[^\d+]/g,'')}`;call.textContent='☎ Call now';call.setAttribute('aria-label',`Call ${contact.name}`);
      const edit=document.createElement('button');edit.textContent='Edit';edit.addEventListener('click',()=>openContactDialog(contact.id));const del=document.createElement('button');del.className='delete';del.textContent='🗑';del.setAttribute('aria-label',`Delete ${contact.name}`);del.addEventListener('click',()=>confirmAction('Delete this contact?',`${contact.name} will be removed from your quick list.`, 'Delete contact',()=>{state.contacts=state.contacts.filter(x=>x.id!==contact.id);if(saveData()){renderContacts();toast('Contact removed.');}},true));row.append(call,edit,del);card.append(top,body,row);root.append(card);
    });
  }
  function showDialog(title, eyebrow, fields, values={}, id=null, type) {
    state.dialog=type;state.editId=id;state.selectedImageData=null;
    $('#dialogTitle').textContent=title;$('#dialogEyebrow').textContent=eyebrow;$('#dialogFields').replaceChildren();
    fields.forEach(field=>{
      const wrap=document.createElement('div');wrap.className='field';const label=document.createElement('label');label.htmlFor=field.name;label.textContent=field.label;wrap.append(label);
      let input;
      if(field.type==='select'){input=document.createElement('select');field.options.forEach(option=>{const opt=document.createElement('option');opt.value=option;opt.textContent=option;input.append(opt);});}
      else if(field.type==='textarea'){input=document.createElement('textarea');input.rows=3;}
      else if(field.type==='preview'){input=document.createElement('div');input.className='image-preview';input.id='imagePreview';input.textContent='Your food photo will appear here';if(values.image){const img=document.createElement('img');img.src=values.image;img.alt='Current food image preview';input.replaceChildren(img);}}
      else {input=document.createElement('input');input.type=field.type||'text';}
      input.id=field.name;input.name=field.name;
      if(field.type!=='preview'&&field.type!=='file')input.value=values[field.name]??field.default??'';
      if(field.type==='file'){input.accept='image/*';input.addEventListener('change',()=>handleImageSelection(input));}
      if(field.placeholder)input.placeholder=field.placeholder;
      if(field.min!==undefined)input.min=field.min;if(field.step!==undefined)input.step=field.step;
      if(field.required)input.required=true;
      if(field.type==='preview')input.setAttribute('aria-live','polite');
      wrap.append(input);
      if(field.hint){const hint=document.createElement('small');hint.textContent=field.hint;wrap.append(hint);}
      $('#dialogFields').append(wrap);
    });
    $('#recordDialog').showModal();
  }
  function openMenuDialog(id=null) {
    const item=id?state.menu.find(x=>x.id===id):null;
    showDialog(item?'Edit food item':'Add a food item','THE TASTY LINEUP',[
      {name:'name',label:'Food item name',required:true,placeholder:'e.g. Cheesy Smash Burger'},
      {name:'price',label:'Price (₹)',type:'number',required:true,min:0,step:'0.01',placeholder:'e.g. 149'},
      {name:'imageFile',label:'Food photo (optional)',type:'file',hint:'Choose a photo from your device. Large photos are resized to help storage.'},
      {name:'imagePreview',label:'Photo preview',type:'preview'}
    ],item?{name:item.name,price:item.price,image:item.image}: {},id,'menu');
  }
  function handleImageSelection(input) {
    const file=input.files&&input.files[0];if(!file)return;
    if(!file.type.startsWith('image/')){toast('Choose an image file, please.','error');input.value='';return;}
    if(file.size>12*1024*1024){toast('That photo is over 12 MB. Choose a smaller image to keep browser storage happy.','error');input.value='';return;}
    const reader=new FileReader();
    reader.onerror=()=>toast('Could not read that image. Please try another file.','error');
    reader.onload=()=> {
      const image=new Image();
      image.onerror=()=>toast('That image could not be opened. Try another photo.','error');
      image.onload=()=>{
        const scale=Math.min(1,MAX_IMAGE_DIMENSION/Math.max(image.width,image.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
        const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
        let data=canvas.toDataURL('image/jpeg',IMAGE_QUALITY);
        if(data.length>1_200_000)data=canvas.toDataURL('image/jpeg',0.58);
        state.selectedImageData=data;
        const preview=$('#imagePreview');if(preview){const img=document.createElement('img');img.src=data;img.alt='Selected food photo preview';preview.replaceChildren(img);}
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  }
  function openStockDialog(id=null) {
    const item=id?state.stock.find(x=>x.id===id):null;
    showDialog(item?'Edit stock entry':'Add stock entry','THE BACK-OF-HOUSE',[
      {name:'name',label:'Ingredient or supply name',required:true,placeholder:'e.g. Burger buns'},
      {name:'quantity',label:'Current quantity',type:'number',required:true,min:0,step:'any',placeholder:'e.g. 24'},
      {name:'unit',label:'Unit',type:'select',options:units,required:true},
      {name:'threshold',label:'Low-stock threshold (optional)',type:'number',min:0,step:'any',placeholder:'e.g. 5'},
      {name:'note',label:'Note (optional)',type:'textarea',placeholder:'Storage shelf, brand, reminder…'}
    ],item?{name:item.name,quantity:item.quantity,unit:item.unit,threshold:item.threshold??'',note:item.note||''}:{unit:'pieces'},id,'stock');
  }
  function openQuantityDialog(id) {
    const item=state.stock.find(x=>x.id===id);if(!item)return;
    showDialog('Update quantity','QUICK STOCK UPDATE',[
      {name:'quantity',label:`New quantity (${item.unit})`,type:'number',required:true,min:0,step:'any'},
      {name:'note',label:'Note (optional)',type:'textarea',placeholder:'Optional update note'}
    ],{quantity:item.quantity,note:item.note||''},id,'quantity');
  }
  function openContactDialog(id=null) {
    const item=id?state.contacts.find(x=>x.id===id):null;
    showDialog(item?'Edit contact':'Add emergency contact','YOUR LITTLE LIFELINE',[
      {name:'name',label:'Contact name',required:true,placeholder:'e.g. Building security'},
      {name:'phone',label:'Phone number',type:'tel',required:true,placeholder:'e.g. +91 98765 43210',hint:'Use a valid phone number with 7–15 digits.'},
      {name:'note',label:'Note (optional)',type:'textarea',placeholder:'Who they are or when to call'}
    ],item?{name:item.name,phone:item.phone,note:item.note||''}:{},id,'contact');
  }
  function validPhone(phone) {const digits=phone.replace(/\D/g,'');return digits.length>=7&&digits.length<=15&&/^[+()\d\s.-]+$/.test(phone.trim());}
  function handleRecordSubmit(event) {
    event.preventDefault();
    const form=$('#recordForm');if(!form.reportValidity())return;
    const data=Object.fromEntries(new FormData(form).entries());
    const now=new Date().toISOString();
    if(state.dialog==='menu'){
      const name=String(data.name||'').trim();const price=Number(data.price);
      if(!name){toast('Add a food name first.','error');return;}
      if(!Number.isFinite(price)||price<0||String(data.price).trim()===''){toast('Enter a valid non-negative price.','error');return;}
      const existing=state.menu.find(x=>x.id===state.editId);
      const record={id:existing?.id||uid('food'),name,price:Number(price.toFixed(2)),image:state.selectedImageData||existing?.image||null,createdAt:existing?.createdAt||now,updatedAt:now};
      const old=state.menu.slice();if(existing)state.menu=state.menu.map(x=>x.id===existing.id?record:x);else state.menu.push(record);
      if(saveData()){closeRecordDialog();renderMenu();renderOrderMenu();toast(existing?'Food item updated.':'Food item added.','success');}else state.menu=old;
    } else if(state.dialog==='stock'){
      const name=String(data.name||'').trim(),quantity=Number(data.quantity),threshold=String(data.threshold||'').trim();
      if(!name||!Number.isFinite(quantity)||quantity<0){toast('Enter a name and a valid quantity of zero or more.','error');return;}
      if(threshold!==''&&(!Number.isFinite(Number(threshold))||Number(threshold)<0)){toast('Low-stock threshold must be zero or more.','error');return;}
      const existing=state.stock.find(x=>x.id===state.editId);
      const record={id:existing?.id||uid('stock'),name,quantity,unit:data.unit,threshold:threshold===''?null:Number(threshold),note:String(data.note||'').trim(),icon:existing?.icon||icons[state.stock.length%icons.length],createdAt:existing?.createdAt||now,updatedAt:now};
      const old=state.stock.slice();if(existing)state.stock=state.stock.map(x=>x.id===existing.id?record:x);else state.stock.push(record);
      if(saveData()){closeRecordDialog();renderStock();toast(existing?'Stock entry updated.':'Stock entry added.');}else state.stock=old;
    } else if(state.dialog==='quantity'){
      const quantity=Number(data.quantity),item=state.stock.find(x=>x.id===state.editId);
      if(!item||!Number.isFinite(quantity)||quantity<0){toast('Quantity must be zero or more.','error');return;}
      const old={...item};item.quantity=quantity;item.note=String(data.note||'').trim();item.updatedAt=now;
      if(saveData()){closeRecordDialog();renderStock();toast('Quantity updated.');}else Object.assign(item,old);
    } else if(state.dialog==='contact'){
      const name=String(data.name||'').trim(),phone=String(data.phone||'').trim();
      if(!name){toast('Add a contact name first.','error');return;}
      if(!validPhone(phone)){toast('Enter a valid phone number with 7–15 digits.','error');return;}
      const existing=state.contacts.find(x=>x.id===state.editId);
      const record={id:existing?.id||uid('contact'),name,phone,note:String(data.note||'').trim(),createdAt:existing?.createdAt||now,updatedAt:now};
      const old=state.contacts.slice();if(existing)state.contacts=state.contacts.map(x=>x.id===existing.id?record:x);else state.contacts.push(record);
      if(saveData()){closeRecordDialog();renderContacts();toast(existing?'Contact updated.':'Contact added.');}else state.contacts=old;
    }
  }
  function closeRecordDialog(){ $('#recordDialog').close(); state.dialog=null;state.editId=null;state.selectedImageData=null; }
  function saveOrder() {
    const table=state.tables.find(x=>x.id===state.selectedTableId);
    if(!table){toast('Choose an available table first.','error');return;}
    if(state.orders.some(order=>order.tableId===table.id&&order.status==='Active')){toast('That table already has an active order. Choose another table.','error');renderTables();return;}
    const items=Object.entries(state.cart).map(([id,quantity])=>{const item=state.menu.find(x=>x.id===id);if(!item||!Number.isInteger(quantity)||quantity<1||quantity>99)return null;return {menuItemId:item.id,name:item.name,price:Number(item.price),quantity};}).filter(Boolean);
    if(!items.length){toast('Add at least one food item before saving.','error');return;}
    const now=new Date().toISOString();const total=items.reduce((sum,item)=>sum+item.price*item.quantity,0);
    const order={id:`CC-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,tableId:table.id,tableName:table.name,items,total:Number(total.toFixed(2)),status:'Active',createdAt:now,updatedAt:now};
    state.orders.unshift(order);syncTableOccupancy();
    if(saveData()){state.cart={};state.selectedTableId=null;renderTables();renderCart();renderHistory();toast(`Ticket ${order.id} saved successfully.`,'success','Order saved!');}
    else {state.orders=state.orders.filter(x=>x.id!==order.id);syncTableOccupancy();}
  }
  function addTable() {
    const number=state.tables.reduce((max,t)=>{const match=t.name.match(/(\d+)/);return Math.max(max,match?Number(match[1]):0);},0)+1;
    const table={id:uid('table'),name:`Table ${number}`,createdAt:new Date().toISOString()};state.tables.push(table);
    if(saveData()){renderTables();toast(`${table.name} added.`);}else state.tables.pop();
  }
  
  let appInitialized = false;

  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    loadData();

    $$('[data-home]').forEach(button =>
      button.addEventListener('click', () => openPage('home'))
    );
    $$('[data-page]').forEach(button =>
      button.addEventListener('click', () => openPage(button.dataset.page))
    );

    $('#homeButton').addEventListener('click', () => openPage('home'));
    $('#addMenuButton').addEventListener('click', () => openMenuDialog());
    $('#addStockButton').addEventListener('click', () => openStockDialog());
    $('#addContactButton').addEventListener('click', () => openContactDialog());
    $('#addTableButton').addEventListener('click', addTable);
    $('#saveOrderButton').addEventListener('click', saveOrder);

    $('#cancelDraftButton').addEventListener('click', () => {
      state.cart = {};
      state.selectedTableId = null;
      renderTables();
      renderCart();
      toast('Draft order cleared.');
    });

    $('#stockSearch').addEventListener('input', renderStock);
    $('#stockFilter').addEventListener('change', renderStock);
    $('#recordForm').addEventListener('submit', handleRecordSubmit);
    $('#closeDialogButton').addEventListener('click', closeRecordDialog);
    $('#dialogCancelButton').addEventListener('click', closeRecordDialog);

    $('#confirmNo').addEventListener('click', () => $('#confirmDialog').close());

    $('#confirmYes').addEventListener('click', () => {
      const callback = state.pendingConfirm;
      state.pendingConfirm = null;
      $('#confirmDialog').close();
      if (callback) callback();
    });

    $('#closeDetailsButton').addEventListener('click', () =>
      $('#detailsDialog').close()
    );

    $('#recordDialog').addEventListener('click', event => {
      if (event.target === $('#recordDialog')) closeRecordDialog();
    });

    const hiddenMenuButton = document.createElement('button');
    hiddenMenuButton.id = 'goToMenuHidden';
    hiddenMenuButton.hidden = true;
    hiddenMenuButton.addEventListener('click', () => openPage('menu'));
    document.body.append(hiddenMenuButton);

    renderMenu();
    renderTables();
    renderOrderMenu();
    renderCart();
    renderHistory();
    renderStock();
    renderContacts();
  }

  function showLogin(message = '') {
    $('#app').classList.add('hidden');
    $('#loginScreen').classList.remove('hidden');
    $('#loginError').textContent = message;
    $('#splash')?.remove();
  }

  function showManagerApp() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#splash')?.remove();
    initApp();
  }

  function setupLogin() {
    $('#loginForm').addEventListener('submit', async event => {
      event.preventDefault();

      const email = $('#managerEmail').value.trim();
      const password = $('#managerPassword').value;
      const button = $('#loginButton');

      button.disabled = true;
      button.textContent = 'Signing in…';
      $('#loginError').textContent = '';

      try {
        const result = await auth.signInWithEmailAndPassword(email, password);

        if (!isApprovedManager(result.user)) {
          await auth.signOut();
          showLogin('This account is not approved for manager access.');
        }
      } catch (error) {
        showLogin(
          error.code === 'auth/invalid-credential'
            ? 'Email or password is incorrect.'
            : 'Sign-in failed. Check your connection and try again.'
        );
      } finally {
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    });

    auth.onAuthStateChanged(user => {
      if (user && isApprovedManager(user)) {
        showManagerApp();
      } else {
        showLogin();
        if (user) auth.signOut();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', setupLogin);
})();
