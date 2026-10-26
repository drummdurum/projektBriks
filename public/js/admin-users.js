// Admin User Management

let allUsers = [];
let filteredUsers = [];
let selectedManualUser = null;
let manualHistoryNotesByBookingId = {};
let selectedManualNoteBookingId = null;

function getSelectedManualUser() {
    return selectedManualUser;
}

function setManualIdentityLocked(locked) {
    const navn = document.getElementById('manualNavn');
    const telefon = document.getElementById('manualTelefon');
    const email = document.getElementById('manualEmail');

    [navn, telefon, email].forEach(field => {
        if (!field) return;

        field.readOnly = !!locked;
        field.classList.toggle('bg-gray-100', !!locked);
        field.classList.toggle('cursor-not-allowed', !!locked);
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderManualUserQuickList() {
    const container = document.getElementById('manualUserQuickList');
    if (!container) return;

    if (!Array.isArray(allUsers) || allUsers.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">Ingen brugere fundet</p>';
        return;
    }

    container.innerHTML = allUsers.map(user => {
        const isSelected = selectedManualUser && selectedManualUser.id === user.id;
        return `
            <button type="button"
                    onclick="selectManualUserFromQuickList(${user.id})"
                    class="w-full text-left p-3 rounded-lg border transition-colors ${isSelected ? 'bg-green-100 border-green-400' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}">
                <p class="font-medium text-gray-900">${escapeHtml(user.navn)} ${escapeHtml(user.efternavn || '')}</p>
                <p class="text-xs text-gray-600">📞 ${escapeHtml(user.telefon)}${user.email ? ` • ✉️ ${escapeHtml(user.email)}` : ''}</p>
            </button>
        `;
    }).join('');
}

function applyManualUserSelection(user) {
    if (!user) return;

    selectedManualUser = {
        id: user.id,
        navn: user.navn,
        efternavn: user.efternavn || '',
        telefon: user.telefon,
        email: user.email || ''
    };

    renderSelectedManualUser();
    renderManualUserQuickList();
    loadManualUserBookingHistory();

    const fullName = `${user.navn} ${user.efternavn || ''}`.trim();
    const manualNavn = document.getElementById('manualNavn');
    const manualTelefon = document.getElementById('manualTelefon');
    const manualEmail = document.getElementById('manualEmail');

    if (manualNavn) manualNavn.value = fullName;
    if (manualTelefon) manualTelefon.value = user.telefon;
    if (manualEmail) manualEmail.value = user.email || '';

    setManualIdentityLocked(true);
}

function selectManualUserFromQuickList(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    applyManualUserSelection(user);
}

function switchManualEntryTab(tabName) {
    const bookingPanel = document.getElementById('manualBookingPanel');
    const userPanel = document.getElementById('manualUserPanel');
    const userPanelGrid = document.getElementById('manualUserPanelGrid');
    const createUserCard = document.getElementById('createUserCard');
    const manageUsersCard = document.getElementById('manageUsersCard');
    const tabButtons = document.querySelectorAll('.manual-entry-tab-btn');

    if (!bookingPanel || !userPanel) {
        return;
    }

    const showBooking = tabName === 'booking';
    const showUserPanel = tabName === 'user' || tabName === 'edit-user';

    bookingPanel.classList.toggle('hidden', !showBooking);
    userPanel.classList.toggle('hidden', !showUserPanel);

    if (createUserCard && manageUsersCard && userPanelGrid) {
        const isEditMode = tabName === 'edit-user';
        createUserCard.classList.toggle('hidden', isEditMode);
        manageUsersCard.classList.toggle('lg:col-span-2', isEditMode);
        userPanelGrid.classList.toggle('lg:grid-cols-1', isEditMode);
        userPanelGrid.classList.toggle('lg:grid-cols-2', !isEditMode);
    }

    tabButtons.forEach(btn => {
        const isActive = btn.dataset.manualTab === tabName;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('bg-green-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('text-gray-700', !isActive);
        btn.classList.toggle('hover:bg-gray-200', !isActive);
    });

    if (tabName === 'edit-user') {
        const usersSearchInput = document.getElementById('usersSearchInput');
        if (usersSearchInput) {
            usersSearchInput.focus();
        }
    }

    if (tabName === 'booking' && !selectedManualUser) {
        setManualIdentityLocked(false);
    }
}

function renderSelectedManualUser() {
    const card = document.getElementById('selectedManualUserCard');
    if (!card) return;

    if (!selectedManualUser) {
        card.innerHTML = '<p class="text-sm text-gray-500">Ingen bruger valgt endnu</p>';
        return;
    }

    card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
            <h3 class="font-medium text-gray-900">Valgt bruger</h3>
            <button type="button" onclick="openSelectedManualUserHistoryModal()" class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm" title="Se tidligere bookinger">📋</button>
        </div>
        <div class="text-sm text-gray-700 space-y-1">
            <p>👤 ${escapeHtml(selectedManualUser.navn)} ${escapeHtml(selectedManualUser.efternavn || '')}</p>
            <p>📞 ${escapeHtml(selectedManualUser.telefon || '-')}</p>
            <p>✉️ ${escapeHtml(selectedManualUser.email || '-')}</p>
        </div>
    `;
}

function closeManualUserHistoryModal() {
    const modal = document.getElementById('manualUserHistoryModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeManualBookingNoteModal() {
    const modal = document.getElementById('manualBookingNoteModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    selectedManualNoteBookingId = null;
}

function openManualBookingNoteModal(bookingId) {
    const modal = document.getElementById('manualBookingNoteModal');
    const noteInput = document.getElementById('manualBookingNoteInput');
    const title = document.getElementById('manualBookingNoteTitle');

    if (!modal || !noteInput) return;

    const note = manualHistoryNotesByBookingId[bookingId] || '';
    selectedManualNoteBookingId = bookingId;
    if (title) {
        title.textContent = `📋 Booking note #${bookingId}`;
    }
    noteInput.value = note;
    modal.classList.remove('hidden');
}

async function saveManualBookingNoteFromModal() {
    if (!selectedManualNoteBookingId) return;

    const noteInput = document.getElementById('manualBookingNoteInput');
    if (!noteInput) return;

    const noteText = noteInput.value || '';

    try {
        const response = await fetch(`/api/admin/bookings/${selectedManualNoteBookingId}/note`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ besked: noteText })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            showNotification(result.message || 'Kunne ikke gemme note', 'error');
            return;
        }

        manualHistoryNotesByBookingId[selectedManualNoteBookingId] = noteText;
        showNotification('Note gemt', 'success');
        closeManualBookingNoteModal();
        await loadManualUserBookingHistory();
    } catch (error) {
        console.error('Error saving manual booking note:', error);
        showNotification('Fejl ved gem af note', 'error');
    }
}

async function openSelectedManualUserHistoryModal() {
    const modal = document.getElementById('manualUserHistoryModal');
    const list = document.getElementById('manualUserHistoryModalList');

    if (!modal || !list) return;

    if (!selectedManualUser) {
        showNotification('Vælg først en bruger', 'error');
        return;
    }

    modal.classList.remove('hidden');
    list.innerHTML = '<p class="text-sm text-gray-500">Indlæser tidligere bookinger...</p>';

    try {
        const response = await fetch('/api/admin/bookings');
        const bookings = await response.json();

        if (!Array.isArray(bookings)) {
            list.innerHTML = '<p class="text-sm text-red-600">Kunne ikke hente bookinger</p>';
            return;
        }

        const matches = bookings
            .filter(b => b.userId === selectedManualUser.id || b.telefon === selectedManualUser.telefon)
            .sort((a, b) => new Date(b.ønsket_dato) - new Date(a.ønsket_dato));

        if (!matches.length) {
            list.innerHTML = '<p class="text-sm text-gray-500">Ingen tidligere bookinger fundet</p>';
            return;
        }

        list.innerHTML = matches.map(b => `
            <div class="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div class="flex items-center justify-between">
                    <p class="font-medium text-gray-900">${formatDate(b.ønsket_dato)} kl. ${escapeHtml(b.ønsket_tid || '-')}</p>
                    <span class="text-xs px-2 py-1 rounded ${b.completed ? 'bg-gray-200 text-gray-800' : b.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${b.completed ? 'Færdig' : getStatusText(b.status)}</span>
                </div>
                <p class="text-sm text-gray-700 mt-1">${escapeHtml(b.behandling || 'Kropsterapi')} · ${escapeHtml(b.betaling || '-')}</p>
                ${b.besked ? `<p class="text-sm text-gray-600 mt-1">📝 ${escapeHtml(b.besked)}</p>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading user history modal:', error);
        list.innerHTML = '<p class="text-sm text-red-600">Fejl ved indlæsning af tidligere bookinger</p>';
    }
}

async function loadManualUserBookingHistory() {
    const container = document.getElementById('manualUserBookingHistory');
    if (!container) return;

    if (!selectedManualUser) {
        container.innerHTML = '<p class="text-sm text-gray-500">Vælg en bruger for at se bookinger</p>';
        return;
    }

    container.innerHTML = '<p class="text-sm text-gray-500">Indlæser bookinger...</p>';

    try {
        const response = await fetch('/api/admin/bookings');
        const bookings = await response.json();

        if (!Array.isArray(bookings)) {
            container.innerHTML = '<p class="text-sm text-red-600">Kunne ikke hente bookinger</p>';
            return;
        }

        const matches = bookings
            .filter(b => b.telefon === selectedManualUser.telefon)
            .sort((a, b) => new Date(b.ønsket_dato) - new Date(a.ønsket_dato))
            .slice(0, 5);

        if (matches.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">Ingen bookinger fundet for denne bruger</p>';
            return;
        }

        manualHistoryNotesByBookingId = {};
        matches.forEach(b => {
            manualHistoryNotesByBookingId[b.id] = b.besked || '';
        });

        container.innerHTML = matches.map(b => `
            <div class="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div class="flex items-center justify-between gap-3">
                    <p class="font-medium text-gray-900">Booking #${b.id}</p>
                    ${b.besked && b.besked.trim()
                        ? `<button type="button" onclick="openManualBookingNoteModal(${b.id})" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-800 text-white text-xs" title="Se note">📋 Note</button>`
                        : '<span class="text-xs text-gray-500">Ingen note</span>'
                    }
                </div>
                <p class="text-sm text-gray-700 mt-1">${formatDate(b.ønsket_dato)} kl. ${escapeHtml(b.ønsket_tid || '-')}</p>
                <p class="text-xs text-gray-600 mt-1">${escapeHtml(b.behandling || 'Kropsterapi')} · ${escapeHtml(b.betaling || '-')}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading manual user history:', error);
        container.innerHTML = '<p class="text-sm text-red-600">Fejl ved indlæsning af bookinghistorik</p>';
    }
}

// Load all users
async function loadAllUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success && data.users) {
            allUsers = data.users;
            filteredUsers = [...allUsers];
            renderUsersList();
            renderManualUserQuickList();
        } else {
            console.error('Failed to load users:', data);
            document.getElementById('usersList').innerHTML = '<p class="text-red-500 text-center py-4">Fejl ved indlæsning af brugere.</p>';
        }
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersList').innerHTML = '<p class="text-red-500 text-center py-4">Fejl ved indlæsning af brugere.</p>';
    }
}

