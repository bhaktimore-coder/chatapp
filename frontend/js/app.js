const token    = localStorage.getItem('token');
const username = localStorage.getItem('username');
const role     = localStorage.getItem('role');

if (!token) window.location.href = 'index.html';

// Show user info
document.getElementById('display-username').textContent = username;
document.getElementById('display-role').textContent     = role;
document.getElementById('user-avatar').textContent      = username[0].toUpperCase();

// Avatar color based on role
const avatarColors = { admin: '#2d6e2d', moderator: '#4a9e4a', member: '#7abe7a' };
document.getElementById('user-avatar').style.background = avatarColors[role] || '#3a8a3a';

// Connect socket with token auth
const socket = io('https://canopy-705v.onrender.com', {
  transports: ['websocket'],
  auth: { token }
});

socket.on('connect', () => {
  console.log('Connected ✅');
  socket.emit('register'); // register personal DM channel
});

socket.on('connect_error', (err) => {
  console.log('Connection error:', err.message);
});

let currentRoom = null;

// Random avatar colors for other users
function getColor(name) {
  const colors = ['#3a8a3a','#2d6e2d','#4a9e4a','#23a55a','#7abe7a','#1a5c1a'];
  let hash = 0;
  for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function joinRoom(roomId, el) {
  currentRoom = roomId;

  document.getElementById('room-title').textContent   = roomId;
  document.getElementById('room-topic').textContent   = `Welcome to #${roomId}`;
  document.getElementById('messages').innerHTML       = '';
  document.getElementById('msg-input').disabled       = false;
  document.getElementById('msg-input').placeholder    = `Message #${roomId}`;
  document.getElementById('msg-input').focus();

  // Active room highlight
  document.querySelectorAll('.channel-item').forEach(r => r.classList.remove('active'));
  if (el) el.classList.add('active');

  // her backend only wants roomId not an object!
  socket.emit('join_room', roomId);
  addDateDivider('Today');
}

function sendMessage() {
  const input   = document.getElementById('msg-input');
  const message = input.value.trim();
  if (!message || !currentRoom) return;

  // her backend gets username/role from JWT token automatically
  socket.emit('send_message', {
    roomId: currentRoom,
    message
  });

  input.value = '';
}

document.getElementById('msg-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ── Incoming events ──────────────────────────

// receive room message — her backend sends { user, role, message, roomId }
socket.on('receive_message', ({ user, role: senderRole, message, roomId }) => {
  if (roomId && roomId.startsWith('dm_')) return; // handled by DM listener
  if (user === 'system') {
    addSystemMessage(message);
    return;
  }
  addMessage(user, senderRole, message);
});

// receive DM — her backend sends { from, message, timestamp }
socket.on('receive_dm', ({ from, message }) => {
  if (!openDMs[from]) openDMPopup(from);
  if (from !== username) addDMMessage(from, from, message);
});

socket.on('error-msg', msg => {
  addSystemMessage('⚠️ ' + msg);
});

// ── Render helpers ───────────────────────────

let lastAuthor = null;

function addMessage(sender, senderRole, message) {
  const msgs = document.getElementById('messages');

  if (sender === lastAuthor) {
    const div = document.createElement('div');
    div.classList.add('msg-continued');
    div.innerHTML = `
      <div class="spacer"></div>
      <div class="msg-bubble ${senderRole || 'member'}">${message}</div>
    `;
    msgs.appendChild(div);
  } else {
    const div       = document.createElement('div');
    div.classList.add('msg-group');

    const isMine      = sender === username;
    const roleClass   = senderRole || 'member';
    const bubbleClass = isMine ? 'mine' : roleClass;
    const pill        = (roleClass === 'admin' || roleClass === 'moderator')
      ? `<span class="role-pill ${roleClass}">${roleClass}</span>` : '';

    div.innerHTML = `
      <div class="msg-avatar" style="background:${getColor(sender)}">${sender[0].toUpperCase()}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-author ${roleClass}">${sender}</span>
          ${pill}
          <span class="msg-time">${getTime()}</span>
        </div>
        <div class="msg-bubble ${bubbleClass}">${message}</div>
      </div>
    `;
    msgs.appendChild(div);
    lastAuthor = sender;
  }

  scrollToBottom();
}

function addSystemMessage(text) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.classList.add('system-msg');
  div.textContent = text;
  msgs.appendChild(div);
  lastAuthor = null;
  scrollToBottom();
}

function addAnnouncement(text) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.classList.add('announcement-msg');
  div.textContent = '📢 ' + text;
  msgs.appendChild(div);
  lastAuthor = null;
  scrollToBottom();
}

function addDateDivider(text) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.classList.add('system-msg');
  div.textContent = text;
  msgs.appendChild(div);
}