// Search users
function handleUsersSearch(e) {
    const query = e.target.value.trim().toLowerCase();
    
    if (query.length === 0) {
        filteredUsers = [...allUsers];
    } else {
        filteredUsers = allUsers.filter(user => {
            return user.navn.toLowerCase().includes(query) ||
                   user.efternavn.toLowerCase().includes(query) ||
                   (user.email && user.email.toLowerCase().includes(query)) ||
                   user.telefon.includes(query);
        });
    }
    
    renderUsersList();
}

// Render users list
function renderUsersList() {
    const container = document.getElementById('usersList');
    if (!container) return;
    
    if (filteredUsers.length === 0) {
        container.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-3">🔍</div><p class="text-gray-500">Ingen brugere fundet</p></div>`;
        return;
    }
    
    container.innerHTML = filteredUsers.map(user => `
        <div class="flex justify-between items-center p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
            <div>
                <p class="font-medium text-gray-900">${escapeHtml(user.navn)} ${escapeHtml(user.efternavn)}</p>
                <div class="text-sm text-gray-600">
                    <span>📞 ${escapeHtml(user.telefon)}</span>
                    ${user.email ? `<span class="ml-2">✉️ ${escapeHtml(user.email)}</span>` : ''}
                </div>
            </div>
            <button type="button" onclick="openEditUserModal(${user.id})" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                ✏️ Rediger
            </button>
        </div>
    `).join('');
}