function scrollToBottom() {
  const msgs = document.getElementById('messages');
  msgs.scrollTop = msgs.scrollHeight;
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Members panel ────────────────────────────

function addMember(name, memberRole) {
  const panel = document.getElementById('members-panel');

  const placeholder = panel.querySelector('div[style]');
  if (placeholder) placeholder.remove();

  if (document.getElementById('member-' + name)) return;

  const sectionId = 'section-' + memberRole;
  let section     = document.getElementById(sectionId);

  if (!section) {
    const heading = document.createElement('div');
    heading.classList.add('members-section');
    heading.id          = sectionId;
    heading.textContent = memberRole.toUpperCase() + 'S';
    panel.appendChild(heading);
  }

  const div = document.createElement('div');
  div.classList.add('member-item');
  div.id = 'member-' + name;
  div.onclick = () => openDMPopup(name);
  div.innerHTML = `
    <div class="member-avatar" style="background:${getColor(name)}">
      ${name[0].toUpperCase()}
      <div class="status-dot online"></div>
    </div>
    <div>
      <div class="member-name">${name}</div>
      <div class="member-role">${memberRole}</div>
    </div>
  `;
  panel.appendChild(div);
  addToDMList(name, memberRole);
}

function removeMember(name) {
  const el = document.getElementById('member-' + name);
  if (el) el.remove();
}

// Add yourself to members on load
addMember(username, role);

function logout() {
  socket.emit('leave_room', currentRoom);
  localStorage.clear();
  window.location.href = 'index.html';
}

// ── FLOATING DM POPUP ─────────────────────

const openDMs = {};

function addToDMList(name, memberRole) {
  if (name === username) return;

  const dmList = document.getElementById('dm-list');
  if (!dmList) return;

  const placeholder = dmList.querySelector('div[style]');
  if (placeholder) placeholder.remove();

  if (document.getElementById('dmlist-' + name)) return;

  const div = document.createElement('div');
  div.classList.add('dm-list-item');
  div.id      = 'dmlist-' + name;
  div.onclick = () => openDMPopup(name);

  div.innerHTML = `
    <div class="dm-list-avatar" style="background:${getColor(name)}">
      ${name[0].toUpperCase()}
    </div>
    <span>${name}</span>
  `;

  dmList.appendChild(div);
}

function openDMPopup(dmUser) {
  if (dmUser === username) return; // can't DM yourself

  if (openDMs[dmUser]) {
    const existing = document.getElementById('dm-popup-' + dmUser);
    if (existing) existing.classList.remove('minimized');
    return;
  }

  openDMs[dmUser] = true;

  const popup = document.createElement('div');
  popup.classList.add('dm-popup');
  popup.id = 'dm-popup-' + dmUser;

  popup.innerHTML = `
    <div class="dm-popup-header" onclick="toggleDMMinimize('${dmUser}')">
      <div class="dm-popup-avatar" style="background:${getColor(dmUser)}">
        ${dmUser[0].toUpperCase()}
      </div>
      <span class="dm-popup-name">${dmUser}</span>
      <div class="dm-popup-actions">
        <button class="dm-popup-btn" onclick="event.stopPropagation(); toggleDMMinimize('${dmUser}')">─</button>
        <button class="dm-popup-btn" onclick="event.stopPropagation(); closeDMPopup('${dmUser}')">✕</button>
      </div>
    </div>
    <div class="dm-popup-messages" id="dm-msgs-${dmUser}">
      <div class="dm-date-divider">Today</div>
    </div>
    <div class="dm-popup-input-area">
      <input
        class="dm-popup-input"
        id="dm-input-${dmUser}"
        placeholder="Message ${dmUser}..."
        onkeydown="if(event.key==='Enter') sendDM('${dmUser}')"
      />
      <button class="dm-send-btn" onclick="sendDM('${dmUser}')">➤</button>
    </div>
  `;

  document.getElementById('dm-popups').appendChild(popup);
}

function toggleDMMinimize(dmUser) {
  const popup = document.getElementById('dm-popup-' + dmUser);
  if (popup) popup.classList.toggle('minimized');
}

function closeDMPopup(dmUser) {
  const popup = document.getElementById('dm-popup-' + dmUser);
  if (popup) popup.remove();
  delete openDMs[dmUser];
}

function sendDM(dmUser) {
  const input   = document.getElementById('dm-input-' + dmUser);
  const message = input.value.trim();
  if (!message) return;

  // show instantly on your side
  addDMMessage(dmUser, username, message);

  // use her backend's direct_message event!
  socket.emit('direct_message', {
    toUsername: dmUser,
    message
  });

  input.value = '';
}

function addDMMessage(dmUser, sender, message) {
  const msgs = document.getElementById('dm-msgs-' + dmUser);
  if (!msgs) return;

  const isMine = sender === username;
  const div    = document.createElement('div');
  div.classList.add('dm-msg', isMine ? 'mine' : 'theirs');

  div.innerHTML = `
    ${!isMine ? `<span class="dm-msg-sender">${sender}</span>` : ''}
    <div class="dm-msg-bubble">${message}</div>
    <span class="dm-msg-time">${getTime()}</span>
  `;

  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}