// Open edit user modal
async function openEditUserModal(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserNavn').value = user.navn;
    document.getElementById('editUserEfternavn').value = user.efternavn;
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserTelefon').value = user.telefon;
    
    document.getElementById('editUserModal').classList.remove('hidden');
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
}

// Handle edit user form submission
async function handleEditUser(e) {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const userData = {
        navn: document.getElementById('editUserNavn').value.trim(),
        efternavn: document.getElementById('editUserEfternavn').value.trim(),
        email: document.getElementById('editUserEmail').value.trim() || null,
        telefon: document.getElementById('editUserTelefon').value.trim()
    };
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Bruger opdateret succesfuldt', 'success');
            closeEditUserModal();
            loadAllUsers();
        } else {
            showNotification(result.message || 'Fejl ved opdatering af bruger', 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showNotification('Fejl ved opdatering af bruger', 'error');
    }
}

// Handle user search

async function handleUserSearch(e) {
    const query = e.target.value.trim();
    const resultsContainer = document.getElementById('userSearchResults');
    
    if (query.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    try {
        const response = await fetch(`/api/bookings/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success && data.users && data.users.length > 0) {
            resultsContainer.innerHTML = data.users.map((user, index) => `
                <li class="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 transition-colors"
                    data-user-index="${index}">
                    <div class="font-medium text-gray-900">${escapeHtml(user.navn)} ${escapeHtml(user.efternavn)}</div>
                    <div class="text-sm text-gray-600">${escapeHtml(user.telefon)}${user.email ? ' • ' + escapeHtml(user.email) : ''}</div>
                </li>
            `).join('');
            resultsContainer.querySelectorAll('[data-user-index]').forEach(item => {
                item.addEventListener('click', () => {
                    const user = data.users[Number(item.dataset.userIndex)];
                    selectUser(user.id, `${user.navn} ${user.efternavn}`, user.telefon, user.email || '');
                });
            });
            resultsContainer.classList.remove('hidden');
        } else {
            resultsContainer.innerHTML = '<li class="px-4 py-3 text-gray-500 text-center">Ingen brugere fundet</li>';
            resultsContainer.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<li class="px-4 py-3 text-red-500 text-center">Fejl ved søgning</li>';
        resultsContainer.classList.remove('hidden');
    }
}

// Select user and fill form
function selectUser(userId, fullName, telefon, email) {
    const userFromList = allUsers.find(u => u.id === userId);

    if (userFromList) {
        applyManualUserSelection(userFromList);
    } else {
        const [fornavn = '', ...rest] = fullName.split(' ');
        applyManualUserSelection({
            id: userId,
            navn: fornavn,
            efternavn: rest.join(' '),
            telefon,
            email
        });
    }

    const userSearch = document.getElementById('userSearch');
    const userSearchResults = document.getElementById('userSearchResults');
    const manualNavn = document.getElementById('manualNavn');

    if (userSearch) userSearch.value = '';
    if (userSearchResults) userSearchResults.classList.add('hidden');
    if (manualNavn) manualNavn.focus();
}

async function handleCreateUser(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const payload = {
        navn: formData.get('navn'),
        efternavn: formData.get('efternavn'),
        telefon: formData.get('telefon'),
        email: formData.get('email') || null
    };

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.success) {
            showNotification(result.message || 'Fejl ved oprettelse af bruger', 'error');
            return;
        }

        showNotification('Bruger oprettet succesfuldt', 'success');
        e.target.reset();

        const fullName = `${result.user.navn} ${result.user.efternavn}`.trim();
        selectUser(result.user.id, fullName, result.user.telefon, result.user.email || '');
        switchManualEntryTab('booking');
        loadAllUsers();
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('Fejl ved oprettelse af bruger', 'error');
    }
}

// Handle import of users
async function handleImportUsers(e) {
    e.preventDefault();
    
    const textarea = document.getElementById('usersJson');
    const statusDiv = document.getElementById('importStatus');
    
    try {
        const users = JSON.parse(textarea.value);
        
        if (!Array.isArray(users) || users.length === 0) {
            statusDiv.className = 'mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg';
            statusDiv.innerHTML = '❌ Ugyldig format. Skal være et JSON array med brugere.';
            statusDiv.classList.remove('hidden');
            return;
        }

        statusDiv.className = 'mt-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg';
        statusDiv.innerHTML = '⏳ Importerer brugere...';
        statusDiv.classList.remove('hidden');
        
        const response = await fetch('/api/admin/import-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ users })
        });
        
        const result = await response.json();
        
        if (result.success) {
            statusDiv.className = 'mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg';
            let html = `✅ ${escapeHtml(result.message)}<br>`;
            html += `• Oprettet: ${escapeHtml(result.created)}<br>`;
            html += `• Eksisterede allerede: ${escapeHtml(result.skipped)}`;
            
            if (result.errors && result.errors.length > 0) {
                html += `<br><br>⚠️ Fejl:<br>`;
                result.errors.forEach(err => {
                    html += `• ${escapeHtml(err)}<br>`;
                });
            }
            
            statusDiv.innerHTML = html;
            textarea.value = '';
        } else {
            statusDiv.className = 'mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg';
            statusDiv.textContent = `❌ ${result.message}`;
        }
    } catch (error) {
        statusDiv.className = 'mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg';
        statusDiv.textContent = `❌ Fejl: ${error.message}`;
        statusDiv.classList.remove('hidden');
    }
}
